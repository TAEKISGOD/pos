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
import { Save, Upload, Table2, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { useSpreadsheetNav, parsePasteData } from "@/hooks/use-spreadsheet";
import { SpreadsheetModal, type SheetColumn, type SheetRow } from "@/components/SpreadsheetModal";

interface RecipeMenu {
  id: string;
  name: string;
  product_code?: string;
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

export function TodaySales({ storeId }: Props) {
  const { selectedDate } = useDateContext();
  const [recipeMenus, setRecipeMenus] = useState<RecipeMenu[]>([]);
  const [recipeSales, setRecipeSales] = useState<Record<string, number>>({});
  const [sectionGroups, setSectionGroups] = useState<SectionGroup[]>([]);
  const [allMenuItems, setAllMenuItems] = useState<MenuBoardItem[]>([]);
  const [sales, setSales] = useState<Record<string, number>>({});
  const [allProducts, setAllProducts] = useState<ProductItem[]>([]);
  const [productSales, setProductSales] = useState<Record<string, number>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done">("idle");
  const supabase = createClient();
  const { toast } = useToast();
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const navRef = useSpreadsheetNav();

  const fetchData = useCallback(async () => {
    if (!storeId) return;

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

  useEffect(() => {
    const handler = () => { fetchData(); };
    window.addEventListener("onis-data-updated", handler);
    return () => window.removeEventListener("onis-data-updated", handler);
  }, [fetchData]);

  const stripPrefix = (name: string) => name.replace(/^\d+\./, "").trim();

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const allRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    let nameCol = -1;
    let qtyCol = -1;
    let codeCol = -1;
    let headerIdx = -1;
    for (let i = 0; i < Math.min(allRows.length, 20); i++) {
      const row = allRows[i];
      if (!row) continue;
      const ni = row.findIndex((c) => c === "상품명" || c === "메뉴명");
      const qi = row.findIndex((c) => c === "수량");
      const ci = row.findIndex((c) => c === "상품코드");
      if (ni !== -1 && qi !== -1) {
        nameCol = ni;
        qtyCol = qi;
        codeCol = ci;
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) {
      toast({ title: "엑셀 형식을 인식할 수 없습니다.", description: "'상품명'(또는 '메뉴명')과 '수량' 컬럼이 필요합니다.", variant: "destructive" });
      e.target.value = "";
      return;
    }

    // 엑셀 행별 데이터 파싱
    interface ExcelRow { name: string; code: string; qty: number }
    const excelRows: ExcelRow[] = [];
    const nameSalesMap: Record<string, number> = {};
    let dataCount = 0;
    for (let i = headerIdx + 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (!row) continue;
      const rawName = String(row[nameCol] || "").trim();
      const qty = Number(row[qtyCol] || 0);
      const code = codeCol !== -1 ? String(row[codeCol] || "").trim() : "";
      if (!rawName || qty <= 0) continue;
      if (rawName.startsWith("소계") || rawName === "합계") continue;

      const itemName = stripPrefix(rawName);
      excelRows.push({ name: itemName, code, qty });
      nameSalesMap[itemName] = (nameSalesMap[itemName] || 0) + qty;
      dataCount++;
    }

    const matchedNames = new Set<string>();

    const newRecipeSales: Record<string, number> = {};
    let recipeMatchCount = 0;

    // 상품코드 비교: 앞자리 0 제거 후 비교 (예: "000007" === "7")
    const normalizeCode = (code: string) => code.replace(/^0+/, "") || "0";

    // 레시피 메뉴 매칭: 메뉴명 AND 상품코드가 모두 일치해야 매칭
    for (const excelRow of excelRows) {
      const menu = recipeMenus.find((m) =>
        m.name === excelRow.name &&
        m.product_code && excelRow.code &&
        normalizeCode(m.product_code) === normalizeCode(excelRow.code)
      );
      if (menu) {
        newRecipeSales[menu.id] = (newRecipeSales[menu.id] || 0) + excelRow.qty;
        matchedNames.add(excelRow.name);
        recipeMatchCount++;
      }
    }

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
    setSaveStatus("saving");
    try {
      const recipeMenuIds = recipeMenus.map((m) => m.id);
      if (recipeMenuIds.length > 0) {
        await supabase.from("daily_sales").delete().in("menu_id", recipeMenuIds).eq("date", dateStr);
      }
      const recipeInserts = recipeMenus
        .filter((m) => (recipeSales[m.id] ?? 0) > 0)
        .map((m) => ({ menu_id: m.id, date: dateStr, quantity: recipeSales[m.id] ?? 0 }));
      if (recipeInserts.length > 0) {
        const { error } = await supabase.from("daily_sales").insert(recipeInserts);
        if (error) { toast({ title: "레시피 메뉴 판매 저장 실패", description: error.message, variant: "destructive" }); setSaveStatus("idle"); return; }
      }

      const itemIds = allMenuItems.map((m) => m.id);
      if (itemIds.length > 0) {
        await supabase.from("daily_sales").delete().in("menu_id", itemIds).eq("date", dateStr);
      }
      const menuInserts = allMenuItems
        .filter((item) => (sales[item.id] ?? 0) > 0)
        .map((item) => ({ menu_id: item.id, date: dateStr, quantity: sales[item.id] ?? 0 }));
      if (menuInserts.length > 0) {
        const { error } = await supabase.from("daily_sales").insert(menuInserts);
        if (error) { toast({ title: "메뉴판 판매 저장 실패", variant: "destructive" }); setSaveStatus("idle"); return; }
      }

      const productIds = allProducts.map((p) => p.id);
      if (productIds.length > 0) {
        await supabase.from("daily_product_sales").delete().in("product_id", productIds).eq("date", dateStr);
      }
      const prodInserts = allProducts
        .filter((p) => (productSales[p.id] ?? 0) > 0)
        .map((p) => ({ product_id: p.id, date: dateStr, quantity: productSales[p.id] ?? 0 }));
      if (prodInserts.length > 0) {
        const { error } = await supabase.from("daily_product_sales").insert(prodInserts);
        if (error) { toast({ title: "제품 판매 저장 실패", variant: "destructive" }); setSaveStatus("idle"); return; }
      }

      setSaveStatus("done");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("idle");
    }
  };

  // Paste handlers
  const handleRecipePaste = (e: React.ClipboardEvent, startIdx: number) => {
    const data = parsePasteData(e);
    if (!data) return;
    setRecipeSales((prev) => {
      const updated = { ...prev };
      for (let i = 0; i < data.length && startIdx + i < recipeMenus.length; i++) {
        updated[recipeMenus[startIdx + i].id] = data[i][0] ?? 0;
      }
      return updated;
    });
  };

  const handleMenuItemPaste = (e: React.ClipboardEvent, itemId: string, items: MenuBoardItem[]) => {
    const data = parsePasteData(e);
    if (!data) return;
    const startIdx = items.findIndex((item) => item.id === itemId);
    if (startIdx === -1) return;
    setSales((prev) => {
      const updated = { ...prev };
      for (let i = 0; i < data.length && startIdx + i < items.length; i++) {
        updated[items[startIdx + i].id] = data[i][0] ?? 0;
      }
      return updated;
    });
  };

  const handleProductPaste = (e: React.ClipboardEvent, startIdx: number) => {
    const data = parsePasteData(e);
    if (!data) return;
    setProductSales((prev) => {
      const updated = { ...prev };
      for (let i = 0; i < data.length && startIdx + i < allProducts.length; i++) {
        updated[allProducts[startIdx + i].id] = data[i][0] ?? 0;
      }
      return updated;
    });
  };

  const soldRecipeMenus = recipeMenus.filter((m) => (recipeSales[m.id] ?? 0) > 0);
  const soldProducts = allProducts.filter((p) => (productSales[p.id] ?? 0) > 0);
  const soldSectionGroups = sectionGroups
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => (sales[item.id] ?? 0) > 0),
    }))
    .filter((section) => section.items.length > 0);
  const hasSoldAnything = soldRecipeMenus.length > 0 || soldProducts.length > 0 || soldSectionGroups.length > 0;

  // Sheet data - show ALL items (not just sold)
  const sheetColumns: SheetColumn[] = [
    { key: "name", header: "이름", width: 200 },
    { key: "category", header: "구분", width: 120 },
    { key: "quantity", header: "판매 수량", type: "number", editable: true, width: 120 },
  ];

  const sheetRows: SheetRow[] = [
    ...recipeMenus.map((menu) => ({
      id: `recipe_${menu.id}`,
      values: { name: menu.name, category: "레시피 메뉴", quantity: recipeSales[menu.id] ?? 0 },
    })),
    ...allMenuItems.map((item) => ({
      id: `menu_${item.id}`,
      values: { name: item.name, category: item.sectionName || "메뉴판", quantity: sales[item.id] ?? 0 },
    })),
    ...allProducts.map((product) => ({
      id: `product_${product.id}`,
      values: { name: product.name, category: product.categoryName, quantity: productSales[product.id] ?? 0 },
    })),
  ];

  const handleSheetCellChange = (rowId: string, colKey: string, value: string | number) => {
    if (colKey !== "quantity") return;
    const num = Number(value) || 0;
    if (rowId.startsWith("recipe_")) {
      const id = rowId.replace("recipe_", "");
      setRecipeSales((prev) => ({ ...prev, [id]: num }));
    } else if (rowId.startsWith("menu_")) {
      const id = rowId.replace("menu_", "");
      setSales((prev) => ({ ...prev, [id]: num }));
    } else if (rowId.startsWith("product_")) {
      const id = rowId.replace("product_", "");
      setProductSales((prev) => ({ ...prev, [id]: num }));
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
          <CardTitle>오늘 판매량 - {format(selectedDate, "yyyy년 MM월 dd일")}</CardTitle>
          <div className="flex items-center gap-2">
            <label>
              <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
              <Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" />엑셀 업로드</span></Button>
            </label>
            <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
              <Table2 className="h-4 w-4 mr-1" />시트 입력
            </Button>
            <Button size="sm" onClick={saveSales}><Save className="h-4 w-4 mr-1" />저장</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={navRef}>
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
                  {soldRecipeMenus.map((menu) => {
                    const menuIdx = recipeMenus.findIndex((m) => m.id === menu.id);
                    return (
                      <TableRow key={menu.id}>
                        <TableCell className="font-medium">{menu.name}</TableCell>
                        <TableCell>
                          <Input type="number" className="w-[120px]" value={recipeSales[menu.id] ?? 0}
                            onChange={(e) => setRecipeSales((prev) => ({ ...prev, [menu.id]: Number(e.target.value) }))}
                            onPaste={(e) => handleRecipePaste(e, menuIdx)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

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
                  {soldProducts.map((product) => {
                    const prodIdx = allProducts.findIndex((p) => p.id === product.id);
                    return (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-muted-foreground">{product.categoryName}</TableCell>
                        <TableCell>
                          <Input type="number" className="w-[120px]" value={productSales[product.id] ?? 0}
                            onChange={(e) => setProductSales((prev) => ({ ...prev, [product.id]: Number(e.target.value) }))}
                            onPaste={(e) => handleProductPaste(e, prodIdx)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

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
                          onChange={(e) => setSales((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))}
                          onPaste={(e) => handleMenuItemPaste(e, item.id, section.items)} />
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
        </div>

        <SpreadsheetModal
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={`판매량 시트 - ${format(selectedDate, "yyyy년 MM월 dd일")}`}
          columns={sheetColumns}
          rows={sheetRows}
          onCellChange={handleSheetCellChange}
        />
      </CardContent>
    </Card>
    </>
  );
}
