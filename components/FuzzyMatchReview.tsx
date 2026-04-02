"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Plus, X, ChevronDown, ChevronUp } from "lucide-react";

interface DbProduct {
  id: string;
  name: string;
  unit: string;
  categoryId: string;
  categoryName: string;
}

interface MatchCandidate {
  product: DbProduct;
  score: number;
}

export interface FuzzyResult {
  inputName: string;
  value: number;
  tolerancePercent?: number;
  status: "auto" | "candidate" | "none";
  matched?: DbProduct;
  candidates?: MatchCandidate[];
}

export interface ResolvedItem {
  inputName: string;
  value: number;
  tolerancePercent?: number;
  productId?: string;
  productName: string;
  isNew?: boolean;
  newUnit?: string;
  newCategoryId?: string;
}

export interface FuzzyContext {
  menuName?: string;
  sauceName?: string;
  sauceStatus?: "auto" | "candidate" | "none";
  sauceMatched?: DbProduct;
  sauceCandidates?: DbProduct[];
}

interface CategoryInfo {
  id: string;
  name: string;
}

export type FuzzyMode = "inventory" | "recipe" | "sauce";

interface Props {
  results: FuzzyResult[];
  categories: CategoryInfo[];
  mode?: FuzzyMode;
  context?: FuzzyContext;
  onConfirm: (items: ResolvedItem[], context?: FuzzyContext) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function FuzzyMatchReview({ results, categories, mode = "inventory", context, onConfirm, onCancel, disabled }: Props) {
  const [resolved, setResolved] = useState<Map<number, ResolvedItem>>(() => {
    const map = new Map<number, ResolvedItem>();
    results.forEach((r, i) => {
      if (r.status === "auto" && r.matched) {
        map.set(i, {
          inputName: r.inputName,
          value: r.value,
          tolerancePercent: r.tolerancePercent,
          productId: r.matched.id,
          productName: r.matched.name,
        });
      }
    });
    return map;
  });

  const [newProductForms, setNewProductForms] = useState<Map<number, { name: string; unit: string; categoryId: string }>>(new Map());
  const [expandedCandidates, setExpandedCandidates] = useState<Set<number>>(
    new Set(results.map((_, i) => i).filter((i) => results[i].status === "candidate"))
  );

  // 소스명 매칭 상태 (sauce 모드)
  const [sauceResolved, setSauceResolved] = useState<DbProduct | null>(() => {
    if (context?.sauceStatus === "auto" && context.sauceMatched) return context.sauceMatched;
    return null;
  });
  const [sauceCandidateOpen, setSauceCandidateOpen] = useState(context?.sauceStatus === "candidate");

  const autoItems = results.map((r, i) => ({ ...r, idx: i })).filter((r) => r.status === "auto");
  const candidateItems = results.map((r, i) => ({ ...r, idx: i })).filter((r) => r.status === "candidate");
  const noneItems = results.map((r, i) => ({ ...r, idx: i })).filter((r) => r.status === "none");

  const totalNeedResolve = candidateItems.length + noneItems.length;
  const resolvedCount = Array.from(resolved.keys()).filter((i) => results[i].status !== "auto").length;

  // sauce 모드: 소스명도 매칭해야 함
  const sauceNeedsResolve = mode === "sauce" && context?.sauceStatus !== "auto" && !sauceResolved;
  const allResolved = resolvedCount >= totalNeedResolve && !sauceNeedsResolve;

  const valueLabel = mode === "inventory" ? "잔량" : "사용량";

  const handleSelectCandidate = (idx: number, product: DbProduct) => {
    setResolved((prev) => {
      const next = new Map(prev);
      next.set(idx, {
        inputName: results[idx].inputName,
        value: results[idx].value,
        tolerancePercent: results[idx].tolerancePercent,
        productId: product.id,
        productName: product.name,
      });
      return next;
    });
    setExpandedCandidates((prev) => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  };

  const handleNewProductToggle = (idx: number) => {
    setNewProductForms((prev) => {
      const next = new Map(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.set(idx, { name: results[idx].inputName, unit: "g", categoryId: categories[0]?.id || "" });
      }
      return next;
    });
  };

  const handleNewProductConfirm = (idx: number) => {
    const form = newProductForms.get(idx);
    if (!form || !form.categoryId || !form.name.trim()) return;

    setResolved((prev) => {
      const next = new Map(prev);
      next.set(idx, {
        inputName: results[idx].inputName,
        value: results[idx].value,
        tolerancePercent: results[idx].tolerancePercent,
        isNew: true,
        productName: form.name.trim(),
        newUnit: form.unit,
        newCategoryId: form.categoryId,
      });
      return next;
    });
    setNewProductForms((prev) => {
      const next = new Map(prev);
      next.delete(idx);
      return next;
    });
  };

  const handleUnresolve = (idx: number) => {
    setResolved((prev) => {
      const next = new Map(prev);
      next.delete(idx);
      return next;
    });
  };

  const handleConfirmAll = () => {
    const items: ResolvedItem[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = resolved.get(i);
      if (r) items.push(r);
    }

    // context에 소스 매칭 결과 반영
    const finalContext: FuzzyContext = { ...context };
    if (mode === "sauce" && sauceResolved) {
      finalContext.sauceMatched = sauceResolved;
      finalContext.sauceStatus = "auto";
    }

    onConfirm(items, finalContext);
  };

  return (
    <div className="border rounded-lg overflow-hidden text-xs bg-background">
      {/* 컨텍스트 헤더 (레시피/소스) */}
      {mode === "recipe" && context?.menuName && (
        <div className="bg-orange-50 dark:bg-orange-950/30 px-3 py-1.5 font-medium text-orange-800 dark:text-orange-200 border-b">
          메뉴: {context.menuName}
        </div>
      )}
      {mode === "sauce" && context?.sauceName && (
        <div className="bg-green-50 dark:bg-green-950/30 px-3 py-1.5 border-b">
          <div className="flex items-center justify-between">
            <span className="font-medium text-green-800 dark:text-green-200">
              소스: {context.sauceName}
            </span>
            {sauceResolved ? (
              <div className="flex items-center gap-1">
                <span className="text-green-600 font-medium">→ {sauceResolved.name}</span>
                <button onClick={() => { setSauceResolved(null); setSauceCandidateOpen(true); }} className="text-muted-foreground hover:text-foreground ml-1">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : context.sauceStatus === "candidate" && context.sauceCandidates ? (
              <button onClick={() => setSauceCandidateOpen(!sauceCandidateOpen)} className="text-amber-600 text-[10px]">
                후보 선택 필요
              </button>
            ) : context.sauceStatus === "none" ? (
              <span className="text-red-500 text-[10px]">매칭 실패</span>
            ) : null}
          </div>
          {sauceCandidateOpen && !sauceResolved && context.sauceCandidates && (
            <div className="mt-1 space-y-0.5">
              {context.sauceCandidates.map((p, j) => (
                <button
                  key={j}
                  onClick={() => { setSauceResolved(p); setSauceCandidateOpen(false); }}
                  className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-muted/80 transition-colors"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground">({p.categoryName})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ✅ 자동 매칭 */}
      {autoItems.length > 0 && (
        <div>
          <div className="bg-green-50 dark:bg-green-950/30 px-3 py-1.5 font-medium text-green-800 dark:text-green-200 border-b">
            ✅ 자동 매칭 ({autoItems.length}개)
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-2 py-1 text-left">입력</th>
                <th className="px-2 py-1 text-left">→ 매칭 제품</th>
                <th className="px-2 py-1 text-right">{valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {autoItems.map(({ idx, inputName, value, matched }) => (
                <tr key={idx} className="border-t">
                  <td className="px-2 py-1 text-muted-foreground">{inputName}</td>
                  <td className="px-2 py-1 font-medium">{matched?.name}</td>
                  <td className="px-2 py-1 text-right font-mono">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 🔶 후보 선택 */}
      {candidateItems.length > 0 && (
        <div>
          <div className="bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 font-medium text-amber-800 dark:text-amber-200 border-b border-t">
            🔶 후보 선택 필요 ({candidateItems.length}개)
          </div>
          {candidateItems.map(({ idx, inputName, value, candidates }) => {
            const isResolved = resolved.has(idx);
            const isExpanded = expandedCandidates.has(idx);
            const resolvedItem = resolved.get(idx);

            return (
              <div key={idx} className="border-t px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span>
                    <span className="text-muted-foreground">{inputName}</span>
                    <span className="font-mono ml-2">{value}</span>
                  </span>
                  {isResolved ? (
                    <div className="flex items-center gap-1">
                      <span className="text-green-600 font-medium">→ {resolvedItem?.productName}</span>
                      <button onClick={() => { handleUnresolve(idx); setExpandedCandidates((p) => new Set(p).add(idx)); }} className="text-muted-foreground hover:text-foreground ml-1">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setExpandedCandidates((prev) => {
                        const next = new Set(prev);
                        if (next.has(idx)) next.delete(idx); else next.add(idx);
                        return next;
                      })}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  )}
                </div>
                {isExpanded && !isResolved && candidates && (
                  <div className="mt-1 ml-2 space-y-0.5">
                    {candidates.map((c, j) => (
                      <button
                        key={j}
                        onClick={() => handleSelectCandidate(idx, c.product)}
                        className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-muted/80 transition-colors"
                      >
                        <span className="font-medium">{c.product.name}</span>
                        <span className="text-muted-foreground">({c.product.categoryName})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ❌ 매칭 실패 */}
      {noneItems.length > 0 && (
        <div>
          <div className="bg-red-50 dark:bg-red-950/30 px-3 py-1.5 font-medium text-red-800 dark:text-red-200 border-b border-t">
            ❌ 매칭 실패 ({noneItems.length}개)
          </div>
          {noneItems.map(({ idx, inputName, value }) => {
            const isResolved = resolved.has(idx);
            const resolvedItem = resolved.get(idx);
            const formData = newProductForms.get(idx);

            return (
              <div key={idx} className="border-t px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span>
                    <span className="text-muted-foreground">{inputName}</span>
                    <span className="font-mono ml-2">{value}</span>
                  </span>
                  {isResolved ? (
                    <div className="flex items-center gap-1">
                      <span className="text-green-600 font-medium">+ {resolvedItem?.productName}</span>
                      <button onClick={() => handleUnresolve(idx)} className="text-muted-foreground hover:text-foreground ml-1">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : !formData ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1"
                      onClick={() => handleNewProductToggle(idx)}
                    >
                      <Plus className="h-3 w-3" />
                      새 제품 추가
                    </Button>
                  ) : null}
                </div>

                {formData && !isResolved && (
                  <div className="mt-2 ml-2 space-y-1.5 p-2 bg-muted/30 rounded">
                    <div className="flex items-center gap-2">
                      <label className="text-muted-foreground w-12 shrink-0">이름</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setNewProductForms((prev) => {
                          const next = new Map(prev);
                          next.set(idx, { ...formData, name: e.target.value });
                          return next;
                        })}
                        className="flex-1 border rounded px-2 py-0.5 text-xs bg-background"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-muted-foreground w-12 shrink-0">단위</label>
                      <input
                        type="text"
                        value={formData.unit}
                        onChange={(e) => setNewProductForms((prev) => {
                          const next = new Map(prev);
                          next.set(idx, { ...formData, unit: e.target.value });
                          return next;
                        })}
                        className="w-20 border rounded px-2 py-0.5 text-xs bg-background"
                        placeholder="g, ml, EA..."
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-muted-foreground w-12 shrink-0">분류</label>
                      <select
                        value={formData.categoryId}
                        onChange={(e) => setNewProductForms((prev) => {
                          const next = new Map(prev);
                          next.set(idx, { ...formData, categoryId: e.target.value });
                          return next;
                        })}
                        className="flex-1 border rounded px-2 py-0.5 text-xs bg-background"
                      >
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => handleNewProductConfirm(idx)}>
                        <Check className="h-3 w-3" />
                        확인
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => handleNewProductToggle(idx)}>
                        취소
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 하단 바 */}
      <div className="border-t px-3 py-2 bg-muted/30 flex items-center justify-between">
        <span className="text-muted-foreground">
          자동 {autoItems.length} / 후보 {candidateItems.length} / 미매칭 {noneItems.length}
        </span>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel} disabled={disabled}>
            취소
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleConfirmAll}
            disabled={disabled || !allResolved}
          >
            {allResolved ? "전체 확인" : `${resolvedCount}/${totalNeedResolve} 해결 대기`}
          </Button>
        </div>
      </div>
    </div>
  );
}
