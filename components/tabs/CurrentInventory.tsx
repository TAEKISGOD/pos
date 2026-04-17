"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useDateContext } from "@/lib/date-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Save, Table2, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useSpreadsheetNav, parsePasteData } from "@/hooks/use-spreadsheet";
import { SpreadsheetModal, type SheetColumn, type SheetRow } from "@/components/SpreadsheetModal";

interface Row {
  id?: string;
  name: string;
  unit: string;
  price: number;
  remaining: number;
  isNew?: boolean;
}

interface Props {
  activeCategory: string;
  storeId: string;
}

export function CurrentInventory({ activeCategory }: Props) {
  const { selectedDate } = useDateContext();
  const [rows, setRows] = useState<Row[]>([]);
  const [isSauceCategory, setIsSauceCategory] = useState(false);
  const [calculatedPrices, setCalculatedPrices] = useState<Record<string, number>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done">("idle");
  const supabase = createClient();
  const { toast } = useToast();
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const navRef = useSpreadsheetNav();

  const fetchRows = useCallback(async () => {
    if (!activeCategory) return;

    const { data: categoryData } = await supabase
      .from("categories")
      .select("name")
      .eq("id", activeCategory)
      .single();

    const isSauce = categoryData?.name === "자체소스";
    setIsSauceCategory(isSauce);

    const { data: products } = await supabase
      .from("products")
      .select("*")
      .eq("category_id", activeCategory)
      .order("created_at");

    if (!products) return;

    const productIds = products.map((p) => p.id);
    const snapMap: Record<string, number> = {};

    if (productIds.length > 0) {
      const { data: snapshots } = await supabase
        .from("inventory_snapshots")
        .select("*")
        .in("product_id", productIds)
        .eq("date", dateStr);

      snapshots?.forEach((s) => {
        snapMap[s.product_id] = s.remaining ?? 0;
      });
    }

    setRows(products.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      price: p.price ?? 0,
      remaining: snapMap[p.id] ?? 0,
    })));

    if (isSauce && productIds.length > 0) {
      const { data: recipes } = await supabase
        .from("custom_sauce_recipes")
        .select("sauce_product_id, ingredient_product_id, amount")
        .in("sauce_product_id", productIds);

      if (recipes && recipes.length > 0) {
        const ingredientIds = Array.from(new Set(recipes.map((r) => r.ingredient_product_id)));
        const { data: ingredientProducts } = await supabase
          .from("products")
          .select("id, unit, price")
          .in("id", ingredientIds);

        const ingredientMap: Record<string, { unit: number; price: number }> = {};
        ingredientProducts?.forEach((p) => {
          ingredientMap[p.id] = { unit: parseFloat(p.unit) || 0, price: p.price ?? 0 };
        });

        const calcPrices: Record<string, number> = {};
        const recipesBySauce: Record<string, typeof recipes> = {};
        recipes.forEach((r) => {
          if (!recipesBySauce[r.sauce_product_id]) recipesBySauce[r.sauce_product_id] = [];
          recipesBySauce[r.sauce_product_id].push(r);
        });

        for (const [sauceId, sauceRecipes] of Object.entries(recipesBySauce)) {
          const totalRecipeAmount = sauceRecipes.reduce((sum, r) => sum + r.amount, 0);
          if (totalRecipeAmount <= 0) continue;

          let totalCost = 0;
          for (const recipe of sauceRecipes) {
            const ingredient = ingredientMap[recipe.ingredient_product_id];
            if (!ingredient || ingredient.unit <= 0) continue;
            totalCost += recipe.amount * (ingredient.price / ingredient.unit);
          }

          const sauceProduct = products.find((p) => p.id === sauceId);
          const sauceUnit = parseFloat(sauceProduct?.unit || "0") || 0;
          calcPrices[sauceId] = sauceUnit > 0
            ? Math.round(totalCost * sauceUnit / totalRecipeAmount)
            : Math.round(totalCost);
        }

        setCalculatedPrices(calcPrices);
      } else {
        setCalculatedPrices({});
      }
    } else {
      setCalculatedPrices({});
    }
  }, [activeCategory, dateStr]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    const handler = () => { fetchRows(); };
    window.addEventListener("onis-data-updated", handler);
    return () => window.removeEventListener("onis-data-updated", handler);
  }, [fetchRows]);

  const addRow = () => {
    setRows((prev) => [...prev, { name: "", unit: "g", price: 0, remaining: 0, isNew: true }]);
  };

  const updateRow = (index: number, field: keyof Row, value: string | number) => {
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const deleteRow = async (index: number) => {
    const row = rows[index];
    if (row.id) {
      await supabase.from("products").delete().eq("id", row.id);
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
    toast({ title: "삭제 완료" });
  };

  const saveAll = async () => {
    if (!activeCategory) return;
    setSaveStatus("saving");

    try {
      for (const row of rows) {
        if (!row.name.trim()) continue;

        let productId = row.id;

        if (row.isNew) {
          const { data: newProduct, error } = await supabase
            .from("products")
            .insert({ category_id: activeCategory, name: row.name.trim(), unit: row.unit, price: row.price })
            .select()
            .single();

          if (error || !newProduct) { toast({ title: `제품 "${row.name}" 추가 실패`, variant: "destructive" }); continue; }
          productId = newProduct.id;
        } else if (row.id) {
          await supabase.from("products").update({ name: row.name.trim(), unit: row.unit, price: row.price }).eq("id", row.id);
        }

        if (productId) {
          await supabase.from("inventory_snapshots").delete().eq("product_id", productId).eq("date", dateStr);
          const { error: snapError } = await supabase.from("inventory_snapshots").insert({
            product_id: productId, date: dateStr, remaining: row.remaining,
          });
          if (snapError) { toast({ title: `재고 저장 실패: ${snapError.message}`, variant: "destructive" }); }
        }
      }

      setSaveStatus("done");
      setTimeout(() => setSaveStatus("idle"), 1500);
      fetchRows();
    } catch {
      setSaveStatus("idle");
    }
  };

  // Paste handler for number inputs
  const handlePaste = (e: React.ClipboardEvent, startIdx: number, field: "price" | "remaining") => {
    const data = parsePasteData(e);
    if (!data) return;
    setRows((prev) => {
      const updated = [...prev];
      for (let i = 0; i < data.length && startIdx + i < updated.length; i++) {
        updated[startIdx + i] = { ...updated[startIdx + i], [field]: data[i][0] ?? 0 };
      }
      return updated;
    });
  };

  // Sheet data
  const sheetColumns: SheetColumn[] = [
    { key: "name", header: "제품명", type: "text", editable: true, width: 200 },
    { key: "unit", header: "용량(g)", type: "text", editable: true, width: 100 },
    ...(isSauceCategory
      ? [{ key: "price", header: "가격(원)", width: 120 } as SheetColumn]
      : [{ key: "price", header: "가격(원)", type: "number" as const, editable: true, width: 120 } as SheetColumn]),
    { key: "remaining", header: "잔량(g)", type: "number", editable: true, width: 100 },
  ];

  const sheetRows: SheetRow[] = rows.map((row, idx) => ({
    id: row.id ?? `new-${idx}`,
    values: {
      name: row.name,
      unit: row.unit,
      price: isSauceCategory
        ? (calculatedPrices[row.id ?? ""] != null ? `${calculatedPrices[row.id ?? ""].toLocaleString()}원` : "-")
        : row.price,
      remaining: row.remaining,
    },
  }));

  const handleSheetCellChange = (rowId: string, colKey: string, value: string | number) => {
    // 새 행 (기존 데이터 범위 밖)
    if (rowId.startsWith("__new__")) {
      setRows((prev) => {
        const newRow: Row = { name: "", unit: "g", price: 0, remaining: 0, isNew: true };
        if (colKey === "name" || colKey === "unit") {
          newRow[colKey] = String(value);
        } else if (colKey === "price" || colKey === "remaining") {
          newRow[colKey] = Number(value) || 0;
        }
        return [...prev, newRow];
      });
      return;
    }

    const idx = rows.findIndex((r) => (r.id ?? `new-${rows.indexOf(r)}`) === rowId);
    if (idx === -1) return;
    if (colKey === "name" || colKey === "unit") {
      updateRow(idx, colKey, String(value));
    } else if (colKey === "price" || colKey === "remaining") {
      updateRow(idx, colKey, Number(value) || 0);
    }
  };

  return (
    <>
    {saveStatus !== "idle" && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
        <div className="bg-background rounded-xl px-8 py-6 shadow-2xl flex flex-col items-center gap-3">
          {saveStatus === "saving" ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm font-medium">저장중...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <span className="text-sm font-medium">저장 완료</span>
            </>
          )}
        </div>
      </div>
    )}
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>현재재고 - {format(selectedDate, "yyyy년 MM월 dd일")}</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
              <Table2 className="h-4 w-4 mr-1" />시트 입력
            </Button>
            <Button size="sm" onClick={saveAll}>
              <Save className="h-4 w-4 mr-1" />저장
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={navRef}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제품명</TableHead>
                <TableHead>용량(g)</TableHead>
                <TableHead>가격(원)</TableHead>
                <TableHead>잔량(g)</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={row.id ?? `new-${idx}`}>
                  <TableCell>
                    <Input lang="ko" value={row.name} onChange={(e) => updateRow(idx, "name", e.target.value)} placeholder="제품명" />
                  </TableCell>
                  <TableCell>
                    <Input value={row.unit} onChange={(e) => updateRow(idx, "unit", e.target.value)} placeholder="g" className="w-[80px]" />
                  </TableCell>
                  <TableCell>
                    {isSauceCategory ? (
                      <span className="text-sm text-muted-foreground w-[100px] inline-block text-right">
                        {calculatedPrices[row.id ?? ""] != null
                          ? `${calculatedPrices[row.id ?? ""].toLocaleString()}원`
                          : "-"}
                      </span>
                    ) : (
                      <Input type="number" value={row.price || ""} onChange={(e) => updateRow(idx, "price", Number(e.target.value))} placeholder="0" className="w-[100px]"
                        onPaste={(e) => handlePaste(e, idx, "price")} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={row.remaining} onChange={(e) => updateRow(idx, "remaining", Number(e.target.value))} className="w-[100px]"
                      onPaste={(e) => handlePaste(e, idx, "remaining")} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => deleteRow(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {activeCategory && (
          <Button variant="outline" className="mt-4 w-full" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" />
            제품 추가
          </Button>
        )}

        <SpreadsheetModal
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={`현재재고 시트 - ${format(selectedDate, "yyyy년 MM월 dd일")}`}
          columns={sheetColumns}
          rows={sheetRows}
          onCellChange={handleSheetCellChange}
        />
      </CardContent>
    </Card>
    </>
  );
}
