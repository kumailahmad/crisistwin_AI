/** @type {import('next').NextConfig} */
const nextConfig = (phase) => ({
  distDir: phase === "phase-development-server" ? ".next-dev" : ".next",
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
});

export default nextConfig;
