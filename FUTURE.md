# 배포 시 체크리스트

## 1. Authentication
- [ ] Supabase Dashboard → Authentication → Providers → Email → "Confirm email" ON으로 변경
- [ ] Supabase redirect URL을 실제 도메인으로 변경 (현재 localhost)

## 2. 환경변수
- [ ] Vercel 등 배포 환경에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 설정

## 3. 모바일 앱
- [ ] React Native 등으로 앱 확장 (Supabase 백엔드 재사용)
