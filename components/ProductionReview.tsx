"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Plus, Search, ChevronDown, ChevronUp } from "lucide-react";

interface DbProduct {
  id: string;
  name: string;
  unit: string;
  categoryId: string;
  categoryName: string;
}

interface CategoryInfo {
  id: string;
  name: string;
}

export type ProductionIntent = "batch" | "stock" | "delete" | "copy" | "preview" | "recommend";

export interface ProductionRow {
  intent: ProductionIntent;
  inputLine: string;
  sauceName: string;
  sauceStatus: "auto" | "candidate" | "none";
  sauceMatched?: DbProduct;
  sauceCandidates?: DbProduct[];
  batchCount?: number | null;
  ingredientName?: string;
  ingredientStatus?: "auto" | "candidate" | "none";
  ingredientMatched?: DbProduct;
  ingredientCandidates?: DbProduct[];
  ingredientAmount?: number | null;
  sourceDateRef?: string | null;
  limitingIngredientHint?: string | null;
}

export interface ResolvedProduction {
  intent: ProductionIntent;
  inputLine: string;
  sauceProductId: string;
  sauceName: string;
  // batch/stock일 때
  batchCount?: number;
  ingredientId?: string;
  ingredientName?: string;
  ingredientAmount?: number;
  // copy일 때
  sourceDateRef?: string;
  // recommend일 때
  limitingIngredientHint?: string;
}

interface SauceRecipeInfo {
  sauceProductId: string;
  ingredientProductId: string;
  ingredientName: string;
  amount: number;
}

interface Props {
  rows: ProductionRow[];
  categories: CategoryInfo[];
  products: DbProduct[];
  sauceProducts: DbProduct[];
  sauceRecipes?: SauceRecipeInfo[];
  onConfirm: (items: ResolvedProduction[]) => void;
  onCancel: () => void;
  disabled?: boolean;
}

const INTENT_LABEL: Record<ProductionIntent, string> = {
  batch: "배합",
  stock: "재고",
  delete: "취소",
  copy: "복사",
  preview: "미리보기",
  recommend: "추천",
};

const INTENT_BADGE_COLOR: Record<ProductionIntent, string> = {
  batch: "bg-blue-100 text-blue-800",
  stock: "bg-purple-100 text-purple-800",
  delete: "bg-red-100 text-red-800",
  copy: "bg-amber-100 text-amber-800",
  preview: "bg-gray-100 text-gray-700",
  recommend: "bg-green-100 text-green-800",
};

interface RowState {
  sauceProduct: DbProduct | null;
  ingredientProduct: DbProduct | null;
  batchCount: number;
  ingredientAmount: number;
}

