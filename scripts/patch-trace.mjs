/**
 * 给 Next.js 的 trace 遥测写入加上错误兜底。
 *
 * 背景：部分 Windows 环境（杀软/过滤驱动）会对 `.next/trace` 的追加写返回 EPERM，
 * Next 内部没有给这个流挂 error 监听，导致整个构建直接 uncaughtException 崩溃。
 * trace 只是性能遥测数据，写入失败完全不影响产物，所以这里幂等地注入一个监听。
 *
 * 由 package.json 的 prebuild 钩子自动执行；npm install 后重装依赖也会再次生效。
 */
import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "node_modules", "next", "dist", "trace", "report", "to-json.js");
const MARK = "__ZDY_TRACE_SAFE__";
const ANCHOR = "this.writeStream = _fs.default.createWriteStream(this.file, writeStreamOptions);";
const INJECT =
  `${ANCHOR} /* ${MARK} */ this.writeStream.on('error', function (traceErr) { ` +
  `console.warn('[next-trace] 遥测写入被跳过（不影响构建）:', traceErr.code); });`;

if (!fs.existsSync(target)) {
  console.log("[patch-trace] 未找到 Next trace 模块，跳过");
  process.exit(0);
}

const source = fs.readFileSync(target, "utf8");
if (source.includes(MARK)) {
  console.log("[patch-trace] 已打过补丁，跳过");
  process.exit(0);
}
if (!source.includes(ANCHOR)) {
  console.log("[patch-trace] Next 版本已变化，未找到注入点，跳过");
  process.exit(0);
}

fs.writeFileSync(target, source.replace(ANCHOR, INJECT));
console.log("[patch-trace] 已为 .next/trace 写入加上错误兜底");
