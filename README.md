# ZDY Agent · LangChain + TypeScript 知识库智能体

一个可直接运行的全栈 AI Agent 脚手架：**Next.js 15（App Router）+ LangChain.js + 本地向量检索（RAG）**。
包含流式对话界面、工具调用可视化、知识库管理页、命令行批量建索引，以及一个离线自测用的 Mock 模型服务。

## 功能一览

| 能力 | 说明 |
| --- | --- |
| 流式对话 | SSE 逐字输出，支持中途停止、回答完成状态条 |
| 多轮会话 | 侧边栏「新建对话」+ 最近对话列表，历史自动保存在浏览器本地（旧版单会话数据自动迁移） |
| 全局搜索 | 侧边栏搜索按钮或 `Ctrl/⌘ + K` 唤起居中弹窗，同时搜历史对话（标题+正文全文，带片段预览与关键词高亮）和知识库文档名 |
| 个人中心 | 侧边栏底部头像 + 昵称/邮箱，下拉菜单：个人设置（改昵称/邮箱）、知识库管理、退出登录（带确认） |
| Agent 工具调用 | `search_knowledge_base` / `list_knowledge_base`，最多 5 轮推理循环 |
| RAG 检索 | 文档解析 → 中文友好切分 → 向量化 → 余弦检索 → 引用标注 |
| 引用溯源 | 回答下方列出命中片段：来源文件、片段序号、相关度、原文预览 |
| 完成状态条 | 回答结束显示「已生成完成 / 已停止生成」与用时；一键复制（含引用来源）、重新生成 |
| 插件机制 | `plugins/` 目录即插即用：给模型加工具、给输入框加斜杠命令、沉淀提示词模板；插件页管理开关 |
| 知识库管理 | 拖拽上传 PDF / DOCX / MD / TXT / CSV / JSON / HTML，同名重建索引，可删除 |
| 多模型 | 任何 OpenAI 兼容接口（DeepSeek / 通义 / Kimi / 智谱 / 硅基流动 / Ollama）改环境变量即可 |

## 目录结构

```
app/
  page.tsx                 对话页
  knowledge/page.tsx       知识库管理页
  plugins/page.tsx         插件管理页
  api/chat/route.ts        POST 流式对话（SSE）
  api/documents/route.ts   GET 列表 / POST 上传 / DELETE 删除
  api/health/route.ts      配置状态与知识库统计
  api/plugins/route.ts     插件清单（?reload=1 强制重扫）
components/
  chat/                    对话界面（消息、工具轨迹、引用、输入框）
  knowledge/               知识库面板
  plugins/                 插件面板
lib/
  agent/runtime.ts         Agent 主循环：模型 → 工具 → 模型，事件流输出
  agent/tools.ts           LangChain tool 定义（每次请求创建，带回传状态）
  plugins/registry.ts      插件发现 / 校验 / 转 LangChain 工具
  plugins/client.ts        插件清单缓存与启用开关（localStorage）
  rag/loader.ts            PDF / DOCX / 文本解析与清洗
  rag/splitter.ts          中文递归切分（段落 → 句号 → 逗号 → 硬切）
  rag/ingest.ts            单文件摄取流水线（含批量向量化与重试）
  rag/retriever.ts         检索、阈值过滤、去重
  vectorstore/FileVectorStore.ts  零依赖本地向量库（VectorStore 抽象实现）
  store/registry.ts        文档元数据注册表
  conversations.ts         会话列表与历史消息的本地存储（localStorage 分片）
  llm.ts / config.ts       模型工厂与配置
plugins/                    插件目录（内置 3 个示例 + 1 个脚手架）
  calculator/               计算器：模型可调用的 calculate 工具
  datetime/                 时间助手：current_datetime 工具
  meeting-notes/            会议纪要：纯提示词插件（无工具）
  _template/                脚手架模板（_ 开头不会被加载）
scripts/
  ingest.ts                CLI 批量建索引（扫描 .data/docs）
  mock-openai-server.mjs   离线自测用的 Mock OpenAI 服务
  patch-trace.mjs          prebuild 钩子：兜底 Windows 下 .next/trace 的 EPERM
.data/
  docs/                    放置待导入的文档（含一份示例）
  index/                   向量索引与元数据（运行后生成）
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置密钥：注意必须复制成 .env.local，直接改 .env.example 不会生效
cp .env.example .env.local   # 填入 OPENAI_API_KEY 等（见下文）

# 3. 自检（强烈推荐）：一次性验证密钥、模型名、工具调用能力和本地索引
npm run doctor

# 4. 启动
npm run dev                  # http://localhost:3000
```

打开「知识库管理」上传文档（`.data/docs` 里已放了一份示例手册），然后回到对话页提问（点侧边栏顶部 Logo）。
也可以命令行批量导入：

```bash
# 把文件放进 .data/docs 后
npm run ingest
```

没有 API Key 也能验证整条链路：

