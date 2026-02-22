"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Save, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Product {
  id: string;
  name: string;
}

interface Menu {
  id: string;
  name: string;
  isNew?: boolean;
}

interface Props {
  activeCategory: string;
  storeId: string;
}

export function MenuRecipe({ activeCategory, storeId }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  // recipes[productId][menuId] = { amount, tolerance_percent }
  const [recipes, setRecipes] = useState<Record<string, Record<string, { amount: number; tolerance_percent: number }>>>({});
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

    const { data: menuData } = await supabase
      .from("menus")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at");

    if (menuData) setMenus(menuData);

    if (menuData && menuData.length > 0 && catProducts && catProducts.length > 0) {
      const { data: recipeData } = await supabase
        .from("menu_recipes")
        .select("*")
        .in("menu_id", menuData.map((m) => m.id))
        .in("product_id", catProducts.map((p) => p.id));

      if (recipeData) {
        const recipeMap: Record<string, Record<string, { amount: number; tolerance_percent: number }>> = {};
        recipeData.forEach((r) => {
          if (!recipeMap[r.product_id]) recipeMap[r.product_id] = {};
          recipeMap[r.product_id][r.menu_id] = {
            amount: r.amount,
            tolerance_percent: r.tolerance_percent,
          };
        });
        setRecipes(recipeMap);
      }
    }
  }, [activeCategory, storeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addMenu = () => {
    const tempId = `new-${Date.now()}`;
    setMenus((prev) => [...prev, { id: tempId, name: "", isNew: true }]);
  };

  const updateMenuName = (menuId: string, name: string) => {
    setMenus((prev) => prev.map((m) => m.id === menuId ? { ...m, name } : m));
  };

  const deleteMenu = async (menuId: string) => {
    const menu = menus.find((m) => m.id === menuId);
    if (!menu) return;

    if (!menu.isNew) {
      await supabase.from("menu_recipes").delete().eq("menu_id", menuId);
      await supabase.from("menus").delete().eq("id", menuId);
    }

    setMenus((prev) => prev.filter((m) => m.id !== menuId));
    // Clean up recipes for this menu
    setRecipes((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((productId) => {
        if (updated[productId][menuId]) {
          const { [menuId]: _removed, ...rest } = updated[productId];
          void _removed;
          updated[productId] = rest;
        }
      });
      return updated;
    });
    toast({ title: "메뉴 삭제 완료" });
  };

  const updateRecipe = (productId: string, menuId: string, field: "amount" | "tolerance_percent", value: number) => {
    setRecipes((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        [menuId]: {
          amount: prev[productId]?.[menuId]?.amount ?? 0,
          tolerance_percent: prev[productId]?.[menuId]?.tolerance_percent ?? 0,
          [field]: value,
        },
      },
    }));
  };

  const saveAll = async () => {
    // 1. Save new menus first
    const newMenus = menus.filter((m) => m.isNew);
    const savedMenuIds: Record<string, string> = {}; // tempId -> realId

    for (const menu of newMenus) {
      if (!menu.name.trim()) continue;
      const { data, error } = await supabase
        .from("menus")
        .insert({ store_id: storeId, name: menu.name.trim() })
        .select("id")
        .single();

      if (error || !data) {
        toast({ title: `메뉴 "${menu.name}" 저장 실패`, variant: "destructive" });
        return;
      }
      savedMenuIds[menu.id] = data.id;
    }

    // 2. Build final menu ID list (replace temp IDs with real IDs)
    const finalMenuIds = menus
      .filter((m) => m.name.trim())
      .map((m) => savedMenuIds[m.id] || m.id);

    // 3. Delete existing recipes for these menus + products
    if (finalMenuIds.length > 0) {
      await supabase
        .from("menu_recipes")
        .delete()
        .in("menu_id", finalMenuIds)
        .in("product_id", products.map((p) => p.id));
    }

    // 4. Insert recipes
    const inserts: { menu_id: string; product_id: string; amount: number; tolerance_percent: number }[] = [];
    Object.entries(recipes).forEach(([productId, menuMap]) => {
      Object.entries(menuMap).forEach(([menuId, { amount, tolerance_percent }]) => {
        const realMenuId = savedMenuIds[menuId] || menuId;
        if (amount > 0) {
          inserts.push({ menu_id: realMenuId, product_id: productId, amount, tolerance_percent });
        }
      });
    });

    if (inserts.length > 0) {
      const { error } = await supabase.from("menu_recipes").insert(inserts);
      if (error) { toast({ title: "레시피 저장 실패", variant: "destructive" }); return; }
    }

    toast({ title: "메뉴별 레시피 저장 완료" });
    fetchData();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>메뉴별 레시피</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addMenu}>
              <Plus className="h-4 w-4 mr-1" />메뉴 추가
            </Button>
            <Button size="sm" onClick={saveAll}>
              <Save className="h-4 w-4 mr-1" />저장
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]" rowSpan={2}>제품명</TableHead>
                {menus.map((menu) => (
                  <TableHead key={menu.id} className="min-w-[180px] text-center">
                    <div className="flex items-center justify-center gap-1">
                      {menu.isNew ? (
                        <Input
                          className="h-7 text-sm"
                          value={menu.name}
                          onChange={(e) => updateMenuName(menu.id, e.target.value)}
                          placeholder="메뉴명"
                          lang="ko"
                        />
                      ) : (
                        <span className="text-sm">{menu.name}</span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => deleteMenu(menu.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
              <TableRow>
                {menus.map((menu) => (
                  <TableHead key={`sub-${menu.id}`} className="text-center">
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
                  {menus.map((menu) => (
                    <TableCell key={menu.id}>
                      <div className="flex items-center justify-center gap-2">
                        <Input
                          type="number"
                          className="w-[80px] h-7 text-sm text-center"
                          value={recipes[product.id]?.[menu.id]?.amount ?? 0}
                          onChange={(e) => updateRecipe(product.id, menu.id, "amount", Number(e.target.value))}
                        />
                        <Input
                          type="number"
                          className="w-[70px] h-7 text-sm text-center text-muted-foreground"
                          value={recipes[product.id]?.[menu.id]?.tolerance_percent ?? 0}
                          onChange={(e) => updateRecipe(product.id, menu.id, "tolerance_percent", Number(e.target.value))}
                        />
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={menus.length + 1} className="text-center text-muted-foreground py-8">
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
