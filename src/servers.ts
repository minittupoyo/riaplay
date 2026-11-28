import { signal } from "./reactive";
import { secretDelete, secretGet, secretSet } from "./secrets";

/** 登録済みの Navidrome サーバー（複数登録可）。パスワードは含まない（OS のキーチェーンに保存） */
export interface Server {
  id: string;
  name: string;
  url: string;
  username: string;
  /** true: パスワードを OS のキーチェーンに保存する / false: このセッション中だけメモリに保持 */
  remember: boolean;
  /** 旧バージョンが localStorage に平文で保存していたパスワード。起動時にキーチェーンへ移行して消える */
  password?: string;
}
export interface ServerInput {
  name: string;
  url: string;
  username: string;
  password: string;
  remember: boolean;
}

const LIST_KEY = "riaplay.servers";
const ACTIVE_KEY = "riaplay.activeServer";
const LEGACY_KEY = "riaplay.config"; // 単一サーバー時代の保存形式
const secretKey = (id: string) => `server:${id}`;

export const normalizeUrl = (u: string) => u.trim().replace(/\/+$/, "");
export const hostOf = (u: string) => {
  try { return new URL(u).host; } catch { return u; }
};

function load(): Server[] {
  try {
    const v = JSON.parse(localStorage.getItem(LIST_KEY) ?? "null");
    if (Array.isArray(v)) return v.map((s) => ({ remember: true, ...s }));
  } catch { /* 破損していたら移行へ */ }
  // 単一サーバー時代の形式から移行（パスワードは後続の migratePasswords でキーチェーンへ）
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null");
    if (old?.url) {
      const s: Server = { id: crypto.randomUUID(), name: hostOf(old.url), url: normalizeUrl(old.url), username: old.username, remember: true, password: old.password };
      localStorage.setItem(LIST_KEY, JSON.stringify([s]));
      localStorage.setItem(ACTIVE_KEY, s.id);
      localStorage.removeItem(LEGACY_KEY);
      return [s];
    }
  } catch { /* 無視 */ }
  return [];
}

const [servers, setServersRaw] = signal<Server[]>(load());
const initialActive = localStorage.getItem(ACTIVE_KEY);
const [activeId, setActiveRaw] = signal<string | null>(
  servers().some((s) => s.id === initialActive) ? initialActive : (servers()[0]?.id ?? null),
);
export { servers, activeId };

const persist = () => {
  localStorage.setItem(LIST_KEY, JSON.stringify(servers())); // password は未移行の旧データを除き含まれない
  const a = activeId();
  if (a) localStorage.setItem(ACTIVE_KEY, a);
  else localStorage.removeItem(ACTIVE_KEY);
};

// ---- パスワード ----
// 「保存しない」サーバーのパスワードと、取得済みのキャッシュ（メモリのみ）
const memory = new Map<string, string>();

/** パスワードを返す。無ければ null（保存されていない／キーチェーンに存在しない） */
export async function getPassword(id: string): Promise<string | null> {
  const m = memory.get(id);
  if (m !== undefined) return m;
  const s = servers().find((x) => x.id === id);
  if (!s?.remember) return null;
  const v = await secretGet(secretKey(id));
  if (v !== null) memory.set(id, v);
  return v;
}

/** 旧バージョンの平文パスワードを OS のキーチェーンへ移行する。失敗した分は次回起動時に再試行する */
async function migratePasswords() {
  let changed = false;
  for (const s of servers()) {
    if (s.password === undefined) continue;
    memory.set(s.id, s.password);
    try {
      await secretSet(secretKey(s.id), s.password);
    } catch (e) {
      console.warn("パスワードをキーチェーンへ移行できませんでした（次回再試行します）:", e);
      continue;
    }
    setServersRaw((l) => l.map((x) => (x.id === s.id ? (({ password: _p, ...rest }) => rest)(x) : x)));
    changed = true;
  }
  if (changed) persist();
}
/** 起動時に 1 回だけ実行される移行処理（接続はこの完了を待つ） */
export const passwordsReady: Promise<void> = migratePasswords().catch(() => {});

// ---- 追加・更新・削除 ----
const toServer = (id: string, v: ServerInput): Server => ({
  id,
  name: v.name.trim() || hostOf(v.url),
  url: normalizeUrl(v.url),
  username: v.username,
  remember: v.remember,
});

/** キーチェーンへの保存に失敗したら例外を投げる（その場合サーバーは追加されない） */
export async function addServer(v: ServerInput): Promise<Server> {
  const s = toServer(crypto.randomUUID(), v);
  if (v.remember) await secretSet(secretKey(s.id), v.password);
  memory.set(s.id, v.password);
  setServersRaw((l) => [...l, s]);
  persist();
  return s;
}

/** password が空なら既存のパスワードを保つ。変更のない他サーバーのオブジェクト参照は保つ */
export async function updateServer(id: string, v: ServerInput): Promise<void> {
  const password = v.password || (await getPassword(id)) || "";
  if (v.remember) await secretSet(secretKey(id), password);
  else await secretDelete(secretKey(id)).catch(() => {}); // 「保存しない」へ変更したらキーチェーンから消す
  memory.set(id, password);
  setServersRaw((l) => l.map((s) => (s.id === id ? toServer(id, { ...v, password }) : s)));
  persist();
}

export async function removeServer(id: string): Promise<void> {
  memory.delete(id);
  setServersRaw((l) => l.filter((s) => s.id !== id));
  if (activeId() === id) setActiveRaw(servers()[0]?.id ?? null);
  persist();
  await secretDelete(secretKey(id)).catch((e) => console.warn("キーチェーンから削除できませんでした:", e));
}

export function setActive(id: string) {
  if (!servers().some((s) => s.id === id)) return;
  setActiveRaw(id);
  persist();
}

// サーバーの追加・編集ダイアログ
export type ServerDialogState = { mode: "add" } | { mode: "edit"; id: string } | null;
export const [serverDialog, setServerDialog] = signal<ServerDialogState>(null);
