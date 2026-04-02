import { createServerSupabaseClient } from "@/lib/supabase-server";

interface BulkItem {
  productId?: string;
  inputName: string;
  value: number;
  isNew?: boolean;
  newProductName?: string;
  newProductUnit?: string;
  newProductCategoryId?: string;
}

export async function POST(request: Request) {
  try {
    const { storeId, date, items } = (await request.json()) as {
      storeId: string;
      date: string;
      items: BulkItem[];
    };

    if (!storeId || !date || !items?.length) {
      return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 인증 확인
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    // 가게 소유권 확인
    const { data: store } = await supabase
      .from("stores")
      .select("id")
      .eq("id", storeId)
      .eq("user_id", user.id)
      .single();

    if (!store) {
      return Response.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const results: { name: string; message: string; success: boolean }[] = [];

    for (const item of items) {
      try {
        let productId = item.productId;
        let productName = item.inputName;

        // 새 제품 추가
        if (item.isNew && item.newProductCategoryId) {
          const { data: newProduct, error: insertErr } = await supabase
            .from("products")
            .insert({
              category_id: item.newProductCategoryId,
              name: item.newProductName || item.inputName,
              unit: item.newProductUnit || "g",
            })
            .select("id, name")
            .single();

          if (insertErr || !newProduct) {
            results.push({
              name: productName,
              message: `제품 추가 실패: ${insertErr?.message || "알 수 없는 오류"}`,
              success: false,
            });
            continue;
          }

          productId = newProduct.id;
          productName = newProduct.name;
        }

        if (!productId) {
          results.push({ name: productName, message: "제품 ID가 없습니다.", success: false });
          continue;
        }

        // 해당 날짜 스냅샷 upsert
        const { data: existing } = await supabase
          .from("inventory_snapshots")
          .select("id, quantity, remaining")
          .eq("product_id", productId)
          .eq("date", date)
          .single();

        if (existing) {
          const { error } = await supabase
            .from("inventory_snapshots")
            .update({ remaining: item.value })
            .eq("id", existing.id);

          if (error) {
            results.push({ name: productName, message: `업데이트 실패: ${error.message}`, success: false });
          } else {
            results.push({ name: productName, message: `잔량 ${item.value}으로 업데이트`, success: true });
          }
        } else {
          const { error } = await supabase.from("inventory_snapshots").insert({
            product_id: productId,
            date,
            quantity: 0,
            remaining: item.value,
          });

          if (error) {
            results.push({ name: productName, message: `생성 실패: ${error.message}`, success: false });
          } else {
            results.push({ name: productName, message: `잔량 ${item.value}으로 등록`, success: true });
          }
        }
      } catch (err) {
        results.push({
          name: item.inputName,
          message: `처리 중 오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
          success: false,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    return Response.json({
      success: successCount > 0,
      message: `${successCount}/${results.length}개 항목 처리 완료`,
      results,
    });
  } catch (error: unknown) {
    console.error("Bulk inventory API error:", error);
    return Response.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
