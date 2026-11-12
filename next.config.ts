import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 部署用：构建产物自包含（含精简 node_modules 与 server.js），镜像体积大幅缩小
  output: "standalone",
  // PDF / DOCX 解析库需要在 Node 运行时按原生方式加载，不能被打包器内联
  serverExternalPackages: ["unpdf", "mammoth", "js-tiktoken"],
};

export default nextConfig;
