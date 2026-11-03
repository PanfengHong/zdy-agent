/**
 * 插件脚手架（不会被加载：目录名以 _ 开头时注册表会跳过）
 *
 * 使用方法：
 *   1. 复制整个目录并改名，例如 `cp -r plugins/_template plugins/weather`
 *   2. 把下面对象的 id 改成目录名（保持一致最省心）
 *   3. 重启 npm run dev，插件会出现在「插件」页面，打开开关即可使用
 *
 * 要点：
 *   - 文件必须是 ESM（.mjs），export default 一个对象，宿主运行期直接 import，不需要构建
 *   - tools[].description 是写给模型看的，要说明「什么时候该调用」，写得越具体越准
 *   - run 的返回值会原样回灌给模型，建议返回结构化的纯文本
 *   - 需要密钥时用 process.env.XXX 读取（写在 .env.local 里），不要硬编码
 */

export default {
  id: "template",
  name: "插件模板",
  description: "复制我，改个名字就是一个新插件。",
  icon: "🧩",
  version: "0.1.0",
  author: "你的名字",
  defaultEnabled: false,

  // 追加到系统提示词，告诉模型这个插件的使用边界（可省略）
  instructions: "在使用 XXX 能力时优先调用本插件提供的工具。",

  // 输入框里的斜杠命令与快捷提示词（可省略）
  commands: [
    {
      name: "hello",
      title: "示例命令",
      hint: "在输入框里点插件按钮就能看到它",
      template: "请用一句话介绍 {{input}}。",
    },
  ],
  prompts: [
    {
      title: "示例提示词",
      description: "点击后直接填入输入框",
      prompt: "把下面的内容翻译成英文：\n\n",
    },
  ],

  // 模型可调用的工具（可省略，只做提示词插件时留空数组即可）
  tools: [
    {
      name: "template_echo",
      label: "示例工具",
      description: "把用户输入的文本原样返回，用于验证插件是否接通。",
      schema: {
        text: { type: "string", description: "要回显的文本" },
        times: { type: "number", optional: true, description: "重复次数，默认 1" },
      },
      run(args) {
        // args 已经按 schema 校验过类型；返回字符串即可
        const text = String(args.text ?? "");
        const times = typeof args.times === "number" ? Math.min(Math.max(args.times, 1), 5) : 1;
        return Array.from({ length: times }, () => text).join("\n");
      },
    },
  ],
};
