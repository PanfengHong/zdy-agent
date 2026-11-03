"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_PROFILE,
  type Profile,
  getProfile,
  saveProfile,
  signIn,
  signOut,
  subscribeProfile,
} from "@/lib/profile";

interface Health {
  llm: { model: string; configured: boolean };
  embedding: { model: string; configured: boolean };
  knowledgeBase: { documents: number; chunks: number };
}

const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BookIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z" strokeLinejoin="round" />
    <path d="M8 7h8M8 11h5" strokeLinecap="round" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M14 7V5.5A2.5 2.5 0 0 0 11.5 3h-5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h5A2.5 2.5 0 0 0 14 18.5V17" strokeLinecap="round" />
    <path d="M9.5 12H21m0 0-3.4-3.4M21 12l-3.4 3.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronIcon = ({ up }: { up?: boolean }) => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{ transform: up ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }}
  >
    <path d="M6 9.5 12 15.5 18 9.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function UserMenu({ health }: { health: Health | null }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"settings" | "login" | "logout" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const rootRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setProfile(getProfile());
    return subscribeProfile(() => setProfile(getProfile()));
  }, []);

  // 点击外部 / 按 Esc 收起菜单
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (dialog === "settings" || dialog === "login") {
      setTimeout(() => nameInputRef.current?.focus(), 30);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDialog(null);
    };
    if (dialog) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialog]);

  const initial = profile.name.trim().slice(0, 1).toUpperCase() || "Z";
  const llmReady = health?.llm.configured ?? false;

  const openSettings = () => {
    setName(profile.name);
    setEmail(profile.email);
    setOpen(false);
    setDialog("settings");
  };

  const openLogin = () => {
    setName(profile.name);
    setEmail(profile.email);
    setOpen(false);
    setDialog("login");
  };

  const submitForm = () => {
    const nextName = name.trim() || profile.name;
    if (dialog === "login") {
      signIn(nextName);
      saveProfile({ email: email.trim() });
    } else {
      saveProfile({ name: nextName, email: email.trim() });
    }
    setDialog(null);
  };

  const confirmLogout = () => {
    signOut();
    setDialog(null);
  };

  return (
    <div className="user-dock" ref={rootRef}>
      {open ? (
        <div className="user-menu" role="menu" aria-label="个人菜单">
          <div className="user-menu-head">
            <div className={`user-avatar-lg${profile.signedIn ? "" : " off"}`}>{initial}</div>
            <div className="user-menu-id">
              <div className="um-name">{profile.signedIn ? profile.name : "未登录"}</div>
              <div className="um-mail">{profile.signedIn ? profile.email || "未设置邮箱" : "点击下方登录继续"}</div>
            </div>
          </div>

          <div className="user-menu-status">
            <div className="um-status-row">
              <span className={llmReady ? "dot" : "dot warn"} />
              <span className="um-status-text">{health ? health.llm.model : "正在检测模型…"}</span>
            </div>
            <div className="um-status-row">
              <span className={health ? "dot" : "dot warn"} />
              <span className="um-status-text">
                {health ? `知识库 ${health.knowledgeBase.documents} 篇 / ${health.knowledgeBase.chunks} 片段` : "知识库…"}
              </span>
            </div>
            {health && !llmReady ? <div className="um-warn">未配置密钥，请填写 .env.local</div> : null}
          </div>

          <div className="user-menu-divider" />

          <button type="button" className="um-item" role="menuitem" onClick={openSettings}>
            <GearIcon />
            个人设置
          </button>
          <button
            type="button"
            className="um-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push("/knowledge");
            }}
          >
            <BookIcon />
            知识库管理
          </button>

          <div className="user-menu-divider" />

          {profile.signedIn ? (
            <button
              type="button"
              className="um-item danger"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setDialog("logout");
              }}
            >
              <LogoutIcon />
              退出登录
            </button>
          ) : (
            <button type="button" className="um-item" role="menuitem" onClick={openLogin}>
              <LogoutIcon />
              登录
            </button>
          )}
        </div>
      ) : null}

      <button
        type="button"
        className={`user-row${open ? " open" : ""}`}
        onClick={() => (profile.signedIn ? setOpen((v) => !v) : openLogin())}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={`user-avatar${profile.signedIn ? "" : " off"}`}>{initial}</span>
        <span className="user-meta">
          <span className="user-name">{profile.signedIn ? profile.name : "未登录"}</span>
          <span className="user-sub">{profile.signedIn ? profile.email || "本地账号" : "点击登录"}</span>
        </span>
        <span className="user-chevron">
          <ChevronIcon up={open} />
        </span>
      </button>

      {dialog ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDialog(null);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label={dialog === "logout" ? "退出登录" : "个人设置"}>
            <div className="modal-head">
              <h3>{dialog === "logout" ? "退出登录" : dialog === "login" ? "登录" : "个人设置"}</h3>
              <button type="button" className="modal-x" onClick={() => setDialog(null)} aria-label="关闭">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {dialog === "logout" ? (
              <>
                <p className="modal-text">
                  退出后只清除本机的登录状态，<strong>历史对话与知识库文件仍保留在浏览器中</strong>。随时可以重新登录。
                </p>
                <div className="modal-actions">
                  <button type="button" className="btn-ghost" onClick={() => setDialog(null)}>
                    取消
                  </button>
                  <button type="button" className="btn-danger" onClick={confirmLogout}>
                    退出登录
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="modal-text">
                  {dialog === "login" ? "本地演示账号，信息只保存在这台设备的浏览器里。" : "信息只保存在本机浏览器，用于侧边栏展示。"}
                </p>
                <label className="field">
                  <span>昵称</span>
                  <input ref={nameInputRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：张栋宇" maxLength={24} />
                </label>
                <label className="field">
                  <span>邮箱</span>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" maxLength={64} />
                </label>
                <div className="modal-meta">
                  当前模型：{health?.llm.model ?? "检测中"} · 向量模型：{health?.embedding.model ?? "检测中"}
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-ghost" onClick={() => setDialog(null)}>
                    取消
                  </button>
                  <button type="button" className="btn-primary" onClick={submitForm}>
                    {dialog === "login" ? "登录" : "保存"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
