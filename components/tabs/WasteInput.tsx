"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useDateContext } from "@/lib/date-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Product {
  id: string;
  name: string;
  unit: string;
}

interface Props {
  activeCategory: string;
  storeId: string;
}

export function WasteInput({ storeId }: Props) {
  const { selectedDate } = useDateContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [waste, setWaste] = useState<Record<string, number>>({});
  const supabase = createClient();
  const { toast } = useToast();
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
    if (!activeCategory) return;

    const { data: productsData } = await supabase
      .from("products").select("*").eq("category_id", activeCategory).order("created_at");

    if (productsData) {
      setProducts(productsData);

      const productIds = productsData.map((p) => p.id);
      if (productIds.length > 0) {
        const { data: wasteData } = await supabase
          .from("daily_waste").select("*").in("product_id", productIds).eq("date", dateStr);
        if (wasteData) {
          const wasteMap: Record<string, number> = {};
          wasteData.forEach((w) => (wasteMap[w.product_id] = w.waste_amount));
          setWaste(wasteMap);
        }
      }
    }
  }, [activeCategory, dateStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveWaste = async () => {
    const productIds = products.map((p) => p.id);
    if (productIds.length > 0) {
      await supabase.from("daily_waste").delete().in("product_id", productIds).eq("date", dateStr);
    }
    const inserts = products
      .filter((p) => (waste[p.id] ?? 0) > 0)
      .map((p) => ({ product_id: p.id, date: dateStr, waste_amount: waste[p.id] ?? 0 }));

    if (inserts.length > 0) {
      const { error } = await supabase.from("daily_waste").insert(inserts);
      if (error) { toast({ title: "저장 실패", variant: "destructive" }); return; }
    }
    toast({ title: "폐기 수량 저장 완료" });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>폐기 수량 - {format(selectedDate, "yyyy년 MM월 dd일")}</CardTitle>
          <Button size="sm" onClick={saveWaste}><Save className="h-4 w-4 mr-1" />저장</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제품명</TableHead>
              <TableHead>단위</TableHead>
              <TableHead>폐기량</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>{product.unit}</TableCell>
                <TableCell>
                  <Input type="number" className="w-[120px]" value={waste[product.id] ?? 0}
                    onChange={(e) => setWaste((prev) => ({ ...prev, [product.id]: Number(e.target.value) }))} />
                </TableCell>
              </TableRow>
            ))}
            {products.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">현재 카테고리에 제품이 없습니다.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
