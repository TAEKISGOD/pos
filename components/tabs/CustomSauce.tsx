"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  // recipes[ingredientId][sauceId] = { amount, tolerance_percent }
  const [recipes, setRecipes] = useState<Record<string, Record<string, { amount: number; tolerance_percent: number }>>>({});
  const [sauceProducts, setSauceProducts] = useState<Product[]>([]);
  const supabase = createClient();
  const { toast } = useToast();

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
      if (error) { toast({ title: "저장 실패", variant: "destructive" }); return; }
    }

    toast({ title: "자체소스 레시피 저장 완료" });
  };

  if (sauceProducts.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          &quot;자체소스&quot; 카테고리를 추가하고 제품을 등록해주세요.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>자체소스 레시피</CardTitle>
          <Button size="sm" onClick={saveRecipes}>
            <Save className="h-4 w-4 mr-1" />
            저장
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]" rowSpan={2}>제품명</TableHead>
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
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  {sauceProducts.map((sauce) => (
                    <TableCell key={sauce.id}>
                      <div className="flex items-center justify-center gap-2">
                        <Input
                          type="number"
                          className="w-[80px] h-7 text-sm text-center"
                          value={recipes[product.id]?.[sauce.id]?.amount ?? 0}
                          onChange={(e) => updateRecipe(product.id, sauce.id, "amount", Number(e.target.value))}
                        />
                        <Input
                          type="number"
                          className="w-[70px] h-7 text-sm text-center text-muted-foreground"
                          value={recipes[product.id]?.[sauce.id]?.tolerance_percent ?? 0}
                          onChange={(e) => updateRecipe(product.id, sauce.id, "tolerance_percent", Number(e.target.value))}
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
      </CardContent>
    </Card>
  );
}
