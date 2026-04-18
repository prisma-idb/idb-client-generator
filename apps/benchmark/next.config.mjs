/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
    externalDir: true,
  },
};

export default config;
