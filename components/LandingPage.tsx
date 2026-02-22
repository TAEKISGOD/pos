"use client";

import Link from "next/link";

export function LandingPage() {
  return (
    <>
      <style jsx global>{`
        .landing-body {
          font-family: 'Noto Sans KR', sans-serif;
          background: #000;
          color: #fff;
          overflow-x: hidden;
        }

        /* NAV */
        .landing-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 24px 48px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .landing-nav-logo {
          font-weight: 800;
          font-size: 22px;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #22c55e, #86efac);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .landing-nav-btn {
          padding: 10px 28px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 100px;
          color: #fff;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s;
          text-decoration: none;
        }

        .landing-nav-btn:hover {
          background: #22c55e;
          border-color: #22c55e;
          color: #000;
        }

        /* HERO */
        .landing-hero {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .landing-hero-glow {
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          filter: blur(120px);
          opacity: 0.15;
          pointer-events: none;
        }

        .landing-hero-glow.g1 {
          background: #22c55e;
          top: -200px;
          left: -100px;
          animation: landingGlowPulse 8s ease-in-out infinite;
        }

        .landing-hero-glow.g2 {
          background: #3b82f6;
          bottom: -200px;
          right: -100px;
          animation: landingGlowPulse 8s ease-in-out infinite 4s;
        }

        .landing-hero-glow.g3 {
          background: #f97316;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 400px;
          height: 400px;
          opacity: 0.08;
          animation: landingGlowPulse 6s ease-in-out infinite 2s;
        }

        @keyframes landingGlowPulse {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.3); opacity: 0.25; }
        }

        .landing-hero-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
          -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
        }

        .landing-hero-content {
          position: relative;
          z-index: 2;
          text-align: center;
          padding: 0 24px;
        }

        .landing-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 20px;
          background: rgba(34,197,94,0.1);
          border: 1px solid rgba(34,197,94,0.2);
          border-radius: 100px;
          font-size: 13px;
          color: #86efac;
          margin-bottom: 40px;
          animation: landingFadeInUp 1s ease 0.2s both;
        }

        .landing-hero-badge .dot {
          width: 6px;
          height: 6px;
          background: #22c55e;
          border-radius: 50%;
          animation: landingBlink 2s ease-in-out infinite;
        }

        @keyframes landingBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .landing-hero-title-wrap {
          animation: landingFadeInUp 1s ease 0.4s both;
        }

        .landing-hero-title {
          font-weight: 900;
          font-size: clamp(72px, 12vw, 160px);
          line-height: 0.95;
          letter-spacing: -4px;
          margin-bottom: 8px;
        }

        .landing-hero-title .on { color: #fff; }
        .landing-hero-title .is {
          background: linear-gradient(135deg, #22c55e, #4ade80, #86efac);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .landing-hero-meaning {
          font-size: clamp(16px, 2.5vw, 24px);
          font-weight: 300;
          color: rgba(255,255,255,0.35);
          letter-spacing: 8px;
          text-transform: uppercase;
          margin-top: 16px;
          margin-bottom: 48px;
          animation: landingFadeInUp 1s ease 0.6s both;
        }

        .landing-hero-meaning span { color: rgba(34,197,94,0.6); font-weight: 500; }

        .landing-hero-desc {
          max-width: 520px;
          margin: 0 auto 52px;
          font-size: 16px;
          line-height: 1.8;
          color: rgba(255,255,255,0.5);
          font-weight: 300;
          animation: landingFadeInUp 1s ease 0.8s both;
        }

        .landing-hero-cta {
          display: flex;
          gap: 16px;
          justify-content: center;
          animation: landingFadeInUp 1s ease 1s both;
        }

        .landing-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 16px 40px;
          background: #22c55e;
          color: #000;
          border: none;
          border-radius: 100px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s;
          text-decoration: none;
          box-shadow: 0 4px 30px rgba(34,197,94,0.3);
        }

        .landing-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 40px rgba(34,197,94,0.5);
        }

        .landing-btn-primary .arrow { transition: transform 0.3s; }
        .landing-btn-primary:hover .arrow { transform: translateX(4px); }

        .landing-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 16px 36px;
          background: transparent;
          color: #fff;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 100px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s;
          text-decoration: none;
        }

        .landing-btn-secondary:hover {
          background: rgba(255,255,255,0.05);
          border-color: rgba(255,255,255,0.3);
        }

        .landing-scroll-indicator {
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: rgba(255,255,255,0.2);
          font-size: 12px;
          letter-spacing: 2px;
          animation: landingFadeInUp 1s ease 1.4s both;
        }

        .landing-scroll-line {
          width: 1px;
          height: 40px;
          background: linear-gradient(to bottom, rgba(255,255,255,0.3), transparent);
          animation: landingScrollLine 2s ease-in-out infinite;
        }

        @keyframes landingScrollLine {
          0% { transform: scaleY(0); transform-origin: top; }
          50% { transform: scaleY(1); transform-origin: top; }
          51% { transform: scaleY(1); transform-origin: bottom; }
          100% { transform: scaleY(0); transform-origin: bottom; }
        }

        /* BIG TEXT */
        .landing-big-text-section {
          padding: 120px 48px;
          position: relative;
          overflow: hidden;
        }

        .landing-big-text {
          font-weight: 900;
          font-size: clamp(48px, 9vw, 140px);
          line-height: 1.05;
          letter-spacing: -3px;
          text-align: center;
          color: rgba(255,255,255,0.04);
          -webkit-text-stroke: 1px rgba(255,255,255,0.08);
        }

        .landing-big-text .highlight {
          color: rgba(255,255,255,0.9);
          -webkit-text-stroke: 0;
          text-shadow: 0 0 80px rgba(34,197,94,0.3);
        }

        /* FEATURES */
        .landing-features {
          padding: 80px 48px 120px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .landing-features-title {
          text-align: center;
          font-size: 14px;
          color: #22c55e;
          letter-spacing: 4px;
          text-transform: uppercase;
          font-weight: 500;
          margin-bottom: 60px;
        }

        .landing-features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        .landing-feature-card {
          padding: 40px 32px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px;
          transition: all 0.4s;
        }

        .landing-feature-card:hover {
          background: rgba(255,255,255,0.04);
          border-color: rgba(34,197,94,0.2);
          transform: translateY(-4px);
        }

        .landing-feature-icon { font-size: 36px; margin-bottom: 20px; }
        .landing-feature-card h3 { font-size: 20px; font-weight: 700; margin-bottom: 12px; }
        .landing-feature-card p { font-size: 14px; line-height: 1.7; color: rgba(255,255,255,0.4); font-weight: 300; }

        /* BOTTOM CTA */
        .landing-bottom-cta {
          padding: 120px 48px;
          text-align: center;
          position: relative;
        }

        .landing-bottom-cta .glow {
          position: absolute;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(34,197,94,0.12), transparent 70%);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }

        .landing-bottom-cta h2 {
          font-size: clamp(32px, 5vw, 56px);
          font-weight: 800;
          letter-spacing: -1px;
          margin-bottom: 20px;
          position: relative;
          z-index: 1;
        }

        .landing-bottom-cta p {
          color: rgba(255,255,255,0.4);
          font-size: 16px;
          margin-bottom: 40px;
          position: relative;
          z-index: 1;
        }

        .landing-bottom-cta .landing-btn-primary {
          position: relative;
          z-index: 1;
        }

        /* FOOTER */
        .landing-footer {
          padding: 40px 48px;
          border-top: 1px solid rgba(255,255,255,0.05);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .landing-footer .logo {
          font-weight: 800;
          font-size: 18px;
          color: rgba(255,255,255,0.3);
        }

        .landing-footer .copy {
          font-size: 13px;
          color: rgba(255,255,255,0.2);
        }

        @keyframes landingFadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 768px) {
          .landing-nav { padding: 16px 24px; }
          .landing-hero-title { letter-spacing: -2px; }
          .landing-hero-meaning { letter-spacing: 4px; font-size: 14px; }
          .landing-features-grid { grid-template-columns: 1fr; }
          .landing-hero-cta { flex-direction: column; align-items: center; }
          .landing-big-text-section { padding: 80px 24px; }
          .landing-features { padding: 60px 24px; }
          .landing-bottom-cta { padding: 80px 24px; }
          .landing-footer { flex-direction: column; gap: 12px; text-align: center; }
        }
      `}</style>

      <div className="landing-body">
        {/* NAV */}
        <nav className="landing-nav">
          <div className="landing-nav-logo">OnIS</div>
          <Link href="/login" className="landing-nav-btn">
            로그인
          </Link>
        </nav>

        {/* HERO */}
        <section className="landing-hero">
          <div className="landing-hero-glow g1" />
          <div className="landing-hero-glow g2" />
          <div className="landing-hero-glow g3" />
          <div className="landing-hero-grid" />

          <div className="landing-hero-content">
            <div className="landing-hero-badge">
              <span className="dot" />
              프라이빗 재고 관리의 새로운 기준
            </div>

            <div className="landing-hero-title-wrap">
              <h1 className="landing-hero-title">
                <span className="on">On</span>
                <span className="is">IS</span>
              </h1>
            </div>

            <p className="landing-hero-meaning">
              <span>O</span>n <span>I</span>ndividual <span>S</span>tore
            </p>

            <p className="landing-hero-desc">
              카페, 음식점, 바 등 나만의 매장에 맞춘 스마트 재고 관리.<br />
              레시피 기반 자동 계산, 실시간 재고 추적,<br />
              그리고 데이터로 보는 내 가게의 모든 것.
            </p>

            <div className="landing-hero-cta">
              <Link href="/login" className="landing-btn-primary">
                로그인
                <span className="arrow">&rarr;</span>
              </Link>
              <a href="#features" className="landing-btn-secondary">
                더 알아보기
              </a>
            </div>
          </div>

          <div className="landing-scroll-indicator">
            <div className="landing-scroll-line" />
            SCROLL
          </div>
        </section>

        {/* BIG TEXT */}
        <section className="landing-big-text-section">
          <div className="landing-big-text">
            INVENTORY<br />
            <span className="highlight">MANAGEMENT</span><br />
            REIMAGINED
          </div>
        </section>

        {/* FEATURES */}
        <section className="landing-features" id="features">
          <div className="landing-features-title">What We Offer</div>
          <div className="landing-features-grid">
            <div className="landing-feature-card">
              <div className="landing-feature-icon">📦</div>
              <h3>스마트 재고 추적</h3>
              <p>레시피와 판매량을 기반으로 재고를 자동 계산합니다. 수작업은 이제 그만.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-icon">🍳</div>
              <h3>레시피 관리</h3>
              <p>메뉴별 레시피를 등록하면 판매 시 자동으로 재료가 차감됩니다.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-icon">📊</div>
              <h3>데이터 분석</h3>
              <p>판매 추이, 폐기량, 재고 현황을 한눈에. 데이터 기반 의사결정을 도와드립니다.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-icon">🔄</div>
              <h3>자체소스 자동 계산</h3>
              <p>커스텀 소스 레시피를 등록하면 재료 소모량까지 자동으로 반영됩니다.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-icon">🏪</div>
              <h3>멀티 매장 지원</h3>
              <p>여러 매장을 운영해도 걱정 없이. 각 매장별 독립적 재고 관리가 가능합니다.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-icon">🔗</div>
              <h3>POS 연동</h3>
              <p>POS 시스템과 연동하여 판매 데이터를 자동으로 가져옵니다.</p>
            </div>
          </div>
        </section>

        {/* BOTTOM CTA */}
        <section className="landing-bottom-cta">
          <div className="glow" />
          <h2>내 매장의 재고,<br />이제 똑똑하게 관리하세요</h2>
          <p>무료로 시작하고, 매장에 맞게 확장하세요.</p>
          <Link href="/login" className="landing-btn-primary">
            로그인하기
            <span className="arrow">&rarr;</span>
          </Link>
        </section>

        {/* FOOTER */}
        <footer className="landing-footer">
          <div className="logo">OnIS</div>
          <div className="copy">&copy; 2026 OnIS. All rights reserved.</div>
        </footer>
      </div>
    </>
  );
}
