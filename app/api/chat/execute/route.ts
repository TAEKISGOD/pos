import { createServerSupabaseClient } from "@/lib/supabase-server";

interface Action {
  type: "update_menu_recipe" | "update_menu_recipes" | "update_menu_code"
    | "update_sauce_recipe" | "update_sauce_recipes"
    | "update_product" | "update_inventory"
    | "delete_sauce_production" | "update_sauce_production"
    | "copy_sauce_production" | "preview_sauce_production"
    | "recommend_sauce_production";
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
      const batchSize = action.params.batchSize ? Number(action.params.batchSize) : undefined;
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

      // batchSize가 있으면 products 테이블 업데이트
      if (batchSize && batchSize > 0) {
        await supabase.from("products").update({ batch_size: batchSize }).eq("id", sauce.id);
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

    // ═══════════════════════════════════════
    //  헬퍼: 자체소스 카테고리 + 재료 정보 조회
    // ═══════════════════════════════════════
    const getSauceData = async () => {
      const { data: cats } = await supabase
        .from("categories")
        .select("id, name")
        .eq("store_id", storeId);
      const sauceCat = cats?.find((c) => c.name === "자체소스");
      if (!sauceCat) return { sauces: [], recipes: [], productNames: new Map<string, string>() };

      const { data: sauceProds } = await supabase
        .from("products")
        .select("id, name")
        .eq("category_id", sauceCat.id);
      const sauces = sauceProds || [];
      const sauceIds = sauces.map((s) => s.id);

      let recipes: { sauce_product_id: string; ingredient_product_id: string; amount: number }[] = [];
      const productNames = new Map<string, string>();
      if (sauceIds.length > 0) {
        const { data: rec } = await supabase
          .from("custom_sauce_recipes")
          .select("sauce_product_id, ingredient_product_id, amount")
          .in("sauce_product_id", sauceIds);
        recipes = rec || [];
        const ingIds = Array.from(new Set(recipes.map((r) => r.ingredient_product_id)));
        const allIds = Array.from(new Set([...sauceIds, ...ingIds]));
        const { data: prods } = await supabase
          .from("products")
          .select("id, name")
          .in("id", allIds);
        prods?.forEach((p) => productNames.set(p.id, p.name));
      }
      return { sauces, recipes, productNames };
    };

    // ═══════════════════════════════════════
    //  delete_sauce_production
    // ═══════════════════════════════════════
    if (action.type === "delete_sauce_production") {
      const sauceName = normalizeName(action.params.sauceName);
      const date = action.params.date ? String(action.params.date) : new Date().toISOString().slice(0, 10);

      const { sauces } = await getSauceData();
      const sauce = sauces.find((s) => s.name === sauceName);
      if (!sauce) {
        return Response.json({ success: false, error: `소스 "${sauceName}"을 찾을 수 없습니다.`, errorType: "product_not_found" }, { status: 404 });
      }

      const { error, count } = await supabase
        .from("daily_sauce_productions")
        .delete({ count: "exact" })
        .eq("sauce_product_id", sauce.id)
        .eq("date", date);

      if (error) return Response.json({ success: false, error: "삭제 실패: " + error.message }, { status: 500 });
      if (!count || count === 0) {
        return Response.json({ success: true, message: `${sauceName}의 ${date} 생산 기록이 없습니다.` });
      }

      return Response.json({ success: true, message: `${sauceName}의 ${date} 생산 기록 ${count}개를 삭제했습니다.` });
    }

    // ═══════════════════════════════════════
    //  update_sauce_production (단건 upsert)
    // ═══════════════════════════════════════
    if (action.type === "update_sauce_production") {
      const sauceName = normalizeName(action.params.sauceName);
      const date = action.params.date ? String(action.params.date) : new Date().toISOString().slice(0, 10);
      const mode = String(action.params.mode || "batch") as "batch" | "stock";
      const batchCount = action.params.batchCount != null ? Number(action.params.batchCount) : 0;
      const ingredientName = action.params.ingredientName ? normalizeName(action.params.ingredientName) : "";
      const ingredientAmount = action.params.ingredientAmount != null ? Number(action.params.ingredientAmount) : 0;

      const { sauces, productNames } = await getSauceData();
      const sauce = sauces.find((s) => s.name === sauceName);
      if (!sauce) {
        return Response.json({ success: false, error: `소스 "${sauceName}"을 찾을 수 없습니다.` }, { status: 404 });
      }

      let ingredientId: string | null = null;
      if (mode === "stock") {
        if (!ingredientName) return Response.json({ success: false, error: "재료명이 필요합니다." }, { status: 400 });
        productNames.forEach((name, id) => {
          if (!ingredientId && name === ingredientName) ingredientId = id;
        });
        if (!ingredientId) return Response.json({ success: false, error: `재료 "${ingredientName}"을 찾을 수 없습니다.` }, { status: 404 });
      }

      // 같은 날짜 같은 소스 모두 삭제 후 신규 (단건 upsert 시)
      await supabase.from("daily_sauce_productions").delete().eq("sauce_product_id", sauce.id).eq("date", date);

      const { error } = await supabase.from("daily_sauce_productions").insert({
        sauce_product_id: sauce.id,
        date,
        mode,
        batch_count: mode === "batch" ? batchCount : 0,
        ingredient_id: ingredientId,
        ingredient_amount: mode === "stock" ? ingredientAmount : 0,
      });

      if (error) return Response.json({ success: false, error: "저장 실패: " + error.message }, { status: 500 });

      const desc = mode === "batch" ? `${batchCount}배합` : `${ingredientName} ${ingredientAmount} 기준`;
      return Response.json({ success: true, message: `${sauceName} 생산 기록을 ${desc}으로 저장했습니다. (${date})` });
    }

    // ═══════════════════════════════════════
    //  copy_sauce_production (다른 날짜에서 복사)
    // ═══════════════════════════════════════
    if (action.type === "copy_sauce_production") {
      const sourceDate = String(action.params.sourceDate || "");
      const targetDate = action.params.targetDate ? String(action.params.targetDate) : new Date().toISOString().slice(0, 10);
      const sauceNameFilter = action.params.sauceName ? normalizeName(action.params.sauceName) : null;
      const conflictMode = String(action.params.conflictMode || "ask") as "ask" | "overwrite" | "append";

      if (!sourceDate) return Response.json({ success: false, error: "복사할 원본 날짜가 없습니다." }, { status: 400 });

      const { sauces } = await getSauceData();
      const sauceIds = sauces.map((s) => s.id);
      if (sauceIds.length === 0) {
        return Response.json({ success: false, error: "자체소스 제품이 없습니다." }, { status: 404 });
      }

      let query = supabase
        .from("daily_sauce_productions")
        .select("sauce_product_id, mode, batch_count, ingredient_id, ingredient_amount")
        .eq("date", sourceDate)
        .in("sauce_product_id", sauceIds);

      if (sauceNameFilter) {
        const sauce = sauces.find((s) => s.name === sauceNameFilter);
        if (!sauce) return Response.json({ success: false, error: `소스 "${sauceNameFilter}"을 찾을 수 없습니다.` }, { status: 404 });
        query = query.eq("sauce_product_id", sauce.id);
      }

      const { data: source } = await query;

      if (!source || source.length === 0) {
        return Response.json({ success: false, error: `${sourceDate}에 복사할 생산 기록이 없습니다.` }, { status: 404 });
      }

      // 충돌 확인
      const targetSauceIds = Array.from(new Set(source.map((s) => s.sauce_product_id)));
      const { data: existing } = await supabase
        .from("daily_sauce_productions")
        .select("sauce_product_id")
        .eq("date", targetDate)
        .in("sauce_product_id", targetSauceIds);

      if (existing && existing.length > 0 && conflictMode === "ask") {
        return Response.json({
          success: false,
          needsConfirm: true,
          conflicts: existing,
          message: `${targetDate}에 이미 생산 기록이 있습니다. 처리 방법을 선택하세요.`,
        });
      }

      if (conflictMode === "overwrite" && existing && existing.length > 0) {
        await supabase
          .from("daily_sauce_productions")
          .delete()
          .eq("date", targetDate)
          .in("sauce_product_id", targetSauceIds);
      }

      const inserts = source.map((s) => ({
        sauce_product_id: s.sauce_product_id,
        date: targetDate,
        mode: s.mode,
        batch_count: s.batch_count,
        ingredient_id: s.ingredient_id,
        ingredient_amount: s.ingredient_amount,
      }));

      const { error } = await supabase.from("daily_sauce_productions").insert(inserts);
      if (error) return Response.json({ success: false, error: "복사 실패: " + error.message }, { status: 500 });

      return Response.json({ success: true, message: `${sourceDate}의 자체소스 생산 ${inserts.length}건을 ${targetDate}로 복사했습니다.` });
    }

    // ═══════════════════════════════════════
    //  preview_sauce_production (저장X, 차감 미리보기)
    // ═══════════════════════════════════════
    if (action.type === "preview_sauce_production") {
      const sauceName = normalizeName(action.params.sauceName);
      const mode = String(action.params.mode || "batch") as "batch" | "stock";
      const batchCount = action.params.batchCount != null ? Number(action.params.batchCount) : 0;
      const ingredientName = action.params.ingredientName ? normalizeName(action.params.ingredientName) : "";
      const ingredientAmount = action.params.ingredientAmount != null ? Number(action.params.ingredientAmount) : 0;

      const { sauces, recipes, productNames } = await getSauceData();
      const sauce = sauces.find((s) => s.name === sauceName);
      if (!sauce) return Response.json({ success: false, error: `소스 "${sauceName}"을 찾을 수 없습니다.` }, { status: 404 });

      const sauceRecipes = recipes.filter((r) => r.sauce_product_id === sauce.id);
      if (sauceRecipes.length === 0) {
        return Response.json({ success: false, error: `${sauceName}의 레시피가 없습니다.` }, { status: 404 });
      }

      const oneBatchTotal = sauceRecipes.reduce((sum, r) => sum + r.amount, 0);

      let actualBatchCount = 0;
      if (mode === "batch") {
        actualBatchCount = batchCount;
      } else {
        const ing = sauceRecipes.find((r) => productNames.get(r.ingredient_product_id) === ingredientName);
        if (!ing) return Response.json({ success: false, error: `재료 "${ingredientName}"이 ${sauceName} 레시피에 없습니다.` }, { status: 404 });
        actualBatchCount = ing.amount > 0 ? ingredientAmount / ing.amount : 0;
      }

      if (actualBatchCount <= 0) {
        return Response.json({ success: false, error: "유효한 입력이 아닙니다." }, { status: 400 });
      }

      const productionAmount = actualBatchCount * oneBatchTotal;
      const lines: string[] = [
        `[${sauceName}] ${mode === "batch" ? `${batchCount}배합` : `${ingredientName} ${ingredientAmount} 기준`}`,
        `→ 생산량: ${productionAmount.toFixed(1)} (${actualBatchCount.toFixed(2)}배합)`,
        `차감 재료:`,
      ];
      for (const r of sauceRecipes) {
        const ingName = productNames.get(r.ingredient_product_id) || "?";
        const deduction = r.amount * actualBatchCount;
        lines.push(`  ${ingName}: -${deduction.toFixed(1)}`);
      }

      return Response.json({ success: true, message: lines.join("\n") });
    }

    // ═══════════════════════════════════════
    //  recommend_sauce_production (재고 기반 한정재료 탐색)
    // ═══════════════════════════════════════
    if (action.type === "recommend_sauce_production") {
      const sauceName = normalizeName(action.params.sauceName);
      const date = action.params.date ? String(action.params.date) : new Date().toISOString().slice(0, 10);
      const limitingIngredientHint = action.params.limitingIngredientHint
        ? normalizeName(action.params.limitingIngredientHint)
        : "";

      const { sauces, recipes, productNames } = await getSauceData();
      const sauce = sauces.find((s) => s.name === sauceName);
      if (!sauce) return Response.json({ success: false, error: `소스 "${sauceName}"을 찾을 수 없습니다.` }, { status: 404 });

      const sauceRecipes = recipes.filter((r) => r.sauce_product_id === sauce.id);
      if (sauceRecipes.length === 0) {
        return Response.json({ success: false, error: `${sauceName}의 레시피가 없습니다.` }, { status: 404 });
      }

      // 각 재료 잔량 조회
      const ingIds = sauceRecipes.map((r) => r.ingredient_product_id);
      const { data: snapshots } = await supabase
        .from("inventory_snapshots")
        .select("product_id, remaining")
        .in("product_id", ingIds)
        .eq("date", date);

      const remainMap = new Map<string, number>();
      snapshots?.forEach((s) => remainMap.set(s.product_id, s.remaining || 0));

      // 비율 계산
      const ratios = sauceRecipes
        .filter((r) => r.amount > 0)
        .map((r) => {
          const remaining = remainMap.get(r.ingredient_product_id) || 0;
          const ratio = remaining / r.amount; // 가능한 배합 수
          return {
            ingredientId: r.ingredient_product_id,
            name: productNames.get(r.ingredient_product_id) || "?",
            remaining,
            recipeAmount: r.amount,
            ratio,
          };
        });

      let chosen = ratios[0];
      if (limitingIngredientHint) {
        const hinted = ratios.find((r) => r.name === limitingIngredientHint);
        if (hinted) chosen = hinted;
      } else {
        // 가장 비율이 낮은 재료 = 한정재료
        chosen = ratios.reduce((min, r) => (r.ratio < min.ratio ? r : min), ratios[0]);
      }

      const oneBatchTotal = sauceRecipes.reduce((sum, r) => sum + r.amount, 0);
      const productionAmount = chosen.ratio * oneBatchTotal;

      const lines: string[] = [
        `[${sauceName}] 추천 생산량 (한정재료: ${chosen.name})`,
        `${chosen.name} 잔량 ${chosen.remaining} → 최대 ${chosen.ratio.toFixed(2)}배합 가능`,
        `예상 생산량: ${productionAmount.toFixed(1)}`,
        `차감 재료:`,
      ];
      for (const r of sauceRecipes) {
        const ingName = productNames.get(r.ingredient_product_id) || "?";
        const deduction = r.amount * chosen.ratio;
        lines.push(`  ${ingName}: -${deduction.toFixed(1)}`);
      }

      return Response.json({
        success: true,
        message: lines.join("\n"),
        recommendation: {
          sauceName,
          mode: "stock",
          ingredientName: chosen.name,
          ingredientAmount: chosen.remaining,
          batchCount: chosen.ratio,
          productionAmount,
        },
      });
    }

    return Response.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
  } catch (error: unknown) {
    console.error("Execute API error:", error);
    return Response.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
