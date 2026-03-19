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
import { Save, RefreshCw, FlaskConical, Table2, Loader2, CheckCircle2, ShoppingCart, X, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { calculateUpdatedInventory, type InventoryCalcResult } from "@/lib/calculations";
import { useSpreadsheetNav, parsePasteData } from "@/hooks/use-spreadsheet";
import { SpreadsheetModal, type SheetColumn, type SheetRow } from "@/components/SpreadsheetModal";

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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done">("idle");

  const [sauceProducts, setSauceProducts] = useState<SauceProduct[]>([]);
  const [sauceRecipes, setSauceRecipes] = useState<SauceRecipe[]>([]);
  const [sauceProductions, setSauceProductions] = useState<Record<string, number>>({});
  const [sauceDialogOpen, setSauceDialogOpen] = useState(false);

  // 발주 추천 관련
  interface OrderRecommendation {
    productId: string;
    productName: string;
    newQuantity: number;
    threshold: number;
    orderQuantity: number;
    orderUnit: string;
    unitAmount: number;
    deliveryDays: number;
    supplierId: string;
    supplierName: string;
  }
  const [orderRecommendations, setOrderRecommendations] = useState<OrderRecommendation[]>([]);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [orderProcessing, setOrderProcessing] = useState(false);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [orderMessages, setOrderMessages] = useState<{ supplierName: string; message: string }[]>([]);

  const supabase = createClient();
  const { toast } = useToast();
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const navRef = useSpreadsheetNav();

  const calculate = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const calcResults = await calculateUpdatedInventory(supabase, storeId, dateStr);
    setResults(calcResults);
    setLoading(false);
  }, [storeId, dateStr]);

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

  useEffect(() => {
    const handler = () => { calculate(); fetchSauceData(); };
    window.addEventListener("onis-data-updated", handler);
    return () => window.removeEventListener("onis-data-updated", handler);
  }, [calculate, fetchSauceData]);

  const sauceEffectMap = useMemo(() => {
    const effectMap: Record<string, number> = {};

    for (const sauceProduct of sauceProducts) {
      const production = sauceProductions[sauceProduct.id] || 0;
      if (production <= 0) continue;

      effectMap[sauceProduct.id] = (effectMap[sauceProduct.id] || 0) + production;

      const ingredientRecipes = sauceRecipes.filter(
        (r) => r.sauce_product_id === sauceProduct.id
      );

      const totalRecipeAmount = ingredientRecipes.reduce((sum, r) => sum + r.amount, 0);
      if (totalRecipeAmount <= 0) continue;

      for (const recipe of ingredientRecipes) {
        const deduction = recipe.amount * (production / totalRecipeAmount);
        effectMap[recipe.ingredient_product_id] = (effectMap[recipe.ingredient_product_id] || 0) - deduction;
      }
    }

    return effectMap;
  }, [sauceProducts, sauceRecipes, sauceProductions]);

  const filtered = results.filter((r) => r.categoryId === activeCategory);

  const handleSave = async () => {
    setSaveStatus("saving");
    setConfirmOpen(false);
    try {
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
        if (error) { toast({ title: "저장 실패", variant: "destructive" }); setSaveStatus("idle"); return; }
      }

      setSaveStatus("done");

      // 발주 추천 체크: 저장 완료 표시가 사라진 뒤 추천 다이얼로그를 띄움
      const recs = await checkOrderRecommendations();
      setTimeout(() => {
        setSaveStatus("idle");
        if (recs && recs.length > 0) {
          setOrderRecommendations(recs);
          setOrderDialogOpen(true);
        }
      }, 1500);
    } catch {
      setSaveStatus("idle");
    }
  };

  const checkOrderRecommendations = async (): Promise<OrderRecommendation[]> => {
    // 전체 제품의 새 재고를 계산
    const allNewQuantities: Record<string, number> = {};
    for (const r of results) {
      const sauceEffect = sauceEffectMap[r.productId] || 0;
      allNewQuantities[r.productId] = manualOverrides[r.productId] ?? (r.newQuantity + sauceEffect);
    }

    // product_suppliers 조회
    const productIds = results.map((r) => r.productId);
    if (productIds.length === 0) return [];

    const { data: psData, error: psError } = await supabase
      .from("product_suppliers")
      .select("product_id, supplier_id, threshold, order_quantity, order_unit, unit_amount, delivery_days")
      .in("product_id", productIds);

    if (psError) {
      console.error("[발주추천] product_suppliers 조회 오류:", psError.message);
      return [];
    }
    if (!psData || psData.length === 0) return [];

    // 업체명 조회
    const supplierIds = Array.from(new Set(psData.map((ps) => ps.supplier_id)));
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .in("id", supplierIds);
    const supplierMap: Record<string, string> = {};
    suppliers?.forEach((s) => { supplierMap[s.id] = s.name; });

    // 임계값 이하 제품 필터 (newQty는 g 총량이므로 수량(개수)으로 변환하여 비교)
    const recommendations: OrderRecommendation[] = [];
    for (const ps of psData) {
      const newQtyGrams = allNewQuantities[ps.product_id];
      if (newQtyGrams === undefined) continue;
      const result = results.find((r) => r.productId === ps.product_id);
      const unitValue = parseFloat(result?.productUnit || "0") || 0;
      // g총량 → 수량으로 변환: ex) 40g / 100g = 0.4개
      const newQtyUnits = unitValue > 0 ? Math.round((newQtyGrams / unitValue) * 100) / 100 : newQtyGrams;

      if (newQtyUnits <= ps.threshold && ps.order_quantity > 0) {
        recommendations.push({
          productId: ps.product_id,
          productName: result?.productName || "알 수 없음",
          newQuantity: newQtyUnits,
          threshold: ps.threshold,
          orderQuantity: ps.order_quantity,
          orderUnit: ps.order_unit || "",
          unitAmount: ps.unit_amount || 0,
          deliveryDays: ps.delivery_days,
          supplierId: ps.supplier_id,
          supplierName: supplierMap[ps.supplier_id] || "알 수 없음",
        });
      }
    }

    return recommendations;
  };

  const removeRecommendation = (productId: string) => {
    setOrderRecommendations((prev) => prev.filter((r) => r.productId !== productId));
  };

  const confirmOrders = async () => {
    if (orderRecommendations.length === 0) return;
    setOrderProcessing(true);

    try {
      const today = format(new Date(), "yyyy-MM-dd");

      // 업체별로 그룹핑
      const bySupplier: Record<string, OrderRecommendation[]> = {};
      for (const rec of orderRecommendations) {
        if (!bySupplier[rec.supplierId]) bySupplier[rec.supplierId] = [];
        bySupplier[rec.supplierId].push(rec);
      }

      for (const [supplierId, items] of Object.entries(bySupplier)) {
        const deliveryDays = Math.max(...items.map((i) => i.deliveryDays));
        const expectedDate = new Date();
        expectedDate.setDate(expectedDate.getDate() + deliveryDays);
        const expectedDateStr = format(expectedDate, "yyyy-MM-dd");

        // 발주 생성
        const { data: order, error: orderError } = await supabase
          .from("orders")
          .insert({
            store_id: storeId,
            supplier_id: supplierId,
            order_date: today,
            expected_date: expectedDateStr,
            status: "ordered",
          })
          .select("id")
          .single();

        if (orderError || !order) {
          toast({ title: "발주 생성 실패", variant: "destructive" });
          continue;
        }

        // 발주 항목 생성
        const orderItems = items.map((item) => ({
          order_id: order.id,
          product_id: item.productId,
          quantity: item.orderQuantity,
        }));

        await supabase.from("order_items").insert(orderItems);
      }

      window.dispatchEvent(new Event("onis-order-updated"));

      // 업체별 문자 메시지 생성
      const messages: { supplierName: string; message: string }[] = [];
      for (const [, items] of Object.entries(bySupplier)) {
        const supplierName = items[0].supplierName;
        const lines = items.map((item) => {
          const unit = item.orderUnit || "";
          return `${item.productName} ${item.orderQuantity}${unit}`;
        });
        lines.push("부탁드립니다");
        messages.push({ supplierName, message: lines.join("\n") });
      }

      setOrderDialogOpen(false);
      setOrderRecommendations([]);
      setOrderMessages(messages);
      setMessageDialogOpen(true);
    } catch {
      toast({ title: "발주 처리 실패", variant: "destructive" });
    } finally {
      setOrderProcessing(false);
    }
  };

  // Paste handler for manual overrides
  const handlePaste = (e: React.ClipboardEvent, startIdx: number) => {
    const toleranceItems = filtered.filter((r) => r.hasTolerance);
    const data = parsePasteData(e);
    if (!data) return;
    setManualOverrides((prev) => {
      const updated = { ...prev };
      for (let i = 0; i < data.length && startIdx + i < toleranceItems.length; i++) {
        updated[toleranceItems[startIdx + i].productId] = data[i][0] ?? 0;
      }
      return updated;
    });
  };

  // Sheet data
  const sheetColumns: SheetColumn[] = [
    { key: "name", header: "제품명", width: 150 },
    { key: "current", header: "현재재고", width: 100 },
    { key: "used", header: "사용량", width: 120 },
    { key: "waste", header: "폐기량", width: 80 },
    { key: "sauce", header: "소스 생산", width: 100 },
    { key: "newQty", header: "새 재고", width: 120 },
    { key: "override", header: "확정값", type: "number", editable: true, width: 100 },
  ];

  const sheetRows: SheetRow[] = filtered.map((r) => {
    const sauceEffect = sauceEffectMap[r.productId] || 0;
    const adjustedNew = r.newQuantity + sauceEffect;
    return {
      id: r.productId,
      values: {
        name: r.productName,
        current: r.currentQuantity,
        used: r.hasTolerance ? `${r.totalUsedMin?.toFixed(1)} ~ ${r.totalUsedMax?.toFixed(1)}` : r.totalUsed.toFixed(1),
        waste: r.wasteAmount,
        sauce: sauceEffect !== 0 ? `${sauceEffect > 0 ? "+" : ""}${sauceEffect.toFixed(1)}` : "-",
        newQty: r.hasTolerance
          ? `${(r.newQuantityMin! + sauceEffect).toFixed(1)} ~ ${(r.newQuantityMax! + sauceEffect).toFixed(1)}`
          : adjustedNew.toFixed(1),
        override: manualOverrides[r.productId] ?? "",
      },
    };
  });

  const handleSheetCellChange = (rowId: string, colKey: string, value: string | number) => {
    if (colKey === "override") {
      setManualOverrides((prev) => ({ ...prev, [rowId]: Number(value) || 0 }));
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
          <CardTitle>업데이트 재고 - {format(selectedDate, "yyyy년 MM월 dd일")}</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSauceDialogOpen(true)} disabled={sauceProducts.length === 0}>
              <FlaskConical className="h-4 w-4 mr-1" />자체소스 생산
            </Button>
            <Button variant="outline" size="sm" onClick={calculate} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />재계산
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
              <Table2 className="h-4 w-4 mr-1" />시트 입력
            </Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)}><Save className="h-4 w-4 mr-1" />저장</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={navRef}>
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
                const toleranceIdx = filtered.filter((x) => x.hasTolerance).indexOf(r);

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
                          onChange={(e) => setManualOverrides((prev) => ({ ...prev, [r.productId]: Number(e.target.value) }))}
                          onPaste={(e) => handlePaste(e, toleranceIdx)} />
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
        </div>

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

        <SpreadsheetModal
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={`업데이트 재고 시트 - ${format(selectedDate, "yyyy년 MM월 dd일")}`}
          columns={sheetColumns}
          rows={sheetRows}
          onCellChange={handleSheetCellChange}
        />

        {/* 발주 추천 다이얼로그 */}
        <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                발주 추천
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              아래 제품들이 임계값 이하입니다. 발주를 진행하시겠습니까?
            </p>
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>제품명</TableHead>
                    <TableHead className="text-right">현재</TableHead>
                    <TableHead className="text-right">임계값</TableHead>
                    <TableHead className="text-right">발주량</TableHead>
                    <TableHead>업체</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderRecommendations.map((rec) => (
                    <TableRow key={rec.productId}>
                      <TableCell className="font-medium">{rec.productName}</TableCell>
                      <TableCell className="text-right text-red-600 font-mono">{rec.newQuantity.toFixed(1)}</TableCell>
                      <TableCell className="text-right text-muted-foreground font-mono">{rec.threshold}</TableCell>
                      <TableCell className="text-right font-mono">{rec.orderQuantity}{rec.orderUnit}</TableCell>
                      <TableCell className="text-sm">{rec.supplierName}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRecommendation(rec.productId)}>
                          <X className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {orderRecommendations.length === 0 ? (
              <div className="flex justify-end mt-4">
                <Button variant="outline" onClick={() => setOrderDialogOpen(false)}>닫기</Button>
              </div>
            ) : (
              <div className="flex gap-2 justify-end mt-4">
                <Button variant="outline" onClick={() => setOrderDialogOpen(false)}>나중에</Button>
                <Button onClick={confirmOrders} disabled={orderProcessing}>
                  {orderProcessing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-1" />}
                  발주 진행 ({orderRecommendations.length}개)
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* 발주 문자 복사 다이얼로그 */}
        <OrderMessageDialog
          open={messageDialogOpen}
          onOpenChange={setMessageDialogOpen}
          messages={orderMessages}
        />
      </CardContent>
    </Card>
    </>
  );
}

function OrderMessageDialog({
  open,
  onOpenChange,
  messages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: { supplierName: string; message: string }[];
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>발주 문자</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          복사 버튼을 눌러 카카오톡/문자에 붙여넣기 하세요.
        </p>
        <div className="space-y-4 max-h-[500px] overflow-y-auto">
          {messages.map((msg, idx) => (
            <div key={idx} className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                <span className="font-medium text-sm">{msg.supplierName}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleCopy(msg.message, idx)}
                >
                  {copiedIdx === idx ? (
                    <><Check className="h-3 w-3" />복사됨</>
                  ) : (
                    <><Copy className="h-3 w-3" />복사</>
                  )}
                </Button>
              </div>
              <pre className="px-3 py-2 text-sm whitespace-pre-wrap font-sans">{msg.message}</pre>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-2">
          <Button onClick={() => onOpenChange(false)}>완료</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
