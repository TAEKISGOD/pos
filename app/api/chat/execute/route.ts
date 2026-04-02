import { createServerSupabaseClient } from "@/lib/supabase-server";

interface Action {
  type: "update_menu_recipe" | "update_menu_code" | "update_sauce_recipe" | "update_product" | "update_inventory";
  params: Record<string, string | number>;
}

export async function POST(request: Request) {
  try {
    const { action, storeId } = (await request.json()) as { action: Action; storeId: string };

    if (!action || !storeId) {
      return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 인증 확인
    const { data: { user } } = await supabase.auth.getUser();
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

    if (action.type === "update_menu_recipe") {
      const { menuName, productName, amount, tolerancePercent } = action.params;

      // 메뉴 찾기
      const { data: menu } = await supabase
        .from("menus")
        .select("id")
        .eq("store_id", storeId)
        .eq("name", menuName)
        .single();

      if (!menu) {
        return Response.json({ error: `메뉴 "${menuName}"을 찾을 수 없습니다.` }, { status: 404 });
      }

      // 제품 찾기 (모든 카테고리에서)
      const { data: categories } = await supabase
        .from("categories")
        .select("id")
        .eq("store_id", storeId);

      const catIds = (categories || []).map((c) => c.id);
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("category_id", catIds);

      const product = (products || []).find((p) => p.name === productName);
      if (!product) {
        return Response.json({ error: `제품 "${productName}"을 찾을 수 없습니다.` }, { status: 404 });
      }

      // 기존 레시피가 있는지 확인
      const { data: existing } = await supabase
        .from("menu_recipes")
        .select("id")
        .eq("menu_id", menu.id)
        .eq("product_id", product.id)
        .single();

      if (existing) {
        // 업데이트
        const updateData: Record<string, number> = { amount: Number(amount) };
        if (tolerancePercent !== undefined) {
          updateData.tolerance_percent = Number(tolerancePercent);
        }
        const { error } = await supabase
          .from("menu_recipes")
          .update(updateData)
          .eq("id", existing.id);

        if (error) {
          return Response.json({ error: "업데이트 실패: " + error.message }, { status: 500 });
        }
      } else {
        // 새로 생성
        const { error } = await supabase.from("menu_recipes").insert({
          menu_id: menu.id,
          product_id: product.id,
          amount: Number(amount),
          tolerance_percent: Number(tolerancePercent || 0),
        });

        if (error) {
          return Response.json({ error: "생성 실패: " + error.message }, { status: 500 });
        }
      }

      return Response.json({
        success: true,
        message: `${menuName}의 ${productName} 사용량을 ${amount}(으)로 ${existing ? "변경" : "등록"}했습니다.`,
      });
    }

    if (action.type === "update_menu_code") {
      const { menuName, productCode } = action.params;

      const { data: menu } = await supabase
        .from("menus")
        .select("id")
        .eq("store_id", storeId)
        .eq("name", menuName)
        .single();

      if (!menu) {
        return Response.json({ error: `메뉴 "${menuName}"을 찾을 수 없습니다.` }, { status: 404 });
      }

      const { error } = await supabase
        .from("menus")
        .update({ product_code: String(productCode) })
        .eq("id", menu.id);

      if (error) {
        return Response.json({ error: "상품코드 업데이트 실패: " + error.message }, { status: 500 });
      }

      return Response.json({
        success: true,
        message: `${menuName}의 상품코드를 ${productCode}(으)로 설정했습니다.`,
      });
    }

    if (action.type === "update_sauce_recipe") {
      const { sauceName, ingredientName, amount } = action.params;

      // 자체소스 제품 찾기
      const { data: categories } = await supabase
        .from("categories")
        .select("id")
        .eq("store_id", storeId);

      const catIds = (categories || []).map((c) => c.id);
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("category_id", catIds);

      const sauce = (products || []).find((p) => p.name === sauceName);
      const ingredient = (products || []).find((p) => p.name === ingredientName);

      if (!sauce) return Response.json({ error: `소스 "${sauceName}"을 찾을 수 없습니다.` }, { status: 404 });
      if (!ingredient) return Response.json({ error: `재료 "${ingredientName}"을 찾을 수 없습니다.` }, { status: 404 });

      const { data: existing } = await supabase
        .from("custom_sauce_recipes")
        .select("id")
        .eq("sauce_product_id", sauce.id)
        .eq("ingredient_product_id", ingredient.id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from("custom_sauce_recipes")
          .update({ amount: Number(amount) })
          .eq("id", existing.id);

        if (error) return Response.json({ error: "업데이트 실패: " + error.message }, { status: 500 });
      } else {
        const { error } = await supabase.from("custom_sauce_recipes").insert({
          sauce_product_id: sauce.id,
          ingredient_product_id: ingredient.id,
          amount: Number(amount),
        });

        if (error) return Response.json({ error: "생성 실패: " + error.message }, { status: 500 });
      }

      return Response.json({
        success: true,
        message: `${sauceName}의 ${ingredientName} 사용량을 ${amount}(으)로 ${existing ? "변경" : "등록"}했습니다.`,
      });
    }

    if (action.type === "update_product") {
      const { productName, field, value } = action.params;

      const allowedFields = ["name", "unit", "price"];
      if (!allowedFields.includes(String(field))) {
        return Response.json({ error: `"${field}" 필드는 수정할 수 없습니다.` }, { status: 400 });
      }

      // 제품 찾기
      const { data: categories } = await supabase
        .from("categories")
        .select("id")
        .eq("store_id", storeId);

      const catIds = (categories || []).map((c) => c.id);
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("category_id", catIds);

      const product = (products || []).find((p) => p.name === productName);
      if (!product) {
        return Response.json({ error: `제품 "${productName}"을 찾을 수 없습니다.` }, { status: 404 });
      }

      const updateData: Record<string, string | number> = {};
      updateData[String(field)] = field === "price" ? Number(value) : value;

      const { error } = await supabase
        .from("products")
        .update(updateData)
        .eq("id", product.id);

      if (error) {
        return Response.json({ error: "업데이트 실패: " + error.message }, { status: 500 });
      }

      const fieldLabels: Record<string, string> = { name: "제품명", unit: "단위", price: "가격" };
      return Response.json({
        success: true,
        message: `${productName}의 ${fieldLabels[String(field)] || field}을(를) ${value}(으)로 변경했습니다.`,
      });
    }

    if (action.type === "update_inventory") {
      const { productName, quantity, remaining, date } = action.params;
      const dateStr = date ? String(date) : new Date().toISOString().slice(0, 10);

      // 제품 찾기
      const { data: categories } = await supabase
        .from("categories")
        .select("id")
        .eq("store_id", storeId);

      const catIds = (categories || []).map((c) => c.id);
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("category_id", catIds);

      const product = (products || []).find((p) => p.name === productName);
      if (!product) {
        return Response.json({ error: `제품 "${productName}"을 찾을 수 없습니다.` }, { status: 404 });
      }

      // 해당 날짜의 스냅샷 찾기
      const { data: snapshot } = await supabase
        .from("inventory_snapshots")
        .select("id, quantity, remaining")
        .eq("product_id", product.id)
        .eq("date", dateStr)
        .single();

      if (snapshot) {
        const updateData: Record<string, number> = {};
        if (quantity !== undefined) updateData.quantity = Number(quantity);
        if (remaining !== undefined) updateData.remaining = Number(remaining);

        const { error } = await supabase
          .from("inventory_snapshots")
          .update(updateData)
          .eq("id", snapshot.id);

        if (error) {
          return Response.json({ error: "업데이트 실패: " + error.message }, { status: 500 });
        }
      } else {
        // 스냅샷이 없으면 새로 생성
        const { error } = await supabase.from("inventory_snapshots").insert({
          product_id: product.id,
          date: dateStr,
          quantity: quantity !== undefined ? Number(quantity) : 0,
          remaining: remaining !== undefined ? Number(remaining) : 0,
        });

        if (error) {
          return Response.json({ error: "생성 실패: " + error.message }, { status: 500 });
        }
      }

      const changes: string[] = [];
      if (quantity !== undefined) changes.push(`수량 ${quantity}`);
      if (remaining !== undefined) changes.push(`잔량 ${remaining}`);

      return Response.json({
        success: true,
        message: `${productName}의 ${changes.join(", ")}(으)로 변경했습니다. (${dateStr})`,
      });
    }

    return Response.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
  } catch (error: unknown) {
    console.error("Execute API error:", error);
    return Response.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
