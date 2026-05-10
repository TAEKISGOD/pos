-- daily_sauce_productions (일별 자체소스 생산)
-- mode: 'batch' (배합 수 기준) | 'stock' (한정 재료 기준)
-- batch 모드: batch_count 사용 (소수점 가능)
-- stock 모드: ingredient_id + ingredient_amount 사용 (그 재료 사용량 기준으로 비율 계산)

CREATE TABLE IF NOT EXISTS daily_sauce_productions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sauce_product_id uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  mode text NOT NULL CHECK (mode IN ('batch', 'stock')),
  batch_count numeric DEFAULT 0,
  ingredient_id uuid REFERENCES products(id) ON DELETE SET NULL,
  ingredient_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_sauce_productions_sauce_date_idx
  ON daily_sauce_productions (sauce_product_id, date);

ALTER TABLE daily_sauce_productions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sauce_prod_insert" ON daily_sauce_productions;
DROP POLICY IF EXISTS "sauce_prod_select" ON daily_sauce_productions;
DROP POLICY IF EXISTS "sauce_prod_update" ON daily_sauce_productions;
DROP POLICY IF EXISTS "sauce_prod_delete" ON daily_sauce_productions;

CREATE POLICY "sauce_prod_insert" ON daily_sauce_productions FOR INSERT WITH CHECK
  (sauce_product_id IN (SELECT p.id FROM products p JOIN categories c ON p.category_id = c.id JOIN stores s ON c.store_id = s.id WHERE s.user_id = auth.uid()));
CREATE POLICY "sauce_prod_select" ON daily_sauce_productions FOR SELECT USING
  (sauce_product_id IN (SELECT p.id FROM products p JOIN categories c ON p.category_id = c.id JOIN stores s ON c.store_id = s.id WHERE s.user_id = auth.uid()));
CREATE POLICY "sauce_prod_update" ON daily_sauce_productions FOR UPDATE USING
  (sauce_product_id IN (SELECT p.id FROM products p JOIN categories c ON p.category_id = c.id JOIN stores s ON c.store_id = s.id WHERE s.user_id = auth.uid()));
CREATE POLICY "sauce_prod_delete" ON daily_sauce_productions FOR DELETE USING
  (sauce_product_id IN (SELECT p.id FROM products p JOIN categories c ON p.category_id = c.id JOIN stores s ON c.store_id = s.id WHERE s.user_id = auth.uid()));