```bash
node scripts/mock-openai-server.mjs   # 终端 1：Mock 模型（127.0.0.1:7391）
# 终端 2：
OPENAI_API_KEY=mock OPENAI_BASE_URL=http://127.0.0.1:7391/v1 CHAT_MODEL=mock-model \
EMBEDDING_API_KEY=mock EMBEDDING_BASE_URL=http://127.0.0.1:7391/v1 EMBEDDING_MODEL=mock-embed \
npm run dev
```

## 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 对话模型密钥 | 必填 |
| `OPENAI_BASE_URL` | OpenAI 兼容地址 | `https://api.deepseek.com/v1` |
| `CHAT_MODEL` | 对话模型名（需支持 Function Calling） | `deepseek-chat` |
| `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` | 向量化模型；Key 和地址留空则复用上面的值，模型名留空时按地址自动推断 | 自动推断 |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | 切分窗口 / 重叠字符数 | `800` / `120` |
| `RETRIEVAL_TOP_K` / `RETRIEVAL_MIN_SCORE` | 召回条数 / 余弦阈值 | `5` / `0.25` |
| `DATA_DIR` | 数据目录 | `./.data` |

常用组合：

| 服务 | BASE_URL | 模型 |
| --- | --- | --- |
| DeepSeek（对话） | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 硅基流动（Embedding） | `https://api.siliconflow.cn/v1` | `BAAI/bge-m3` |
| 阿里百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` + `text-embedding-v3` |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-plus` + `embedding-3` |
| Ollama 本地 | `http://localhost:11434/v1` | `qwen2.5:7b` + `nomic-embed-text` |

> 注意：**DeepSeek 没有 embedding 接口**，向量化需要单独指向上面任一支持 embedding 的服务。

## 工作原理

**对话链路**（`lib/agent/runtime.ts`）：

```
用户消息 → 组装 System Prompt + 历史
   └─ 循环（最多 5 步）
        ├─ ChatOpenAI.bindTools(tools).stream() 逐字输出 delta
        ├─ 无工具调用 → 结束
        └─ 有 tool_calls → 执行工具 → ToolMessage 回填 → 进入下一轮
最后把本次检索命中的片段作为 sources 事件推给前端
```

System Prompt 约定了三条硬规则：内部问题必须先检索、检索不到要明说而不是编造、引用必须带 `[1]` `[2]` 角标。

**RAG 链路**（`lib/rag/`）：

```
文件 → 解析(unpdf/mammoth/文本) → 清洗 → 中文递归切分(800/120)
     → OpenAIEmbeddings 批量向量化(32/批, 3 次重试) → L2 归一化入库
检索：查询向量化 → 点积(=余弦) → 阈值过滤 → 去重 → Top-K
```

**本地向量库**（`lib/vectorstore/FileVectorStore.ts`）：索引常驻内存 + JSON 原子写（tmp + rename）+ 写入串行队列。
几千到几万个片段毫秒级检索，零外部依赖。超过 10 万片段或需要多实例共享时再换 pgvector / LanceDB —— 调用方只依赖 `VectorStore` 抽象，替换点只在 `lib/llm.ts` 的工厂函数。

## 插件机制

第三方扩展不需要改本项目代码，也不需要重新构建：在 `plugins/` 下放一个目录（内含 `index.mjs`），重启 dev 后即出现在「插件」页面，打开开关就能用。目录名以 `_` 或 `.` 开头的会被跳过（`_template` 是脚手架模板）。

每个插件可以声明三类能力，按需组合：

| 能力 | 字段 | 效果 |
| --- | --- | --- |
| 模型工具 | `tools[]` | 模型可自主调用的函数（自动转成 zod schema 参与 Function Calling），调用过程显示在回答上方的轨迹里 |
| 斜杠命令 | `commands[]` | 输入框点插件按钮（或输入 `/`）可见，一键填入模板；选中后本次提问会优先使用该插件 |
| 快捷提示词 | `prompts[]` | 同样出现在插件菜单里，点击填入输入框 |
| 行为约定 | `instructions` | 追加到 System Prompt，告诉模型什么时候该用这个插件 |

最小示例（完整字段见 `plugins/_template/index.mjs`）：

```js
// plugins/my-plugin/index.mjs —— ESM，丢进目录重启即生效
export default {
  id: "my-plugin",
  name: "我的插件",
  description: "一句话说明它能干什么",
  tools: [
    {
      name: "my_tool",                       // 全局唯一，建议带插件前缀
      description: "写给模型看：什么时候该调用它",
      schema: { text: { type: "string", description: "入参说明" } },
      run: async ({ text }) => `收到：${text}`,   // 返回值会回灌给模型
    },
  ],
};
```

加载规则与安全边界：

- `lib/plugins/registry.ts` 在运行期动态 import 插件文件，逐个校验（id 合法性、工具名唯一、run 是函数）；**加载失败只影响该插件本身**，会以红色标注在插件页，不会拖垮应用
- 插件工具与内置工具重名时，内置优先；启用的插件会把工具说明自动拼进 System Prompt
- 启用状态存在浏览器 localStorage（`zdy:plugins:v1`），随每次 `/api/chat` 请求下发（`plugins` / `focusPlugin` 字段），服务端不保存状态
- 插件是宿主进程内运行的真实代码，`run` 里能访问 `process.env` 与网络——只安装可信来源的插件；需要密钥时写在 `.env.local`，不要硬编码
- 生产环境插件模块会缓存，改插件后重启进程；开发环境按文件 mtime 自动重载，也可以在插件页点「重新扫描」

