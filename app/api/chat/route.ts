import { getOpenAIClient } from "@/lib/openai";
import { CategoryProducts } from "@/lib/recipe-prompt";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// 사용자당 일일 요청 횟수 제한
const DAILY_LIMIT = 30;
const rateLimitMap = new Map<string, { count: number; date: string }>();

function checkRateLimit(userId: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const entry = rateLimitMap.get(userId);

  if (!entry || entry.date !== today) {
    rateLimitMap.set(userId, { count: 1, date: today });
    return true;
  }

  if (entry.count >= DAILY_LIMIT) return false;
  entry.count++;
  return true;
}

interface StoreData {
  categoryProducts: CategoryProducts[];
  menus: { name: string; recipes: { productName: string; amount: number; tolerancePercent: number }[] }[];
  sauceRecipes: { sauceName: string; ingredients: { name: string; amount: number }[] }[];
}

async function fetchStoreData(storeId: string): Promise<StoreData> {
  const supabase = createServerSupabaseClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, sort_order")
    .eq("store_id", storeId)
    .order("sort_order");

  const categoryProducts: CategoryProducts[] = [];
  const productMap = new Map<string, string>();

  for (const cat of categories || []) {
    const { data: products } = await supabase
      .from("products")
      .select("id, name, unit")
      .eq("category_id", cat.id)
      .order("created_at");

    for (const p of products || []) {
      productMap.set(p.id, p.name);
    }

    categoryProducts.push({
      category: cat.name,
      products: (products || []).map((p) => ({ name: p.name, unit: p.unit })),
    });
  }

  const { data: menus } = await supabase
    .from("menus")
    .select("id, name")
    .eq("store_id", storeId)
    .order("created_at");

  const menuData: StoreData["menus"] = [];
  for (const menu of menus || []) {
    const { data: recipes } = await supabase
      .from("menu_recipes")
      .select("product_id, amount, tolerance_percent")
      .eq("menu_id", menu.id);

    menuData.push({
      name: menu.name,
      recipes: (recipes || []).map((r) => ({
        productName: productMap.get(r.product_id) || "알 수 없음",
        amount: r.amount,
        tolerancePercent: r.tolerance_percent,
      })),
    });
  }

  const allSauceProductIds = new Set<string>();
  const { data: sauceRecipesRaw } = await supabase
    .from("custom_sauce_recipes")
    .select("sauce_product_id, ingredient_product_id, amount");

  for (const sr of sauceRecipesRaw || []) {
    allSauceProductIds.add(sr.sauce_product_id);
  }

  const sauceRecipes: StoreData["sauceRecipes"] = [];
  for (const sauceId of Array.from(allSauceProductIds)) {
    const sauceName = productMap.get(sauceId) || "알 수 없음";
    const ingredients = (sauceRecipesRaw || [])
      .filter((sr) => sr.sauce_product_id === sauceId && sr.amount > 0)
      .map((sr) => ({
        name: productMap.get(sr.ingredient_product_id) || "알 수 없음",
        amount: sr.amount,
      }));

    if (ingredients.length > 0) {
      sauceRecipes.push({ sauceName, ingredients });
    }
  }

  return { categoryProducts, menus: menuData, sauceRecipes };
}

function formatStoreData(data: StoreData): string {
  let text = "";

  text += "【제품 목록 (카테고리별)】";
  for (const cat of data.categoryProducts) {
    text += `\n[${cat.category}] `;
    if (cat.products.length === 0) {
      text += "(제품 없음)";
    } else {
      text += cat.products.map((p) => `${p.name}(${p.unit})`).join(", ");
    }
  }

  if (data.menus.length > 0) {
    text += "\n\n【메뉴별 레시피】";
    for (const menu of data.menus) {
      text += `\n[${menu.name}] `;
      const activeRecipes = menu.recipes.filter((r) => r.amount > 0);
      if (activeRecipes.length === 0) {
        text += "(레시피 미등록)";
      } else {
        text += activeRecipes
          .map((r) => {
            let s = `${r.productName} ${r.amount}`;
            if (r.tolerancePercent > 0) s += `(오차 ±${r.tolerancePercent}%)`;
            return s;
          })
          .join(", ");
      }
    }
  }

  if (data.sauceRecipes.length > 0) {
    text += "\n\n【자체소스 레시피】";
    for (const sauce of data.sauceRecipes) {
      text += `\n[${sauce.sauceName}] `;
      text += sauce.ingredients.map((i) => `${i.name} ${i.amount}`).join(", ");
    }
  }

  return text;
}

