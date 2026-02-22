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
import { Plus } from "lucide-react";
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

    const { error } = await supabase.from("categories").insert({
      store_id: storeId,
      name: newCategoryName.trim(),
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

  const handleContextMenu = (e: React.MouseEvent, catId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, catId });
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
        {categories.map((cat) => (
          <Button
            key={cat.id}
            variant={activeCategory === cat.id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveCategory(cat.id)}
            onContextMenu={(e) => handleContextMenu(e, cat.id)}
          >
            {cat.name}
          </Button>
        ))}
        <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
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
      </div>

      {/* 메인 탭 */}
      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="inventory">현재재고</TabsTrigger>
          <TabsTrigger value="custom-sauce">자체소스</TabsTrigger>
          <TabsTrigger value="menu-recipe">메뉴별 레시피</TabsTrigger>
          <TabsTrigger value="sales">오늘 판매량</TabsTrigger>
          <TabsTrigger value="waste">폐기 수량</TabsTrigger>
          <TabsTrigger value="update">업데이트 재고</TabsTrigger>
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
