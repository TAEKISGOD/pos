import { getOpenAIClient } from "@/lib/openai";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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

interface DbProduct {
  id: string;
  name: string;
  unit: string;
  categoryId: string;
  categoryName: string;
}

function buildProductList(products: DbProduct[]): string {
  const byCat = new Map<string, string[]>();
  for (const p of products) {
    const list = byCat.get(p.categoryName) || [];
    list.push(p.name);
    byCat.set(p.categoryName, list);
  }
  let text = "";
  byCat.forEach((names, cat) => {
    text += `[${cat}] ${names.join(", ")}\n`;
  });
  return text;
}

const MATCHING_RULES = `【매칭 규칙】
1. 축약어, 띄어쓰기 차이, 오타를 고려해서 유연하게 매칭하세요.
   예: "우스타" → "우스터소스", "홀그레인 마스타드" → "홀그레인머스타드", "노추왕 간장" → "노추왕간장"
2. 확실히 매칭되는 것은 "auto"로 분류하세요.
3. 후보가 여러 개이거나 애매한 경우 "candidate"로 분류하고 가능한 후보들(최대 5개)을 나열하세요.
4. 전혀 매칭할 수 없는 것은 "none"으로 분류하세요.
candidates는 candidate 상태일 때만 포함하세요. auto일 때는 matchedProduct만, none일 때는 둘 다 비워주세요.`;

function buildInventoryPrompt(productList: string): string {
  return `당신은 재고 입력 매칭 어시스턴트입니다.

사용자가 입력한 재고 텍스트의 각 항목을 아래 DB 제품 목록과 매칭해주세요.

【DB 제품 목록】
${productList}

${MATCHING_RULES}

추가 규칙:
- 제품명에 숫자가 붙어있으면 제품명의 일부일 수 있습니다 (예: "빵가루1000"은 제품명).
- 제품명과 숫자가 공백으로 구분되면 숫자는 잔량입니다.

【출력 형식】 반드시 아래 JSON만 출력하세요:
{
  "results": [
    {
      "inputName": "사용자가 입력한 원본 텍스트",
      "value": 숫자(잔량),
      "status": "auto" | "candidate" | "none",
      "matchedProduct": "매칭된 DB 제품명 (auto일 때만)",
      "candidates": ["후보1", "후보2"]
    }
  ]
}`;
}

function buildRecipePrompt(productList: string, menuList: string): string {
  return `당신은 메뉴 레시피 매칭 어시스턴트입니다.

사용자가 입력한 메뉴 레시피의 각 재료를 아래 DB 제품 목록과 매칭해주세요.

【DB 제품 목록】
${productList}

【등록된 메뉴 목록】
${menuList || "(등록된 메뉴 없음)"}

${MATCHING_RULES}

추가 규칙:
- 사용자 입력에서 메뉴명과 재료를 분리하세요.
- 메뉴명은 보통 첫 줄이나 콜론(:) 앞에 있습니다.
- 각 재료에서 제품명과 사용량(숫자)을 추출하세요.
- 오차범위가 명시되어 있으면 tolerancePercent로 추출하세요 (예: "오차 5%").
- 메뉴명이 등록된 메뉴 목록에 없으면 그대로 menuName에 적어주세요.

【출력 형식】 반드시 아래 JSON만 출력하세요:
{
  "menuName": "메뉴명",
  "results": [
    {
      "inputName": "사용자가 입력한 재료명",
      "value": 숫자(사용량),
      "tolerancePercent": 숫자 또는 0,
      "status": "auto" | "candidate" | "none",
      "matchedProduct": "매칭된 DB 제품명 (auto일 때만)",
      "candidates": ["후보1", "후보2"]
    }
  ]
}`;
}

function buildSaucePrompt(productList: string): string {
  return `당신은 자체소스 레시피 매칭 어시스턴트입니다.

사용자가 입력한 자체소스 레시피의 각 재료를 아래 DB 제품 목록과 매칭해주세요.

【DB 제품 목록】
${productList}

${MATCHING_RULES}

추가 규칙:
- 사용자 입력에서 소스명과 재료를 분리하세요.
- 소스명은 보통 첫 줄이나 콜론(:) 앞에 있습니다.
- 소스명도 DB 제품 목록에 있는 제품이어야 합니다 (보통 "자체소스" 카테고리).
- 소스명도 매칭 규칙에 따라 매칭하세요.
- 각 재료에서 제품명과 사용량(숫자)을 추출하세요.

【출력 형식】 반드시 아래 JSON만 출력하세요:
{
  "sauceName": "소스 제품명 (입력 그대로)",
  "sauceStatus": "auto" | "candidate" | "none",
  "sauceMatchedProduct": "매칭된 DB 제품명 (auto일 때만)",
  "sauceCandidates": ["후보1", "후보2"],
  "results": [
    {
      "inputName": "사용자가 입력한 재료명",
      "value": 숫자(사용량),
      "status": "auto" | "candidate" | "none",
      "matchedProduct": "매칭된 DB 제품명 (auto일 때만)",
      "candidates": ["후보1", "후보2"]
    }
  ]
}`;
}