// ──────────────── 모드별 시스템 프롬프트 ────────────────

const CHAT_SYSTEM_PROMPT = (storeDataText: string) => `당신은 한국 음식점의 재고 관리를 돕는 어시스턴트 "OnIS 도우미"입니다.

이 매장의 등록 데이터:
${storeDataText}

역할:
- 매장의 제품, 카테고리, 메뉴 레시피, 자체소스 레시피에 대한 질문에 위 데이터를 기반으로 답변합니다
- 일반적인 인사나 질문에는 친절하게 답변합니다
- 데이터를 수정하고 싶으면 #레시피입력 또는 #현재재고입력 모드를 사용하라고 안내합니다

답변은 간결하고 친절하게 해주세요.`;

const RECIPE_SYSTEM_PROMPT = (storeDataText: string) => `당신은 한국 음식점의 레시피와 메뉴 정보를 DB에 입력하는 어시스턴트입니다.

현재 매장 데이터:
${storeDataText}

이 모드에서 할 수 있는 작업:
1. 메뉴 레시피 입력/수정 (재료와 용량)
2. 메뉴 상품코드 설정/변경

사용자가 레시피를 입력하면, 매장의 기존 제품명에 유연하게 매칭하여 DB 변경 액션을 생성하세요.
- "간장" → "진간장", "양조간장" 등 유사한 제품으로 매칭
- 매칭할 수 없는 재료는 별도로 알려주세요
- 메뉴명이 기존 메뉴 목록에 없으면 새 메뉴라고 알려주세요 (현재는 기존 메뉴만 수정 가능)
- 중요: 유사한 이름의 제품이 여러 개 있을 경우 (예: "명란", "명란2") 임의로 선택하지 말고, 어떤 제품을 사용할지 사용자에게 물어보세요. 이 경우 JSON이 아닌 일반 텍스트로 후보 목록을 보여주고 선택을 요청하세요.

사용자가 상품코드를 설정하면, 해당 메뉴의 상품코드를 변경하는 액션을 생성하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "description": "변경 내용 설명 (한국어)",
  "actions": [
    {
      "type": "update_menu_recipe",
      "params": { "menuName": "메뉴명", "productName": "제품명", "amount": 숫자 }
    },
    {
      "type": "update_menu_code",
      "params": { "menuName": "메뉴명", "productCode": "상품코드" }
    }
  ]
}

여러 항목은 actions 배열에 여러 개를 넣으세요.
오차범위가 있으면 params에 "tolerancePercent": 숫자 를 추가하세요.
처리 불가능한 경우 일반 텍스트로 설명하세요.`;

const SAUCE_SYSTEM_PROMPT = (storeDataText: string) => `당신은 한국 음식점의 자체소스 레시피를 DB에 입력하는 어시스턴트입니다.

현재 매장 데이터:
${storeDataText}

이 모드에서 할 수 있는 작업:
- 자체소스 레시피 입력/수정 (소스에 들어가는 재료와 용량)

규칙:
- 소스명은 제품 목록에 등록된 제품이어야 합니다 (보통 "자체소스" 카테고리에 있음)
- 재료명도 제품 목록에 등록된 제품이어야 합니다
- 사용자가 입력한 이름을 기존 제품명에 유연하게 매칭하세요 ("간장" → "진간장" 등)
- 매칭할 수 없는 소스나 재료는 별도로 알려주세요
- 중요: 유사한 이름의 제품이 여러 개 있을 경우 (예: "명란", "명란2") 임의로 선택하지 말고, 어떤 제품을 사용할지 사용자에게 물어보세요. 이 경우 JSON이 아닌 일반 텍스트로 후보 목록을 보여주고 선택을 요청하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "description": "변경 내용 설명 (한국어)",
  "actions": [
    {
      "type": "update_sauce_recipe",
      "params": { "sauceName": "소스제품명", "ingredientName": "재료제품명", "amount": 숫자 }
    }
  ]
}

여러 재료는 actions 배열에 여러 개를 넣으세요.
처리 불가능한 경우 일반 텍스트로 설명하세요.`;

