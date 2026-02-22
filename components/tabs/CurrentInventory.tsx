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
import { Plus, Trash2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Row {
  id?: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
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
  const supabase = createClient();
  const { toast } = useToast();
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const fetchRows = useCallback(async () => {
    if (!activeCategory) return;

    // 카테고리 이름 확인 (자체소스 여부)
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
    const snapMap: Record<string, { quantity: number; remaining: number }> = {};

    if (productIds.length > 0) {
      const { data: snapshots } = await supabase
        .from("inventory_snapshots")
        .select("*")
        .in("product_id", productIds)
        .eq("date", dateStr);

      snapshots?.forEach((s) => {
        snapMap[s.product_id] = { quantity: s.quantity, remaining: s.remaining };
      });
    }

    setRows(products.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      price: p.price ?? 0,
      quantity: snapMap[p.id]?.quantity ?? 0,
      remaining: snapMap[p.id]?.remaining ?? 0,
    })));

    // 자체소스: 레시피 기반 가격 자동 계산
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

  const addRow = () => {
    setRows((prev) => [...prev, { name: "", unit: "g", price: 0, quantity: 0, remaining: 0, isNew: true }]);
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
          product_id: productId, date: dateStr, quantity: row.quantity, remaining: row.remaining,
        });
        if (snapError) { toast({ title: `재고 저장 실패: ${snapError.message}`, variant: "destructive" }); }
      }
    }

    toast({ title: "저장 완료" });
    fetchRows();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>현재재고 - {format(selectedDate, "yyyy년 MM월 dd일")}</CardTitle>
          <Button size="sm" onClick={saveAll}>
            <Save className="h-4 w-4 mr-1" />
            저장
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제품명</TableHead>
              <TableHead>용량(g)</TableHead>
              <TableHead>가격(원)</TableHead>
              <TableHead>수량</TableHead>
              <TableHead>잔량</TableHead>
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
                    <Input type="number" value={row.price || ""} onChange={(e) => updateRow(idx, "price", Number(e.target.value))} placeholder="0" className="w-[100px]" />
                  )}
                </TableCell>
                <TableCell>
                  <Input type="number" value={row.quantity} onChange={(e) => updateRow(idx, "quantity", Number(e.target.value))} className="w-[100px]" />
                </TableCell>
                <TableCell>
                  <Input type="number" value={row.remaining} onChange={(e) => updateRow(idx, "remaining", Number(e.target.value))} className="w-[100px]" />
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

        {activeCategory && (
          <Button variant="outline" className="mt-4 w-full" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" />
            제품 추가
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
