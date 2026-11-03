/**
 * 插件契约（服务端与前端共享的类型定义）
 *
 * 设计目标：第三方只需在 `plugins/` 下放一个目录 + 一个 .mjs 文件，
 * 重启即生效，不需要改本项目的任何代码，也不需要构建。
 */

/** 工具入参的声明式 schema，服务端会转成 zod 交给模型 */
export interface PluginField {
  type?: "string" | "number" | "boolean" | "enum";
  description?: string;
  /** type 为 enum 时的候选值 */
  enum?: string[];
  /** 是否可选（默认必填） */
  optional?: boolean;
}

/** 插件提供的工具：模型可自主调用 */
export interface PluginToolSpec {
  /** 全局唯一，建议带插件前缀，如 weather_query */
  name: string;
  /** 界面上展示的中文名，如「查询天气」 */
  label?: string;
  /** 给模型看的说明：什么时候该用它，越具体越好 */
  description: string;
  schema?: Record<string, PluginField>;
  /** 实际执行逻辑，返回值会作为工具结果回灌给模型 */
  run: (args: Record<string, unknown>, ctx: PluginContext) => Promise<string> | string;
}

/** 斜杠命令：在输入框里一键插入提示词 */
export interface PluginCommand {
  /** 命令名，不带斜杠，如 weather */
  name: string;
  title: string;
  hint?: string;
  /** 插入输入框的模板，{{input}} 会被替换成光标位置 */
  template: string;
}

/** 快捷提示词：不需要工具，纯提示词模板 */
export interface PluginPrompt {
  title: string;
  description?: string;
  prompt: string;
}

/** 插件定义（第三方默认导出的对象） */
export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  /** 一个 emoji 或单字符，作为插件图标 */
  icon?: string;
  version?: string;
  author?: string;
  /** 安装后是否默认启用，默认 true */
  defaultEnabled?: boolean;
  /** 追加到系统提示词的行为约定，用于「只提供提示词」的轻量插件 */
  instructions?: string;
  commands?: PluginCommand[];
  prompts?: PluginPrompt[];
  tools?: PluginToolSpec[];
}

/** 运行时传给插件的上下文 */
export interface PluginContext {
  log: (...args: unknown[]) => void;
  env: Record<string, string | undefined>;
  now: Date;
  /** 插件自身 id，便于日志区分 */
  pluginId: string;
}

/** 序列化给前端的工具摘要 */
export interface PluginToolMeta {
  name: string;
  label: string;
  description: string;
}

/** 序列化给前端的插件信息（/api/plugins 返回） */
export interface PluginMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  author: string;
  defaultEnabled: boolean;
  /** 插件目录名，方便排查 */
  dir: string;
  instructions?: string;
  commands: PluginCommand[];
  prompts: PluginPrompt[];
  tools: PluginToolMeta[];
  /** 加载/校验失败时的原因，前端会以红色标注 */
  error?: string;
}
