"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { useDateContext } from "@/lib/date-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Save, Loader2, CheckCircle2, ChevronDown, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Props {
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

interface ProductLite {
  id: string;
  name: string;
}

type Mode = "batch" | "stock";

interface ProductionRow {
  mode: Mode;
  batch_count: number;
  ingredient_id: string | null;
  ingredient_amount: number;
}

const BATCH_PRESETS = [1, 2, 3];

export function SauceProduction({ storeId }: Props) {
  const { selectedDate } = useDateContext();
  const [sauceProducts, setSauceProducts] = useState<SauceProduct[]>([]);
  const [sauceRecipes, setSauceRecipes] = useState<SauceRecipe[]>([]);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [productions, setProductions] = useState<Record<string, ProductionRow>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done">("idle");
  const [detailSauceId, setDetailSauceId] = useState<string | null>(null);
  const [batchPopoverOpen, setBatchPopoverOpen] = useState<string | null>(null);
  const [stockPopoverOpen, setStockPopoverOpen] = useState<string | null>(null);

  const supabase = createClient();
  const { toast } = useToast();
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
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

    if (!sauceProds) return;
    setSauceProducts(sauceProds);

    if (sauceProds.length === 0) return;

    const sauceIds = sauceProds.map((p) => p.id);
    const { data: recipes } = await supabase
      .from("custom_sauce_recipes")
      .select("sauce_product_id, ingredient_product_id, amount")
      .in("sauce_product_id", sauceIds);

    if (recipes) setSauceRecipes(recipes);

    // 재료 이름 조회 (자체소스 외 카테고리 제품 포함)
    const ingredientIds = Array.from(
      new Set((recipes ?? []).map((r) => r.ingredient_product_id))
    );
    if (ingredientIds.length > 0) {
      const { data: ingProds } = await supabase
        .from("products")
        .select("id, name")
        .in("id", ingredientIds);
      if (ingProds) {
        const map: Record<string, string> = {};
        ingProds.forEach((p: ProductLite) => { map[p.id] = p.name; });
        setProductNames(map);
      }
    }

    // 해당 날짜의 기존 생산 입력 조회
    const { data: existing } = await supabase
      .from("daily_sauce_productions")
      .select("sauce_product_id, mode, batch_count, ingredient_id, ingredient_amount")
      .in("sauce_product_id", sauceIds)
      .eq("date", dateStr);

    const map: Record<string, ProductionRow> = {};
    (existing ?? []).forEach((row) => {
      map[row.sauce_product_id] = {
        mode: row.mode as Mode,
        batch_count: row.batch_count ?? 0,
        ingredient_id: row.ingredient_id ?? null,
        ingredient_amount: row.ingredient_amount ?? 0,
      };
    });
    setProductions(map);
  }, [storeId, dateStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const handler = () => { fetchData(); };
    window.addEventListener("onis-data-updated", handler);
    return () => window.removeEventListener("onis-data-updated", handler);
  }, [fetchData]);

  const recipesBySauce = useMemo(() => {
    const map: Record<string, SauceRecipe[]> = {};
    sauceRecipes.forEach((r) => {
      if (!map[r.sauce_product_id]) map[r.sauce_product_id] = [];
      map[r.sauce_product_id].push(r);
    });
    return map;
  }, [sauceRecipes]);

  // 1배합 총 g (해당 소스의 레시피 재료 합)
  const oneBatchTotal = (sauceId: string): number => {
    const list = recipesBySauce[sauceId] ?? [];
    return list.reduce((sum, r) => sum + r.amount, 0);
  };

  const getRow = (sauceId: string): ProductionRow => {
    return productions[sauceId] ?? {
      mode: "batch",
      batch_count: 0,
      ingredient_id: null,
      ingredient_amount: 0,
    };
  };

  // 배합 수 계산 (재고 모드일 때 비율로 환산)
  const computeBatchCount = (sauceId: string): number => {
    const row = getRow(sauceId);
    if (row.mode === "batch") return row.batch_count;
    if (!row.ingredient_id || row.ingredient_amount <= 0) return 0;
    const list = recipesBySauce[sauceId] ?? [];
    const recipe = list.find((r) => r.ingredient_product_id === row.ingredient_id);
    if (!recipe || recipe.amount <= 0) return 0;
    return row.ingredient_amount / recipe.amount;
  };

  const computeProduction = (sauceId: string): number => {
    return computeBatchCount(sauceId) * oneBatchTotal(sauceId);
  };

  const updateRow = (sauceId: string, patch: Partial<ProductionRow>) => {
    setProductions((prev) => ({
      ...prev,
      [sauceId]: { ...getRow(sauceId), ...patch },
    }));
  };

  const setMode = (sauceId: string, mode: Mode) => {
    // 모드 변경 시 입력값 초기화
    setProductions((prev) => ({
      ...prev,
      [sauceId]: {
        mode,
        batch_count: 0,
        ingredient_id: null,
        ingredient_amount: 0,
      },
    }));
  };

  const isBatchPreset = (sauceId: string): boolean => {
    const row = getRow(sauceId);
    if (row.mode !== "batch") return false;
    return BATCH_PRESETS.includes(row.batch_count);
  };

  // 배합 모드 직접입력 활성 여부 (프리셋이 아닌데 mode가 batch)
  const [directInputActive, setDirectInputActive] = useState<Record<string, boolean>>({});

  const isDirectInput = (sauceId: string): boolean => {
    const row = getRow(sauceId);
    if (row.mode !== "batch") return false;
    return directInputActive[sauceId] === true || (row.batch_count > 0 && !BATCH_PRESETS.includes(row.batch_count));
  };

  const save = async () => {
    setSaveStatus("saving");
    try {
      const sauceIds = sauceProducts.map((p) => p.id);
      if (sauceIds.length > 0) {
        await supabase
          .from("daily_sauce_productions")
          .delete()
          .in("sauce_product_id", sauceIds)
          .eq("date", dateStr);
      }

      const inserts = Object.entries(productions)
        .filter(([, row]) => {
          if (row.mode === "batch") return row.batch_count > 0;
          return row.ingredient_id != null && row.ingredient_amount > 0;
        })
        .map(([sauceId, row]) => ({
          sauce_product_id: sauceId,
          date: dateStr,
          mode: row.mode,
          batch_count: row.mode === "batch" ? row.batch_count : 0,
          ingredient_id: row.mode === "stock" ? row.ingredient_id : null,
          ingredient_amount: row.mode === "stock" ? row.ingredient_amount : 0,
        }));

      if (inserts.length > 0) {
        const { error } = await supabase.from("daily_sauce_productions").insert(inserts);
        if (error) {
          toast({ title: "저장 실패", description: error.message, variant: "destructive" });
          setSaveStatus("idle");
          return;
        }
      }

      window.dispatchEvent(new Event("onis-data-updated"));
      setSaveStatus("done");
      setTimeout(() => setSaveStatus("idle"), 1200);
    } catch {
      setSaveStatus("idle");
    }
  };

  const overlay = saveStatus !== "idle" && (
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
  );

  if (sauceProducts.length === 0) {
    return (
      <>{overlay}<Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          &quot;자체소스&quot; 카테고리에 제품을 등록해주세요.
        </CardContent>
      </Card></>
    );
  }

  const detailSauce = detailSauceId ? sauceProducts.find((s) => s.id === detailSauceId) : null;
  const detailRecipes = detailSauceId ? recipesBySauce[detailSauceId] ?? [] : [];
  const detailBatchCount = detailSauceId ? computeBatchCount(detailSauceId) : 0;
  const detailProduction = detailSauceId ? computeProduction(detailSauceId) : 0;

  return (
    <>
    {overlay}
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>자체소스 생산 - {format(selectedDate, "yyyy년 MM월 dd일")}</CardTitle>
          <Button size="sm" onClick={save}>
            <Save className="h-4 w-4 mr-1" />저장
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[140px]">자체소스명</TableHead>
              <TableHead className="w-[120px]">기준</TableHead>
              <TableHead className="w-[180px]">상세</TableHead>
              <TableHead className="w-[140px]">숫자 입력</TableHead>
              <TableHead className="w-[140px]">생산량</TableHead>
              <TableHead className="w-[110px]">차감 보기</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sauceProducts.map((sauce) => {
              const row = getRow(sauce.id);
              const oneBatch = oneBatchTotal(sauce.id);
              const production = computeProduction(sauce.id);
              const recipes = recipesBySauce[sauce.id] ?? [];
              const directActive = isDirectInput(sauce.id);
              const presetActive = isBatchPreset(sauce.id);

              return (
                <TableRow key={sauce.id}>
                  {/* 자체소스명 */}
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{sauce.name}</span>
                      <span className="text-xs text-muted-foreground">1배합 {oneBatch}</span>
                    </div>
                  </TableCell>

                  {/* 기준 (배합/재고) */}
                  <TableCell>
                    <Select
                      value={row.mode}
                      onValueChange={(v) => setMode(sauce.id, v as Mode)}
                    >
                      <SelectTrigger className="h-8 w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="batch">배합</SelectItem>
                        <SelectItem value="stock">재고</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>

                  {/* 상세 (설정 popover) */}
                  <TableCell>
                    {row.mode === "batch" ? (
                      <Popover
                        open={batchPopoverOpen === sauce.id}
                        onOpenChange={(o) => setBatchPopoverOpen(o ? sauce.id : null)}
                      >
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 w-full justify-between">
                            <span className="text-xs">
                              {presetActive
                                ? `${row.batch_count}배합`
                                : directActive
                                  ? "직접 입력"
                                  : "선택"}
                            </span>
                            <ChevronDown className="h-3 w-3 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[160px] p-1" align="start">
                          <div className="max-h-[200px] overflow-y-auto flex flex-col">
                            {BATCH_PRESETS.map((n) => (
                              <button
                                key={n}
                                className={`text-left px-3 py-2 text-sm rounded hover:bg-accent ${
                                  presetActive && row.batch_count === n ? "bg-accent" : ""
                                }`}
                                onClick={() => {
                                  updateRow(sauce.id, { mode: "batch", batch_count: n, ingredient_id: null, ingredient_amount: 0 });
                                  setDirectInputActive((p) => ({ ...p, [sauce.id]: false }));
                                  setBatchPopoverOpen(null);
                                }}
                              >
                                {n}배합
                              </button>
                            ))}
                            <button
                              className={`text-left px-3 py-2 text-sm rounded hover:bg-accent ${
                                directActive ? "bg-accent" : ""
                              }`}
                              onClick={() => {
                                updateRow(sauce.id, { mode: "batch", batch_count: 0, ingredient_id: null, ingredient_amount: 0 });
                                setDirectInputActive((p) => ({ ...p, [sauce.id]: true }));
                                setBatchPopoverOpen(null);
                              }}
                            >
                              직접 입력
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <Popover
                        open={stockPopoverOpen === sauce.id}
                        onOpenChange={(o) => setStockPopoverOpen(o ? sauce.id : null)}
                      >
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 w-full justify-between" disabled={recipes.length === 0}>
                            <span className="text-xs truncate">
                              {row.ingredient_id
                                ? productNames[row.ingredient_id] ?? "알 수 없음"
                                : recipes.length === 0 ? "레시피 없음" : "재료 선택"}
                            </span>
                            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[220px] p-1" align="start">
                          <div className="max-h-[240px] overflow-y-auto flex flex-col">
                            {recipes.map((r) => (
                              <button
                                key={r.ingredient_product_id}
                                className={`text-left px-3 py-2 text-sm rounded hover:bg-accent ${
                                  row.ingredient_id === r.ingredient_product_id ? "bg-accent" : ""
                                }`}
                                onClick={() => {
                                  updateRow(sauce.id, {
                                    mode: "stock",
                                    batch_count: 0,
                                    ingredient_id: r.ingredient_product_id,
                                    ingredient_amount: 0,
                                  });
                                  setStockPopoverOpen(null);
                                }}
                              >
                                <div className="flex justify-between items-center gap-2">
                                  <span className="truncate">{productNames[r.ingredient_product_id] ?? "알 수 없음"}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">레시피 {r.amount}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </TableCell>

                  {/* 숫자 입력 */}
                  <TableCell>
                    {row.mode === "batch" ? (
                      directActive ? (
                        <Input
                          type="number"
                          className="h-8 w-[100px]"
                          value={row.batch_count || ""}
                          placeholder="배합 수"
                          step="0.1"
                          min={0}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateRow(sauce.id, { batch_count: v === "" ? 0 : Number(v) });
                          }}
                        />
                      ) : (
                        <span className="text-muted-foreground">
                          {presetActive ? `${row.batch_count}배합` : "-"}
                        </span>
                      )
                    ) : row.ingredient_id ? (
                      <Input
                        type="number"
                        className="h-8 w-[100px]"
                        value={row.ingredient_amount || ""}
                        placeholder="사용량"
                        min={0}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateRow(sauce.id, { ingredient_amount: v === "" ? 0 : Number(v) });
                        }}
                      />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* 생산량 */}
                  <TableCell>
                    {production > 0 ? (
                      <span className="font-medium">{production.toFixed(1)}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* 차감 보기 (모달) */}
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => setDetailSauceId(sauce.id)}
                      disabled={production <= 0}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      상세
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* 차감 상세 모달 */}
        <Dialog open={detailSauceId !== null} onOpenChange={(o) => !o && setDetailSauceId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{detailSauce?.name} - 차감 재료</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm flex gap-4">
                <span><span className="text-muted-foreground">배합 수: </span>{detailBatchCount.toFixed(2)}</span>
                <span><span className="text-muted-foreground">생산량: </span>{detailProduction.toFixed(1)}</span>
              </div>
              <div className="border rounded-md divide-y">
                {detailRecipes.length === 0 && (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                    레시피가 비어있습니다.
                  </div>
                )}
                {detailRecipes.map((r) => {
                  const deduction = r.amount * detailBatchCount;
                  return (
                    <div key={r.ingredient_product_id} className="px-3 py-2 flex justify-between text-sm">
                      <span>{productNames[r.ingredient_product_id] ?? "알 수 없음"}</span>
                      <span className="text-red-600">-{deduction.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
    </>
  );
}
