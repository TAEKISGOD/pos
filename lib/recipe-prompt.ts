export interface CategoryProducts {
  category: string;
  products: { name: string; unit: string }[];
}

export function buildSystemPrompt(): string {
  return `당신은 한국 음식점의 레시피를 제품 재고 목록에 매칭하는 어시스턴트입니다.

규칙:
- 사용자가 입력한 레시피의 재료명을 제품 목록에서 유연하게 매칭하세요 (예: "간장" → "진간장", "양조간장" 등)
- 제품 목록의 순서를 반드시 유지하세요
- 레시피에 해당하지 않는 제품은 quantity를 0으로 설정하세요
- 반드시 유효한 JSON만 출력하세요
- 출력 형식: { "results": [ { "category": "카테고리명", "products": [ { "name": "제품명", "quantity": 숫자 } ] } ] }`;
}

export function buildUserPrompt(
  categoryProducts: CategoryProducts[],
  recipeText: string
): string {
  let productList = "제품 목록:\n";
  let idx = 1;
  for (const cat of categoryProducts) {
    productList += `\n[카테고리: ${cat.category}]\n`;
    for (const p of cat.products) {
      productList += `${idx}. ${p.name} (${p.unit})\n`;
      idx++;
    }
  }

  return `${productList}\n레시피 입력:\n${recipeText}`;
}
