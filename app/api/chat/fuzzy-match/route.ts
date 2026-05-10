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

/** @ 기호 제거 + trim */
function normalizeName(raw: unknown): string {
  return String(raw ?? "").replace(/^@+/, "").trim();
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
- 숫자 뒤에 단위(g, ml, kg, EA 등)가 붙어있으면 무시하고 숫자만 추출하세요 (예: "2000g" → value: 2000).
- "냉동 관자"처럼 공백이 포함된 제품명도 인식하세요. 마지막 숫자(+단위)만 잔량입니다.

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
}

【실패 처리】
처리할 수 없는 입력이면 다음 형식으로 응답하세요:
{
  "error": true,
  "errorReason": "parse_failed",
  "description": "구체적인 실패 이유 설명"
}`;
}

function buildProductionPrompt(sauceList: string, ingredientList: string): string {
  return `당신은 자체소스 생산 입력 매칭 어시스턴트입니다.

사용자의 자체소스 생산 관련 입력을 분석하여 의도와 데이터를 추출합니다.

【등록된 자체소스 목록】
${sauceList || "(등록된 자체소스 없음)"}

【재료 후보 (각 자체소스 레시피 재료)】
${ingredientList || "(재료 정보 없음)"}

${MATCHING_RULES}

【의도 분류 (intent)】
입력 라인별로 아래 6가지 의도 중 하나로 분류:
1. "batch" - 배합 단위 생산: "오리엔탈 2배합", "갈릭 1.5배합", "타다끼 만들었어 3배합"
2. "stock" - 한정재료 기준 생산: "쯔유 마요네즈 200", "갈릭소스 다진마늘 100g"
3. "delete" - 취소/삭제: "오리엔탈 취소", "갈릭 삭제", "오리엔탈 안 만들었어"
4. "copy" - 다른 날짜 복사: "어제랑 똑같이", "어제 갈릭이랑 똑같이", "지난주 화요일이랑"
5. "preview" - 미리보기 (저장X): "오리엔탈 3배합 만들면 재료 얼마?", "타다끼 200g 만들려면 뭐 필요해?"
6. "recommend" - 재고 기반 추천: "남은 마요로 최대 만들면?", "오리엔탈 재고에 맞춰서"

【파싱 규칙】
- 단위(g, ml, kg, EA 등)는 무시하고 숫자만 추출하세요. 예: "200g" → value: 200
- 배합 수는 소수점 가능: "1.5배합" → batchCount: 1.5
- "@" 기호가 붙은 경우 제거하세요.
- 한 메시지에 여러 라인은 각각 분리하여 productions 배열에 넣으세요.
- "어제" / "오늘" / "지난주 화요일" 같은 상대 날짜는 sourceDateRef 필드에 그대로 넣으세요.

【출력 형식】 반드시 아래 JSON만 출력하세요:
{
  "productions": [
    {
      "intent": "batch" | "stock" | "delete" | "copy" | "preview" | "recommend",
      "inputLine": "사용자가 입력한 원본 라인",
      "sauceName": "소스명 (입력 그대로)",
      "sauceStatus": "auto" | "candidate" | "none",
      "sauceMatchedProduct": "매칭된 자체소스 제품명 (auto일 때만)",
      "sauceCandidates": ["후보1", "후보2"],
      "batchCount": 숫자 (intent=batch 또는 preview일 때),
      "ingredientName": "재료명 (intent=stock 또는 preview일 때)",
      "ingredientStatus": "auto" | "candidate" | "none",
      "ingredientMatchedProduct": "매칭된 재료 제품명 (auto일 때만)",
      "ingredientCandidates": ["후보1", "후보2"],
      "ingredientAmount": 숫자 (intent=stock 또는 preview일 때),
      "sourceDateRef": "어제 | 그저께 | 지난주 화요일 등 (intent=copy일 때만)",
      "limitingIngredientHint": "재료명 (intent=recommend, 사용자가 특정 재료를 언급한 경우)"
    }
  ]
}

