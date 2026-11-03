"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isPluginEnabled, resetPluginPrefs, setPluginDraft, setPluginEnabled, usePlugins } from "@/lib/plugins/client";
import type { PluginMeta } from "@/lib/plugins/types";

const SAMPLE = `// plugins/my-plugin/index.mjs  —— 丢进目录，重启即生效
export default {
  id: "my-plugin",
  name: "我的插件",
  description: "一句话说明它能干什么",
  icon: "🚀",
  defaultEnabled: true,
  instructions: "告诉模型什么时候该用它",   // 可选
  commands: [                              // 可选：输入框快捷入口
    { name: "run", title: "执行", template: "帮我处理：{{input}}" },
  ],
  tools: [                                 // 可选：模型可调用的工具
    {
      name: "my_tool",
      description: "什么时候该调用它（写给模型看）",
      schema: { text: { type: "string", description: "入参说明" } },
      run: async ({ text }) => \`收到：\${text}\`,
    },
  ],
};`;

export function PluginPanel() {
  const { plugins, loading, error, reload } = usePlugins();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const usable = plugins.filter((p) => !p.error);
  const stats = {
    total: plugins.length,
    enabled: usable.filter((p) => isPluginEnabled(p)).length,
    tools: usable.reduce((n, p) => n + p.tools.length, 0),
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const rescan = async () => {
    setBusy(true);
    try {
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const useCommand = (plugin: PluginMeta, template: string) => {
    setPluginDraft({ pluginId: plugin.id, template });
    router.push("/");
  };

  return (
    <div className="page">
      <div className="page-inner">
        <header>
          <h1 className="page-title">插件</h1>
          <p className="page-desc">
            插件用来给 ZDY Agent 加能力：把一个小目录放进 <code className="inline-code">plugins/</code>，就能提供模型可调用的工具、
            输入框里的斜杠命令，或者一套固定的提示词模板——不需要改本项目任何代码，也不需要重新构建。
          </p>
        </header>

        <div className="stat-row">
          <div className="stat">
            <div className="stat-label">已安装插件</div>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat">
            <div className="stat-label">已启用</div>
            <div className="stat-value">{stats.enabled}</div>
          </div>
          <div className="stat">
            <div className="stat-label">可用工具</div>
            <div className="stat-value">{stats.tools}</div>
          </div>
        </div>

        <div className="plugin-bar">
          <span className="plugin-bar-text">
            {loading ? "正在扫描插件目录…" : error ? `读取失败：${error}` : `扫描目录 plugins/ · 修改插件后点右侧重新扫描即可，无需重启`}
          </span>
          <div className="plugin-bar-actions">
            <button type="button" className="btn-ghost" onClick={rescan} disabled={busy || loading}>
              {busy ? "扫描中…" : "重新扫描"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                resetPluginPrefs();
                void rescan();
              }}
              disabled={busy}
            >
              恢复默认
            </button>
          </div>
        </div>

        <div className="plugin-grid">
          {plugins.length === 0 && !loading ? (
            <div className="plugin-empty">没有发现插件。往 plugins/ 下放一个目录就会出现在这里。</div>
          ) : null}

          {plugins.map((p) => {
            const on = isPluginEnabled(p);
            const open = expanded.includes(p.id);
            return (
              <section key={p.id} className={`plugin-card${p.error ? " broken" : ""}${on ? " on" : ""}`}>
                <div className="plugin-head">
                  <div className="plugin-icon">{p.icon}</div>
                  <div className="plugin-title">
                    <div className="plugin-name-row">
                      <h3>{p.name}</h3>
                      <span className="plugin-ver">v{p.version}</span>
                      {p.error ? <span className="plugin-tag danger">加载失败</span> : null}
                    </div>
                    <p className="plugin-desc">{p.description}</p>
                    <div className="plugin-meta">
                      <span>{p.author}</span>
                      {p.tools.length > 0 ? <span>{p.tools.length} 个工具</span> : null}
                      {p.commands.length > 0 ? <span>{p.commands.length} 个命令</span> : null}
                      {p.prompts.length > 0 ? <span>{p.prompts.length} 个提示词</span> : null}
                      <span className="plugin-dir">plugins/{p.dir}</span>
                    </div>
                  </div>
                  <div className="plugin-actions">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${on ? "停用" : "启用"}${p.name}`}
                      className={`switch${on ? " on" : ""}`}
                      disabled={Boolean(p.error)}
                      onClick={() => setPluginEnabled(p.id, !on)}
                    >
                      <span className="switch-dot" />
                    </button>
                    {!p.error ? (
                      <button type="button" className="plugin-more" onClick={() => toggleExpand(p.id)}>
                        {open ? "收起" : "详情"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {p.error ? <div className="plugin-error">无法加载：{p.error}</div> : null}

                {open && !p.error ? (
                  <div className="plugin-body">
                    {p.tools.length > 0 ? (
                      <div className="plugin-section">
                        <div className="plugin-section-title">模型可调用的工具</div>
                        {p.tools.map((t) => (
                          <div className="plugin-tool" key={t.name}>
                            <code>{t.name}</code>
                            <strong>{t.label}</strong>
                            <span>{t.description}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {p.commands.length > 0 ? (
                      <div className="plugin-section">
                        <div className="plugin-section-title">输入框斜杠命令</div>
                        {p.commands.map((c) => (
                          <div className="plugin-cmd" key={c.name}>
                            <code>/{c.name}</code>
                            <strong>{c.title}</strong>
                            <span>{c.hint}</span>
                            <button type="button" onClick={() => useCommand(p, c.template)}>
                              用这个
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {p.prompts.length > 0 ? (
                      <div className="plugin-section">
                        <div className="plugin-section-title">快捷提示词</div>
                        {p.prompts.map((t) => (
                          <div className="plugin-cmd" key={t.title}>
                            <code>提示词</code>
                            <strong>{t.title}</strong>
                            <span>{t.description}</span>
                            <button type="button" onClick={() => useCommand(p, t.prompt)}>
                              用这个
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {p.instructions ? (
                      <div className="plugin-section">
                        <div className="plugin-section-title">追加到系统提示词</div>
                        <div className="plugin-instructions">{p.instructions}</div>
                      </div>
                    ) : null}

                    {p.tools.length + p.commands.length + p.prompts.length === 0 && !p.instructions ? (
                      <div className="plugin-section">
                        <div className="plugin-empty-inline">这个插件没有声明任何能力。</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        <section className="dev-guide">
          <h2>开发自己的插件</h2>
          <ol>
            <li>
              复制模板：<code className="inline-code">cp -r plugins/_template plugins/my-plugin</code>
            </li>
            <li>改 id、name、description，按需补 tools / commands / prompts</li>
            <li>回到本页点「重新扫描」，打开开关，然后去对话页用 <code className="inline-code">/</code> 调用</li>
          </ol>
          <pre className="code-block">
            <code>{SAMPLE}</code>
          </pre>
          <p className="dev-note">
            插件是运行期直接加载的 ESM 模块，所以扩展名必须是 <code className="inline-code">.mjs</code>。需要密钥时用{" "}
            <code className="inline-code">process.env.MY_KEY</code> 读取（写在 <code className="inline-code">.env.local</code>{" "}
            里），不要硬编码；要引入第三方库，在插件目录下放自己的 <code className="inline-code">node_modules</code> 即可。
          </p>
        </section>
      </div>
    </div>
  );
}