## HTTP 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/chat` | `{ messages, plugins?, focusPlugin? }` → SSE 事件流（`delta` / `tool_start` / `tool_end` / `sources` / `done` / `error`）；`plugins` 是启用的插件 id 列表，`focusPlugin` 是本次点选的插件 |
| GET | `/api/documents` | 文档列表 + 统计 |
| POST | `/api/documents` | `multipart/form-data`，字段 `files`，多文件 |
| DELETE | `/api/documents?id=` | 删除文档及其向量 |
| GET | `/api/plugins` | 插件清单（`?reload=1` 强制重扫磁盘） |
| GET | `/api/health` | 配置状态、知识库统计 |

## 生产部署

```bash
npm run build && npm start        # 或部署到 Vercel / Docker
```

- `.data` 目录必须挂载持久卷，否则重启丢索引。
- 多实例部署时把 `FileVectorStore` 换成 pgvector（同一台 PG 还能存 `documents.json` 的元数据）。

## 常见问题

**填了 API Key 还是报「未配置密钥」**
最常见的坑：把密钥写进了 `.env.example`。Next.js **只加载** `.env.local` / `.env` / `.env.development(.local)`，不加载 `.env.example`。请复制该文件为 `.env.local` 再填值，并重启 `npm run dev`。跑一遍 `npm run doctor` 可以立刻确认配置是否被读到。

**智谱 / 任何平台返回 401「令牌已过期或验证不正确」**
先跑 `npm run doctor`，它会打印当前使用的 Key（脱敏）。注意智谱的 API Key 形如 `{id}.{secret}`（中间有一个点，总长约 49 字符）；如果拿到的密钥只有一段，多半是只复制了一半或拿错了平台的 Key，去智谱开放平台重新复制完整 Key。

**向量模型报错「模型不存在」或 404**
各平台的 embedding 模型名不通用：智谱是 `embedding-3`，硅基流动是 `BAAI/bge-m3`，百炼是 `text-embedding-v3`。`EMBEDDING_MODEL` 留空时会按 BASE_URL 自动推断，推荐直接留空。

**对话报「未配置 OPENAI_API_KEY」**
环境变量是启动时读取的，改完 `.env.local` 必须**重启** `npm run dev`。首页底部的黄色提示条会给出具体缺什么。

**`npm run build` 报 `EPERM ... .next/trace`（Windows）**
`npm run build` 已内置 prebuild 补丁（`scripts/patch-trace.mjs`）把该遥测写入错误降级为警告；若手动直连 `next build` 仍遇到，属杀软/过滤驱动拦截，重跑 `npm run build` 即可，与业务代码无关。

**插件没有出现在列表里 / 显示「加载失败」**
确认目录在 `plugins/` 下且文件名为 `index.mjs`（ESM 语法，不能用 TypeScript 注解）、目录名不以 `_` 开头；插件页点「重新扫描」后查看红色错误信息即可定位（缺 id / 缺 description / run 不是函数都会给出行内提示）。

**换 embedding 模型后检索报「向量维度不一致」**
不同模型维度不同。删除 `.data/index` 目录，重新上传或 `npm run ingest`。

**对话历史存在哪里？清浏览器数据会丢吗？**
存在浏览器的 localStorage（索引 `zdy:conversations:v1`，正文按会话分片 `zdy:conv:<id>`，上限 60 个会话）。清理浏览器数据会删除历史；换浏览器 / 换设备不共享。需要跨设备时再上服务端存储（见「下一步」）。

**「退出登录」是真的登录系统吗？**
目前是本地演示账号：昵称 / 邮箱保存在 localStorage（`zdy:profile:v1`），退出登录只清除本机登录状态，不影响历史对话。接入真实鉴权时把 `lib/profile.ts` 的几个函数替换成 NextAuth / Clerk / 自建接口即可，`components/UserMenu.tsx` 无需改动。

**扫描版 PDF 解析出很少文本**
unpdf 只能提取文本层。扫描件需要 OCR（可接 PaddleOCR / 云 OCR 后在 `lib/rag/loader.ts` 扩展一个分支）。

## 下一步可以做什么

- 服务端会话记忆（PostgreSQL + `UpstashRedis` / 自建 session 表，实现跨设备同步）
- 混合检索（向量 + BM25）与 Rerank 重排（bge-reranker）
- 文档级权限过滤（`FileVectorStore` 已支持 metadata filter，传入 `{ userId }` 即可按人过滤）
- 流式结构化输出、MCP 工具接入（可做成一个「MCP 桥」插件，把远端 MCP 服务的工具映射成本地插件工具）、Eval 评测集