export async function POST(request: Request) {
  try {
    const { message, storeId, userId, mode = "inventory" } = await request.json();

    if (!message || typeof message !== "string") {
      return Response.json({ error: "메시지를 입력해주세요." }, { status: 400 });
    }
    if (!storeId || !userId) {
      return Response.json({ error: "인증 정보가 없습니다." }, { status: 401 });
    }
    if (!checkRateLimit(userId)) {
      return Response.json(
        { error: `일일 요청 한도(${DAILY_LIMIT}회)를 초과했습니다.` },
        { status: 429 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 매장의 모든 제품 가져오기
    const { data: categories } = await supabase
      .from("categories")
      .select("id, name, sort_order")
      .eq("store_id", storeId)
      .order("sort_order");

    const dbProducts: DbProduct[] = [];
    const categoryList: { id: string; name: string }[] = [];

    for (const cat of categories || []) {
      categoryList.push({ id: cat.id, name: cat.name });

      const { data: products } = await supabase
        .from("products")
        .select("id, name, unit")
        .eq("category_id", cat.id)
        .order("created_at");

      for (const p of products || []) {
        dbProducts.push({
          id: p.id,
          name: p.name,
          unit: p.unit,
          categoryId: cat.id,
          categoryName: cat.name,
        });
      }
    }

    const productList = buildProductList(dbProducts);

    // 모드별 프롬프트 구성
    let systemPrompt: string;
    if (mode === "recipe") {
      // 메뉴 목록 가져오기
      const { data: menus } = await supabase
        .from("menus")
        .select("name")
        .eq("store_id", storeId)
        .order("created_at");
      const menuList = (menus || []).map((m) => m.name).join(", ");
      systemPrompt = buildRecipePrompt(productList, menuList);
    } else if (mode === "sauce") {
      systemPrompt = buildSaucePrompt(productList);
    } else {
      systemPrompt = buildInventoryPrompt(productList);
    }

    // LLM이 파싱 + 매칭을 한번에 수행
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_tokens: 3000,
      temperature: 0.1,
    });

    const reply = response.choices[0]?.message?.content || "";

    let parsed: Record<string, unknown> = {};
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      return Response.json({ error: "매칭 처리에 실패했습니다. 다시 시도해주세요." }, { status: 500 });
    }

    const llmResults = (parsed.results || []) as {
      inputName: string;
      value: number;
      tolerancePercent?: number;
      status: "auto" | "candidate" | "none";
      matchedProduct?: string;
      candidates?: string[];
    }[];

    if (llmResults.length === 0) {
      return Response.json({ error: "입력에서 항목을 찾을 수 없습니다." }, { status: 400 });
    }

    // LLM 결과를 FuzzyMatchReview 형식으로 변환
    const productMap = new Map(dbProducts.map((p) => [p.name, p]));

    const results = llmResults.map((item) => {
      const base: Record<string, unknown> = {
        inputName: item.inputName,
        value: item.value,
      };
      if (item.tolerancePercent) base.tolerancePercent = item.tolerancePercent;

      if (item.status === "auto" && item.matchedProduct) {
        const product = productMap.get(item.matchedProduct);
        if (product) {
          return { ...base, status: "auto" as const, matched: product };
        }
        return { ...base, status: "none" as const };
      }

      if (item.status === "candidate" && item.candidates?.length) {
        const candidateProducts = item.candidates
          .map((name) => productMap.get(name))
          .filter((p): p is DbProduct => !!p)
          .map((p, i) => ({ product: p, score: 0.8 - i * 0.1, matchType: "substring" as const }));

        if (candidateProducts.length > 0) {
          return { ...base, status: "candidate" as const, candidates: candidateProducts };
        }
        return { ...base, status: "none" as const };
      }

      return { ...base, status: "none" as const };
    });

    // 컨텍스트 정보 구성 (레시피/소스)
    const context: Record<string, unknown> = {};

    if (mode === "recipe") {
      context.menuName = parsed.menuName || "";
    }

    if (mode === "sauce") {
      context.sauceName = parsed.sauceName || "";
      context.sauceStatus = parsed.sauceStatus || "none";
      // 소스명 매칭 처리
      if (parsed.sauceStatus === "auto" && parsed.sauceMatchedProduct) {
        const sp = productMap.get(parsed.sauceMatchedProduct as string);
        if (sp) context.sauceMatched = sp;
        else context.sauceStatus = "none";
      } else if (parsed.sauceStatus === "candidate" && parsed.sauceCandidates) {
        const sc = (parsed.sauceCandidates as string[])
          .map((name) => productMap.get(name))
          .filter((p): p is DbProduct => !!p);
        if (sc.length > 0) context.sauceCandidates = sc;
        else context.sauceStatus = "none";
      }
    }

    return Response.json({
      results,
      categories: categoryList,
      context: Object.keys(context).length > 0 ? context : undefined,
      mode,
    });
  } catch (error: unknown) {
    console.error("Fuzzy match API error:", error);
    return Response.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