export function ProductionReview({
  rows, products, sauceProducts, sauceRecipes = [], onConfirm, onCancel, disabled,
}: Props) {
  const [states, setStates] = useState<RowState[]>(() =>
    rows.map((row) => ({
      sauceProduct: row.sauceStatus === "auto" && row.sauceMatched ? row.sauceMatched : null,
      ingredientProduct: row.ingredientStatus === "auto" && row.ingredientMatched ? row.ingredientMatched : null,
      batchCount: row.batchCount ?? 0,
      ingredientAmount: row.ingredientAmount ?? 0,
    }))
  );

  const [expandedSauce, setExpandedSauce] = useState<Set<number>>(
    new Set(rows.map((_, i) => i).filter((i) => rows[i].sauceStatus === "candidate" || rows[i].sauceStatus === "none"))
  );
  const [expandedIngredient, setExpandedIngredient] = useState<Set<number>>(
    new Set(rows.map((_, i) => i).filter((i) =>
      (rows[i].intent === "stock" || rows[i].intent === "preview") &&
      (rows[i].ingredientStatus === "candidate" || rows[i].ingredientStatus === "none")
    ))
  );

  const updateState = (idx: number, patch: Partial<RowState>) => {
    setStates((prev) => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const productMapById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // 행별 해결 여부 판단
  const isRowResolved = (idx: number): boolean => {
    const row = rows[idx];
    const s = states[idx];

    // 모든 intent에서 소스 필요 (recommend의 경우 sauce가 명시됐으면 필요)
    if (row.sauceName && !s.sauceProduct) return false;

    if (row.intent === "batch") {
      return s.batchCount > 0;
    }
    if (row.intent === "stock") {
      return s.ingredientProduct != null && s.ingredientAmount > 0;
    }
    if (row.intent === "preview") {
      // 배합 또는 재고 형태 둘 다 가능
      const hasBatch = s.batchCount > 0;
      const hasStock = s.ingredientProduct != null && s.ingredientAmount > 0;
      return hasBatch || hasStock;
    }
    // delete / copy / recommend는 sauce만 있으면 됨
    return true;
  };

  const allResolved = states.every((_, i) => isRowResolved(i));
  const resolvedCount = states.filter((_, i) => isRowResolved(i)).length;

  const handleSelectSauce = (idx: number, product: DbProduct) => {
    updateState(idx, { sauceProduct: product });
    setExpandedSauce((prev) => { const next = new Set(prev); next.delete(idx); return next; });
  };

  const handleSelectIngredient = (idx: number, product: DbProduct) => {
    updateState(idx, { ingredientProduct: product });
    setExpandedIngredient((prev) => { const next = new Set(prev); next.delete(idx); return next; });
  };

  const handleConfirmAll = () => {
    const items: ResolvedProduction[] = [];
    rows.forEach((row, idx) => {
      const s = states[idx];
      if (!isRowResolved(idx)) return;
      const item: ResolvedProduction = {
        intent: row.intent,
        inputLine: row.inputLine,
        sauceProductId: s.sauceProduct?.id ?? "",
        sauceName: s.sauceProduct?.name ?? row.sauceName,
      };
      if (row.intent === "batch") {
        item.batchCount = s.batchCount;
      }
      if (row.intent === "stock" || (row.intent === "preview" && s.ingredientProduct)) {
        item.ingredientId = s.ingredientProduct!.id;
        item.ingredientName = s.ingredientProduct!.name;
        item.ingredientAmount = s.ingredientAmount;
      }
      if (row.intent === "preview" && s.batchCount > 0 && !s.ingredientProduct) {
        item.batchCount = s.batchCount;
      }
      if (row.intent === "copy" && row.sourceDateRef) {
        item.sourceDateRef = row.sourceDateRef;
      }
      if (row.intent === "recommend") {
        if (row.limitingIngredientHint) item.limitingIngredientHint = row.limitingIngredientHint;
      }
      items.push(item);
    });
    onConfirm(items);
  };

  // 소스 후보 영역 렌더
  const renderSauceSelection = (idx: number) => {
    const row = rows[idx];
    const s = states[idx];
    const isExpanded = expandedSauce.has(idx);
    const candidateList = row.sauceCandidates ?? [];

    return (
      <div className="flex items-start gap-2">
        <span className="text-muted-foreground shrink-0 w-12">소스</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.sauceName || "(소스 미지정)"}</span>
            {s.sauceProduct ? (
              <>
                <span className="text-green-600 text-xs">→ {s.sauceProduct.name}</span>
                <button onClick={() => updateState(idx, { sauceProduct: null })} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setExpandedSauce((prev) => {
                  const next = new Set(prev);
                  if (next.has(idx)) next.delete(idx); else next.add(idx);
                  return next;
                })}
                className="text-amber-600 text-[10px]"
              >
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                선택 필요
              </button>
            )}
          </div>
          {isExpanded && !s.sauceProduct && (
            <div className="mt-1 space-y-0.5">
              {candidateList.map((c, j) => (
                <button key={j} onClick={() => handleSelectSauce(idx, c)}
                  className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-muted/80 transition-colors">
                  <span className="font-medium">{c.name}</span>
                </button>
              ))}
              {/* 소스 직접 선택 (자체소스 카테고리에서) */}
              <details className="ml-2">
                <summary className="text-[10px] text-muted-foreground cursor-pointer">직접 선택</summary>
                <div className="mt-1 space-y-0.5">
                  {sauceProducts.map((sp) => (
                    <button key={sp.id} onClick={() => handleSelectSauce(idx, sp)}
                      className="flex items-center gap-1 w-full text-left px-2 py-0.5 rounded hover:bg-muted/80 text-[11px]">
                      <Search className="h-3 w-3" />
                      {sp.name}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 재료 후보 영역 렌더 (stock/preview일 때만)
  const renderIngredientSelection = (idx: number) => {
    const row = rows[idx];
    const s = states[idx];
    if (row.intent !== "stock" && row.intent !== "preview") return null;
    if (!row.ingredientName && row.intent === "preview") return null;

    const isExpanded = expandedIngredient.has(idx);
    const candidateList = row.ingredientCandidates ?? [];

    // 자동 후보: 선택된 소스의 레시피 재료들로 제한
    const sauceRecipeIngredients = s.sauceProduct
      ? sauceRecipes
          .filter((r) => r.sauceProductId === s.sauceProduct!.id)
          .map((r) => productMapById.get(r.ingredientProductId))
          .filter((p): p is DbProduct => !!p)
      : [];

    return (
      <div className="flex items-start gap-2">
        <span className="text-muted-foreground shrink-0 w-12">재료</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.ingredientName || "(재료 미지정)"}</span>
            {s.ingredientProduct ? (
              <>
                <span className="text-green-600 text-xs">→ {s.ingredientProduct.name}</span>
                <button onClick={() => updateState(idx, { ingredientProduct: null })} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setExpandedIngredient((prev) => {
                  const next = new Set(prev);
                  if (next.has(idx)) next.delete(idx); else next.add(idx);
                  return next;
                })}
                className="text-amber-600 text-[10px]"
              >
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                선택 필요
              </button>
            )}
          </div>
          {isExpanded && !s.ingredientProduct && (
            <div className="mt-1 space-y-0.5">
              {candidateList.map((c, j) => (
                <button key={j} onClick={() => handleSelectIngredient(idx, c)}
                  className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-muted/80 transition-colors">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground text-[10px]">({c.categoryName})</span>
                </button>
              ))}
              {sauceRecipeIngredients.length > 0 && (
                <details className="ml-2" open>
                  <summary className="text-[10px] text-muted-foreground cursor-pointer">소스 레시피 재료에서 선택</summary>
                  <div className="mt-1 space-y-0.5">
                    {sauceRecipeIngredients.map((ip) => (
                      <button key={ip.id} onClick={() => handleSelectIngredient(idx, ip)}
                        className="flex items-center gap-1 w-full text-left px-2 py-0.5 rounded hover:bg-muted/80 text-[11px]">
                        <Plus className="h-3 w-3" />
                        {ip.name}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="border rounded-lg overflow-hidden text-xs bg-background">
      <div className="bg-purple-50 dark:bg-purple-950/30 px-3 py-1.5 border-b">
        <span className="font-medium text-purple-800 dark:text-purple-200">자체소스 생산 검토 ({rows.length}건)</span>
      </div>

      {rows.map((row, idx) => {
        const s = states[idx];
        const resolved = isRowResolved(idx);

        return (
          <div key={idx} className={`border-t px-3 py-2 ${resolved ? "" : "bg-muted/20"}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${INTENT_BADGE_COLOR[row.intent]}`}>
                {INTENT_LABEL[row.intent]}
              </span>
              <span className="text-muted-foreground text-[11px] truncate flex-1">{row.inputLine}</span>
              {resolved ? (
                <Check className="h-3 w-3 text-green-600 shrink-0" />
              ) : (
                <span className="text-amber-600 text-[10px] shrink-0">미해결</span>
              )}
            </div>

            <div className="space-y-1.5 ml-2">
              {renderSauceSelection(idx)}

              {/* 배합 모드 입력 */}
              {(row.intent === "batch" || (row.intent === "preview" && !row.ingredientName)) && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground shrink-0 w-12">배합</span>
                  <input
                    type="number"
                    step="0.1"
                    value={s.batchCount || ""}
                    onChange={(e) => updateState(idx, { batchCount: Number(e.target.value) || 0 })}
                    className="w-20 border rounded px-1 py-0.5 text-xs bg-background"
                    placeholder="2"
                  />
                  <span className="text-muted-foreground text-[10px]">배합</span>
                </div>
              )}

              {/* 재고 모드 입력 */}
              {renderIngredientSelection(idx)}

              {(row.intent === "stock" || (row.intent === "preview" && row.ingredientName)) && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground shrink-0 w-12">사용량</span>
                  <input
                    type="number"
                    value={s.ingredientAmount || ""}
                    onChange={(e) => updateState(idx, { ingredientAmount: Number(e.target.value) || 0 })}
                    className="w-20 border rounded px-1 py-0.5 text-xs bg-background"
                    placeholder="200"
                  />
                </div>
              )}

              {/* copy: 원본 날짜 표시 */}
              {row.intent === "copy" && row.sourceDateRef && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground shrink-0 w-12">원본</span>
                  <span>{row.sourceDateRef}</span>
                </div>
              )}

              {/* recommend: 한정재료 힌트 */}
              {row.intent === "recommend" && row.limitingIngredientHint && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground shrink-0 w-12">한정</span>
                  <span>{row.limitingIngredientHint}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="border-t px-3 py-2 bg-muted/30 flex items-center justify-between">
        <span className="text-muted-foreground">{resolvedCount}/{rows.length} 해결됨</span>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel} disabled={disabled}>취소</Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleConfirmAll} disabled={disabled || !allResolved}>
            {allResolved ? "전체 확인" : `${resolvedCount}/${rows.length} 해결 대기`}
          </Button>
        </div>
      </div>
    </div>
  );
}