const INVENTORY_SYSTEM_PROMPT = (storeDataText: string, dateStr: string) => `당신은 한국 음식점의 현재재고를 수정하는 어시스턴트입니다.

현재 매장 데이터:
${storeDataText}

현재 선택된 날짜: ${dateStr}

사용자가 제품의 정보를 수정 요청하면, DB 변경 액션을 생성하세요.

**지원하는 작업 2가지:**

1. 제품 정보 수정 (products 테이블):
{
  "description": "변경 내용 설명 (한국어)",
  "actions": [
    {
      "type": "update_product",
      "params": { "productName": "현재 제품명", "field": "price", "value": 3000 }
    }
  ]
}
field 가능한 값: "name", "unit", "price"

2. 재고 수량/잔량 수정 (inventory_snapshots 테이블):
{
  "description": "변경 내용 설명 (한국어)",
  "actions": [
    {
      "type": "update_inventory",
      "params": { "productName": "제품명", "quantity": 5, "remaining": 200 }
    }
  ]
}
- quantity(수량)와 remaining(잔량) 중 사용자가 언급한 것만 포함하세요.
- 둘 다 언급하면 둘 다 포함하세요.
- 날짜는 현재 선택된 날짜(${dateStr})를 기준으로 합니다.

여러 수정은 actions 배열에 여러 개를 넣으세요.
두 타입을 섞어서 사용할 수도 있습니다.
제품을 찾을 수 없으면 일반 텍스트로 안내하세요.`;

export async function POST(request: Request) {
  try {
    const { message, storeId, userId, mode = "chat", history = [], date } = await request.json();

    if (!message || typeof message !== "string") {
      return Response.json({ error: "메시지를 입력해주세요." }, { status: 400 });
    }

    if (message.length > 500) {
      return Response.json({ error: "메시지는 500자 이내로 입력해주세요." }, { status: 400 });
    }

    if (!storeId || !userId) {
      return Response.json({ error: "인증 정보가 없습니다." }, { status: 401 });
    }

    if (!checkRateLimit(userId)) {
      return Response.json(
        { error: `일일 요청 한도(${DAILY_LIMIT}회)를 초과했습니다. 내일 다시 시도해주세요.` },
        { status: 429 }
      );
    }

    const storeData = await fetchStoreData(storeId);
    const storeDataText = formatStoreData(storeData);
    const openai = getOpenAIClient();

    // 대화 히스토리를 OpenAI 메시지 형식으로 변환 (최근 10개, role 검증)
    const chatHistory = (history as { role: string; content: string }[])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // ─── 레시피 입력 모드 ───
    if (mode === "recipe") {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: RECIPE_SYSTEM_PROMPT(storeDataText) },
          ...chatHistory,
        ],
        max_tokens: 2000,
        temperature: 0.2,
      });

      const reply = response.choices[0]?.message?.content || "";

      try {
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const actionData = JSON.parse(jsonMatch[0]);
          return Response.json({ reply: actionData.description || reply, action: actionData });
        }
      } catch {
        // pass
      }

      return Response.json({ reply });
    }

    // ─── 자체소스 레시피 입력 모드 ───
    if (mode === "sauce") {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SAUCE_SYSTEM_PROMPT(storeDataText) },
          ...chatHistory,
        ],
        max_tokens: 2000,
        temperature: 0.2,
      });

      const reply = response.choices[0]?.message?.content || "";

      try {
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const actionData = JSON.parse(jsonMatch[0]);
          return Response.json({ reply: actionData.description || reply, action: actionData });
        }
      } catch {
        // pass
      }

      return Response.json({ reply });
    }

    // ─── 현재재고 수정 모드 ───
    if (mode === "inventory") {
      const dateStr = date || new Date().toISOString().slice(0, 10);
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: INVENTORY_SYSTEM_PROMPT(storeDataText, dateStr) },
          ...chatHistory,
        ],
        max_tokens: 1000,
        temperature: 0.2,
      });

      const reply = response.choices[0]?.message?.content || "";

      try {
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const actionData = JSON.parse(jsonMatch[0]);
          return Response.json({ reply: actionData.description || reply, action: actionData });
        }
      } catch {
        // pass
      }

      return Response.json({ reply });
    }

    // ─── 일반 채팅 모드 ───
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: CHAT_SYSTEM_PROMPT(storeDataText) },
        ...chatHistory,
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply = response.choices[0]?.message?.content || "";
    return Response.json({ reply });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";

    if (errorMessage.includes("API key")) {
      return Response.json({ error: "OpenAI API 키가 설정되지 않았습니다." }, { status: 500 });
    }

    return Response.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
