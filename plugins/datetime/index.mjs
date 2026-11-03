/**
 * 示例插件：时间与日期
 *
 * 演示两件事：
 *   - 插件可以读取宿主的 env（这里用 TZ 作为默认时区）
 *   - 一个工具可以带多个可选参数（enum / number / string），宿主会自动转成模型能懂的 schema
 */

const DEFAULT_TZ = process.env.TZ || "Asia/Shanghai";

function fmt(date, timeZone, opts) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone, ...opts }).format(date);
}

export default {
  id: "datetime",
  name: "时间助手",
  description: "获取当前日期时间、星期、时区换算，以及「N 天前后是几号」这类日期推算。",
  icon: "🕒",
  version: "1.0.0",
  author: "ZDY Agent 内置示例",
  defaultEnabled: true,

  commands: [
    {
      name: "time",
      title: "当前时间",
      hint: "含星期与时区",
      template: "现在是几点？请给出完整日期、星期和时区。",
    },
    {
      name: "days",
      title: "日期推算",
      hint: "例如 30 天后是几号",
      template: "请帮我推算：{{input}}，并说明推算依据。",
    },
  ],

  instructions:
    "涉及“今天”“现在”“几号”“几天后”“截止日期还剩多少天”这类问题，先调用 current_datetime 拿到准确时间，不要凭训练数据猜测。",

  tools: [
    {
      name: "current_datetime",
      label: "获取当前时间",
      description:
        "获取指定时区的当前日期与时间。任何需要“今天日期”“现在几点”“某日期前后 N 天”的问题都应先调用它。",
      schema: {
        timeZone: {
          type: "string",
          optional: true,
          description: `IANA 时区名，如 Asia/Shanghai、America/New_York，默认 ${DEFAULT_TZ}`,
        },
        offsetDays: {
          type: "number",
          optional: true,
          description: "相对今天的天数偏移，正数为之后、负数为之前，例如 30 表示 30 天后",
        },
        detail: {
          type: "enum",
          enum: ["date", "time", "full", "weekday"],
          optional: true,
          description: "返回粒度：date 只有日期，time 只有时间，full 完整（默认），weekday 只看星期",
        },
      },
      run(args) {
        const timeZone = (args.timeZone && String(args.timeZone).trim()) || DEFAULT_TZ;
        const offset = typeof args.offsetDays === "number" ? Math.trunc(args.offsetDays) : 0;
        const detail = String(args.detail || "full");

        const base = new Date(Date.now() + offset * 86_400_000);
        try {
          new Intl.DateTimeFormat("zh-CN", { timeZone });
        } catch {
          return `时区「${timeZone}」无法识别，请传入 IANA 时区名，例如 Asia/Shanghai。`;
        }

        const date = fmt(base, timeZone, { year: "numeric", month: "2-digit", day: "2-digit" });
        const time = fmt(base, timeZone, { hour: "2-digit", minute: "2-digit", hour12: false });
        const week = fmt(base, timeZone, { weekday: "long" });
        const stamp = `${date} ${time}`;

        const lines = [`时区：${timeZone}`];
        if (detail === "date") lines.push(`日期：${date}`);
        else if (detail === "time") lines.push(`时间：${time}`);
        else if (detail === "weekday") lines.push(`星期：${week}（${date}）`);
        else lines.push(`当前时间：${stamp} ${week}`);

        if (offset !== 0) {
          lines.push(`相对今天偏移 ${offset} 天，推算结果：${date} ${week}`);
        }
        lines.push(`ISO 时间戳：${base.toISOString()}`);
        return lines.join("\n");
      },
    },
  ],
};
