# 多阶段构建：deps（装依赖）→ builder（next build）→ runner（standalone 精简运行）
# 基础镜像可覆盖：Docker Hub 直连失败时用国内镜像源构建，
#   docker compose build --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine

# ==== 参数（不传则用官方镜像名）====
ARG NODE_IMAGE=node:22-alpine

# ---------- 1. 依赖 ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2. 构建 ----------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# patch-trace 是为 Windows .next/trace EPERM 准备的兜底，Linux 上幂等无害
RUN node scripts/patch-trace.mjs && npm run build

# ---------- 3. 运行 ----------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/.data

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001

# standalone 产物自带精简 node_modules 与 server.js
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# 插件目录在运行时按 cwd/plugins 动态扫描，必须随镜像携带
COPY --from=builder /app/plugins ./plugins

RUN mkdir -p /app/.data && chown -R nextjs:nodejs /app/.data /app/plugins
USER nextjs

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
