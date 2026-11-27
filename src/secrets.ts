import { invoke } from "@tauri-apps/api/core";

/**
 * 秘密情報（サーバーのパスワード）の保存先。
 * - アプリ（Tauri）: OS のキーチェーンに保存（Rust 側の secret_* コマンド）
 * - ブラウザ単体で開発しているとき（Tauri 外）だけ、localStorage で代用する。配布アプリでは使われない。
 */
const inTauri = () => "__TAURI_INTERNALS__" in window;
const DEV_KEY = "riaplay.dev-secrets";
const devLoad = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(DEV_KEY) ?? "{}"); } catch { return {}; }
};

export async function secretSet(key: string, value: string): Promise<void> {
  if (inTauri()) return invoke("secret_set", { key, value });
  localStorage.setItem(DEV_KEY, JSON.stringify({ ...devLoad(), [key]: value }));
}

export async function secretGet(key: string): Promise<string | null> {
  if (inTauri()) return invoke<string | null>("secret_get", { key });
  return devLoad()[key] ?? null;
}

export async function secretDelete(key: string): Promise<void> {
  if (inTauri()) return invoke("secret_delete", { key });
  const d = devLoad();
  delete d[key];
  localStorage.setItem(DEV_KEY, JSON.stringify(d));
}
