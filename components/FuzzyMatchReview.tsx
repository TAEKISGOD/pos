"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronDown, ChevronUp, Search, Plus, Check } from "lucide-react";

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
  newCategoryId?: string;
  newUnit?: string;
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
  products?: DbProduct[];
  mode?: FuzzyMode;
  context?: FuzzyContext;
  onConfirm: (items: ResolvedItem[], context?: FuzzyContext) => void;
  onCancel: () => void;
  disabled?: boolean;
}

// ─── 제품추가 폼 (새 제품 생성) ───
function NewProductForm({
  idx, defaultName, valueLabel, isInventory, categories, value,
  onConfirm, onCancel,
}: {
  idx: number;
  defaultName: string;
  valueLabel: string;
  isInventory: boolean;
  categories: CategoryInfo[];
  value: number;
  onConfirm: (idx: number, data: { name: string; categoryId: string; unit: string; value: number }) => void;
  onCancel: () => void;
}) {
  const [catId, setCatId] = useState(categories[0]?.id || "");
  const [name, setName] = useState(defaultName);
  const [unit, setUnit] = useState("g");
  const [val, setVal] = useState(value);

  return (
    <div className="mt-1.5 ml-2 space-y-1.5 p-2 bg-muted/30 rounded">
      <div className="flex items-center gap-2">
        <label className="text-muted-foreground w-12 shrink-0">분류</label>
        <select value={catId} onChange={(e) => setCatId(e.target.value)}
          className="flex-1 border rounded px-2 py-0.5 text-xs bg-background">
          {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-muted-foreground w-12 shrink-0">이름</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          className="flex-1 border rounded px-2 py-0.5 text-xs bg-background" />
      </div>
      {isInventory && (
        <div className="flex items-center gap-2">
          <label className="text-muted-foreground w-12 shrink-0">용량</label>
          <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g"
            className="w-20 border rounded px-2 py-0.5 text-xs bg-background" />
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="text-muted-foreground w-12 shrink-0">{valueLabel}</label>
        <input type="number" value={val} onChange={(e) => setVal(Number(e.target.value) || 0)}
          className="w-24 border rounded px-2 py-0.5 text-xs bg-background" />
      </div>
      <div className="flex gap-1 mt-1">
        <Button size="sm" className="h-6 text-[10px] gap-1"
          onClick={() => { if (name.trim() && catId) onConfirm(idx, { name: name.trim(), categoryId: catId, unit, value: val }); }}>
          <Check className="h-3 w-3" /> 확인
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={onCancel}>취소</Button>
      </div>
    </div>
  );
}

// ─── 직접선택 폼 (기존 제품 드롭다운) ───
function SelectProductForm({
  idx, valueLabel, isInventory, categories, products, value,
  onConfirm, onCancel,
}: {
  idx: number;
  valueLabel: string;
  isInventory: boolean;
  categories: CategoryInfo[];
  products: DbProduct[];
  value: number;
  onConfirm: (idx: number, product: DbProduct, value: number) => void;
  onCancel: () => void;
}) {
  const [catId, setCatId] = useState(categories[0]?.id || "");
  const [productId, setProductId] = useState("");
  const [val, setVal] = useState(value);

  const filteredProducts = products.filter((p) => p.categoryId === catId);
  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <div className="mt-1.5 ml-2 space-y-1.5 p-2 bg-muted/30 rounded">
      <div className="flex items-center gap-2">
        <label className="text-muted-foreground w-12 shrink-0">분류</label>
        <select value={catId} onChange={(e) => { setCatId(e.target.value); setProductId(""); }}
          className="flex-1 border rounded px-2 py-0.5 text-xs bg-background">
          {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-muted-foreground w-12 shrink-0">이름</label>
        <select value={productId} onChange={(e) => setProductId(e.target.value)}
          className="flex-1 border rounded px-2 py-0.5 text-xs bg-background">
          <option value="">-- 선택 --</option>
          {filteredProducts.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
        </select>
      </div>
      {isInventory && selectedProduct && (
        <div className="flex items-center gap-2">
          <label className="text-muted-foreground w-12 shrink-0">용량</label>
          <span className="text-xs text-muted-foreground">{selectedProduct.unit}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="text-muted-foreground w-12 shrink-0">{valueLabel}</label>
        <input type="number" value={val} onChange={(e) => setVal(Number(e.target.value) || 0)}
          className="w-24 border rounded px-2 py-0.5 text-xs bg-background" />
      </div>
      <div className="flex gap-1 mt-1">
        <Button size="sm" className="h-6 text-[10px] gap-1" disabled={!selectedProduct}
          onClick={() => { if (selectedProduct) onConfirm(idx, selectedProduct, val); }}>
          <Check className="h-3 w-3" /> 확인
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={onCancel}>취소</Button>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ───
export function FuzzyMatchReview({ results, categories, products = [], mode = "inventory", context, onConfirm, onCancel, disabled }: Props) {
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

  const [valueOverrides, setValueOverrides] = useState<Map<number, number>>(() => {
    const map = new Map<number, number>();
    results.forEach((r, i) => { map.set(i, r.value); });
    return map;
  });

  const getItemValue = (idx: number) => valueOverrides.get(idx) ?? results[idx].value;

  // 열린 폼 추적: { idx, type: "new" | "select" }
  const [openForm, setOpenForm] = useState<{ idx: number; type: "new" | "select" } | null>(null);

  const [expandedCandidates, setExpandedCandidates] = useState<Set<number>>(
    new Set(results.map((_, i) => i).filter((i) => results[i].status === "candidate"))
  );

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
  const sauceNeedsResolve = mode === "sauce" && context?.sauceStatus !== "auto" && !sauceResolved;
  const allResolved = resolvedCount >= totalNeedResolve && !sauceNeedsResolve;

  const isInventory = mode === "inventory";
  const valueLabel = isInventory ? "잔량" : "사용량";

  const handleSelectCandidate = (idx: number, product: DbProduct) => {
    setResolved((prev) => {
      const next = new Map(prev);
      next.set(idx, {
        inputName: results[idx].inputName,
        value: getItemValue(idx),
        tolerancePercent: results[idx].tolerancePercent,
        productId: product.id,
        productName: product.name,
      });
      return next;
    });
    setExpandedCandidates((prev) => { const next = new Set(prev); next.delete(idx); return next; });
    setOpenForm(null);
  };

  const handleNewProductConfirm = (idx: number, data: { name: string; categoryId: string; unit: string; value: number }) => {
    setValueOverrides((prev) => new Map(prev).set(idx, data.value));
    setResolved((prev) => {
      const next = new Map(prev);
      next.set(idx, {
        inputName: results[idx].inputName,
        value: data.value,
        tolerancePercent: results[idx].tolerancePercent,
        isNew: true,
        productName: data.name,
        newCategoryId: data.categoryId,
        newUnit: data.unit,
      });
      return next;
    });
    setExpandedCandidates((prev) => { const next = new Set(prev); next.delete(idx); return next; });
    setOpenForm(null);
  };

  const handleSelectProductConfirm = (idx: number, product: DbProduct, value: number) => {
    setValueOverrides((prev) => new Map(prev).set(idx, value));
    setResolved((prev) => {
      const next = new Map(prev);
      next.set(idx, {
        inputName: results[idx].inputName,
        value,
        tolerancePercent: results[idx].tolerancePercent,
        productId: product.id,
        productName: product.name,
      });
      return next;
    });
    setExpandedCandidates((prev) => { const next = new Set(prev); next.delete(idx); return next; });
    setOpenForm(null);
  };

  const handleUnresolve = (idx: number) => {
    setResolved((prev) => { const next = new Map(prev); next.delete(idx); return next; });
  };

  const handleConfirmAll = () => {
    const items: ResolvedItem[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = resolved.get(i);
      if (r) items.push({ ...r, value: getItemValue(i) });
    }
    const finalContext: FuzzyContext = { ...context };
    if (mode === "sauce" && sauceResolved) {
      finalContext.sauceMatched = sauceResolved;
      finalContext.sauceStatus = "auto";
    }
    onConfirm(items, finalContext);
  };

  // 제품추가 / 직접선택 버튼 쌍
  const renderActionButtons = (idx: number) => {
    if (openForm?.idx === idx) return null;
    return (
      <div className="flex gap-1 mt-0.5">
        <button onClick={() => setOpenForm({ idx, type: "new" })}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/80 transition-colors text-muted-foreground">
          <Plus className="h-3 w-3" /><span>제품추가</span>
        </button>
        <button onClick={() => setOpenForm({ idx, type: "select" })}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/80 transition-colors text-muted-foreground">
          <Search className="h-3 w-3" /><span>직접선택</span>
        </button>
      </div>
    );
  };

  // 열린 폼 렌더
  const renderOpenForm = (idx: number) => {
    if (openForm?.idx !== idx) return null;
    if (openForm.type === "new") {
      return (
        <NewProductForm idx={idx} defaultName={results[idx].inputName} valueLabel={valueLabel}
          isInventory={isInventory} categories={categories} value={getItemValue(idx)}
          onConfirm={handleNewProductConfirm} onCancel={() => setOpenForm(null)} />
      );
    }
    return (
      <SelectProductForm idx={idx} valueLabel={valueLabel} isInventory={isInventory}
        categories={categories} products={products} value={getItemValue(idx)}
        onConfirm={handleSelectProductConfirm} onCancel={() => setOpenForm(null)} />
    );
  };

  return (
    <div className="border rounded-lg overflow-hidden text-xs bg-background">
      {/* 컨텍스트 헤더 */}
      {mode === "recipe" && context?.menuName && (
        <div className="bg-orange-50 dark:bg-orange-950/30 px-3 py-1.5 font-medium text-orange-800 dark:text-orange-200 border-b">
          메뉴: {context.menuName}
        </div>
      )}
      {mode === "sauce" && context?.sauceName && (
        <div className="bg-green-50 dark:bg-green-950/30 px-3 py-1.5 border-b">
          <div className="flex items-center justify-between">
            <span className="font-medium text-green-800 dark:text-green-200">소스: {context.sauceName}</span>
            {sauceResolved ? (
              <div className="flex items-center gap-1">
                <span className="text-green-600 font-medium">→ {sauceResolved.name}</span>
                <button onClick={() => { setSauceResolved(null); setSauceCandidateOpen(true); }} className="text-muted-foreground hover:text-foreground ml-1"><X className="h-3 w-3" /></button>
              </div>
            ) : context.sauceStatus === "candidate" && context.sauceCandidates ? (
              <button onClick={() => setSauceCandidateOpen(!sauceCandidateOpen)} className="text-amber-600 text-[10px]">후보 선택 필요</button>
            ) : context.sauceStatus === "none" ? (
              <span className="text-red-500 text-[10px]">매칭 실패</span>
            ) : null}
          </div>
          {sauceCandidateOpen && !sauceResolved && context.sauceCandidates && (
            <div className="mt-1 space-y-0.5">
              {context.sauceCandidates.map((p, j) => (
                <button key={j} onClick={() => { setSauceResolved(p); setSauceCandidateOpen(false); }}
                  className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-muted/80 transition-colors">
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
              {autoItems.map(({ idx, inputName, matched }) => (
                <tr key={idx} className="border-t">
                  <td className="px-2 py-1 text-muted-foreground">{inputName}</td>
                  <td className="px-2 py-1 font-medium">{matched?.name}</td>
                  <td className="px-2 py-1 text-right">
                    <input type="number" value={getItemValue(idx)}
                      onChange={(e) => setValueOverrides((prev) => new Map(prev).set(idx, Number(e.target.value) || 0))}
                      className="w-16 text-right font-mono border rounded px-1 py-0.5 text-xs bg-background" />
                  </td>
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
          {candidateItems.map(({ idx, inputName, candidates }) => {
            const isResolved = resolved.has(idx);
            const isExpanded = expandedCandidates.has(idx);
            const resolvedItem = resolved.get(idx);

            return (
              <div key={idx} className="border-t px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">{inputName}</span>
                    <input type="number" value={getItemValue(idx)}
                      onChange={(e) => setValueOverrides((prev) => new Map(prev).set(idx, Number(e.target.value) || 0))}
                      className="w-16 text-right font-mono border rounded px-1 py-0.5 text-xs bg-background" />
                  </span>
                  {isResolved ? (
                    <div className="flex items-center gap-1">
                      <span className="text-green-600 font-medium">→ {resolvedItem?.productName}</span>
                      <button onClick={() => { handleUnresolve(idx); setExpandedCandidates((p) => new Set(p).add(idx)); }}
                        className="text-muted-foreground hover:text-foreground ml-1"><X className="h-3 w-3" /></button>
                    </div>
                  ) : (
                    <button onClick={() => setExpandedCandidates((prev) => {
                      const next = new Set(prev);
                      if (next.has(idx)) next.delete(idx); else next.add(idx);
                      return next;
                    })} className="text-muted-foreground hover:text-foreground">
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  )}
                </div>
                {isExpanded && !isResolved && candidates && (
                  <div className="mt-1 ml-2 space-y-0.5">
                    {candidates.map((c, j) => (
                      <button key={j} onClick={() => handleSelectCandidate(idx, c.product)}
                        className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-muted/80 transition-colors">
                        <span className="font-medium">{c.product.name}</span>
                        <span className="text-muted-foreground">({c.product.categoryName})</span>
                      </button>
                    ))}
                    {renderActionButtons(idx)}
                  </div>
                )}
                {isExpanded && !isResolved && renderOpenForm(idx)}
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
          {noneItems.map(({ idx, inputName }) => {
            const isResolved = resolved.has(idx);
            const resolvedItem = resolved.get(idx);

            return (
              <div key={idx} className="border-t px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">{inputName}</span>
                    <input type="number" value={getItemValue(idx)}
                      onChange={(e) => setValueOverrides((prev) => new Map(prev).set(idx, Number(e.target.value) || 0))}
                      className="w-16 text-right font-mono border rounded px-1 py-0.5 text-xs bg-background" />
                  </span>
                  {isResolved ? (
                    <div className="flex items-center gap-1">
                      <span className="text-green-600 font-medium">→ {resolvedItem?.productName}</span>
                      <button onClick={() => handleUnresolve(idx)} className="text-muted-foreground hover:text-foreground ml-1"><X className="h-3 w-3" /></button>
                    </div>
                  ) : openForm?.idx !== idx ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => setOpenForm({ idx, type: "new" })}>
                        <Plus className="h-3 w-3" /> 제품추가
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => setOpenForm({ idx, type: "select" })}>
                        <Search className="h-3 w-3" /> 직접선택
                      </Button>
                    </div>
                  ) : null}
                </div>
                {!isResolved && renderOpenForm(idx)}
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
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel} disabled={disabled}>취소</Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleConfirmAll} disabled={disabled || !allResolved}>
            {allResolved ? "전체 확인" : `${resolvedCount}/${totalNeedResolve} 해결 대기`}
          </Button>
        </div>
      </div>
    </div>
  );
}
