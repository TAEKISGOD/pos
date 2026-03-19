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
import { Save, Table2, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useSpreadsheetNav, parsePasteData } from "@/hooks/use-spreadsheet";
import { SpreadsheetModal, type SheetColumn, type SheetRow } from "@/components/SpreadsheetModal";

interface Product {
  id: string;
  name: string;
  unit: string;
}

interface Props {
  activeCategory: string;
  storeId: string;
}

export function WasteInput({ activeCategory }: Props) {
  const { selectedDate } = useDateContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [waste, setWaste] = useState<Record<string, number>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done">("idle");
  const supabase = createClient();
  const { toast } = useToast();
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const navRef = useSpreadsheetNav();

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

  useEffect(() => {
    const handler = () => { fetchData(); };
    window.addEventListener("onis-data-updated", handler);
    return () => window.removeEventListener("onis-data-updated", handler);
  }, [fetchData]);

  const saveWaste = async () => {
    setSaveStatus("saving");
    try {
      const productIds = products.map((p) => p.id);
      if (productIds.length > 0) {
        await supabase.from("daily_waste").delete().in("product_id", productIds).eq("date", dateStr);
      }
      const inserts = products
        .filter((p) => (waste[p.id] ?? 0) > 0)
        .map((p) => ({ product_id: p.id, date: dateStr, waste_amount: waste[p.id] ?? 0 }));

      if (inserts.length > 0) {
        const { error } = await supabase.from("daily_waste").insert(inserts);
        if (error) { toast({ title: "저장 실패", variant: "destructive" }); setSaveStatus("idle"); return; }
      }
      setSaveStatus("done");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("idle");
    }
  };

  // Paste handler
  const handlePaste = (e: React.ClipboardEvent, startIdx: number) => {
    const data = parsePasteData(e);
    if (!data) return;
    setWaste((prev) => {
      const updated = { ...prev };
      for (let i = 0; i < data.length && startIdx + i < products.length; i++) {
        updated[products[startIdx + i].id] = data[i][0] ?? 0;
      }
      return updated;
    });
  };

  // Sheet data
  const sheetColumns: SheetColumn[] = [
    { key: "name", header: "제품명", width: 200 },
    { key: "unit", header: "단위", width: 100 },
    { key: "waste", header: "폐기량", type: "number", editable: true, width: 120 },
  ];

  const sheetRows: SheetRow[] = products.map((product) => ({
    id: product.id,
    values: { name: product.name, unit: product.unit, waste: waste[product.id] ?? 0 },
  }));

  const handleSheetCellChange = (rowId: string, colKey: string, value: string | number) => {
    if (colKey === "waste") {
      setWaste((prev) => ({ ...prev, [rowId]: Number(value) || 0 }));
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
          <CardTitle>폐기 수량 - {format(selectedDate, "yyyy년 MM월 dd일")}</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
              <Table2 className="h-4 w-4 mr-1" />시트 입력
            </Button>
            <Button size="sm" onClick={saveWaste}><Save className="h-4 w-4 mr-1" />저장</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={navRef}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제품명</TableHead>
                <TableHead>단위</TableHead>
                <TableHead>폐기량</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product, idx) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>{product.unit}</TableCell>
                  <TableCell>
                    <Input type="number" className="w-[120px]" value={waste[product.id] ?? 0}
                      onChange={(e) => setWaste((prev) => ({ ...prev, [product.id]: Number(e.target.value) }))}
                      onPaste={(e) => handlePaste(e, idx)} />
                  </TableCell>
                </TableRow>
              ))}
              {products.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">현재 카테고리에 제품이 없습니다.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <SpreadsheetModal
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={`폐기 수량 시트 - ${format(selectedDate, "yyyy년 MM월 dd일")}`}
          columns={sheetColumns}
          rows={sheetRows}
          onCellChange={handleSheetCellChange}
        />
      </CardContent>
    </Card>
    </>
  );
}
