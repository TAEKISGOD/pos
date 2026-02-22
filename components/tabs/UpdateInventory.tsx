"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { useDateContext } from "@/lib/date-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Save, RefreshCw, FlaskConical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { calculateUpdatedInventory, type InventoryCalcResult } from "@/lib/calculations";

interface Props {
  activeCategory: string;
  storeId: string;
}

interface SauceProduct {
  id: string;
  name: string;
}

interface SauceRecipe {
  sauce_product_id: string;
  ingredient_product_id: string;
  amount: number;
}

export function UpdateInventory({ activeCategory, storeId }: Props) {
  const { selectedDate } = useDateContext();
  const [results, setResults] = useState<InventoryCalcResult[]>([]);
  const [manualOverrides, setManualOverrides] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // 자체소스 생산 관련 상태
  const [sauceProducts, setSauceProducts] = useState<SauceProduct[]>([]);
  const [sauceRecipes, setSauceRecipes] = useState<SauceRecipe[]>([]);
  const [sauceProductions, setSauceProductions] = useState<Record<string, number>>({});
  const [sauceDialogOpen, setSauceDialogOpen] = useState(false);

  const supabase = createClient();
  const { toast } = useToast();
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const calculate = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const calcResults = await calculateUpdatedInventory(supabase, storeId, dateStr);
    setResults(calcResults);
    setLoading(false);
  }, [storeId, dateStr]);

  // 자체소스 데이터 fetch
  const fetchSauceData = useCallback(async () => {
    if (!storeId) return;

    const { data: categories } = await supabase
      .from("categories")
      .select("id, name")
      .eq("store_id", storeId);

    const sauceCat = categories?.find((c) => c.name === "자체소스");
    if (!sauceCat) {
      setSauceProducts([]);
      setSauceRecipes([]);
      return;
    }

    const { data: sauceProds } = await supabase
      .from("products")
      .select("id, name")
      .eq("category_id", sauceCat.id)
      .order("created_at");

    if (sauceProds) setSauceProducts(sauceProds);

    if (sauceProds && sauceProds.length > 0) {
      const { data: recipes } = await supabase
        .from("custom_sauce_recipes")
        .select("sauce_product_id, ingredient_product_id, amount")
        .in("sauce_product_id", sauceProds.map((p) => p.id));

      if (recipes) setSauceRecipes(recipes);
    }
  }, [storeId]);

  useEffect(() => { calculate(); }, [calculate]);
  useEffect(() => { fetchSauceData(); }, [fetchSauceData]);

  // 자체소스 생산 효과 계산
  const sauceEffectMap = useMemo(() => {
    const effectMap: Record<string, number> = {};

    for (const sauceProduct of sauceProducts) {
      const production = sauceProductions[sauceProduct.id] || 0;
      if (production <= 0) continue;

      // 소스 제품: +생산량
      effectMap[sauceProduct.id] = (effectMap[sauceProduct.id] || 0) + production;

      // 해당 소스의 레시피 재료들
      const ingredientRecipes = sauceRecipes.filter(
        (r) => r.sauce_product_id === sauceProduct.id
      );

      // 레시피 총량
      const totalRecipeAmount = ingredientRecipes.reduce((sum, r) => sum + r.amount, 0);
      if (totalRecipeAmount <= 0) continue;

      // 재료 제품: -(recipe.amount × (생산량 / 레시피총량))
      for (const recipe of ingredientRecipes) {
        const deduction = recipe.amount * (production / totalRecipeAmount);
        effectMap[recipe.ingredient_product_id] = (effectMap[recipe.ingredient_product_id] || 0) - deduction;
      }
    }

    return effectMap;
  }, [sauceProducts, sauceRecipes, sauceProductions]);

  const filtered = results.filter((r) => r.categoryId === activeCategory);

  const handleSave = async () => {
    const nextDateObj = new Date(selectedDate);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDateStr = format(nextDateObj, "yyyy-MM-dd");

    const upserts = filtered.map((r) => {
      const sauceEffect = sauceEffectMap[r.productId] || 0;
      const total = manualOverrides[r.productId] ?? (r.newQuantity + sauceEffect);
      const unitValue = parseFloat(r.productUnit) || 0;
      const qty = unitValue > 0 ? Math.floor(total / unitValue) : 0;
      const rem = unitValue > 0 ? total - qty * unitValue : total;
      return {
        product_id: r.productId,
        date: nextDateStr,
        quantity: qty,
        remaining: Math.round(rem * 100) / 100,
      };
    });

    const productIds = filtered.map((r) => r.productId);
    if (productIds.length > 0) {
      await supabase.from("inventory_snapshots").delete().in("product_id", productIds).eq("date", nextDateStr);
    }

    if (upserts.length > 0) {
      const { error } = await supabase.from("inventory_snapshots").insert(upserts);
      if (error) { toast({ title: "저장 실패", variant: "destructive" }); setConfirmOpen(false); return; }
    }

    toast({ title: `${format(nextDateObj, "MM월 dd일")} 재고가 저장되었습니다.` });
    setConfirmOpen(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>업데이트 재고 - {format(selectedDate, "yyyy년 MM월 dd일")}</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSauceDialogOpen(true)} disabled={sauceProducts.length === 0}>
              <FlaskConical className="h-4 w-4 mr-1" />자체소스 생산
            </Button>
            <Button variant="outline" size="sm" onClick={calculate} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />재계산
            </Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)}><Save className="h-4 w-4 mr-1" />저장</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제품명</TableHead>
              <TableHead>현재재고</TableHead>
              <TableHead>사용량</TableHead>
              <TableHead>폐기량</TableHead>
              <TableHead>자체소스 생산</TableHead>
              <TableHead>새 재고</TableHead>
              <TableHead>확정값</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const sauceEffect = sauceEffectMap[r.productId] || 0;
              const adjustedNew = r.newQuantity + sauceEffect;
              const adjustedNewMin = r.newQuantityMin != null ? r.newQuantityMin + sauceEffect : undefined;
              const adjustedNewMax = r.newQuantityMax != null ? r.newQuantityMax + sauceEffect : undefined;

              return (
                <TableRow key={r.productId}>
                  <TableCell className="font-medium">{r.productName}</TableCell>
                  <TableCell>{r.currentQuantity}</TableCell>
                  <TableCell>
                    {r.hasTolerance ? (
                      <Badge variant="outline">{r.totalUsedMin?.toFixed(1)} ~ {r.totalUsedMax?.toFixed(1)}</Badge>
                    ) : (<span>{r.totalUsed.toFixed(1)}</span>)}
                  </TableCell>
                  <TableCell>{r.wasteAmount}</TableCell>
                  <TableCell>
                    {sauceEffect !== 0 ? (
                      <span className={sauceEffect > 0 ? "text-blue-600 font-medium" : "text-red-600 font-medium"}>
                        {sauceEffect > 0 ? "+" : ""}{sauceEffect.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.hasTolerance ? (
                      <Badge variant="outline">{adjustedNewMin?.toFixed(1)} ~ {adjustedNewMax?.toFixed(1)}</Badge>
                    ) : (<span>{adjustedNew.toFixed(1)}</span>)}
                  </TableCell>
                  <TableCell>
                    {r.hasTolerance ? (
                      <Input type="number" className="w-[100px]" value={manualOverrides[r.productId] ?? ""}
                        placeholder={adjustedNew.toFixed(1)}
                        onChange={(e) => setManualOverrides((prev) => ({ ...prev, [r.productId]: Number(e.target.value) }))} />
                    ) : (<span className="text-muted-foreground">{adjustedNew.toFixed(1)}</span>)}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                {loading ? "계산 중..." : "데이터가 없습니다."}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>

        {/* 자체소스 생산 다이얼로그 */}
        <Dialog open={sauceDialogOpen} onOpenChange={setSauceDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>자체소스 생산량 입력</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {sauceProducts.map((sauce) => {
                const ingredientRecipes = sauceRecipes.filter(
                  (r) => r.sauce_product_id === sauce.id
                );
                const totalRecipeAmount = ingredientRecipes.reduce((sum, r) => sum + r.amount, 0);
                const production = sauceProductions[sauce.id] || 0;

                return (
                  <div key={sauce.id} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <label className="font-medium min-w-[100px]">{sauce.name}</label>
                      <Input
                        type="number"
                        className="w-[120px]"
                        placeholder="0"
                        value={sauceProductions[sauce.id] || ""}
                        onChange={(e) => setSauceProductions((prev) => ({
                          ...prev,
                          [sauce.id]: Number(e.target.value),
                        }))}
                      />
                      <span className="text-sm text-muted-foreground">g</span>
                    </div>
                    {production > 0 && ingredientRecipes.length > 0 && (
                      <div className="ml-4 text-sm text-muted-foreground space-y-1">
                        {ingredientRecipes.map((recipe) => {
                          const ingredientProduct = results.find(
                            (r) => r.productId === recipe.ingredient_product_id
                          );
                          const deduction = recipe.amount * (production / totalRecipeAmount);
                          return (
                            <div key={recipe.ingredient_product_id} className="flex gap-2">
                              <span>{ingredientProduct?.productName ?? "알 수 없음"}</span>
                              <span className="text-red-600">-{deduction.toFixed(1)}g</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={() => setSauceDialogOpen(false)}>확인</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>재고 업데이트 확인</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              {format(selectedDate, "yyyy년 MM월 dd일")} 기준으로 계산된 재고를 다음 날 재고로 저장하시겠습니까?
            </p>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>취소</Button>
              <Button onClick={handleSave}>확인</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
