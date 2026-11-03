"use client";

/**
 * 本地账号信息（演示用）。
 * 目前没有接入真实鉴权，登录状态只保存在浏览器里：
 * 换成 NextAuth / Clerk / 自建登录时，只需把这几个函数替换成接口调用，
 * UI（components/UserMenu.tsx）不用改。
 */

export interface Profile {
  name: string;
  email: string;
  signedIn: boolean;
}

const KEY = "zdy:profile:v1";
const EVENT = "zdy:profile-changed";

export const DEFAULT_PROFILE: Profile = {
  name: "ZDY 用户",
  email: "local@zdy.agent",
  signedIn: true,
};

const isBrowser = () => typeof window !== "undefined";

function emit() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(EVENT));
}

export function getProfile(): Profile {
  if (!isBrowser()) return DEFAULT_PROFILE;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : DEFAULT_PROFILE.name,
      email: typeof parsed.email === "string" ? parsed.email : DEFAULT_PROFILE.email,
      signedIn: parsed.signedIn !== false,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(patch: Partial<Profile>) {
  if (!isBrowser()) return;
  const next = { ...getProfile(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 忽略配额错误 */
  }
  emit();
}

export function signIn(name: string) {
  saveProfile({ name: name.trim() || DEFAULT_PROFILE.name, signedIn: true });
}

export function signOut() {
  saveProfile({ signedIn: false });
}

export function subscribeProfile(fn: () => void): () => void {
  if (!isBrowser()) return () => undefined;
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
