import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf.js resolves its own worker file at runtime; bundling it breaks that
  // path. Keep it external so Node loads it straight from node_modules.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
