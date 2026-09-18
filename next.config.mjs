/** @type {import('next').NextConfig} */
const nextConfig = {
  // dev 서버와 프로덕션 빌드가 같은 .next 폴더를 공유하면
  // 빌드가 dev 서버의 static 청크를 덮어써서 화면이 깨진다(청크 404).
  // 로컬 검증 빌드는 NEXT_DIST_DIR 로 별도 폴더를 쓰게 한다.
  // (Vercel 등 배포 환경에서는 이 값이 없으므로 기존과 동일하게 .next 사용)
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
