-- 선택한 날짜에 스냅샷이 없으면 그 이전 가장 최근 스냅샷을 반환한다.
-- (마감을 며칠 건너뛰어도 재고가 0으로 리셋되지 않도록 하기 위한 조회 함수)
--
-- inventory_snapshots 의 UNIQUE(product_id, date) 인덱스를 그대로 타므로
-- DISTINCT ON 이 인덱스 스캔으로 처리된다.
--
-- security invoker → 호출한 사용자의 권한으로 실행되어 기존 RLS 정책이 그대로 적용된다.

create or replace function public.inventory_as_of(
  p_product_ids uuid[],
  p_date date
)
returns table (
  product_id uuid,
  remaining numeric,
  snapshot_date date
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (s.product_id)
         s.product_id,
         s.remaining,
         s.date as snapshot_date
  from public.inventory_snapshots s
  where s.product_id = any(p_product_ids)
    and s.date <= p_date
  order by s.product_id, s.date desc
$$;

grant execute on function public.inventory_as_of(uuid[], date) to authenticated;
