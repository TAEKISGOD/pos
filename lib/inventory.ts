import { SupabaseClient } from "@supabase/supabase-js";

export interface InventoryAsOf {
  /** product_id → 잔량 */
  remaining: Record<string, number>;
  /** product_id → 그 값이 실제 저장된 날짜(yyyy-MM-dd). 선택일과 다르면 이월된 값이다. */
  sourceDate: Record<string, string>;
}

/**
 * 선택한 날짜 기준 재고를 가져온다.
 * 해당 날짜에 스냅샷이 없으면 그 이전 가장 최근 스냅샷 값을 이월해서 돌려준다.
 * (마감을 며칠 건너뛰어도 재고가 0으로 리셋되지 않게 하기 위함)
 */
export async function fetchInventoryAsOf(
  supabase: SupabaseClient,
  productIds: string[],
  dateStr: string
): Promise<InventoryAsOf> {
  const remaining: Record<string, number> = {};
  const sourceDate: Record<string, string> = {};

  if (productIds.length === 0) return { remaining, sourceDate };

  const { data, error } = await supabase.rpc("inventory_as_of", {
    p_product_ids: productIds,
    p_date: dateStr,
  });

  if (!error && data) {
    (data as { product_id: string; remaining: number | null; snapshot_date: string }[]).forEach((r) => {
      remaining[r.product_id] = r.remaining ?? 0;
      sourceDate[r.product_id] = r.snapshot_date;
    });
    return { remaining, sourceDate };
  }

  // RPC 미설치 등으로 실패하면 기존 동작(선택일 정확 일치)으로 폴백
  console.warn("[inventory_as_of] RPC 사용 불가, 선택일 조회로 폴백:", error?.message);

  const { data: snapshots } = await supabase
    .from("inventory_snapshots")
    .select("product_id, remaining, date")
    .in("product_id", productIds)
    .eq("date", dateStr);

  snapshots?.forEach((s) => {
    remaining[s.product_id] = s.remaining ?? 0;
    sourceDate[s.product_id] = s.date;
  });

  return { remaining, sourceDate };
}

/**
 * 이월된 값이 섞여 있으면 그중 가장 최근 출처 날짜를 돌려준다.
 * 전부 선택일 그대로면 null.
 */
export function carriedOverFrom(
  sourceDate: Record<string, string>,
  dateStr: string
): string | null {
  const carried = Object.values(sourceDate).filter((d) => d && d !== dateStr);
  if (carried.length === 0) return null;
  return carried.sort()[carried.length - 1];
}
