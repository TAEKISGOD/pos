import { SupabaseClient } from "@supabase/supabase-js";

export interface InventoryCalcResult {
  productId: string;
  categoryId: string;
  productName: string;
  productUnit: string;
  currentQuantity: number;
  totalUsed: number;
  totalUsedMin?: number;
  totalUsedMax?: number;
  wasteAmount: number;
  newQuantity: number;
  newQuantityMin?: number;
  newQuantityMax?: number;
  hasTolerance: boolean;
}

export async function calculateUpdatedInventory(
  supabase: SupabaseClient,
  storeId: string,
  dateStr: string
): Promise<InventoryCalcResult[]> {
  // 1. 전체 카테고리 + 제품
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("store_id", storeId);

  if (!categories || categories.length === 0) return [];

  const categoryIds = categories.map((c) => c.id);
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .in("category_id", categoryIds);

  if (!products || products.length === 0) return [];

  // 2. 현재재고 스냅샷 (잔량 = 총 재고량 g)
  const productIds = products.map((p) => p.id);
  const { data: snapshots } = await supabase
    .from("inventory_snapshots")
    .select("*")
    .in("product_id", productIds)
    .eq("date", dateStr);

  const productUnitMap: Record<string, number> = {};
  products.forEach((p) => { productUnitMap[p.id] = parseFloat(p.unit) || 0; });

  // 자체소스 카테고리 제품 식별 (batch_size 기반 차감용)
  const sauceCat = categories.find((c) => c.name === "자체소스");
  const sauceProductIds = new Set<string>();
  const productBatchSizeMap: Record<string, number> = {};
  if (sauceCat) {
    products.forEach((p) => {
      if (p.category_id === sauceCat.id) {
        sauceProductIds.add(p.id);
        productBatchSizeMap[p.id] = p.batch_size ?? 1;
      }
    });
  }

  const inventoryMap: Record<string, number> = {};
  snapshots?.forEach((s) => {
    inventoryMap[s.product_id] = s.remaining || 0;
  });

  // 3. 메뉴 + 레시피
  const { data: menus } = await supabase
    .from("menus")
    .select("id")
    .eq("store_id", storeId);

  const usageMap: Record<string, { total: number; minTotal: number; maxTotal: number; hasTolerance: boolean }> = {};
  products.forEach((p) => {
    usageMap[p.id] = { total: 0, minTotal: 0, maxTotal: 0, hasTolerance: false };
  });

  if (menus && menus.length > 0) {
    const menuIds = menus.map((m) => m.id);

    const { data: recipes } = await supabase
      .from("menu_recipes")
      .select("*")
      .in("menu_id", menuIds);

    const { data: salesData } = await supabase
      .from("daily_sales")
      .select("*")
      .in("menu_id", menuIds)
      .eq("date", dateStr);

    const salesMap: Record<string, number> = {};
    salesData?.forEach((s) => (salesMap[s.menu_id] = s.quantity));

    // 레시피 * 판매수량 = 사용량
    // 자체소스 제품: (용량 / batch_size) × 사용량 × 판매수량
    recipes?.forEach((recipe) => {
      const salesQty = salesMap[recipe.menu_id] || 0;
      if (salesQty === 0) return;

      let usage: number;
      if (sauceProductIds.has(recipe.product_id)) {
        // 자체소스: (용량 / batch_size) × amount × salesQty
        const unitValue = productUnitMap[recipe.product_id] || 0;
        const batchSize = productBatchSizeMap[recipe.product_id] || 1;
        const perBatch = batchSize > 0 ? unitValue / batchSize : unitValue;
        usage = perBatch * recipe.amount * salesQty;
      } else {
        // 일반 제품: amount × salesQty
        usage = recipe.amount * salesQty;
      }

      const toleranceRatio = recipe.tolerance_percent / 100;

      if (!usageMap[recipe.product_id]) {
        usageMap[recipe.product_id] = { total: 0, minTotal: 0, maxTotal: 0, hasTolerance: false };
      }

      usageMap[recipe.product_id].total += usage;
      usageMap[recipe.product_id].minTotal += usage * (1 - toleranceRatio);
      usageMap[recipe.product_id].maxTotal += usage * (1 + toleranceRatio);

      if (recipe.tolerance_percent > 0) {
        usageMap[recipe.product_id].hasTolerance = true;
      }
    });
  }

  // 4. 제품 직접 판매 (주류/음료 등 레시피 없이 바로 판매되는 제품)
  const { data: productSalesData } = await supabase
    .from("daily_product_sales")
    .select("*")
    .in("product_id", productIds)
    .eq("date", dateStr);

  productSalesData?.forEach((ps) => {
    const unitValue = productUnitMap[ps.product_id] || 0;
    const usage = ps.quantity * unitValue; // 1개 판매 = 1단위(용량) 소진
    if (usageMap[ps.product_id]) {
      usageMap[ps.product_id].total += usage;
      usageMap[ps.product_id].minTotal += usage;
      usageMap[ps.product_id].maxTotal += usage;
    }
  });

  // 5. 폐기량
  const { data: wasteData } = await supabase
    .from("daily_waste")
    .select("*")
    .in("product_id", productIds)
    .eq("date", dateStr);

  const wasteMap: Record<string, number> = {};
  wasteData?.forEach((w) => (wasteMap[w.product_id] = w.waste_amount));

  // 6. 결과 조합
  return products.map((product) => {
    const current = inventoryMap[product.id] || 0;
    const usage = usageMap[product.id] || { total: 0, minTotal: 0, maxTotal: 0, hasTolerance: false };
    const waste = wasteMap[product.id] || 0;

    const newQuantity = current - usage.total - waste;

    const result: InventoryCalcResult = {
      productId: product.id,
      categoryId: product.category_id,
      productName: product.name,
      productUnit: product.unit,
      currentQuantity: current,
      totalUsed: usage.total,
      wasteAmount: waste,
      newQuantity,
      hasTolerance: usage.hasTolerance,
    };

    if (usage.hasTolerance) {
      result.totalUsedMin = usage.minTotal;
      result.totalUsedMax = usage.maxTotal;
      result.newQuantityMin = current - usage.maxTotal - waste;
      result.newQuantityMax = current - usage.minTotal - waste;
    }

    return result;
  });
}
