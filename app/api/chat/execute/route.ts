import { createServerSupabaseClient } from "@/lib/supabase-server";

interface Action {
  type: "update_menu_recipe" | "update_menu_recipes" | "update_menu_code"
    | "update_sauce_recipe" | "update_sauce_recipes"
    | "update_product" | "update_inventory";
  params: Record<string, unknown>;
}

/** @ 기호 제거 + trim */
function normalizeName(raw: unknown): string {
  return String(raw ?? "").replace(/^@+/, "").trim();
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

    // ─── 헬퍼: 매장 전체 제품 조회 (1회) ───
    const getProducts = async () => {
      const { data: categories } = await supabase
        .from("categories")
        .select("id")
        .eq("store_id", storeId);
      const catIds = (categories || []).map((c) => c.id);
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("category_id", catIds);
      return products || [];
    };

    // ═══════════════════════════════════════
    //  update_menu_recipes (벌크 - 권장)
    // ═══════════════════════════════════════
    if (action.type === "update_menu_recipes") {
      const menuName = normalizeName(action.params.menuName);
      const recipes = action.params.recipes as { productName: string; amount: number; tolerancePercent?: number }[];

      if (!menuName) return Response.json({ error: "메뉴명이 없습니다." }, { status: 400 });
      if (!recipes || recipes.length === 0) return Response.json({ error: "재료가 없습니다." }, { status: 400 });

      // 메뉴 조회 1회
      const { data: menu } = await supabase
        .from("menus")
        .select("id")
        .eq("store_id", storeId)
        .eq("name", menuName)
        .single();

      if (!menu) {
        return Response.json({
          success: false,
          error: `메뉴 "${menuName}"을 찾을 수 없습니다.`,
          errorType: "menu_not_found",
        }, { status: 404 });
      }

      // 제품 목록 1회
      const products = await getProducts();
      const productMap = new Map(products.map((p) => [p.name, p]));

      // 기존 레시피 1회
      const { data: existingRecipes } = await supabase
        .from("menu_recipes")
        .select("id, product_id")
        .eq("menu_id", menu.id);
      const existingMap = new Map((existingRecipes || []).map((r) => [r.product_id, r.id]));

      let inserted = 0;
      let updated = 0;
      const failed: { productName: string; reason: string }[] = [];

      for (const recipe of recipes) {
        const pName = normalizeName(recipe.productName);
        const product = productMap.get(pName);
        if (!product) {
          failed.push({ productName: pName, reason: "제품을 찾을 수 없음" });
          continue;
        }

        const existingId = existingMap.get(product.id);
        if (existingId) {
          const updateData: Record<string, number> = { amount: Number(recipe.amount) };
          if (recipe.tolerancePercent !== undefined) updateData.tolerance_percent = Number(recipe.tolerancePercent);
          const { error } = await supabase.from("menu_recipes").update(updateData).eq("id", existingId);
          if (error) { failed.push({ productName: pName, reason: error.message }); } else { updated++; }
        } else {
          const { error } = await supabase.from("menu_recipes").insert({
            menu_id: menu.id,
            product_id: product.id,
            amount: Number(recipe.amount),
            tolerance_percent: Number(recipe.tolerancePercent || 0),
          });
          if (error) { failed.push({ productName: pName, reason: error.message }); } else { inserted++; }
        }
      }

      const total = inserted + updated;
      const msg = failed.length === 0
        ? `${menuName}에 ${total}개 재료를 등록했습니다.`
        : `${menuName}에 ${total}개 재료 등록 (${failed.length}개 실패)`;

      return Response.json({
        success: true,
        message: msg,
        details: { inserted, updated, failed },
      });
    }

    // ═══════════════════════════════════════
    //  update_sauce_recipes (벌크)
    // ═══════════════════════════════════════
    if (action.type === "update_sauce_recipes") {
      const sauceName = normalizeName(action.params.sauceName);
      const recipes = action.params.recipes as { ingredientName: string; amount: number }[];

      if (!sauceName) return Response.json({ error: "소스명이 없습니다." }, { status: 400 });
      if (!recipes || recipes.length === 0) return Response.json({ error: "재료가 없습니다." }, { status: 400 });

      const products = await getProducts();
      const productMap = new Map(products.map((p) => [p.name, p]));

      const sauce = productMap.get(sauceName);
      if (!sauce) {
        return Response.json({
          success: false,
          error: `소스 "${sauceName}"을 찾을 수 없습니다.`,
          errorType: "product_not_found",
        }, { status: 404 });
      }

      // 기존 소스 레시피 1회
      const { data: existingRecipes } = await supabase
        .from("custom_sauce_recipes")
        .select("id, ingredient_product_id")
        .eq("sauce_product_id", sauce.id);
      const existingMap = new Map((existingRecipes || []).map((r) => [r.ingredient_product_id, r.id]));

      let inserted = 0;
      let updated = 0;
      const failed: { productName: string; reason: string }[] = [];

      for (const recipe of recipes) {
        const iName = normalizeName(recipe.ingredientName);
        const ingredient = productMap.get(iName);
        if (!ingredient) {
          failed.push({ productName: iName, reason: "제품을 찾을 수 없음" });
          continue;
        }

        const existingId = existingMap.get(ingredient.id);
        if (existingId) {
          const { error } = await supabase.from("custom_sauce_recipes").update({ amount: Number(recipe.amount) }).eq("id", existingId);
          if (error) { failed.push({ productName: iName, reason: error.message }); } else { updated++; }
        } else {
          const { error } = await supabase.from("custom_sauce_recipes").insert({
            sauce_product_id: sauce.id,
            ingredient_product_id: ingredient.id,
            amount: Number(recipe.amount),
          });
          if (error) { failed.push({ productName: iName, reason: error.message }); } else { inserted++; }
        }
      }

      const total = inserted + updated;
      const msg = failed.length === 0
        ? `${sauceName}에 ${total}개 재료를 등록했습니다.`
        : `${sauceName}에 ${total}개 재료 등록 (${failed.length}개 실패)`;

      return Response.json({ success: true, message: msg, details: { inserted, updated, failed } });
    }

    // ═══════════════════════════════════════
    //  update_menu_recipe (단건 - 레거시 호환)
    // ═══════════════════════════════════════
    if (action.type === "update_menu_recipe") {
      const menuName = normalizeName(action.params.menuName);
      const productName = normalizeName(action.params.productName);
      const { amount, tolerancePercent } = action.params;

      const { data: menu } = await supabase
        .from("menus")
        .select("id")
        .eq("store_id", storeId)
        .eq("name", menuName)
        .single();

      if (!menu) {
        return Response.json({ error: `메뉴 "${menuName}"을 찾을 수 없습니다.` }, { status: 404 });
      }

      const products = await getProducts();
      const product = products.find((p) => p.name === productName);
      if (!product) {
        return Response.json({ error: `제품 "${productName}"을 찾을 수 없습니다.` }, { status: 404 });
      }

      const { data: existing } = await supabase
        .from("menu_recipes")
        .select("id")
        .eq("menu_id", menu.id)
        .eq("product_id", product.id)
        .single();

      if (existing) {
        const updateData: Record<string, number> = { amount: Number(amount) };
        if (tolerancePercent !== undefined) updateData.tolerance_percent = Number(tolerancePercent);
        const { error } = await supabase.from("menu_recipes").update(updateData).eq("id", existing.id);
        if (error) return Response.json({ error: "업데이트 실패: " + error.message }, { status: 500 });
      } else {
        const { error } = await supabase.from("menu_recipes").insert({
          menu_id: menu.id,
          product_id: product.id,
          amount: Number(amount),
          tolerance_percent: Number(tolerancePercent || 0),
        });
        if (error) return Response.json({ error: "생성 실패: " + error.message }, { status: 500 });
      }

      return Response.json({
        success: true,
        message: `${menuName}의 ${productName} 사용량을 ${amount}(으)로 ${existing ? "변경" : "등록"}했습니다.`,
      });
    }

    // ═══════════════════════════════════════
    //  update_menu_code
    // ═══════════════════════════════════════
    if (action.type === "update_menu_code") {
      const menuName = normalizeName(action.params.menuName);
      const { productCode } = action.params;

      const { data: menu } = await supabase
        .from("menus")
        .select("id")
        .eq("store_id", storeId)
        .eq("name", menuName)
        .single();

      if (!menu) {
        return Response.json({ error: `메뉴 "${menuName}"을 찾을 수 없습니다.` }, { status: 404 });
      }

      const { error } = await supabase.from("menus").update({ product_code: String(productCode) }).eq("id", menu.id);
      if (error) return Response.json({ error: "상품코드 업데이트 실패: " + error.message }, { status: 500 });

      return Response.json({ success: true, message: `${menuName}의 상품코드를 ${productCode}(으)로 설정했습니다.` });
    }

    // ═══════════════════════════════════════
    //  update_sauce_recipe (단건 - 레거시 호환)
    // ═══════════════════════════════════════
    if (action.type === "update_sauce_recipe") {
      const sauceName = normalizeName(action.params.sauceName);
      const ingredientName = normalizeName(action.params.ingredientName);
      const { amount } = action.params;

      const products = await getProducts();
      const sauce = products.find((p) => p.name === sauceName);
      const ingredient = products.find((p) => p.name === ingredientName);

      if (!sauce) return Response.json({ error: `소스 "${sauceName}"을 찾을 수 없습니다.` }, { status: 404 });
      if (!ingredient) return Response.json({ error: `재료 "${ingredientName}"을 찾을 수 없습니다.` }, { status: 404 });

      const { data: existing } = await supabase
        .from("custom_sauce_recipes")
        .select("id")
        .eq("sauce_product_id", sauce.id)
        .eq("ingredient_product_id", ingredient.id)
        .single();

      if (existing) {
        const { error } = await supabase.from("custom_sauce_recipes").update({ amount: Number(amount) }).eq("id", existing.id);
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

    // ═══════════════════════════════════════
    //  update_product
    // ═══════════════════════════════════════
    if (action.type === "update_product") {
      const productName = normalizeName(action.params.productName);
      const { field, value } = action.params;

      const allowedFields = ["name", "unit", "price"];
      if (!allowedFields.includes(String(field))) {
        return Response.json({ error: `"${field}" 필드는 수정할 수 없습니다.` }, { status: 400 });
      }

      const products = await getProducts();
      const product = products.find((p) => p.name === productName);
      if (!product) {
        return Response.json({ error: `제품 "${productName}"을 찾을 수 없습니다.` }, { status: 404 });
      }

      const updateData: Record<string, string | number> = {};
      updateData[String(field)] = field === "price" ? Number(value) : value as string;

      const { error } = await supabase.from("products").update(updateData).eq("id", product.id);
      if (error) return Response.json({ error: "업데이트 실패: " + error.message }, { status: 500 });

      const fieldLabels: Record<string, string> = { name: "제품명", unit: "단위", price: "가격" };
      return Response.json({
        success: true,
        message: `${productName}의 ${fieldLabels[String(field)] || field}을(를) ${value}(으)로 변경했습니다.`,
      });
    }

    // ═══════════════════════════════════════
    //  update_inventory
    // ═══════════════════════════════════════
    if (action.type === "update_inventory") {
      const productName = normalizeName(action.params.productName);
      const { remaining, date } = action.params;
      const dateStr = date ? String(date) : new Date().toISOString().slice(0, 10);

      const products = await getProducts();
      const product = products.find((p) => p.name === productName);
      if (!product) {
        return Response.json({ error: `제품 "${productName}"을 찾을 수 없습니다.` }, { status: 404 });
      }

      const { data: snapshot } = await supabase
        .from("inventory_snapshots")
        .select("id")
        .eq("product_id", product.id)
        .eq("date", dateStr)
        .single();

      if (snapshot) {
        const updateData: Record<string, number> = {};
        if (remaining !== undefined) updateData.remaining = Number(remaining);
        const { error } = await supabase.from("inventory_snapshots").update(updateData).eq("id", snapshot.id);
        if (error) return Response.json({ error: "업데이트 실패: " + error.message }, { status: 500 });
      } else {
        const { error } = await supabase.from("inventory_snapshots").insert({
          product_id: product.id,
          date: dateStr,
          remaining: remaining !== undefined ? Number(remaining) : 0,
        });
        if (error) return Response.json({ error: "생성 실패: " + error.message }, { status: 500 });
      }

      return Response.json({
        success: true,
        message: `${productName}의 잔량을 ${remaining}(으)로 변경했습니다. (${dateStr})`,
      });
    }

    return Response.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
  } catch (error: unknown) {
    console.error("Execute API error:", error);
    return Response.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
