"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CalendarIcon, Truck, PackageCheck, Loader2, CheckCircle2, X } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface OrderItem {
  id: string;
  product_id: string;
  productName: string;
  quantity: number;
  received_quantity: number | null;
}

interface DeliveryOrder {
  id: string;
  supplierName: string;
  orderDate: string;
  expectedDate: string;
  status: string;
  items: OrderItem[];
}

interface Props {
  storeId: string;
}

export function DeliveryList({ storeId }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<DeliveryOrder | null>(null);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done">("idle");
  const supabase = createClient();
  const { toast } = useToast();
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const fetchDeliveries = useCallback(async () => {
    if (!storeId) return;

    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, supplier_id, order_date, expected_date, status")
      .eq("store_id", storeId)
      .eq("expected_date", dateStr)
      .order("created_at", { ascending: false });

    if (!ordersData || ordersData.length === 0) {
      setDeliveries([]);
      return;
    }

    const supplierIds = Array.from(new Set(ordersData.map((o) => o.supplier_id)));
    const { data: suppliers } = await supabase
      .from("suppliers").select("id, name").in("id", supplierIds);
    const supplierMap: Record<string, string> = {};
    suppliers?.forEach((s) => { supplierMap[s.id] = s.name; });

    const orderIds = ordersData.map((o) => o.id);
    const { data: items } = await supabase
      .from("order_items")
      .select("id, order_id, product_id, quantity, received_quantity")
      .in("order_id", orderIds);

    const productIds = Array.from(new Set(items?.map((i) => i.product_id) || []));
    const productMap: Record<string, string> = {};
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("products").select("id, name").in("id", productIds);
      products?.forEach((p) => { productMap[p.id] = p.name; });
    }

    const result: DeliveryOrder[] = ordersData.map((order) => ({
      id: order.id,
      supplierName: supplierMap[order.supplier_id] || "알 수 없음",
      orderDate: order.order_date,
      expectedDate: order.expected_date,
      status: order.status,
      items: (items || [])
        .filter((i) => i.order_id === order.id)
        .map((i) => ({
          id: i.id,
          product_id: i.product_id,
          productName: productMap[i.product_id] || "알 수 없음",
          quantity: i.quantity,
          received_quantity: i.received_quantity,
        })),
    }));

    setDeliveries(result);
  }, [storeId, dateStr]);

  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  useEffect(() => {
    const handler = () => fetchDeliveries();
    window.addEventListener("onis-order-updated", handler);
    return () => window.removeEventListener("onis-order-updated", handler);
  }, [fetchDeliveries]);

  const deleteOrder = async (orderId: string) => {
    await supabase.from("order_items").delete().eq("order_id", orderId);
    await supabase.from("orders").delete().eq("id", orderId);
    fetchDeliveries();
    window.dispatchEvent(new Event("onis-order-updated"));
    toast({ title: "발주 삭제 완료" });
  };

  const openReceiveDialog = (order: DeliveryOrder) => {
    setReceivingOrder(order);
    const qtyMap: Record<string, number> = {};
    order.items.forEach((item) => {
      qtyMap[item.id] = item.quantity; // 기본값: 발주 수량
    });
    setReceiveQuantities(qtyMap);
    setReceiveDialogOpen(true);
  };

  const confirmReceive = async () => {
    if (!receivingOrder) return;
    setSaveStatus("saving");
    setReceiveDialogOpen(false);

    try {
      // 1. order_items에 received_quantity 업데이트
      for (const item of receivingOrder.items) {
        const receivedQty = receiveQuantities[item.id] ?? item.quantity;
        await supabase
          .from("order_items")
          .update({ received_quantity: receivedQty })
          .eq("id", item.id);
      }

      // 2. order 상태를 received로 변경
      await supabase
        .from("orders")
        .update({ status: "received" })
        .eq("id", receivingOrder.id);

      // 3. 현재재고에 입고 수량 반영 (오늘 날짜 스냅샷에 추가)
      // 발주 수량 × 실제량(unit_amount)으로 g 단위 변환
      const productIdsForOrder = receivingOrder.items.map((i) => i.product_id);
      const { data: psData } = await supabase
        .from("product_suppliers")
        .select("product_id, unit_amount")
        .in("product_id", productIdsForOrder);
      const unitAmountMap: Record<string, number> = {};
      psData?.forEach((ps) => { unitAmountMap[ps.product_id] = ps.unit_amount || 0; });

      const today = format(new Date(), "yyyy-MM-dd");
      for (const item of receivingOrder.items) {
        const receivedQty = receiveQuantities[item.id] ?? item.quantity;
        const unitAmount = unitAmountMap[item.product_id] || 1;
        // 입고량(g) = 받은 수량 × 실제량 (ex: 3kg × 1000 = 3000g)
        const receivedGrams = receivedQty * unitAmount;

        // 현재 스냅샷 조회
        const { data: snapshot } = await supabase
          .from("inventory_snapshots")
          .select("id, quantity, remaining")
          .eq("product_id", item.product_id)
          .eq("date", today)
          .single();

        // 제품의 단위 조회
        const { data: product } = await supabase
          .from("products")
          .select("unit")
          .eq("id", item.product_id)
          .single();

        const unitValue = parseFloat(product?.unit || "0") || 0;

        if (snapshot) {
          const currentTotal = (snapshot.quantity * (unitValue || 1)) + snapshot.remaining;
          const newTotal = currentTotal + receivedGrams;
          const newQty = unitValue > 0 ? Math.floor(newTotal / unitValue) : 0;
          const newRem = unitValue > 0 ? newTotal - newQty * unitValue : newTotal;

          await supabase
            .from("inventory_snapshots")
            .update({ quantity: newQty, remaining: Math.round(newRem * 100) / 100 })
            .eq("id", snapshot.id);
        } else {
          const newQty = unitValue > 0 ? Math.floor(receivedGrams / unitValue) : 0;
          const newRem = unitValue > 0 ? receivedGrams - newQty * unitValue : receivedGrams;

          await supabase
            .from("inventory_snapshots")
            .insert({
              product_id: item.product_id,
              date: today,
              quantity: newQty,
              remaining: Math.round(newRem * 100) / 100,
            });
        }
      }

      window.dispatchEvent(new Event("onis-data-updated"));
      setSaveStatus("done");
      setTimeout(() => setSaveStatus("idle"), 1500);
      fetchDeliveries();
      toast({ title: "입고 확인 완료" });
    } catch {
      setSaveStatus("idle");
      toast({ title: "입고 처리 실패", variant: "destructive" });
    }
  };

  return (
    <>
      {saveStatus !== "idle" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl px-8 py-6 shadow-2xl flex flex-col items-center gap-3">
            {saveStatus === "saving" ? (
              <><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="text-sm font-medium">입고 처리중...</span></>
            ) : (
              <><CheckCircle2 className="h-8 w-8 text-green-500" /><span className="text-sm font-medium">입고 완료</span></>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              도착 예정 목록
            </CardTitle>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[180px] justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, "yyyy년 MM월 dd일", { locale: ko })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} locale={ko} />
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {format(selectedDate, "yyyy년 MM월 dd일", { locale: ko })}에 도착 예정인 발주가 없습니다.
            </p>
          ) : (
            <div className="space-y-4">
              {deliveries.map((order) => (
                <div key={order.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{order.supplierName}</span>
                      <Badge variant={order.status === "received" ? "default" : "outline"}>
                        {order.status === "ordered" ? "배송중" : "입고완료"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        발주일: {format(new Date(order.orderDate + "T00:00:00"), "MM/dd", { locale: ko })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {order.status === "ordered" && (
                        <Button size="sm" onClick={() => openReceiveDialog(order)}>
                          <PackageCheck className="h-4 w-4 mr-1" />입고 확인
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteOrder(order.id)}>
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>제품명</TableHead>
                        <TableHead className="text-right">발주 수량</TableHead>
                        {order.status === "received" && (
                          <TableHead className="text-right">입고 수량</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                          {order.status === "received" && (
                            <TableCell className="text-right font-mono">
                              {item.received_quantity ?? item.quantity}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 입고 확인 모달 */}
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>입고 확인 - {receivingOrder?.supplierName}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            발주 수량이 기본값으로 입력되어 있습니다. 실제 입고 수량이 다르면 수정해주세요.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제품명</TableHead>
                <TableHead className="text-right">발주 수량</TableHead>
                <TableHead className="text-right">입고 수량</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receivingOrder?.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      className="w-[100px] h-8 text-sm text-right ml-auto"
                      value={receiveQuantities[item.id] ?? item.quantity}
                      onChange={(e) => setReceiveQuantities((prev) => ({
                        ...prev,
                        [item.id]: Number(e.target.value),
                      }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setReceiveDialogOpen(false)}>취소</Button>
            <Button onClick={confirmReceive}>재고 업데이트</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
