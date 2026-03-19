"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Save, Trash2, Table2, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSpreadsheetNav, parsePasteData } from "@/hooks/use-spreadsheet";
import { SpreadsheetModal, type SheetColumn, type SheetRow } from "@/components/SpreadsheetModal";

interface Product {
  id: string;
  name: string;
}

interface Menu {
  id: string;
  name: string;
  product_code?: string;
  isNew?: boolean;
}

interface Props {
  activeCategory: string;
  storeId: string;
}

export function MenuRecipe({ activeCategory, storeId }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [recipes, setRecipes] = useState<Record<string, Record<string, { amount: number; tolerance_percent: number }>>>({});
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

  useEffect(() => {
    const handler = () => { fetchData(); };
    window.addEventListener("onis-data-updated", handler);
    return () => window.removeEventListener("onis-data-updated", handler);
  }, [fetchData]);

  const addMenu = () => {
    const tempId = `new-${Date.now()}`;
    setMenus((prev) => [...prev, { id: tempId, name: "", product_code: "", isNew: true }]);
  };

  const updateMenuName = (menuId: string, name: string) => {
    setMenus((prev) => prev.map((m) => m.id === menuId ? { ...m, name } : m));
  };

  const updateMenuCode = (menuId: string, product_code: string) => {
    setMenus((prev) => prev.map((m) => m.id === menuId ? { ...m, product_code } : m));
  };

  const deleteMenu = async (menuId: string) => {
    const menu = menus.find((m) => m.id === menuId);
    if (!menu) return;

    if (!menu.isNew) {
      await supabase.from("menu_recipes").delete().eq("menu_id", menuId);
      await supabase.from("menus").delete().eq("id", menuId);
    }

    setMenus((prev) => prev.filter((m) => m.id !== menuId));
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
    setSaveStatus("saving");
    try {
    const newMenus = menus.filter((m) => m.isNew);
    const savedMenuIds: Record<string, string> = {};

    for (const menu of newMenus) {
      if (!menu.name.trim()) continue;
      const { data, error } = await supabase
        .from("menus")
        .insert({ store_id: storeId, name: menu.name.trim(), product_code: menu.product_code?.trim() || null })
        .select("id")
        .single();

      if (error || !data) {
        toast({ title: `메뉴 "${menu.name}" 저장 실패`, variant: "destructive" });
        return;
      }
      savedMenuIds[menu.id] = data.id;
    }

    // 기존 메뉴 이름/코드 업데이트
    const existingMenus = menus.filter((m) => !m.isNew && m.name.trim());
    for (const menu of existingMenus) {
      await supabase
        .from("menus")
        .update({ name: menu.name.trim(), product_code: menu.product_code?.trim() || null })
        .eq("id", menu.id);
    }

    const finalMenuIds = menus
      .filter((m) => m.name.trim())
      .map((m) => savedMenuIds[m.id] || m.id);

    if (finalMenuIds.length > 0) {
      await supabase
        .from("menu_recipes")
        .delete()
        .in("menu_id", finalMenuIds)
        .in("product_id", products.map((p) => p.id));
    }

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

    fetchData();
    setSaveStatus("done");
    setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("idle");
      toast({ title: "저장 실패", variant: "destructive" });
    }
  };

  // Paste handler
  const handlePaste = (e: React.ClipboardEvent, productIdx: number, menuIdx: number, field: "amount" | "tolerance_percent") => {
    const data = parsePasteData(e);
    if (!data) return;
    for (let r = 0; r < data.length; r++) {
      const pIdx = productIdx + r;
      if (pIdx >= products.length) break;
      for (let c = 0; c < data[r].length; c++) {
        const mIdx = menuIdx + Math.floor(c / 2);
        if (mIdx >= menus.length) break;
        const f = c % 2 === 0 ? "amount" : "tolerance_percent";
        if (field === "tolerance_percent" && c === 0) {
          updateRecipe(products[pIdx].id, menus[mIdx].id, "tolerance_percent", data[r][c]);
        } else {
          updateRecipe(products[pIdx].id, menus[mIdx].id, f, data[r][c]);
        }
      }
    }
  };

  // Sheet data
  const EXTRA_MENU_SLOTS = 100;
  const allMenuSlots = [
    ...menus.map((m) => ({ id: m.id, name: m.name, product_code: m.product_code || "", isNew: false })),
    ...Array.from({ length: EXTRA_MENU_SLOTS }, (_, i) => ({ id: `__newmenu_${i}`, name: "", product_code: "", isNew: true })),
  ];

  // 컬럼: 헤더 없이 (공백), 전부 editable
  const sheetColumns: SheetColumn[] = [
    { key: "c0", header: " ", width: 150, type: "text", editable: true },
    ...allMenuSlots.flatMap((_, i) => [
      { key: `c${1 + i * 2}`, header: " ", type: "text" as const, editable: true, width: 100 },
      { key: `c${2 + i * 2}`, header: " ", type: "text" as const, editable: true, width: 100 },
    ]),
  ];

  // 1행: 메뉴명 / 상품코드 (병합 없음)
  // 2행: 사용량 / 오차(%)

  // 데이터 행: 1행=메뉴명+상품코드, 2행=사용량/오차 라벨, 3행~=제품 데이터
  const sheetRows: SheetRow[] = [
    // 1행: 메뉴명 / 상품코드
    {
      id: "__header_menu",
      values: {
        c0: "제품명",
        ...Object.fromEntries(
          allMenuSlots.flatMap((slot, i) => [
            [`c${1 + i * 2}`, slot.name || ""],
            [`c${2 + i * 2}`, slot.product_code || ""],
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
          allMenuSlots.flatMap((_, i) => [
            [`c${1 + i * 2}`, "사용량"],
            [`c${2 + i * 2}`, "오차(%)"],
          ])
        ),
      },
    },
    // 3행~: 제품 데이터
    ...products.map((product) => {
      const values: Record<string, string | number> = { c0: product.name };
      allMenuSlots.forEach((slot, i) => {
        if (!slot.isNew) {
          const recipe = recipes[product.id]?.[slot.id];
          values[`c${1 + i * 2}`] = recipe?.amount !== undefined && recipe?.amount !== null ? recipe.amount : "";
          values[`c${2 + i * 2}`] = recipe?.tolerance_percent !== undefined && recipe?.tolerance_percent !== null ? recipe.tolerance_percent : "";
        } else {
          values[`c${1 + i * 2}`] = "";
          values[`c${2 + i * 2}`] = "";
        }
      });
      return { id: product.id, values };
    }),
  ];

  const handleSheetCellChange = (rowId: string, colKey: string, value: string | number) => {
    const colIdx = Number(colKey.replace("c", ""));
    if (isNaN(colIdx)) return;

    // 1행: 메뉴 이름 (왼쪽) / 상품코드 (오른쪽) 편집
    if (rowId === "__header_menu") {
      if (colIdx === 0) return; // "제품명" 라벨 무시
      const slotIdx = Math.floor((colIdx - 1) / 2);
      const isLeftCol = (colIdx - 1) % 2 === 0; // 왼쪽=메뉴명, 오른쪽=상품코드
      const slot = allMenuSlots[slotIdx];
      if (!slot) return;

      if (isLeftCol) {
        // 메뉴명 편집
        const menuName = String(value || "").trim();
        if (slot.isNew) {
          if (menuName) {
            const existingNew = menus.find((m) => m.id === slot.id);
            if (!existingNew) {
              setMenus((prev) => [...prev, { id: slot.id, name: menuName, product_code: "", isNew: true }]);
            } else {
              updateMenuName(slot.id, menuName);
            }
          }
        } else {
          updateMenuName(slot.id, menuName);
        }
      } else {
        // 상품코드 편집
        const code = String(value || "").trim();
        if (slot.isNew) {
          const existingNew = menus.find((m) => m.id === slot.id);
          if (existingNew) {
            updateMenuCode(slot.id, code);
          }
        } else {
          updateMenuCode(slot.id, code);
        }
      }
      return;
    }

    // 2행: 사용량/오차 라벨 → 무시
    if (rowId === "__header_sub") return;

    // 제품명 컬럼은 무시
    if (colIdx === 0) return;

    // 제품 데이터 행
    const slotIdx = Math.floor((colIdx - 1) / 2);
    const isAmount = (colIdx - 1) % 2 === 0;
    const slot = allMenuSlots[slotIdx];
    if (!slot) return;

    if (slot.isNew) {
      const existingNew = menus.find((m) => m.id === slot.id);
      if (!existingNew) {
        const menuName = `새 메뉴 ${slotIdx - menus.length + 1}`;
        setMenus((prev) => [...prev, { id: slot.id, name: menuName, isNew: true }]);
      }
    }

    const field = isAmount ? "amount" : "tolerance_percent";
    updateRecipe(rowId, slot.id, field, Number(value) || 0);
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
          <CardTitle>메뉴별 레시피</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addMenu}>
              <Plus className="h-4 w-4 mr-1" />메뉴 추가
            </Button>
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
        <div className="overflow-x-auto" ref={navRef}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px] sticky left-0 z-10 bg-background" rowSpan={2}>제품명</TableHead>
                {menus.map((menu) => (
                  <TableHead key={menu.id} className="min-w-[220px] text-center">
                    <div className="flex items-center gap-1">
                      {menu.isNew ? (
                        <Input
                          className="h-7 text-sm flex-1"
                          value={menu.name}
                          onChange={(e) => updateMenuName(menu.id, e.target.value)}
                          placeholder="메뉴명"
                          lang="ko"
                        />
                      ) : (
                        <span className="text-sm flex-1 truncate">{menu.name}</span>
                      )}
                      <Input
                        className="h-7 text-xs text-center w-[72px] shrink-0 text-muted-foreground"
                        value={menu.product_code || ""}
                        onChange={(e) => updateMenuCode(menu.id, e.target.value)}
                        placeholder="코드"
                      />
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
              {products.map((product, pIdx) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium sticky left-0 z-10 bg-background">{product.name}</TableCell>
                  {menus.map((menu, mIdx) => (
                    <TableCell key={menu.id}>
                      <div className="flex items-center justify-center gap-2">
                        <Input
                          type="number"
                          className="w-[80px] h-7 text-sm text-center"
                          value={recipes[product.id]?.[menu.id]?.amount ?? 0}
                          onChange={(e) => updateRecipe(product.id, menu.id, "amount", Number(e.target.value))}
                          onPaste={(e) => handlePaste(e, pIdx, mIdx, "amount")}
                        />
                        <Input
                          type="number"
                          className="w-[70px] h-7 text-sm text-center text-muted-foreground"
                          value={recipes[product.id]?.[menu.id]?.tolerance_percent ?? 0}
                          onChange={(e) => updateRecipe(product.id, menu.id, "tolerance_percent", Number(e.target.value))}
                          onPaste={(e) => handlePaste(e, pIdx, mIdx, "tolerance_percent")}
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

        <SpreadsheetModal
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="메뉴별 레시피 시트"
          columns={sheetColumns}
          rows={sheetRows}
          onCellChange={handleSheetCellChange}

          freezeRows={2}
          allowInsertRow={false}
        />
      </CardContent>
    </Card>
    </>
  );
}
