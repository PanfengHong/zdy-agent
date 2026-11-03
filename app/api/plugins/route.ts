import { listPluginMetas, loadPlugins, pluginRoot } from "@/lib/plugins/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 插件清单（前端侧边栏、插件页、输入框菜单共用）
 * ?reload=1 强制重新扫描磁盘，改完插件后无需重启服务
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("reload") === "1") {
    await loadPlugins(true);
  }
  const plugins = await listPluginMetas();
  return Response.json(
    {
      plugins,
      dir: pluginRoot().replace(process.cwd(), ".").replace(/\\/g, "/"),
      enabledCount: plugins.filter((p) => !p.error && p.defaultEnabled).length,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
