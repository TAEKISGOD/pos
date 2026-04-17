-- Drop the deprecated 'quantity' column from inventory_snapshots.
-- Previously: 현재재고 = 용량 × 수량 + 잔량
-- Now: 현재재고 = remaining (잔량 = 총 재고량 g)
ALTER TABLE inventory_snapshots DROP COLUMN IF EXISTS quantity;
