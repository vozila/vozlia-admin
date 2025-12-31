/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // IMPORTANT: Prevent Vercel/Next build from failing due to ESLint.
  // Run `npm run lint` separately in CI/local instead.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
