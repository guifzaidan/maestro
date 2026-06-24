import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (silences the multi-lockfile warning).
  turbopack: {
    root: path.resolve(__dirname),
  },
  // exceljs/docx são server-only (geração de artefatos) — não bundlar.
  serverExternalPackages: ["exceljs", "docx"],
};

export default nextConfig;
