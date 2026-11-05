/** @type {import('next').NextConfig} */
// 브라우저는 같은 출처의 /backend/* 로 요청하고, Next.js 가 FastAPI 서버로 전달합니다. (CORS 설정 불필요)
// 배포 시에는 BACKEND_URL 환경변수에 별도로 배포한 FastAPI 주소를 지정하세요.
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${BACKEND_URL}/:path*` }];
  },
};
export default nextConfig;
