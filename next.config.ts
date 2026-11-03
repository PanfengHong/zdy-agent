import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF / DOCX 解析库需要在 Node 运行时按原生方式加载，不能被打包器内联
  serverExternalPackages: ["unpdf", "mammoth", "js-tiktoken"],
};

export default nextConfig;
