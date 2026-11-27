/** @type {import('next').NextConfig} */
const nextConfig = (phase) => ({
  distDir: phase === "phase-development-server" ? ".next-dev" : ".next",
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
});

export default nextConfig;
