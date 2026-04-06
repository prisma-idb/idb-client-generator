import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  experimental: {
    optimizePackageImports: ["lucide-react", "motion"],
  },
};

export default withMDX(config);
