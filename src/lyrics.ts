import { fetch } from "@tauri-apps/plugin-http";
import type { Song } from "./api";

export interface Lyrics {
  /** 同期歌詞（時刻順）。無ければ null */
  synced: { time: number; text: string }[] | null;
  plain: string | null;
  instrumental: boolean;
}

const BASE = "https://lrclib.net/api";
const HEADERS = { "User-Agent": "riaplay/0.1.0" };
const cache = new Map<string, Lyrics | null>();
/** サーバー切り替え時に破棄する（曲IDはサーバーごとに別物） */
export const clearLyricsCache = () => cache.clear();

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
  if (cache.has(song.id)) return cache.get(song.id)!;
  const q = new URLSearchParams({ track_name: song.title, artist_name: song.artist, album_name: song.album, duration: String(Math.round(song.duration)) });
  let r = await getJson(`${BASE}/get?${q}`);
  if (!r) {
    const list = await getJson(`${BASE}/search?${new URLSearchParams({ track_name: song.title, artist_name: song.artist })}`);
    // 再生時間が近いものを優先（±3秒）、無ければ先頭
    r = Array.isArray(list) && list.length ? (list.find((x: any) => Math.abs((x.duration ?? 0) - song.duration) <= 3) ?? list[0]) : null;
  }
  const result = r ? toLyrics(r) : null;
  cache.set(song.id, result);
  return result;
}
