"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { useDateContext } from "@/lib/date-context";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from "date-fns";
import { ko } from "date-fns/locale";

// ── types ──
type Period = "오늘" | "이번 주" | "이번 달" | "기간 설정";

interface MenuSales {
  menuId: string;
  menuName: string;
  totalQty: number;
}

interface DailySalesPoint {
  date: string;
  label: string;
  totalQty: number;
}

interface MenuCost {
  menuId: string;
  menuName: string;
  costPerServing: number;
  totalQty: number;
}

interface WasteItem {
  productName: string;
  totalWaste: number;
}

const PERIODS: Period[] = ["오늘", "이번 주", "이번 달", "기간 설정"];

// ── component ──
export function AnalyticsDashboard() {
  const { selectedDate } = useDateContext();
  const supabase = createClient();

  const [activePeriod, setActivePeriod] = useState<Period>("오늘");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [storeId, setStoreId] = useState("");
  const [menuSales, setMenuSales] = useState<MenuSales[]>([]);
  const [dailySales, setDailySales] = useState<DailySalesPoint[]>([]);
  const [menuCosts, setMenuCosts] = useState<MenuCost[]>([]);
  const [wasteItems, setWasteItems] = useState<WasteItem[]>([]);
  const [loading, setLoading] = useState(false);

  // ── date range ──
  const dateRange = useMemo(() => {
    const ref = selectedDate;
    switch (activePeriod) {
      case "오늘":
        return { start: ref, end: ref };
      case "이번 주":
        return {
          start: startOfWeek(ref, { weekStartsOn: 1 }),
          end: endOfWeek(ref, { weekStartsOn: 1 }),
        };
      case "이번 달":
        return { start: startOfMonth(ref), end: endOfMonth(ref) };
      case "기간 설정":
        return {
          start: customStart ? new Date(customStart) : ref,
          end: customEnd ? new Date(customEnd) : ref,
        };
    }
  }, [selectedDate, activePeriod, customStart, customEnd]);

  const startStr = format(dateRange.start, "yyyy-MM-dd");
  const endStr = format(dateRange.end, "yyyy-MM-dd");

  // ── fetch store ──
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

  // ── fetch data ──
  const fetchData = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);

    // menus (recipe menus)
    const { data: menus } = await supabase
      .from("menus")
      .select("id, name")
      .eq("store_id", storeId);

    const menuIds = menus?.map((m) => m.id) || [];
    const menuNameMap: Record<string, string> = {};
    menus?.forEach((m) => {
      menuNameMap[m.id] = m.name;
    });

    // menu board items
    const { data: sectionRows } = await supabase
      .from("menu_board_sections")
      .select("id, name")
      .eq("store_id", storeId);

    const sectionIds = sectionRows?.map((s) => s.id) || [];
    let boardItems: { id: string; name: string }[] = [];
    if (sectionIds.length > 0) {
      const { data: itemRows } = await supabase
        .from("menu_board_items")
        .select("id, name")
        .in("section_id", sectionIds);
      boardItems = itemRows || [];
    }
    boardItems.forEach((item) => {
      menuNameMap[item.id] = item.name;
    });

    const allMenuIds = [...menuIds, ...boardItems.map((b) => b.id)];

    if (allMenuIds.length === 0) {
      setMenuSales([]);
      setDailySales([]);
      setMenuCosts([]);
      setLoading(false);
      return;
    }

    // daily_sales
    const { data: salesData } = await supabase
      .from("daily_sales")
      .select("*")
      .in("menu_id", allMenuIds)
      .gte("date", startStr)
      .lte("date", endStr);

    const menuQtyMap: Record<string, number> = {};
    const dateQtyMap: Record<string, number> = {};
    salesData?.forEach((s) => {
      menuQtyMap[s.menu_id] = (menuQtyMap[s.menu_id] || 0) + s.quantity;
      dateQtyMap[s.date] = (dateQtyMap[s.date] || 0) + s.quantity;
    });

    const menuSalesArr: MenuSales[] = Object.entries(menuQtyMap)
      .map(([menuId, totalQty]) => ({
        menuId,
        menuName: menuNameMap[menuId] || "알 수 없음",
        totalQty,
      }))
      .sort((a, b) => b.totalQty - a.totalQty);
    setMenuSales(menuSalesArr);

    // daily points
    const days = eachDayOfInterval({
      start: dateRange.start,
      end: dateRange.end,
    });
    const dailyPoints: DailySalesPoint[] = days.map((day) => {
      const ds = format(day, "yyyy-MM-dd");
      let label: string;
      if (activePeriod === "오늘") label = "오늘";
      else if (activePeriod === "이번 주")
        label = format(day, "EEE", { locale: ko });
      else label = format(day, "M/d");
      return { date: ds, label, totalQty: dateQtyMap[ds] || 0 };
    });
    setDailySales(dailyPoints);

    // menu costs
    const { data: recipes } = await supabase
      .from("menu_recipes")
      .select("menu_id, product_id, amount")
      .in("menu_id", menuIds);

    if (recipes && recipes.length > 0) {
      const productIds = Array.from(
        new Set(recipes.map((r) => r.product_id))
      );
      const { data: products } = await supabase
        .from("products")
        .select("id, unit, price")
        .in("id", productIds);

      const productMap: Record<string, { unit: number; price: number }> = {};
      products?.forEach((p) => {
        productMap[p.id] = {
          unit: parseFloat(p.unit) || 0,
          price: p.price ?? 0,
        };
      });

      const recipesByMenu: Record<string, typeof recipes> = {};
      recipes.forEach((r) => {
        if (!recipesByMenu[r.menu_id]) recipesByMenu[r.menu_id] = [];
        recipesByMenu[r.menu_id].push(r);
      });

      const costs: MenuCost[] = [];
      for (const [menuId, menuRecipes] of Object.entries(recipesByMenu)) {
        let totalCost = 0;
        for (const recipe of menuRecipes) {
          const product = productMap[recipe.product_id];
          if (product && product.unit > 0) {
            totalCost += recipe.amount * (product.price / product.unit);
          }
        }
        costs.push({
          menuId,
          menuName: menuNameMap[menuId] || "알 수 없음",
          costPerServing: Math.round(totalCost),
          totalQty: menuQtyMap[menuId] || 0,
        });
      }
      costs.sort((a, b) => b.totalQty - a.totalQty);
      setMenuCosts(costs);
    } else {
      setMenuCosts([]);
    }

    // waste
    const { data: categories } = await supabase
      .from("categories")
      .select("id")
      .eq("store_id", storeId);

    if (categories && categories.length > 0) {
      const catIds = categories.map((c) => c.id);
      const { data: allProducts } = await supabase
        .from("products")
        .select("id, name")
        .in("category_id", catIds);

      if (allProducts && allProducts.length > 0) {
        const allProductIds = allProducts.map((p) => p.id);
        const productNameMap: Record<string, string> = {};
        allProducts.forEach((p) => {
          productNameMap[p.id] = p.name;
        });

        const { data: wasteData } = await supabase
          .from("daily_waste")
          .select("*")
          .in("product_id", allProductIds)
          .gte("date", startStr)
          .lte("date", endStr);

        const wasteQtyMap: Record<string, number> = {};
        wasteData?.forEach((w) => {
          wasteQtyMap[w.product_id] =
            (wasteQtyMap[w.product_id] || 0) + w.waste_amount;
        });

        const wasteArr: WasteItem[] = Object.entries(wasteQtyMap)
          .map(([productId, totalWaste]) => ({
            productName: productNameMap[productId] || "알 수 없음",
            totalWaste,
          }))
          .sort((a, b) => b.totalWaste - a.totalWaste);
        setWasteItems(wasteArr);
      } else {
        setWasteItems([]);
      }
    }

    setLoading(false);
  }, [storeId, startStr, endStr, activePeriod]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── derived ──
  const totalSales = menuSales.reduce((sum, m) => sum + m.totalQty, 0);
  const daysWithSales = dailySales.filter((d) => d.totalQty > 0).length;
  const avgDailySales =
    daysWithSales > 0 ? Math.round(totalSales / daysWithSales) : 0;
  const totalWasteAmount = wasteItems.reduce((sum, w) => sum + w.totalWaste, 0);
  const totalCostAll = menuCosts.reduce(
    (sum, m) => sum + m.costPerServing * m.totalQty,
    0
  );

  const maxBarValue = Math.max(...menuSales.map((m) => m.totalQty), 1);
  const maxWaste = Math.max(...wasteItems.map((w) => w.totalWaste), 1);
  const maxCost = Math.max(...menuCosts.map((c) => c.costPerServing), 1);

  // donut
  const donutData = useMemo(() => {
    if (menuSales.length === 0) return [];
    const top4 = menuSales.slice(0, 4);
    const rest = menuSales.slice(4);
    const restTotal = rest.reduce((sum, m) => sum + m.totalQty, 0);
    const hexes = ["#27272a", "#52525b", "#a1a1aa", "#d4d4d8", "#e4e4e7"];
    const colors = [
      "bg-zinc-800",
      "bg-zinc-600",
      "bg-zinc-400",
      "bg-zinc-300",
      "bg-zinc-200",
    ];
    const slices = top4.map((m, i) => ({
      name: m.menuName,
      count: m.totalQty,
      pct: totalSales > 0 ? Math.round((m.totalQty / totalSales) * 100) : 0,
      color: colors[i],
      hex: hexes[i],
    }));
    if (restTotal > 0) {
      slices.push({
        name: "기타",
        count: restTotal,
        pct:
          totalSales > 0 ? Math.round((restTotal / totalSales) * 100) : 0,
        color: colors[4],
        hex: hexes[4],
      });
    }
    return slices;
  }, [menuSales, totalSales]);

  const donutGradient = useMemo(() => {
    if (donutData.length === 0) return "conic-gradient(#e4e4e7 0% 100%)";
    let acc = 0;
    const stops = donutData.map((s) => {
      const start = acc;
      acc += s.pct;
      return `${s.hex} ${start}% ${acc}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [donutData]);

  // period label
  const periodLabel = useMemo(() => {
    if (activePeriod === "오늘") return format(selectedDate, "yyyy.MM.dd");
    return `${format(dateRange.start, "yyyy.MM.dd")} ~ ${format(dateRange.end, "yyyy.MM.dd")}`;
  }, [activePeriod, selectedDate, dateRange]);

  // ── render helpers ──
  const NoData = () => (
    <div className="py-12 text-center text-sm text-muted-foreground">
      {loading ? "불러오는 중..." : "해당 기간에 데이터가 없습니다."}
    </div>
  );

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      {/* ── Header ── */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">대시보드</h1>
          <p className="text-[13.5px] text-muted-foreground mt-0.5">
            {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activePeriod === "기간 설정" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="w-[150px] h-8 text-sm"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
              <span className="text-muted-foreground text-sm">~</span>
              <Input
                type="date"
                className="w-[150px] h-8 text-sm"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          )}
          <div className="flex border rounded-lg overflow-hidden">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setActivePeriod(p)}
                className={cn(
                  "px-4 py-[7px] text-[13px] font-medium border-r last:border-r-0 transition-colors",
                  activePeriod === p
                    ? "bg-muted text-foreground font-semibold"
                    : "bg-background text-muted-foreground hover:bg-muted/50"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-4 border rounded-[10px] overflow-hidden">
        {[
          { label: "총 판매수", value: `${totalSales.toLocaleString()}건` },
          { label: "일 평균 판매", value: `${avgDailySales.toLocaleString()}건` },
          {
            label: "총 원가 합계",
            value: totalCostAll > 0 ? `₩${totalCostAll.toLocaleString()}` : "-",
          },
          {
            label: "총 폐기량",
            value:
              totalWasteAmount > 0
                ? `${totalWasteAmount.toLocaleString()}g`
                : "-",
          },
        ].map((c, i) => (
          <div
            key={i}
            className={cn(
              "px-[22px] py-5 bg-background",
              i < 3 && "border-r"
            )}
          >
            <div className="text-[12.5px] text-muted-foreground font-medium mb-1.5">
              {c.label}
            </div>
            <span className="text-[26px] font-bold tracking-tight">
              {c.value}
            </span>
          </div>
        ))}
      </div>

      {/* ── 일별 판매량 bar chart ── */}
      <div className="border rounded-[10px] overflow-hidden">
        <div className="px-[22px] pt-[18px]">
          <h3 className="text-[14.5px] font-semibold tracking-tight">
            일별 판매량
          </h3>
        </div>
        <div className="px-[22px] pb-[22px] pt-[18px]">
          {menuSales.length === 0 ? (
            <NoData />
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-2 h-[200px] border-b" style={{ minWidth: menuSales.length > 8 ? `${menuSales.length * 72}px` : undefined }}>
                {menuSales.map((m, i) => (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center h-full justify-end gap-1"
                    style={{ minWidth: "56px" }}
                  >
                    {m.totalQty > 0 && (
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {m.totalQty}
                      </span>
                    )}
                    <div
                      className={cn(
                        "w-full max-w-[48px] rounded-t transition-opacity hover:opacity-75 cursor-pointer",
                        m.totalQty > 0 ? "bg-zinc-800" : "bg-zinc-200"
                      )}
                      style={{
                        height: `${Math.max(
                          (m.totalQty / maxBarValue) * 100,
                          m.totalQty > 0 ? 4 : 1
                        )}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2" style={{ minWidth: menuSales.length > 8 ? `${menuSales.length * 72}px` : undefined }}>
                {menuSales.map((m, i) => (
                  <div
                    key={i}
                    className="flex-1 text-center text-[11px] text-muted-foreground truncate"
                    style={{ minWidth: "56px" }}
                  >
                    {m.menuName}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 메뉴별 판매 비중 donut ── */}
      <div className="border rounded-[10px] overflow-hidden">
        <div className="px-[22px] pt-[18px]">
          <h3 className="text-[14.5px] font-semibold tracking-tight">
            메뉴별 판매 비중
          </h3>
        </div>
        <div className="px-[22px] pb-[22px] pt-[18px]">
          {donutData.length === 0 ? (
            <NoData />
          ) : (
            <div className="flex items-center gap-10">
              {/* donut */}
              <div className="relative w-[160px] h-[160px] flex-shrink-0">
                <div
                  className="w-full h-full rounded-full"
                  style={{ background: donutGradient }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-[96px] h-[96px] rounded-full bg-background flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-bold tracking-tight">
                        {totalSales}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        총 판매
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* legend */}
              <div className="flex flex-col gap-2.5 flex-1">
                {donutData.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2.5 h-2.5 rounded-sm", s.color)} />
                      <span className="text-[13px] text-muted-foreground">
                        {s.name}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{s.count}건</span>
                      <span className="text-[11.5px] text-muted-foreground">
                        {s.pct}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 메뉴별 원가 ── */}
      <div className="border rounded-[10px] overflow-hidden">
        <div className="px-[22px] pt-[18px]">
          <h3 className="text-[14.5px] font-semibold tracking-tight">
            메뉴별 원가
          </h3>
        </div>
        <div className="px-[22px] pb-[22px] pt-[18px]">
          {menuCosts.length === 0 ? (
            <NoData />
          ) : (
            <div className="flex flex-col gap-4">
              {menuCosts.map((item) => (
                <div key={item.menuId}>
                  <div className="flex justify-between items-center mb-[7px]">
                    <span className="text-[13.5px] font-semibold">
                      {item.menuName}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {item.totalQty > 0
                        ? `${item.totalQty}건 × ₩${item.costPerServing.toLocaleString()} = ₩${(item.totalQty * item.costPerServing).toLocaleString()}`
                        : `₩${item.costPerServing.toLocaleString()}/1인분`}
                    </span>
                  </div>
                  <div className="h-[22px] bg-muted rounded">
                    <div
                      className="h-full bg-zinc-700 rounded text-white text-[11.5px] font-semibold flex items-center pl-2.5"
                      style={{
                        width: `${Math.max(
                          (item.costPerServing / maxCost) * 100,
                          8
                        )}%`,
                      }}
                    >
                      ₩{item.costPerServing.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 메뉴 판매 순위 ── */}
      <div className="border rounded-[10px] overflow-hidden">
        <div className="px-[22px] pt-[18px]">
          <h3 className="text-[14.5px] font-semibold tracking-tight">
            메뉴 판매 순위
          </h3>
        </div>
        <div className="px-[22px] pb-[22px] pt-[18px]">
          {menuSales.length === 0 ? (
            <NoData />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-2 pb-2.5 text-xs text-muted-foreground font-normal">
                    #
                  </th>
                  <th className="text-left px-2 pb-2.5 text-xs text-muted-foreground font-normal">
                    메뉴
                  </th>
                  <th className="text-right px-2 pb-2.5 text-xs text-muted-foreground font-normal">
                    판매수량
                  </th>
                  <th className="text-right px-2 pb-2.5 text-xs text-muted-foreground font-normal">
                    원가 합계
                  </th>
                </tr>
              </thead>
              <tbody>
                {menuSales.map((m, i) => {
                  const cost = menuCosts.find(
                    (c) => c.menuId === m.menuId
                  );
                  const totalCost = cost
                    ? cost.costPerServing * m.totalQty
                    : 0;
                  return (
                    <tr
                      key={m.menuId}
                      className="border-b last:border-b-0"
                    >
                      <td className="px-2 py-[11px]">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center w-[22px] h-[22px] rounded-[5px] text-[11px] font-bold",
                            i === 0 && "bg-amber-100 text-amber-700",
                            i === 1 && "bg-slate-100 text-slate-500",
                            i === 2 && "bg-orange-50 text-orange-700",
                            i > 2 && "bg-muted text-muted-foreground"
                          )}
                        >
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-2 py-[11px] text-[13.5px]">
                        {m.menuName}
                      </td>
                      <td className="px-2 py-[11px] text-[13.5px] font-bold tracking-tight text-right">
                        {m.totalQty.toLocaleString()}건
                      </td>
                      <td className="px-2 py-[11px] text-[13.5px] text-muted-foreground text-right">
                        {totalCost > 0
                          ? `₩${totalCost.toLocaleString()}`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── 원재료 폐기량 ── */}
      <div className="border rounded-[10px] overflow-hidden">
        <div className="px-[22px] pt-[18px]">
          <h3 className="text-[14.5px] font-semibold tracking-tight">
            원재료 폐기량
          </h3>
        </div>
        <div className="px-[22px] pb-[22px] pt-[18px]">
          {wasteItems.length === 0 ? (
            <NoData />
          ) : (
            <div className="flex flex-col gap-3">
              {wasteItems.map((w) => (
                <div key={w.productName} className="flex items-center gap-2.5">
                  <span className="w-[64px] text-right text-[12.5px] text-muted-foreground flex-shrink-0 truncate">
                    {w.productName}
                  </span>
                  <div className="flex-1 h-6 bg-muted rounded-[5px] overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-[5px] flex items-center justify-end pr-2 text-[11px] font-semibold text-white",
                        (w.totalWaste / maxWaste) > 0.6
                          ? "bg-zinc-800"
                          : (w.totalWaste / maxWaste) > 0.3
                          ? "bg-zinc-600"
                          : "bg-zinc-400"
                      )}
                      style={{
                        width: `${Math.max(
                          (w.totalWaste / maxWaste) * 100,
                          8
                        )}%`,
                      }}
                    >
                      {w.totalWaste}g
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
