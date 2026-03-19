"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Save, Table2, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSpreadsheetNav, parsePasteData } from "@/hooks/use-spreadsheet";
import { SpreadsheetModal, type SheetColumn, type SheetRow } from "@/components/SpreadsheetModal";

interface Product {
  id: string;
  name: string;
}

interface Props {
  activeCategory: string;
  storeId: string;
}

export function CustomSauce({ activeCategory, storeId }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<Record<string, Record<string, { amount: number; tolerance_percent: number }>>>({});
  const [sauceProducts, setSauceProducts] = useState<Product[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done">("idle");
  const supabase = createClient();
  const { toast } = useToast();
  const navRef = useSpreadsheetNav();

  const fetchData = useCallback(async () => {
    if (!activeCategory || !storeId) return;

    const { data: catProducts } = await supabase
      .from("products")
      .select("id, name")
      .eq("category_id", activeCategory)
      .order("created_at");

    if (catProducts) setProducts(catProducts);

    const { data: categories } = await supabase
      .from("categories")
      .select("id, name")
      .eq("store_id", storeId);

    const sauceCat = categories?.find((c) => c.name === "자체소스");
    if (!sauceCat) {
      setSauceProducts([]);
      return;
    }

    const { data: sauceProds } = await supabase
      .from("products")
      .select("id, name")
      .eq("category_id", sauceCat.id)
      .order("created_at");

    if (sauceProds) setSauceProducts(sauceProds);

    if (sauceProds && sauceProds.length > 0) {
      const { data: existingRecipes } = await supabase
        .from("custom_sauce_recipes")
        .select("*")
        .in("sauce_product_id", sauceProds.map((p) => p.id));

      if (existingRecipes) {
        const recipeMap: Record<string, Record<string, { amount: number; tolerance_percent: number }>> = {};
        existingRecipes.forEach((r) => {
          if (!recipeMap[r.ingredient_product_id]) recipeMap[r.ingredient_product_id] = {};
          recipeMap[r.ingredient_product_id][r.sauce_product_id] = {
            amount: r.amount,
            tolerance_percent: r.tolerance_percent ?? 0,
          };
        });
        setRecipes(recipeMap);
      }
    }
  }, [activeCategory, storeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = () => { fetchData(); };
    window.addEventListener("onis-data-updated", handler);
    return () => window.removeEventListener("onis-data-updated", handler);
  }, [fetchData]);

  const updateRecipe = (ingredientId: string, sauceId: string, field: "amount" | "tolerance_percent", value: number) => {
    setRecipes((prev) => ({
      ...prev,
      [ingredientId]: {
        ...(prev[ingredientId] || {}),
        [sauceId]: {
          amount: prev[ingredientId]?.[sauceId]?.amount ?? 0,
          tolerance_percent: prev[ingredientId]?.[sauceId]?.tolerance_percent ?? 0,
          [field]: value,
        },
      },
    }));
  };

  const saveRecipes = async () => {
    setSaveStatus("saving");
    try {
      const sauceIds = sauceProducts.map((p) => p.id);
      if (sauceIds.length > 0) {
        await supabase.from("custom_sauce_recipes").delete().in("sauce_product_id", sauceIds);
      }

      const inserts: { sauce_product_id: string; ingredient_product_id: string; amount: number; tolerance_percent: number }[] = [];
      Object.entries(recipes).forEach(([ingredientId, sauceMap]) => {
        Object.entries(sauceMap).forEach(([sauceId, { amount, tolerance_percent }]) => {
          if (amount > 0) inserts.push({ sauce_product_id: sauceId, ingredient_product_id: ingredientId, amount, tolerance_percent });
        });
      });

      if (inserts.length > 0) {
        const { error } = await supabase.from("custom_sauce_recipes").insert(inserts);
        if (error) { toast({ title: "저장 실패", variant: "destructive" }); setSaveStatus("idle"); return; }
      }

      setSaveStatus("done");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("idle");
    }
  };

  // Paste handler
  const handlePaste = (e: React.ClipboardEvent, productIdx: number, sauceIdx: number, field: "amount" | "tolerance_percent") => {
    const data = parsePasteData(e);
    if (!data) return;
    for (let r = 0; r < data.length; r++) {
      const pIdx = productIdx + r;
      if (pIdx >= products.length) break;
      for (let c = 0; c < data[r].length; c++) {
        const sIdx = sauceIdx + Math.floor(c / 2);
        if (sIdx >= sauceProducts.length) break;
        const f = c % 2 === 0 ? "amount" : "tolerance_percent";
        if (field === "tolerance_percent" && c === 0) {
          updateRecipe(products[pIdx].id, sauceProducts[sIdx].id, "tolerance_percent", data[r][c]);
        } else {
          updateRecipe(products[pIdx].id, sauceProducts[sIdx].id, f, data[r][c]);
        }
      }
    }
  };

  // Sheet data
  // Column index → letter (A, B, C, ..., Z, AA, AB, ...)
  const colLetter = (idx: number): string => {
    let s = "";
    let n = idx;
    while (n >= 0) {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  };

  // 컬럼: 헤더 없이 (공백), 전부 editable
  const sheetColumns: SheetColumn[] = [
    { key: "c0", header: " ", width: 150, type: "text", editable: true },
    ...sauceProducts.flatMap((_, i) => [
      { key: `c${1 + i * 2}`, header: " ", type: "text" as const, editable: true, width: 100 },
      { key: `c${2 + i * 2}`, header: " ", type: "text" as const, editable: true, width: 100 },
    ]),
  ];

  // 1행 소스명 셀 병합 (각 소스가 2칸 차지)
  const sheetMergeCells: Record<string, [number, number]> = {};
  sauceProducts.forEach((_, i) => {
    const cIdx = 1 + i * 2;
    sheetMergeCells[`${colLetter(cIdx)}1`] = [2, 1];
  });

  // 데이터 행: 1행=제품명+소스이름, 2행=사용량/오차 라벨, 3행~=제품 데이터
  const sheetRows: SheetRow[] = [
    // 1행: 제품명 라벨 + 소스 이름
    {
      id: "__header_sauce",
      values: {
        c0: "제품명",
        ...Object.fromEntries(
          sauceProducts.flatMap((sauce, i) => [
            [`c${1 + i * 2}`, sauce.name],
            [`c${2 + i * 2}`, ""],
          ])
        ),
      },
    },
    // 2행: 사용량/오차 라벨
    {
      id: "__header_sub",
      values: {
        c0: "",
        ...Object.fromEntries(
          sauceProducts.flatMap((_, i) => [
            [`c${1 + i * 2}`, "사용량"],
            [`c${2 + i * 2}`, "오차(%)"],
          ])
        ),
      },
    },
    // 3행~: 제품 데이터
    ...products.map((product) => {
      const values: Record<string, string | number> = { c0: product.name };
      sauceProducts.forEach((sauce, i) => {
        values[`c${1 + i * 2}`] = recipes[product.id]?.[sauce.id]?.amount ?? 0;
        values[`c${2 + i * 2}`] = recipes[product.id]?.[sauce.id]?.tolerance_percent ?? 0;
      });
      return { id: product.id, values };
    }),
  ];

  const handleSheetCellChange = (rowId: string, colKey: string, value: string | number) => {
    const colIdx = Number(colKey.replace("c", ""));
    if (isNaN(colIdx)) return;

    // 1행(소스이름), 2행(라벨), 제품명 컬럼 → 무시
    if (rowId === "__header_sauce" || rowId === "__header_sub") return;
    if (colIdx === 0) return;

    // 제품 데이터 행
    const sauceIdx = Math.floor((colIdx - 1) / 2);
    const isAmount = (colIdx - 1) % 2 === 0;
    const sauce = sauceProducts[sauceIdx];
    if (!sauce) return;

    const field = isAmount ? "amount" : "tolerance_percent";
    updateRecipe(rowId, sauce.id, field, Number(value) || 0);
  };

  const saveOverlay = saveStatus !== "idle" && (
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
  );

  if (sauceProducts.length === 0) {
    return (
      <>{saveOverlay}<Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          &quot;자체소스&quot; 카테고리를 추가하고 제품을 등록해주세요.
        </CardContent>
      </Card></>
    );
  }

  return (
    <>
    {saveOverlay}
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>자체소스 레시피</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
              <Table2 className="h-4 w-4 mr-1" />시트 입력
            </Button>
            <Button size="sm" onClick={saveRecipes}>
              <Save className="h-4 w-4 mr-1" />저장
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto" ref={navRef}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px] sticky left-0 z-10 bg-background" rowSpan={2}>제품명</TableHead>
                {sauceProducts.map((sauce) => (
                  <TableHead key={sauce.id} className="min-w-[180px] text-center">{sauce.name}</TableHead>
                ))}
              </TableRow>
              <TableRow>
                {sauceProducts.map((sauce) => (
                  <TableHead key={`sub-${sauce.id}`} className="text-center">
                    <div className="flex justify-center gap-2 text-xs text-muted-foreground">
                      <span className="w-[80px] text-center">사용량</span>
                      <span className="w-[70px] text-center">오차(%)</span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product, pIdx) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium sticky left-0 z-10 bg-background">{product.name}</TableCell>
                  {sauceProducts.map((sauce, sIdx) => (
                    <TableCell key={sauce.id}>
                      <div className="flex items-center justify-center gap-2">
                        <Input
                          type="number"
                          className="w-[80px] h-7 text-sm text-center"
                          value={recipes[product.id]?.[sauce.id]?.amount ?? 0}
                          onChange={(e) => updateRecipe(product.id, sauce.id, "amount", Number(e.target.value))}
                          onPaste={(e) => handlePaste(e, pIdx, sIdx, "amount")}
                        />
                        <Input
                          type="number"
                          className="w-[70px] h-7 text-sm text-center text-muted-foreground"
                          value={recipes[product.id]?.[sauce.id]?.tolerance_percent ?? 0}
                          onChange={(e) => updateRecipe(product.id, sauce.id, "tolerance_percent", Number(e.target.value))}
                          onPaste={(e) => handlePaste(e, pIdx, sIdx, "tolerance_percent")}
                        />
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={sauceProducts.length + 1} className="text-center text-muted-foreground py-8">
                    현재 카테고리에 제품이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <SpreadsheetModal
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="자체소스 레시피 시트"
          columns={sheetColumns}
          rows={sheetRows}
          onCellChange={handleSheetCellChange}
          mergeCells={sheetMergeCells}
          freezeRows={2}
          allowInsertRow={false}
          allowInsertColumn={false}
        />
      </CardContent>
    </Card>
    </>
  );
}
