"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarIcon, ClipboardList, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface OrderWithItems {
  id: string;
  supplierName: string;
  orderDate: string;
  expectedDate: string;
  status: string;
  items: { productName: string; quantity: number }[];
}

interface Props {
  storeId: string;
}

export function OrderList({ storeId }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const supabase = createClient();
  const { toast } = useToast();
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const fetchOrders = useCallback(async () => {
    if (!storeId) return;

    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, supplier_id, order_date, expected_date, status")
      .eq("store_id", storeId)
      .eq("order_date", dateStr)
      .order("created_at", { ascending: false });

    if (!ordersData || ordersData.length === 0) {
      setOrders([]);
      return;
    }

    // 업체명 조회
    const supplierIds = Array.from(new Set(ordersData.map((o) => o.supplier_id)));
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .in("id", supplierIds);
    const supplierMap: Record<string, string> = {};
    suppliers?.forEach((s) => { supplierMap[s.id] = s.name; });

    // 항목 조회
    const orderIds = ordersData.map((o) => o.id);
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, product_id, quantity")
      .in("order_id", orderIds);

    // 제품명 조회
    const productIds = Array.from(new Set(items?.map((i) => i.product_id) || []));
    const productMap: Record<string, string> = {};
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds);
      products?.forEach((p) => { productMap[p.id] = p.name; });
    }

    const result: OrderWithItems[] = ordersData.map((order) => ({
      id: order.id,
      supplierName: supplierMap[order.supplier_id] || "알 수 없음",
      orderDate: order.order_date,
      expectedDate: order.expected_date,
      status: order.status,
      items: (items || [])
        .filter((i) => i.order_id === order.id)
        .map((i) => ({
          productName: productMap[i.product_id] || "알 수 없음",
          quantity: i.quantity,
        })),
    }));

    setOrders(result);
  }, [storeId, dateStr]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    const handler = () => fetchOrders();
    window.addEventListener("onis-order-updated", handler);
    return () => window.removeEventListener("onis-order-updated", handler);
  }, [fetchOrders]);

  const deleteOrder = async (orderId: string) => {
    await supabase.from("order_items").delete().eq("order_id", orderId);
    await supabase.from("orders").delete().eq("id", orderId);
    fetchOrders();
    window.dispatchEvent(new Event("onis-order-updated"));
    toast({ title: "발주 삭제 완료" });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            발주 신청 목록
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
        {orders.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {format(selectedDate, "yyyy년 MM월 dd일", { locale: ko })}에 발주 내역이 없습니다.
          </p>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{order.supplierName}</span>
                    <Badge variant={order.status === "received" ? "default" : "secondary"}>
                      {order.status === "ordered" ? "발주완료" : "입고완료"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      도착예정: {format(new Date(order.expectedDate + "T00:00:00"), "MM/dd (EEE)", { locale: ko })}
                    </span>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell className="text-right font-mono">{item.quantity}</TableCell>
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
  );
}
