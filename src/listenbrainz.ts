import { fetch } from "@tauri-apps/plugin-http";
import { watch } from "vue";
import { signal } from "./reactive";
import { current, duration, playing, time } from "./player";
import { settings } from "./settings";
import { secretDelete, secretGet, secretSet } from "./secrets";

// ListenBrainz（公式サーバー）へ再生履歴を送る。トークンはキーチェーンに保存する
const API = "https://api.listenbrainz.org/1";
const TOKEN_KEY = "listenbrainz:token";
const QUEUE_KEY = "riaplay.listenbrainz.queue";
const MAX_QUEUE = 500;
const MIN_LENGTH = 30; // これより短い曲は記録しない
const MAX_THRESHOLD = 240; // 半分か 4 分の短い方を聴いたら記録

interface Listen { listened_at: number; track_metadata: { artist_name: string; track_name: string; release_name?: string; additional_info: Record<string, unknown> } }

const [hasToken, setHasToken] = signal(false);
export { hasToken };
let token: string | null = null;
void secretGet(TOKEN_KEY).then((t) => { token = t; setHasToken(!!t); }).catch(() => {});

const headers = () => ({ Authorization: `Token ${token}`, "Content-Type": "application/json" });

/** トークンを確認して保存する。有効ならユーザー名を返す */
export async function saveToken(value: string): Promise<string> {
  const t = value.trim();
  const res = await fetch(`${API}/validate-token`, { headers: { Authorization: `Token ${t}` } });
  const j = (await res.json().catch(() => ({}))) as { valid?: boolean; user_name?: string };
  if (!res.ok || !j.valid) throw new Error("トークンが正しくありません");
  await secretSet(TOKEN_KEY, t);
  token = t;
  setHasToken(true);
  void flush();
  return j.user_name ?? "";
}

export async function clearToken() {
  await secretDelete(TOKEN_KEY);
  token = null;
  setHasToken(false);
}

const enabled = () => settings().listenbrainzEnabled && !!token;

const loadQueue = (): Listen[] => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]"); } catch { return []; }
};
const saveQueue = (q: Listen[]) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE))); } catch { /* 容量超過などは諦める */ } };

const info = () => ({ media_player: "riaplay", submission_client: "riaplay", music_service_name: "navidrome" });
const meta = (s: NonNullable<ReturnType<typeof current>>): Listen["track_metadata"] => ({
  artist_name: s.artist,
  track_name: s.title,
  ...(s.album ? { release_name: s.album } : {}),
  additional_info: { ...info(), duration: Math.round(s.duration) },
});

let flushing = false;
/** 溜まっている分を送る。ネットワーク・サーバー側の失敗は残して後で再送し、それ以外（不正なデータ）は捨てる */
async function flush() {
  if (flushing || !token) return;
  flushing = true;
  try {
    for (let q = loadQueue(); q.length; q = loadQueue()) {
      const batch = q.slice(0, 100);
      const res = await fetch(`${API}/submit-listens`, { method: "POST", headers: headers(), body: JSON.stringify({ listen_type: "import", payload: batch }) });
      if (res.status === 429 || res.status >= 500 || res.status === 401) break; // 401 はトークン失効。再設定されるまで溜めておく
      saveQueue(loadQueue().slice(batch.length));
    }
  } catch { /* オフラインなど。次の機会に再送する */ } finally { flushing = false; }
}

function playingNow() {
  const s = current();
  if (!s || !enabled()) return;
  void fetch(`${API}/submit-listens`, { method: "POST", headers: headers(), body: JSON.stringify({ listen_type: "playing_now", payload: [{ track_metadata: meta(s) }] }) }).catch(() => {});
}

// 今の曲の再生状況
let startedAt = 0; // 再生を始めた時刻（秒）
let listened = 0; // 実際に聴いた秒数（シークで稼げないよう、経過時間で数える）
let scrobbled = false;
let nowSent = false;
let lastTime = 0;

function reset() {
  startedAt = Math.floor(Date.now() / 1000);
  listened = 0;
  scrobbled = false;
  nowSent = false;
  lastTime = time();
  if (playing()) tryNow();
}
function tryNow() {
  if (nowSent || !enabled()) return;
  nowSent = true;
  playingNow();
}

watch(() => current()?.id, reset);
watch(playing, (p) => { if (p) tryNow(); });
watch(() => settings().listenbrainzEnabled, (on) => { if (on) { reset(); void flush(); } });

setInterval(() => {
  const s = current();
  if (!s || !enabled()) return;
  const t = time();
  // 同じ曲を頭から聴き直した（1 曲リピート）ら、新しい再生として数える
  if (scrobbled && t < 5 && lastTime > 5) reset();
  lastTime = t;
  if (!playing() || scrobbled) return;
  listened += 1;
  const len = s.duration || duration();
  if (len < MIN_LENGTH || listened < Math.min(len / 2, MAX_THRESHOLD)) return;
  scrobbled = true;
  saveQueue([...loadQueue(), { listened_at: startedAt, track_metadata: meta(s) }]);
  void flush();
}, 1000);
setInterval(() => { if (enabled()) void flush(); }, 60_000);
