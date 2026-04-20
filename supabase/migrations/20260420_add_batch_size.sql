-- 자체소스 배합(batch) 시스템: products 테이블에 batch_size 추가
-- 자체소스 제품만 이 값을 설정 (예: 100배합)
-- 일반 제품은 default 1 → 기존 로직에 영향 없음
ALTER TABLE products ADD COLUMN IF NOT EXISTS batch_size INTEGER DEFAULT 1;
