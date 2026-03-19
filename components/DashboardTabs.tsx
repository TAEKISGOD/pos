"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, HelpCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { CurrentInventory } from "@/components/tabs/CurrentInventory";
import { CustomSauce } from "@/components/tabs/CustomSauce";
import { MenuRecipe } from "@/components/tabs/MenuRecipe";
import { TodaySales } from "@/components/tabs/TodaySales";
import { WasteInput } from "@/components/tabs/WasteInput";
import { UpdateInventory } from "@/components/tabs/UpdateInventory";

export interface Category {
  id: string;
  name: string;
  store_id: string;
  sort_order: number;
}

export function DashboardTabs() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [storeId, setStoreId] = useState<string>("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();

  const fetchCategories = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: store } = await supabase
      .from("stores")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!store) return;
    setStoreId(store.id);

    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("store_id", store.id)
      .order("sort_order")
      .order("created_at");

    if (data && data.length > 0) {
      setCategories(data);
      if (!activeCategory) setActiveCategory(data[0].id);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const addCategory = async () => {
    if (!newCategoryName.trim() || !storeId) return;

    const maxOrder = categories.length > 0
      ? Math.max(...categories.map((c) => c.sort_order ?? 0)) + 1
      : 0;
    const { error } = await supabase.from("categories").insert({
      store_id: storeId,
      name: newCategoryName.trim(),
      sort_order: maxOrder,
    });

    if (!error) {
      setNewCategoryName("");
      setCategoryDialogOpen(false);
      fetchCategories();
      toast({ title: "카테고리 추가 완료" });
    }
  };

  const deleteCategory = async (catId: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", catId);
    if (error) {
      toast({ title: "삭제 실패", variant: "destructive" });
      return;
    }
    if (activeCategory === catId) {
      const remaining = categories.filter((c) => c.id !== catId);
      setActiveCategory(remaining.length > 0 ? remaining[0].id : "");
    }
    fetchCategories();
    toast({ title: "카테고리 삭제 완료" });
  };

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; catId: string } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const categoryTooltips: Record<string, string> = {
    "소스류": "시제품 소스 재고를 입력해주세요",
    "야채류": "야채 재고를 입력해주세요",
    "고기류": "육류 재고를 입력해주세요",
    "주류": "소주 및 맥주 재고를 입력해주세요",
    "음료": "음료 재고를 입력해주세요",
    "자체소스": "배합 소스 및 특제 소스 재고를 입력해주세요",
  };

  const handleContextMenu = (e: React.MouseEvent, catId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, catId });
  };

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = async (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }

    const reordered = [...categories];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    // 즉시 UI 반영
    setCategories(reordered);
    setDragIdx(null);
    setDragOverIdx(null);

    // DB 업데이트
    const updates = reordered.map((cat, i) =>
      supabase.from("categories").update({ sort_order: i }).eq("id", cat.id)
    );
    await Promise.all(updates);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div className="space-y-4">
      {/* 서브탭 (카테고리) - 모든 탭에서 공유 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={() => setContextMenu(null)}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
            onClick={() => { deleteCategory(contextMenu.catId); setContextMenu(null); }}
          >
            삭제
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {categories.map((cat, idx) => {
          const tip = categoryTooltips[cat.name];
          const btn = (
            <Button
              variant={activeCategory === cat.id ? "default" : "outline"}
              size="sm"
              draggable
              onClick={() => setActiveCategory(cat.id)}
              onContextMenu={(e) => handleContextMenu(e, cat.id)}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              className={`cursor-grab active:cursor-grabbing transition-all ${
                dragOverIdx === idx && dragIdx !== idx
                  ? "ring-2 ring-primary ring-offset-1"
                  : ""
              } ${dragIdx === idx ? "opacity-50" : ""}`}
            >
              {cat.name}
            </Button>
          );
          return tip ? (
            <Tooltip key={cat.id}>
              <TooltipTrigger asChild>{btn}</TooltipTrigger>
              <TooltipContent>{tip}</TooltipContent>
            </Tooltip>
          ) : (
            <span key={cat.id}>{btn}</span>
          );
        })}
        <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent>서브탭을 추가합니다</TooltipContent>
          </Tooltip>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>카테고리 추가</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>카테고리 이름</Label>
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="예: 소스류, 야채류"
                />
              </div>
              <Button onClick={addCategory} className="w-full">추가</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>드래그로 순서 변경</p>
            <p>우클릭으로 삭제</p>
            <p>+ 버튼으로 추가</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* 메인 탭 */}
      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          {[
            { value: "inventory", label: "현재재고", tip: "서브탭별 재고 정보를 입력해주세요" },
            { value: "custom-sauce", label: "자체소스", tip: "자체소스 레시피를 입력해주세요" },
            { value: "menu-recipe", label: "메뉴별 레시피", tip: "매장에 등록된 메뉴의 레시피를 입력해주세요" },
            { value: "sales", label: "오늘 판매량", tip: "마감 후 매출 내역 엑셀 파일을 업로드해주세요" },
            { value: "waste", label: "폐기 수량", tip: "당일 폐기 수량을 입력해주세요" },
            { value: "update", label: "업데이트 재고", tip: "업데이트된 재고를 확인해주세요" },
          ].map((tab) => (
            <Tooltip key={tab.value}>
              <TabsTrigger value={tab.value} asChild>
                <TooltipTrigger asChild>
                  <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow">
                    {tab.label}
                  </button>
                </TooltipTrigger>
              </TabsTrigger>
              <TooltipContent>{tab.tip}</TooltipContent>
            </Tooltip>
          ))}
        </TabsList>

        <TabsContent value="inventory">
          <CurrentInventory activeCategory={activeCategory} storeId={storeId} />
        </TabsContent>
        <TabsContent value="custom-sauce">
          <CustomSauce activeCategory={activeCategory} storeId={storeId} />
        </TabsContent>
        <TabsContent value="menu-recipe">
          <MenuRecipe activeCategory={activeCategory} storeId={storeId} />
        </TabsContent>
        <TabsContent value="sales">
          <TodaySales activeCategory={activeCategory} storeId={storeId} />
        </TabsContent>
        <TabsContent value="waste">
          <WasteInput activeCategory={activeCategory} storeId={storeId} />
        </TabsContent>
        <TabsContent value="update">
          <UpdateInventory activeCategory={activeCategory} storeId={storeId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
