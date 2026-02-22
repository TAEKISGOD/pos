"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useDateContext } from "@/lib/date-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Save, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import * as XLSX from "xlsx";

interface RecipeMenu {
  id: string;
  name: string;
}

interface MenuBoardItem {
  id: string;
  name: string;
  price: number;
  sectionId: string;
  sectionName: string;
}

interface SectionGroup {
  id: string;
  name: string;
  items: MenuBoardItem[];
}

interface ProductItem {
  id: string;
  name: string;
  categoryName: string;
}

interface Props {
  activeCategory: string;
  storeId: string;
}

export function TodaySales({ activeCategory, storeId }: Props) {
  const { selectedDate } = useDateContext();
  const [recipeMenus, setRecipeMenus] = useState<RecipeMenu[]>([]);
  const [recipeSales, setRecipeSales] = useState<Record<string, number>>({});
  const [sectionGroups, setSectionGroups] = useState<SectionGroup[]>([]);
  const [allMenuItems, setAllMenuItems] = useState<MenuBoardItem[]>([]);
  const [sales, setSales] = useState<Record<string, number>>({});
  const [allProducts, setAllProducts] = useState<ProductItem[]>([]);
  const [productSales, setProductSales] = useState<Record<string, number>>({});
  const supabase = createClient();
  const { toast } = useToast();
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
    if (!storeId) return;

    // 레시피 메뉴 조회
    const { data: menuData } = await supabase
      .from("menus").select("*").eq("store_id", storeId).order("created_at");
    if (menuData) setRecipeMenus(menuData);

    if (menuData && menuData.length > 0) {
      const { data: recipeSalesData } = await supabase
        .from("daily_sales").select("*").in("menu_id", menuData.map((m) => m.id)).eq("date", dateStr);
      if (recipeSalesData) {
        const rsMap: Record<string, number> = {};
        recipeSalesData.forEach((s) => (rsMap[s.menu_id] = s.quantity));
        setRecipeSales(rsMap);
      }
    }

    // 메뉴판 보드에서 섹션 + 아이템 조회
    const { data: sections } = await supabase
      .from("menu_board_sections").select("*").eq("store_id", storeId).order("sort_order");

    if (sections && sections.length > 0) {
      const sectionIds = sections.map((s) => s.id);
      const { data: items } = await supabase
        .from("menu_board_items").select("*").in("section_id", sectionIds).order("sort_order");

      const sectionNameMap: Record<string, string> = {};
      sections.forEach((s) => { sectionNameMap[s.id] = s.name; });

      const menuItems: MenuBoardItem[] = (items || []).map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        sectionId: item.section_id,
        sectionName: sectionNameMap[item.section_id] || "",
      }));
      setAllMenuItems(menuItems);

      const groups: SectionGroup[] = sections.map((s) => ({
        id: s.id,
        name: s.name,
        items: menuItems.filter((m) => m.sectionId === s.id),
      }));
      setSectionGroups(groups);

      // 메뉴판 아이템 판매 데이터
      const itemIds = menuItems.map((m) => m.id);
      if (itemIds.length > 0) {
        const { data: salesData } = await supabase
          .from("daily_sales").select("*").in("menu_id", itemIds).eq("date", dateStr);
        if (salesData) {
          const salesMap: Record<string, number> = {};
          salesData.forEach((s) => (salesMap[s.menu_id] = s.quantity));
          setSales(salesMap);
        }
      }
    } else {
      setSectionGroups([]);
      setAllMenuItems([]);
    }

    // 전체 제품 (제품 직접 판매 매칭용)
    const { data: categories } = await supabase
      .from("categories").select("id, name").eq("store_id", storeId);

    if (categories && categories.length > 0) {
      const catNameMap: Record<string, string> = {};
      categories.forEach((c) => { catNameMap[c.id] = c.name; });

      const { data: products } = await supabase
        .from("products").select("id, name, category_id")
        .in("category_id", categories.map((c) => c.id))
        .order("created_at");

      if (products) {
        setAllProducts(products.map((p) => ({
          id: p.id,
          name: p.name,
          categoryName: catNameMap[p.category_id] || "",
        })));

        const { data: prodSalesData } = await supabase
          .from("daily_product_sales").select("*")
          .in("product_id", products.map((p) => p.id))
          .eq("date", dateStr);

        if (prodSalesData) {
          const psMap: Record<string, number> = {};
          prodSalesData.forEach((s) => { psMap[s.product_id] = s.quantity; });
          setProductSales(psMap);
        }
      }
    }
  }, [storeId, dateStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stripPrefix = (name: string) => name.replace(/^\d+\./, "").trim();

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const allRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    // 헤더 행 찾기
    let nameCol = -1;
    let qtyCol = -1;
    let headerIdx = -1;
    for (let i = 0; i < Math.min(allRows.length, 20); i++) {
      const row = allRows[i];
      if (!row) continue;
      const ni = row.findIndex((c) => c === "상품명" || c === "메뉴명");
      const qi = row.findIndex((c) => c === "수량");
      if (ni !== -1 && qi !== -1) {
        nameCol = ni;
        qtyCol = qi;
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) {
      toast({ title: "엑셀 형식을 인식할 수 없습니다.", description: "'상품명'(또는 '메뉴명')과 '수량' 컬럼이 필요합니다.", variant: "destructive" });
      e.target.value = "";
      return;
    }

    // 이름 → 수량 합산 (접두사 제거)
    const nameSalesMap: Record<string, number> = {};
    let dataCount = 0;
    for (let i = headerIdx + 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (!row) continue;
      const rawName = String(row[nameCol] || "").trim();
      const qty = Number(row[qtyCol] || 0);
      if (!rawName || qty <= 0) continue;
      if (rawName.startsWith("소계") || rawName === "합계") continue;

      const itemName = stripPrefix(rawName);
      nameSalesMap[itemName] = (nameSalesMap[itemName] || 0) + qty;
      dataCount++;
    }

    const matchedNames = new Set<string>();

    // 1차: 레시피 메뉴 매칭
    const newRecipeSales: Record<string, number> = {};
    let recipeMatchCount = 0;
    for (const [name, qty] of Object.entries(nameSalesMap)) {
      const menu = recipeMenus.find((m) => m.name === name);
      if (menu) {
        newRecipeSales[menu.id] = (newRecipeSales[menu.id] || 0) + qty;
        matchedNames.add(name);
        recipeMatchCount++;
      }
    }

    // 2차: 메뉴판 아이템 매칭
    const newMenuSales: Record<string, number> = {};
    let menuMatchCount = 0;
    for (const [name, qty] of Object.entries(nameSalesMap)) {
      if (matchedNames.has(name)) continue;
      const menuItem = allMenuItems.find((m) => m.name === name);
      if (menuItem) {
        newMenuSales[menuItem.id] = (newMenuSales[menuItem.id] || 0) + qty;
        matchedNames.add(name);
        menuMatchCount++;
      }
    }

    // 3차: 제품명 매칭
    const newProdSales: Record<string, number> = {};
    let productMatchCount = 0;
    for (const [name, qty] of Object.entries(nameSalesMap)) {
      if (matchedNames.has(name)) continue;
      const product = allProducts.find((p) => p.name === name);
      if (product) {
        newProdSales[product.id] = (newProdSales[product.id] || 0) + qty;
        matchedNames.add(name);
        productMatchCount++;
      }
    }

    const unmatchedCount = Object.keys(nameSalesMap).length - matchedNames.size;

    setRecipeSales((prev) => ({ ...prev, ...newRecipeSales }));
    setSales((prev) => ({ ...prev, ...newMenuSales }));
    setProductSales((prev) => ({ ...prev, ...newProdSales }));

    const parts: string[] = [];
    if (recipeMatchCount > 0) parts.push(`레시피 메뉴 ${recipeMatchCount}개`);
    if (menuMatchCount > 0) parts.push(`메뉴판 ${menuMatchCount}개`);
    if (productMatchCount > 0) parts.push(`제품 ${productMatchCount}개`);

    toast({
      title: `엑셀 ${dataCount}행 → ${parts.join(" + ")} 매칭`,
      description: unmatchedCount > 0 ? `${unmatchedCount}개 항목은 매칭 실패 (건너뜀)` : undefined,
    });
    e.target.value = "";
  };

  const saveSales = async () => {
    // 레시피 메뉴 판매 저장
    const recipeMenuIds = recipeMenus.map((m) => m.id);
    if (recipeMenuIds.length > 0) {
      await supabase.from("daily_sales").delete().in("menu_id", recipeMenuIds).eq("date", dateStr);
    }
    const recipeInserts = recipeMenus
      .filter((m) => (recipeSales[m.id] ?? 0) > 0)
      .map((m) => ({ menu_id: m.id, date: dateStr, quantity: recipeSales[m.id] ?? 0 }));
    if (recipeInserts.length > 0) {
      const { error } = await supabase.from("daily_sales").insert(recipeInserts);
      if (error) { toast({ title: "레시피 메뉴 판매 저장 실패", description: error.message, variant: "destructive" }); return; }
    }

    // 메뉴판 아이템 판매 저장
    const itemIds = allMenuItems.map((m) => m.id);
    if (itemIds.length > 0) {
      await supabase.from("daily_sales").delete().in("menu_id", itemIds).eq("date", dateStr);
    }
    const menuInserts = allMenuItems
      .filter((item) => (sales[item.id] ?? 0) > 0)
      .map((item) => ({ menu_id: item.id, date: dateStr, quantity: sales[item.id] ?? 0 }));
    if (menuInserts.length > 0) {
      const { error } = await supabase.from("daily_sales").insert(menuInserts);
      if (error) { toast({ title: "메뉴판 판매 저장 실패", variant: "destructive" }); return; }
    }

    // 제품 직접 판매 저장
    const productIds = allProducts.map((p) => p.id);
    if (productIds.length > 0) {
      await supabase.from("daily_product_sales").delete().in("product_id", productIds).eq("date", dateStr);
    }
    const prodInserts = allProducts
      .filter((p) => (productSales[p.id] ?? 0) > 0)
      .map((p) => ({ product_id: p.id, date: dateStr, quantity: productSales[p.id] ?? 0 }));
    if (prodInserts.length > 0) {
      const { error } = await supabase.from("daily_product_sales").insert(prodInserts);
      if (error) { toast({ title: "제품 판매 저장 실패", variant: "destructive" }); return; }
    }

    toast({ title: "판매량 저장 완료" });
  };

  // 판매된 레시피 메뉴만
  const soldRecipeMenus = recipeMenus.filter((m) => (recipeSales[m.id] ?? 0) > 0);

  // 판매된 제품만
  const soldProducts = allProducts.filter((p) => (productSales[p.id] ?? 0) > 0);

  // 판매된 메뉴판 아이템만 섹션별 그룹핑
  const soldSectionGroups = sectionGroups
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => (sales[item.id] ?? 0) > 0),
    }))
    .filter((section) => section.items.length > 0);

  const hasSoldAnything = soldRecipeMenus.length > 0 || soldProducts.length > 0 || soldSectionGroups.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>오늘 판매량 - {format(selectedDate, "yyyy년 MM월 dd일")}</CardTitle>
          <div className="flex items-center gap-2">
            <label>
              <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
              <Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" />엑셀 업로드</span></Button>
            </label>
            <Button size="sm" onClick={saveSales}><Save className="h-4 w-4 mr-1" />저장</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* 레시피 메뉴 (최상위) */}
        {soldRecipeMenus.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-sm font-semibold">레시피 메뉴</h4>
              <Badge variant="secondary" className="text-xs">{soldRecipeMenus.length}개</Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>메뉴명</TableHead>
                  <TableHead>판매 수량</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {soldRecipeMenus.map((menu) => (
                  <TableRow key={menu.id}>
                    <TableCell className="font-medium">{menu.name}</TableCell>
                    <TableCell>
                      <Input type="number" className="w-[120px]" value={recipeSales[menu.id] ?? 0}
                        onChange={(e) => setRecipeSales((prev) => ({ ...prev, [menu.id]: Number(e.target.value) }))} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* 등록된 항목 판매 */}
        {soldProducts.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-sm font-semibold">등록된 항목 판매</h4>
              <Badge variant="secondary" className="text-xs">{soldProducts.length}개</Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제품명</TableHead>
                  <TableHead>카테고리</TableHead>
                  <TableHead>판매 수량</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {soldProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-muted-foreground">{product.categoryName}</TableCell>
                    <TableCell>
                      <Input type="number" className="w-[120px]" value={productSales[product.id] ?? 0}
                        onChange={(e) => setProductSales((prev) => ({ ...prev, [product.id]: Number(e.target.value) }))} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* 메뉴판 섹션별 표시 */}
        {soldSectionGroups.map((section) => (
          <div key={section.id} className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-sm font-semibold">{section.name}</h4>
              <Badge variant="secondary" className="text-xs">{section.items.length}개</Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>메뉴명</TableHead>
                  <TableHead>가격</TableHead>
                  <TableHead>판매 수량</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {section.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">₩{item.price.toLocaleString()}</TableCell>
                    <TableCell>
                      <Input type="number" className="w-[120px]" value={sales[item.id] ?? 0}
                        onChange={(e) => setSales((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}

        {!hasSoldAnything && (
          <div className="text-center text-muted-foreground py-8">
            엑셀을 업로드하면 메뉴판과 매칭된 판매 데이터가 표시됩니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
