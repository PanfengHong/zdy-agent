/**
 * 示例插件：计算器
 *
 * 这个文件演示了一个「带工具」的插件最少需要写什么：
 *   1. export default 一个对象
 *   2. 声明 id / name / description
 *   3. tools 里给出 name、description（模型靠它判断何时调用）和 run
 *
 * 注意：插件是运行期直接加载的 ESM 模块，所以文件后缀必须是 .mjs，
 * 也不需要 npm 依赖——想引入第三方库请在插件目录里自己装，或用宿主提供的 fetch。
 */

const ALLOWED = /^[\d+\-*/().%\s^]+$/;

/** 只允许四则运算与括号，避免把任意代码传进去执行 */
function evaluate(expression) {
  const expr = expression.trim();
  if (!expr) throw new Error("表达式为空");
  if (expr.length > 200) throw new Error("表达式过长（上限 200 字符）");
  if (!ALLOWED.test(expr)) {
    throw new Error("只支持数字、+ - * / ( ) % ^ 和空格，请检查是否混入了字母或其他符号");
  }

  // 百分号统一按「百分比」解释：1200*15% -> 1200*(15/100)
  const percent = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");
  if (percent.includes("%")) throw new Error("百分号必须紧跟在数字后面，例如 1200*15%");
  const js = percent.replace(/\^/g, "**");
  // eslint-disable-next-line no-new-func
  const value = new Function(`"use strict"; return (${js});`)();
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("计算结果不是有效数字");
  return value;
}

export default {
  id: "calculator",
  name: "计算器",
  description: "精确计算数学表达式，避免模型自己算错。支持四则运算、括号、百分比与乘方。",
  icon: "🧮",
  version: "1.0.0",
  author: "ZDY Agent 内置示例",
  defaultEnabled: true,

  commands: [
    {
      name: "calc",
      title: "数学计算",
      hint: "支持括号、百分比、^ 乘方",
      template: "帮我算一下：{{input}}，请说明计算过程。",
    },
  ],

  instructions: "遇到需要精确计算的问题时，调用 calculate 工具，不要自己心算。",

  tools: [
    {
      name: "calculate",
      label: "计算表达式",
      description:
        "计算一个数学表达式并返回结果。涉及加减乘除、百分比、乘方或带括号的运算时使用，float 误差由工具保证。",
      schema: {
        expression: {
          type: "string",
          description: "要计算的表达式，例如 (38.5+12)*3 或 1200*0.85^2，只能包含数字和 + - * / ( ) % ^",
        },
        precision: {
          type: "number",
          optional: true,
          description: "结果保留的小数位数，默认 6 位（会自动去掉末尾多余的 0）",
        },
      },
      run(args) {
        const raw = String(args.expression ?? "");
        const precision = typeof args.precision === "number" ? Math.min(Math.max(args.precision, 0), 12) : 6;
        try {
          const value = evaluate(raw);
          const text = precision === 0 ? String(Math.round(value)) : Number(value.toFixed(precision)).toString();
          return `${raw.trim()} = ${text}`;
        } catch (err) {
          return `计算失败：${err.message}。请把表达式改写为纯数学式子后重试。`;
        }
      },
    },
  ],
};
