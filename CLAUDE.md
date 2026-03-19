# OnIS (On Individual Store)

## 프로젝트 개요
음식점 재고 관리 시스템. 여러 가게가 회원가입하여 각자의 재고/레시피/판매량을 관리하는 멀티테넌트 플랫폼.
모바일 앱 확장 예정. OKPOS POS 시스템과 Selenium 크롤링 연동 (추후).

## 기술 스택
- **Frontend + Backend**: Next.js 14 (App Router)
- **Database + Auth**: Supabase (PostgreSQL + 내장 인증)
- **UI**: Tailwind CSS + shadcn/ui
- **언어**: TypeScript
- **배포**: Vercel
- **크롤링**: Python Selenium (별도 서비스, 추후)

## 데이터베이스 스키마
```
stores (가게 정보)
├── categories (서브탭: 소스류, 야채류, 자체소스, +추가)
│   └── products (제품: 이름, 용량)
├── inventory_snapshots (일별 재고: 날짜, 제품, 수량, 잔량)
├── custom_sauce_recipes (자체소스 레시피: 소스ID, 재료ID, 용량)
├── menus (메뉴명)
│   └── menu_recipes (메뉴 레시피: 메뉴ID, 제품ID, 용량, 오차%)
├── daily_sales (일별 판매: 날짜, 메뉴ID, 수량)
└── daily_waste (일별 폐기: 날짜, 제품ID, 폐기량)
```

## 프로젝트 구조
```
pos/claude/
├── app/
│   ├── layout.tsx              # 루트 레이아웃
│   ├── page.tsx                # 랜딩/로그인 페이지
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   └── dashboard/
│       ├── layout.tsx          # 대시보드 레이아웃 (사이드바, 달력)
│       └── page.tsx            # 메인 대시보드 (6개 탭)
├── components/
│   ├── tabs/
│   │   ├── CurrentInventory.tsx    # 탭1: 현재재고
│   │   ├── CustomSauce.tsx         # 탭2: 자체소스
│   │   ├── MenuRecipe.tsx          # 탭3: 메뉴별 레시피
│   │   ├── TodaySales.tsx          # 탭4: 오늘 판매량
│   │   ├── WasteInput.tsx          # 탭5: 폐기 수량 입력
│   │   └── UpdateInventory.tsx     # 탭6: 업데이트 재고
│   ├── ui/                     # shadcn/ui 컴포넌트
│   ├── Calendar.tsx
│   └── SubTabManager.tsx
├── lib/
│   ├── supabase.ts
│   └── calculations.ts
```

## 대시보드 탭 구성 (6개)
1. **현재재고**: 서브탭(소스류/야채류/자체소스/+추가), 제품 CRUD, 달력 날짜 선택
2. **자체소스 레시피**: 탭1 자체소스 제품을 컬럼, 다른 제품을 행으로 교차 테이블
3. **메뉴별 레시피**: 메뉴 추가, 용량(g)/오차범위(%) 2컬럼
4. **오늘 판매량**: 엑셀 파일 업로드 → 레시피*수량 자동 계산
5. **폐기 수량**: 제품별 폐기량 입력 (기본 0)
6. **업데이트 재고**: 현재재고 - 판매총합 - 폐기 = 새 재고, 자체소스 자동 재생산, 오차범위 표시

## 핵심 비즈니스 로직
- 재고 업데이트: `새 재고 = 현재재고 - (레시피 × 판매량) - 폐기`
- 자체소스 초과 사용 시 자동 재생산 계산
- 오차범위 있을 시 범위 표시 (예: 133~140) → 사용자 직접 입력
- 저장 시 확인 모달 → 날짜별 스냅샷 저장

## 컨벤션
- 한국어 UI, 영어 코드
- Supabase RLS로 멀티테넌트 데이터 격리
- App Router 사용 (pages 디렉토리 X)
- 서버 컴포넌트 기본, 클라이언트 컴포넌트는 'use client' 명시

# Supabase
liam01@naver.com
Godsladk97!

# 로컬호스트 실행방법
cd C:\Users\이택기\Desktop\pos\onis-temp && npm run dev 
http://localhost:3000