【실패 처리】
처리할 수 없는 경우:
{
  "error": true,
  "errorReason": "parse_failed",
  "description": "구체적 실패 이유"
}
절대 추측이나 임의 매칭으로 진행하지 마세요.`;
}

function buildRecipePrompt(productList: string, menuList: string): string {
  return `당신은 메뉴 레시피 및 자체소스 레시피 매칭 어시스턴트입니다.

사용자가 입력한 레시피의 각 재료를 아래 DB 제품 목록과 매칭해주세요.
메뉴 레시피와 자체소스 레시피 모두 처리할 수 있습니다.

【DB 제품 목록】
${productList}

【등록된 메뉴 목록】
${menuList || "(등록된 메뉴 없음)"}

${MATCHING_RULES}

【메뉴/소스 구분 규칙】
- @는 메뉴명 구분 기호입니다. @ 뒤의 텍스트만 메뉴명으로 추출하세요.
  예: 입력 "@잭콕" → menuName은 "잭콕" (반드시 @ 기호 제거)
      입력 "@순두부 쫄면" → menuName은 "순두부 쫄면"
- 최종 JSON의 menuName 필드에는 절대로 @ 기호를 포함하지 마세요.
- 소스명(sauceName)에도 동일하게 적용됩니다.
- @가 없는 경우: 첫 줄 또는 콜론(:) 앞이 메뉴/소스명이고, 빈 줄을 메뉴 경계로 추정하세요.
- 메뉴명이 "자체소스" 카테고리의 제품명과 매칭되면 recipeType: "sauce"로 분류하세요.
- 그 외에는 recipeType: "menu"로 분류하세요.

【배합(batch) 규칙 - 자체소스 전용】
- 소스명 뒤에 "N배합"이 명시되면 batchSize = N으로 설정하세요.
  예: "@우동국물 100배합" → menuName: "우동국물", batchSize: 100
- "배합" 키워드가 없으면 batchSize는 null (기본값 1 적용)
- batchSize는 recipeType이 "sauce"일 때만 유효합니다.

【재료 파싱 규칙】
- 각 재료에서 제품명과 사용량(숫자)을 추출하세요.
- 잔 종류(하이볼잔, 언더락잔, 허리케인글라스 등)는 재료가 아닙니다 → "glassware" 필드로 분리
- 가니쉬/데코(라임 웻지, 체리, 시나몬스틱 등)와 조리 지시(섞고, 얹져서, 천천히 따라서)는 재료가 아닙니다 → "garnish" 또는 "note" 필드로 분리
- 수량이 없는 재료 줄은 value를 null로 설정하세요.
- 오차범위가 명시되어 있으면 tolerancePercent로 추출하세요.

【출력 형식】 반드시 아래 JSON만 출력하세요. 단일 메뉴도 menus 배열에 1개 원소로 반환:
{
  "menus": [
    {
      "menuName": "메뉴명 또는 소스명 (입력 그대로)",
      "recipeType": "menu" | "sauce",
      "batchSize": "숫자 또는 null (sauce에서 N배합이 명시된 경우만)",
      "glassware": "잔 종류 (있을 때만, 없으면 null)",
      "garnish": "가니쉬/데코 설명 (있을 때만, 없으면 null)",
      "note": "기타 조리 지시사항 (있을 때만, 없으면 null)",
      "sauceStatus": "auto | candidate | none (sauce일 때만)",
      "sauceMatchedProduct": "매칭된 소스 제품명 (sauce + auto일 때만)",
      "sauceCandidates": ["후보1", "후보2"],
      "results": [
        {
          "inputName": "사용자가 입력한 재료명",
          "value": 숫자(사용량) 또는 null,
          "tolerancePercent": 숫자 또는 0,
          "status": "auto" | "candidate" | "none",
          "matchedProduct": "매칭된 DB 제품명 (auto일 때만)",
          "candidates": ["후보1", "후보2"]
        }
      ]
    }
  ]
}

