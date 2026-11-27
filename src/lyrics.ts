import { fetch } from "@tauri-apps/plugin-http";
import type { Song } from "./api";
import { openStore } from "./idb";

export interface Lyrics {
  /** 同期歌詞（時刻順）。無ければ null */
  synced: { time: number; text: string }[] | null;
  plain: string | null;
  instrumental: boolean;
}

const BASE = "https://lrclib.net/api";
const HEADERS = { "User-Agent": "riaplay/0.1.0" };

// ---- キャッシュ ----
// 歌詞は曲名・アーティスト・アルバム・再生時間で決まり、どのサーバーの曲かには依らない。
// そのためキーはそれらから作り、サーバーを切り替えても、アプリを再起動しても使い回す（IndexedDB に保存）。
// 見つからなかった曲も覚えるが、LRCLIB に後から追加されることがあるので、一定期間で再確認する。
const NOT_FOUND_TTL = 7 * 24 * 60 * 60 * 1000;
interface Entry { v: Lyrics | null; at: number }
const fresh = (e: Entry) => e.v !== null || Date.now() - e.at < NOT_FOUND_TTL;
const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<Lyrics | null>>();

const keyOf = (s: Song) => [s.title, s.artist, s.album, Math.round(s.duration)].map((x) => String(x).trim().toLowerCase()).join("\u0000");

const db = openStore("riaplay-cache", "lyrics");

/** 保存済みの歌詞をすべて消す（設定から） */
export async function clearLyricsCache() {
  memory.clear();
  await db.clear();
}

/** "[01:23.45] text" 形式（1行に複数タイムスタンプも可）を解析する */
export function parseLrc(lrc: string): { time: number; text: string }[] {
  const out: { time: number; text: string }[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue; // [ar:...] などのメタ情報は無視
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of stamps) out.push({ time: Number(m[1]) * 60 + Number(m[2]), text });
  }
  return out.sort((a, b) => a.time - b.time);
}

function toLyrics(r: any): Lyrics {
  const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : null;
  return {
    synced: synced?.length ? synced : null,
    plain: r.plainLyrics ?? null,
    instrumental: !!r.instrumental,
  };
}

async function getJson(url: string): Promise<any | null> {
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB: HTTP ${res.status}`);
  return res.json();
}

/** LRCLIB から歌詞を取得（完全一致 → 検索の順）。見つからなければ null */
export async function fetchLyrics(song: Song): Promise<Lyrics | null> {
  const key = keyOf(song);
  const m = memory.get(key);
  if (m && fresh(m)) return m.v;
  const saved = await db.get<Entry>(key);
  if (saved && fresh(saved)) {
    memory.set(key, saved);
    return saved.v;
  }
  // 同じ曲の取得が重なったら、1 回の問い合わせを共有する
  let p = inflight.get(key);
  if (!p) {
    p = fetchRemote(song).then((v) => {
      const e: Entry = { v, at: Date.now() };
      memory.set(key, e);
      void db.put(key, e);
      return v;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function fetchRemote(song: Song): Promise<Lyrics | null> {
  const q = new URLSearchParams({ track_name: song.title, artist_name: song.artist, album_name: song.album, duration: String(Math.round(song.duration)) });
  let r = await getJson(`${BASE}/get?${q}`);
  if (!r) {
    const list = await getJson(`${BASE}/search?${new URLSearchParams({ track_name: song.title, artist_name: song.artist })}`);
    // 再生時間が近いものを優先（±3秒）、無ければ先頭
    r = Array.isArray(list) && list.length ? (list.find((x: any) => Math.abs((x.duration ?? 0) - song.duration) <= 3) ?? list[0]) : null;
  }
  return r ? toLyrics(r) : null;
}
