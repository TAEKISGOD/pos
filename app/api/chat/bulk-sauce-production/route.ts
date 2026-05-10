import { createServerSupabaseClient } from "@/lib/supabase-server";

interface ProductionItem {
  sauceProductId: string;
  sauceName: string;
  mode: "batch" | "stock";
  batchCount?: number;
  ingredientId?: string;
  ingredientName?: string;
  ingredientAmount?: number;
}

type ConflictMode = "ask" | "overwrite" | "append";

export async function POST(request: Request) {
  try {
    const { storeId, date, items, conflictMode = "ask" } =
      (await request.json()) as {
        storeId: string;
        date: string;
        items: ProductionItem[];
        conflictMode?: ConflictMode;
      };

    if (!storeId || !date || !items?.length) {
      return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 인증
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "인증이 필요합니다." }, { status: 401 });

    // 가게 소유권
    const { data: store } = await supabase
      .from("stores")
      .select("id")
      .eq("id", storeId)
      .eq("user_id", user.id)
      .single();
    if (!store) return Response.json({ error: "권한이 없습니다." }, { status: 403 });

    const sauceIds = Array.from(new Set(items.map((i) => i.sauceProductId)));

    // 기존 row 조회
    const { data: existing } = await supabase
      .from("daily_sauce_productions")
      .select("id, sauce_product_id, mode, batch_count, ingredient_id, ingredient_amount")
      .in("sauce_product_id", sauceIds)
      .eq("date", date);

    const existingBySauce = new Map<string, typeof existing>();
    for (const e of existing || []) {
      const list = existingBySauce.get(e.sauce_product_id) || [];
      list.push(e);
      existingBySauce.set(e.sauce_product_id, list);
    }

    // 충돌 감지
    const conflicts: { sauceId: string; sauceName: string; existing: typeof existing; incoming: ProductionItem[] }[] = [];
    for (const sid of sauceIds) {
      const ex = existingBySauce.get(sid);
      if (ex && ex.length > 0) {
        const incoming = items.filter((i) => i.sauceProductId === sid);
        const sauceName = incoming[0]?.sauceName || "";
        conflicts.push({ sauceId: sid, sauceName, existing: ex, incoming });
      }
    }

    // ask 모드 + 충돌 있으면 사용자 확인 요청
    if (conflictMode === "ask" && conflicts.length > 0) {
      return Response.json({
        needsConfirm: true,
        conflicts: conflicts.map((c) => ({
          sauceId: c.sauceId,
          sauceName: c.sauceName,
          existing: c.existing,
          incoming: c.incoming,
        })),
      });
    }

    // overwrite: 기존 모두 삭제
    if (conflictMode === "overwrite" && conflicts.length > 0) {
      const conflictSauceIds = conflicts.map((c) => c.sauceId);
      await supabase
        .from("daily_sauce_productions")
        .delete()
        .in("sauce_product_id", conflictSauceIds)
        .eq("date", date);
    }

    // append: 같은 sauce + mode + ingredient의 row가 있으면 합산, 아니면 신규
    const inserts: {
      sauce_product_id: string;
      date: string;
      mode: "batch" | "stock";
      batch_count: number;
      ingredient_id: string | null;
      ingredient_amount: number;
    }[] = [];

    const updates: { id: string; batch_count?: number; ingredient_amount?: number }[] = [];

    for (const item of items) {
      const isStock = item.mode === "stock";
      if (conflictMode === "append") {
        const exList = existingBySauce.get(item.sauceProductId) || [];
        // 같은 모드 + (재고 모드면 같은 재료) row 찾기
        const match = exList.find((e) => {
          if (e.mode !== item.mode) return false;
          if (isStock) return e.ingredient_id === item.ingredientId;
          return true;
        });
        if (match) {
          if (item.mode === "batch") {
            updates.push({ id: match.id, batch_count: (match.batch_count || 0) + (item.batchCount || 0) });
          } else {
            updates.push({ id: match.id, ingredient_amount: (match.ingredient_amount || 0) + (item.ingredientAmount || 0) });
          }
          continue;
        }
      }

      inserts.push({
        sauce_product_id: item.sauceProductId,
        date,
        mode: item.mode,
        batch_count: item.mode === "batch" ? (item.batchCount || 0) : 0,
        ingredient_id: isStock ? (item.ingredientId || null) : null,
        ingredient_amount: isStock ? (item.ingredientAmount || 0) : 0,
      });
    }

    // 업데이트 적용
    for (const u of updates) {
      const data: Record<string, number> = {};
      if (u.batch_count !== undefined) data.batch_count = u.batch_count;
      if (u.ingredient_amount !== undefined) data.ingredient_amount = u.ingredient_amount;
      await supabase.from("daily_sauce_productions").update(data).eq("id", u.id);
    }

    // 인서트 적용
    if (inserts.length > 0) {
      const { error } = await supabase.from("daily_sauce_productions").insert(inserts);
      if (error) {
        return Response.json({
          success: false,
          error: `저장 실패: ${error.message}`,
          errorType: "db_error",
        }, { status: 500 });
      }
    }

    return Response.json({
      success: true,
      message: `${items.length}개 자체소스 생산 항목 저장 완료`,
      inserted: inserts.length,
      updated: updates.length,
    });
  } catch (error: unknown) {
    console.error("Bulk sauce production API error:", error);
    return Response.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