【실패 처리】
처리할 수 없는 경우 다음 형식으로 응답하세요:
{
  "error": true,
  "errorReason": "parse_failed" | "menu_not_found" | "product_ambiguous",
  "description": "구체적인 실패 이유를 한국어로 설명",
  "failedItems": ["문제가 된 항목"]
}
절대 추측이나 임의 매칭으로 진행하지 마세요.`;
}

export async function POST(request: Request) {
  try {
    const { message, storeId, userId, mode = "inventory" } = await request.json();

    if (!message || typeof message !== "string") {
      return Response.json({
        success: false,
        error: "메시지를 입력해주세요.",
        errorType: "parse_failed",
      }, { status: 400 });
    }
    if (!storeId || !userId) {
      return Response.json({
        success: false,
        error: "인증 정보가 없습니다.",
        errorType: "permission_denied",
      }, { status: 401 });
    }
    if (!checkRateLimit(userId)) {
      return Response.json({
        success: false,
        error: `일일 요청 한도(${DAILY_LIMIT}회)를 초과했습니다. 내일 다시 시도해주세요.`,
        errorType: "rate_limited",
      }, { status: 429 });
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
      const { data: menus } = await supabase
        .from("menus")
        .select("name")
        .eq("store_id", storeId)
        .order("created_at");
      const menuList = (menus || []).map((m) => m.name).join(", ");
      systemPrompt = buildRecipePrompt(productList, menuList);
    } else if (mode === "production") {
      // 자체소스 카테고리 + 각 소스의 레시피 재료 목록
      const sauceCat = (categories || []).find((c) => c.name === "자체소스");
      const sauceProducts = sauceCat
        ? dbProducts.filter((p) => p.categoryId === sauceCat.id)
        : [];
      const sauceList = sauceProducts.map((p) => p.name).join(", ");

      let ingredientList = "";
      if (sauceProducts.length > 0) {
        const sauceIds = sauceProducts.map((p) => p.id);
        const { data: recipes } = await supabase
          .from("custom_sauce_recipes")
          .select("sauce_product_id, ingredient_product_id, amount")
          .in("sauce_product_id", sauceIds);
        const productNameMap = new Map(dbProducts.map((p) => [p.id, p.name]));
        const ingByCat = new Map<string, string[]>();
        for (const sp of sauceProducts) {
          const rs = (recipes || []).filter((r) => r.sauce_product_id === sp.id);
          const names = rs.map((r) => productNameMap.get(r.ingredient_product_id) ?? "?");
          if (names.length > 0) ingByCat.set(sp.name, names);
        }
        ingByCat.forEach((names, sName) => {
          ingredientList += `[${sName}] ${names.join(", ")}\n`;
        });
      }

      systemPrompt = buildProductionPrompt(sauceList, ingredientList);
    } else {
      systemPrompt = buildInventoryPrompt(productList);
    }

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_tokens: 4000,
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
      return Response.json({
        success: false,
        error: "AI 응답을 해석할 수 없습니다. 입력을 더 간단히 나눠서 다시 시도해 주세요.",
        errorType: "llm_error",
      }, { status: 500 });
    }

    // LLM이 에러를 반환한 경우
    if (parsed.error) {
      return Response.json({
        success: false,
        error: (parsed.description as string) || "처리할 수 없는 입력입니다.",
        errorType: (parsed.errorReason as string) || "parse_failed",
        details: {
          failedItems: parsed.failedItems || [],
        },
      }, { status: 400 });
    }

    const productMap = new Map(dbProducts.map((p) => [p.name, p]));

    // ─── 레시피 모드: 다중 메뉴 배열 처리 ───
    if (mode === "recipe") {
      const menusRaw = (parsed.menus || []) as {
        menuName: string;
        recipeType?: "menu" | "sauce";
        batchSize?: number | null;
        glassware?: string | null;
        garnish?: string | null;
        note?: string | null;
        sauceStatus?: string;
        sauceMatchedProduct?: string;
        sauceCandidates?: string[];
        results: {
          inputName: string;
          value: number | null;
          tolerancePercent?: number;
          status: "auto" | "candidate" | "none";
          matchedProduct?: string;
          candidates?: string[];
        }[];
      }[];

      if (menusRaw.length === 0) {
        return Response.json({
          success: false,
          error: "입력에서 메뉴명을 찾지 못했습니다. `@메뉴명` 형식으로 시작해 주세요.",
          errorType: "parse_failed",
          details: { suggestion: "@메뉴명 형식으로 메뉴를 구분해 주세요." },
        }, { status: 400 });
      }

      const menus = menusRaw.map((menu) => {
        const recipeType = menu.recipeType || "menu";
        // @ 기호 정규화
        const cleanMenuName = normalizeName(menu.menuName);

        const results = (menu.results || []).map((item) => {
          const base: Record<string, unknown> = {
            inputName: normalizeName(item.inputName),
            value: item.value ?? 0,
          };
          if (item.tolerancePercent) base.tolerancePercent = item.tolerancePercent;

          if (item.status === "auto" && item.matchedProduct) {
            const product = productMap.get(item.matchedProduct);
            if (product) return { ...base, status: "auto" as const, matched: product };
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

        // 배합수 추출 (sauce 전용)
        const batchSize = recipeType === "sauce" && menu.batchSize ? Number(menu.batchSize) : null;

        // 컨텍스트 구성
        const context: Record<string, unknown> = {};
        if (recipeType === "sauce") {
          context.sauceName = cleanMenuName;
          if (batchSize) context.batchSize = batchSize;
          context.sauceStatus = menu.sauceStatus || "none";
          if (menu.sauceStatus === "auto" && menu.sauceMatchedProduct) {
            const sp = productMap.get(normalizeName(menu.sauceMatchedProduct));
            if (sp) context.sauceMatched = sp;
            else context.sauceStatus = "none";
          } else if (menu.sauceStatus === "candidate" && menu.sauceCandidates) {
            const sc = menu.sauceCandidates
              .map((name) => productMap.get(normalizeName(name)))
              .filter((p): p is DbProduct => !!p);
            if (sc.length > 0) context.sauceCandidates = sc;
            else context.sauceStatus = "none";
          }
        } else {
          context.menuName = cleanMenuName;
        }

        return {
          menuName: cleanMenuName,
          recipeType,
          batchSize,
          glassware: menu.glassware || null,
          garnish: menu.garnish || null,
          note: menu.note || null,
          results,
          context,
        };
      });

      return Response.json({
        menus,
        categories: categoryList,
        products: dbProducts,
        mode: "recipe",
      });
    }

    // ─── 자체소스 생산 모드 ───
    if (mode === "production") {
      const productionsRaw = (parsed.productions || []) as {
        intent: "batch" | "stock" | "delete" | "copy" | "preview" | "recommend";
        inputLine?: string;
        sauceName?: string;
        sauceStatus?: "auto" | "candidate" | "none";
        sauceMatchedProduct?: string;
        sauceCandidates?: string[];
        batchCount?: number;
        ingredientName?: string;
        ingredientStatus?: "auto" | "candidate" | "none";
        ingredientMatchedProduct?: string;
        ingredientCandidates?: string[];
        ingredientAmount?: number;
        sourceDateRef?: string;
        limitingIngredientHint?: string;
      }[];

      if (productionsRaw.length === 0) {
        return Response.json({
          success: false,
          error: "입력에서 자체소스 생산 항목을 찾지 못했습니다.",
          errorType: "parse_failed",
          details: { suggestion: "예: \"오리엔탈 2배합\" 또는 \"쯔유 마요네즈 200\"" },
        }, { status: 400 });
      }

      // 자체소스 카테고리 식별
      const sauceCat = (categories || []).find((c) => c.name === "자체소스");
      const sauceProductsList = sauceCat
        ? dbProducts.filter((p) => p.categoryId === sauceCat.id)
        : [];
      const sauceMap = new Map(sauceProductsList.map((p) => [p.name, p]));

      const productions = productionsRaw.map((row) => {
        const cleanSauceName = normalizeName(row.sauceName);

        // 소스 매칭
        let sauceField: Record<string, unknown> = { sauceStatus: row.sauceStatus || "none" };
        if (row.sauceStatus === "auto" && row.sauceMatchedProduct) {
          const sp = sauceMap.get(normalizeName(row.sauceMatchedProduct));
          if (sp) sauceField = { sauceStatus: "auto", sauceMatched: sp };
          else sauceField = { sauceStatus: "none" };
        } else if (row.sauceStatus === "candidate" && row.sauceCandidates) {
          const sc = row.sauceCandidates
            .map((n) => sauceMap.get(normalizeName(n)))
            .filter((p): p is DbProduct => !!p);
          if (sc.length > 0) sauceField = { sauceStatus: "candidate", sauceCandidates: sc };
          else sauceField = { sauceStatus: "none" };
        }

        // 재료 매칭 (stock 또는 preview일 때만)
        let ingredientField: Record<string, unknown> = {};
        if (row.intent === "stock" || row.intent === "preview") {
          if (row.ingredientName) {
            const cleanIng = normalizeName(row.ingredientName);
            ingredientField = { ingredientName: cleanIng, ingredientStatus: row.ingredientStatus || "none" };
            if (row.ingredientStatus === "auto" && row.ingredientMatchedProduct) {
              const ip = productMap.get(normalizeName(row.ingredientMatchedProduct));
              if (ip) ingredientField = { ingredientName: cleanIng, ingredientStatus: "auto", ingredientMatched: ip };
              else ingredientField = { ingredientName: cleanIng, ingredientStatus: "none" };
            } else if (row.ingredientStatus === "candidate" && row.ingredientCandidates) {
              const ic = row.ingredientCandidates
                .map((n) => productMap.get(normalizeName(n)))
                .filter((p): p is DbProduct => !!p);
              if (ic.length > 0) ingredientField = { ingredientName: cleanIng, ingredientStatus: "candidate", ingredientCandidates: ic };
              else ingredientField = { ingredientName: cleanIng, ingredientStatus: "none" };
            }
          }
        }

        return {
          intent: row.intent,
          inputLine: row.inputLine || "",
          sauceName: cleanSauceName,
          ...sauceField,
          batchCount: row.batchCount ?? null,
          ingredientAmount: row.ingredientAmount ?? null,
          ...ingredientField,
          sourceDateRef: row.sourceDateRef || null,
          limitingIngredientHint: row.limitingIngredientHint || null,
        };
      });

      return Response.json({
        productions,
        categories: categoryList,
        products: dbProducts,
        sauceProducts: sauceProductsList,
        mode: "production",
      });
    }

    // ─── 재고 모드 ───
    const llmResults = (parsed.results || []) as {
      inputName: string;
      value: number;
      status: "auto" | "candidate" | "none";
      matchedProduct?: string;
      candidates?: string[];
    }[];

    if (llmResults.length === 0) {
      return Response.json({
        success: false,
        error: "입력에서 항목을 찾을 수 없습니다. \"제품명 잔량\" 형식으로 입력해 주세요.",
        errorType: "parse_failed",
        details: { suggestion: "제품명과 숫자를 공백으로 구분하여 입력하세요." },
      }, { status: 400 });
    }

    const results = llmResults.map((item) => {
      const base: Record<string, unknown> = {
        inputName: item.inputName,
        value: item.value,
      };

      if (item.status === "auto" && item.matchedProduct) {
        const product = productMap.get(item.matchedProduct);
        if (product) return { ...base, status: "auto" as const, matched: product };
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

    return Response.json({
      results,
      categories: categoryList,
      products: dbProducts,
      mode: "inventory",
    });
  } catch (error: unknown) {
    console.error("Fuzzy match API error:", error);
    return Response.json({
      success: false,
      error: "서버와 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      errorType: "network_error",
    }, { status: 500 });
  }
}
