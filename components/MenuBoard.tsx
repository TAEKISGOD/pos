"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

interface MenuItem {
  id?: string;
  name: string;
  price: number;
  sortOrder: number;
  isNew?: boolean;
}

interface Section {
  id?: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
  isNew?: boolean;
}

export function MenuBoard() {
  const supabase = createClient();
  const [storeId, setStoreId] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // fetch store id
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (store) setStoreId(store.id);
    })();
  }, []);

  // fetch sections + items
  const fetchData = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);

    const { data: sectionRows } = await supabase
      .from("menu_board_sections")
      .select("*")
      .eq("store_id", storeId)
      .order("sort_order");

    if (!sectionRows || sectionRows.length === 0) {
      setSections([]);
      setLoading(false);
      return;
    }

    const sectionIds = sectionRows.map((s) => s.id);
    const { data: itemRows } = await supabase
      .from("menu_board_items")
      .select("*")
      .in("section_id", sectionIds)
      .order("sort_order");

    const itemsBySection: Record<string, MenuItem[]> = {};
    itemRows?.forEach((item) => {
      if (!itemsBySection[item.section_id]) itemsBySection[item.section_id] = [];
      itemsBySection[item.section_id].push({
        id: item.id,
        name: item.name,
        price: item.price,
        sortOrder: item.sort_order,
      });
    });

    const loaded: Section[] = sectionRows.map((s) => ({
      id: s.id,
      name: s.name,
      sortOrder: s.sort_order,
      items: itemsBySection[s.id] || [],
    }));

    setSections(loaded);
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── handlers ──

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        name: "",
        sortOrder: prev.length,
        items: [],
        isNew: true,
      },
    ]);
  };

  const removeSection = (sectionIndex: number) => {
    setSections((prev) => prev.filter((_, i) => i !== sectionIndex));
  };

  const updateSectionName = (sectionIndex: number, name: string) => {
    setSections((prev) =>
      prev.map((s, i) => (i === sectionIndex ? { ...s, name } : s))
    );
  };

  const addItem = (sectionIndex: number) => {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex
          ? {
              ...s,
              items: [
                ...s.items,
                {
                  name: "",
                  price: 0,
                  sortOrder: s.items.length,
                  isNew: true,
                },
              ],
            }
          : s
      )
    );
  };

  const removeItem = (sectionIndex: number, itemIndex: number) => {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex
          ? { ...s, items: s.items.filter((_, j) => j !== itemIndex) }
          : s
      )
    );
  };

  const updateItemName = (
    sectionIndex: number,
    itemIndex: number,
    name: string
  ) => {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex
          ? {
              ...s,
              items: s.items.map((item, j) =>
                j === itemIndex ? { ...item, name } : item
              ),
            }
          : s
      )
    );
  };

  const updateItemPrice = (
    sectionIndex: number,
    itemIndex: number,
    priceStr: string
  ) => {
    const price = parseInt(priceStr) || 0;
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex
          ? {
              ...s,
              items: s.items.map((item, j) =>
                j === itemIndex ? { ...item, price } : item
              ),
            }
          : s
      )
    );
  };

  // ── save: delete all → re-insert ──
  const handleSave = async () => {
    if (!storeId) return;
    setSaving(true);

    // delete existing sections (cascade deletes items)
    await supabase
      .from("menu_board_sections")
      .delete()
      .eq("store_id", storeId);

    // insert sections + items
    for (let si = 0; si < sections.length; si++) {
      const section = sections[si];
      if (!section.name.trim()) continue;

      const { data: inserted } = await supabase
        .from("menu_board_sections")
        .insert({
          store_id: storeId,
          name: section.name.trim(),
          sort_order: si,
        })
        .select("id")
        .single();

      if (!inserted) continue;

      const itemsToInsert = section.items
        .filter((item) => item.name.trim())
        .map((item, ii) => ({
          section_id: inserted.id,
          name: item.name.trim(),
          price: item.price,
          sort_order: ii,
        }));

      if (itemsToInsert.length > 0) {
        await supabase.from("menu_board_items").insert(itemsToInsert);
      }
    }

    setSaving(false);
    await fetchData();
  };

  if (loading && !sections.length) {
    return (
      <div className="max-w-[800px] mx-auto py-12 text-center text-sm text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold tracking-tight">메뉴판 편집</h1>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>

      {/* Add section button */}
      <Button variant="outline" className="w-full" onClick={addSection}>
        <Plus className="h-4 w-4 mr-2" />
        섹션 추가
      </Button>

      {/* Sections */}
      {sections.map((section, si) => (
        <div
          key={si}
          className="border rounded-[10px] overflow-hidden bg-background"
        >
          {/* Section header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
            <Input
              value={section.name}
              onChange={(e) => updateSectionName(si, e.target.value)}
              placeholder="섹션명 (예: 한식류)"
              className="flex-1 font-semibold border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 text-[15px]"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => removeSection(si)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Items */}
          <div className="px-4 py-2">
            {section.items.map((item, ii) => (
              <div
                key={ii}
                className="flex items-center gap-3 py-2 border-b last:border-b-0"
              >
                <Input
                  value={item.name}
                  onChange={(e) => updateItemName(si, ii, e.target.value)}
                  placeholder="메뉴명"
                  className="flex-1 h-9 text-[14px]"
                />
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">₩</span>
                  <Input
                    type="number"
                    value={item.price || ""}
                    onChange={(e) => updateItemPrice(si, ii, e.target.value)}
                    placeholder="가격"
                    className="w-[120px] h-9 text-[14px] text-right"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                  onClick={() => removeItem(si, ii)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {/* Add item */}
            <button
              onClick={() => addItem(si)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground py-2 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              메뉴 추가
            </button>
          </div>
        </div>
      ))}

      {sections.length === 0 && !loading && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          아직 등록된 섹션이 없습니다. 위의 &quot;섹션 추가&quot; 버튼을 눌러 시작하세요.
        </div>
      )}
    </div>
  );
}
