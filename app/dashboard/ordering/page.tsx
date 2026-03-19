"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SupplierManager } from "@/components/ordering/SupplierManager";
import { OrderList } from "@/components/ordering/OrderList";
import { DeliveryList } from "@/components/ordering/DeliveryList";

export default function OrderingPage() {
  const [storeId, setStoreId] = useState("");
  const supabase = createClient();

  useEffect(() => {
    const fetchStore = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (store) setStoreId(store.id);
    };
    fetchStore();
  }, []);

  if (!storeId) return null;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="suppliers" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="suppliers">업체 / 발주 설정</TabsTrigger>
          <TabsTrigger value="orders">발주 신청 목록</TabsTrigger>
          <TabsTrigger value="deliveries">도착 예정 목록</TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers">
          <SupplierManager storeId={storeId} />
        </TabsContent>
        <TabsContent value="orders">
          <OrderList storeId={storeId} />
        </TabsContent>
        <TabsContent value="deliveries">
          <DeliveryList storeId={storeId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
