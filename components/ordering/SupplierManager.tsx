"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Save, Building2, Package, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Supplier {
  id: string;
  name: string;
  isNew?: boolean;
}

interface Product {
  id: string;
  name: string;
  categoryName: string;
}

interface ProductSupplier {
  product_id: string;
  supplier_id: string;
  threshold: number;
  order_quantity: number;
  order_unit: string;
  unit_amount: number;
  delivery_days: number;
}

interface Props {
  storeId: string;
}

export function SupplierManager({ storeId }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSuppliers, setProductSuppliers] = useState<ProductSupplier[]>([]);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done">("idle");
  const supabase = createClient();
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    if (!storeId) return;

    // 업체 목록
    const { data: supplierData } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("store_id", storeId)
      .order("created_at");
    if (supplierData) setSuppliers(supplierData);

    // 전체 제품 목록 (카테고리별)
    const { data: categories } = await supabase
      .from("categories")
      .select("id, name")
      .eq("store_id", storeId)
      .order("sort_order");

    if (categories) {
      const allProducts: Product[] = [];
      for (const cat of categories) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, name")
          .eq("category_id", cat.id)
          .order("created_at");
        if (prods) {
          prods.forEach((p) =>
            allProducts.push({ id: p.id, name: p.name, categoryName: cat.name })
          );
        }
      }
      setProducts(allProducts);
    }

    // 제품-업체 매핑
    const { data: psData } = await supabase
      .from("product_suppliers")
      .select("product_id, supplier_id, threshold, order_quantity, order_unit, unit_amount, delivery_days");
    if (psData) setProductSuppliers(psData);
  }, [storeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addSupplier = async () => {
    const name = newSupplierName.trim();
    if (!name) return;
    const { error } = await supabase.from("suppliers").insert({ store_id: storeId, name });
    if (error) {
      toast({ title: "업체 추가 실패", variant: "destructive" });
      return;
    }
    setNewSupplierName("");
    setAddDialogOpen(false);
    fetchData();
    toast({ title: `업체 "${name}" 추가 완료` });
  };

  const deleteSupplier = async (supplierId: string) => {
    await supabase.from("product_suppliers").delete().eq("supplier_id", supplierId);
    await supabase.from("suppliers").delete().eq("id", supplierId);
    fetchData();
    toast({ title: "업체 삭제 완료" });
  };

  const updateProductSupplier = (productId: string, field: keyof ProductSupplier, value: string | number) => {
    setProductSuppliers((prev) => {
      const existing = prev.find((ps) => ps.product_id === productId);
      if (existing) {
        return prev.map((ps) =>
          ps.product_id === productId ? { ...ps, [field]: value } : ps
        );
      }
      if (field === "supplier_id" && value) {
        return [
          ...prev,
          {
            product_id: productId,
            supplier_id: value as string,
            threshold: 0,
            order_quantity: 0,
            order_unit: "",
            unit_amount: 0,
            delivery_days: 1,
          },
        ];
      }
      return prev;
    });
  };

  const removeProductSupplier = (productId: string) => {
    setProductSuppliers((prev) => prev.filter((ps) => ps.product_id !== productId));
  };

  const saveAll = async () => {
    setSaveStatus("saving");
    try {
      // 기존 매핑 삭제 후 재삽입
      const productIds = products.map((p) => p.id);
      if (productIds.length > 0) {
        await supabase.from("product_suppliers").delete().in("product_id", productIds);
      }

      const inserts = productSuppliers
        .filter((ps) => ps.supplier_id && ps.product_id)
        .map((ps) => ({
          product_id: ps.product_id,
          supplier_id: ps.supplier_id,
          threshold: ps.threshold,
          order_quantity: ps.order_quantity,
          order_unit: ps.order_unit || null,
          unit_amount: ps.unit_amount || 0,
          delivery_days: ps.delivery_days,
        }));

      if (inserts.length > 0) {
        const { error } = await supabase.from("product_suppliers").insert(inserts);
        if (error) {
          toast({ title: "저장 실패", description: error.message, variant: "destructive" });
          setSaveStatus("idle");
          return;
        }
      }

      setSaveStatus("done");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("idle");
      toast({ title: "저장 실패", variant: "destructive" });
    }
  };

  // 선택된 업체 기준 필터링
  const filteredProducts = selectedSupplier === "all"
    ? products
    : selectedSupplier === "unassigned"
      ? products.filter((p) => !productSuppliers.find((ps) => ps.product_id === p.id))
      : products.filter((p) => {
          const ps = productSuppliers.find((ps) => ps.product_id === p.id);
          return ps && ps.supplier_id === selectedSupplier;
        });

  return (
    <>
      {saveStatus !== "idle" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl px-8 py-6 shadow-2xl flex flex-col items-center gap-3">
            {saveStatus === "saving" ? (
              <><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="text-sm font-medium">저장중...</span></>
            ) : (
              <><CheckCircle2 className="h-8 w-8 text-green-500" /><span className="text-sm font-medium">저장 완료</span></>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* 업체 관리 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                발주 업체
              </CardTitle>
              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />업체 추가
                </Button>
                <DialogContent>
                  <DialogHeader><DialogTitle>업체 추가</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <Input
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      placeholder="업체명 입력"
                      onKeyDown={(e) => e.key === "Enter" && addSupplier()}
                    />
                    <Button onClick={addSupplier} className="w-full">추가</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">등록된 업체가 없습니다. 업체를 추가해주세요.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {suppliers.map((s) => (
                  <div key={s.id} className="flex items-center gap-1 border rounded-lg px-3 py-1.5">
                    <span className="text-sm font-medium">{s.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {productSuppliers.filter((ps) => ps.supplier_id === s.id).length}개 제품
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-5 w-5 ml-1" onClick={() => deleteSupplier(s.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 제품별 발주 설정 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                제품별 발주 설정
              </CardTitle>
              <div className="flex items-center gap-2">
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger className="w-[160px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 제품</SelectItem>
                    <SelectItem value="unassigned">미배정</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    <TableHead className="min-w-[120px]">제품명</TableHead>
                    <TableHead className="min-w-[80px]">카테고리</TableHead>
                    <TableHead className="min-w-[140px]">발주 업체</TableHead>
                    <TableHead className="min-w-[100px]">임계값(g)</TableHead>
                    <TableHead className="min-w-[100px]">발주 수량</TableHead>
                    <TableHead className="min-w-[80px]">발주 단위</TableHead>
                    <TableHead className="min-w-[80px]">실제량</TableHead>
                    <TableHead className="min-w-[100px]">배송 소요일</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => {
                    const ps = productSuppliers.find((ps) => ps.product_id === product.id);
                    return (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{product.categoryName}</TableCell>
                        <TableCell>
                          <Select
                            value={ps?.supplier_id || ""}
                            onValueChange={(v) => updateProductSupplier(product.id, "supplier_id", v)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {suppliers.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            className="w-[80px] h-8 text-sm"
                            value={ps?.threshold ?? ""}
                            placeholder="0"
                            onChange={(e) => updateProductSupplier(product.id, "threshold", Number(e.target.value))}
                            disabled={!ps?.supplier_id}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            className="w-[80px] h-8 text-sm"
                            value={ps?.order_quantity ?? ""}
                            placeholder="0"
                            onChange={(e) => updateProductSupplier(product.id, "order_quantity", Number(e.target.value))}
                            disabled={!ps?.supplier_id}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="w-[70px] h-8 text-sm"
                            value={ps?.order_unit ?? ""}
                            placeholder="kg"
                            onChange={(e) => updateProductSupplier(product.id, "order_unit", e.target.value)}
                            disabled={!ps?.supplier_id}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            className="w-[70px] h-8 text-sm"
                            value={ps?.unit_amount ?? ""}
                            placeholder="0"
                            onChange={(e) => updateProductSupplier(product.id, "unit_amount", Number(e.target.value))}
                            disabled={!ps?.supplier_id}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            className="w-[60px] h-8 text-sm text-center"
                            value={ps?.delivery_days ?? ""}
                            placeholder="1"
                            min={1}
                            onChange={(e) => updateProductSupplier(product.id, "delivery_days", Number(e.target.value) || 1)}
                            disabled={!ps?.supplier_id}
                          />
                        </TableCell>
                        <TableCell>
                          {ps?.supplier_id && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeProductSupplier(product.id)}>
                              <Trash2 className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        해당 조건의 제품이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
