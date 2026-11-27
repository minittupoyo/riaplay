import { fetch } from "@tauri-apps/plugin-http";
import type { Song, SubsonicClient } from "./api";
import { openStore } from "./idb";

export interface Lyrics {
  /** 同期歌詞（時刻順）。無ければ null */
  synced: { time: number; text: string }[] | null;
  plain: string | null;
  instrumental: boolean;
  /** 取得元の表示名（クレジット用） */
  source?: string;
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

async function getJson(url: string, name = "LRCLIB"): Promise<any | null> {
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

/** 取得元。上から順に試し、同期歌詞が見つかった時点で止める */
type Source = (song: Song, client?: SubsonicClient) => Promise<Lyrics | null>;

/** サーバー自身が持つ歌詞（外部送信なし。OpenSubsonic 対応サーバーのみ） */
const fromServer: Source = async (song, client) => {
  if (!client) return null;
  const list = await client.getLyricsBySongId(song.id);
  const pick = list.find((l) => l.synced) ?? list[0];
  if (!pick?.lines.length) return null;
  if (pick.synced) {
    const synced = pick.lines.map((l) => ({ time: (l.start ?? 0) / 1000, text: l.value.trim() }));
    return { synced, plain: synced.map((l) => l.text).join("\n"), instrumental: false };
  }
  return { synced: null, plain: pick.lines.map((l) => l.value).join("\n"), instrumental: false };
};

/** LRCLIB（完全一致 → 検索の順） */
const fromLrclib: Source = async (song) => {
  const q = new URLSearchParams({ track_name: song.title, artist_name: song.artist, album_name: song.album, duration: String(Math.round(song.duration)) });
  let r = await getJson(`${BASE}/get?${q}`);
  if (!r) {
    const list = await getJson(`${BASE}/search?${new URLSearchParams({ track_name: song.title, artist_name: song.artist })}`);
    // 再生時間が近いものを優先（±3秒）、無ければ先頭
    r = Array.isArray(list) && list.length ? (list.find((x: any) => Math.abs((x.duration ?? 0) - song.duration) <= 3) ?? list[0]) : null;
  }
  return r ? toLyrics(r) : null;
};

/** NetEase Cloud Music（非公式 API）。LRCLIB に無い日本語・中国語の曲に強い。再生時間が近い候補だけ採用する */
const fromNetease: Source = async (song) => {
  const s = `${song.title} ${song.artist}`;
  const found = await getJson(`https://music.163.com/api/search/get/web?${new URLSearchParams({ s, type: "1", offset: "0", limit: "6" })}`, "NetEase");
  const songs: any[] = found?.result?.songs ?? [];
  const hit = songs.find((x) => Math.abs((x.duration ?? 0) / 1000 - song.duration) <= 3);
  if (!hit) return null;
  const r = await getJson(`https://music.163.com/api/song/lyric?${new URLSearchParams({ id: String(hit.id), lv: "1", kv: "1", tv: "-1" })}`, "NetEase");
  const lrc: string | undefined = r?.lrc?.lyric;
  if (!lrc) return null;
  const synced = parseLrc(lrc);
  const plain = synced.length ? synced.map((l) => l.text).join("\n") : lrc.trim();
  return { synced: synced.length ? synced : null, plain: plain || null, instrumental: false };
};

const SOURCES: [name: string, fn: Source][] = [["サーバー", fromServer], ["LRCLIB", fromLrclib], ["NetEase Cloud Music", fromNetease]];

/** 歌詞を取得する。見つからなければ null */
export async function fetchLyrics(song: Song, client?: SubsonicClient): Promise<Lyrics | null> {
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
    p = fetchRemote(song, client).then((v) => {
      const e: Entry = { v, at: Date.now() };
      memory.set(key, e);
      void db.put(key, e);
      return v;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function fetchRemote(song: Song, client?: SubsonicClient): Promise<Lyrics | null> {
  let best: Lyrics | null = null;
  let failures = 0;
  let lastError: unknown;
  for (const [name, source] of SOURCES) {
    try {
      const v = await source(song, client);
      if (!v) continue;
      v.source = name;
      if (v.synced || v.instrumental) return v;
      best ??= v; // 同期歌詞が無ければ、テキストだけの歌詞を控えて次の取得元も試す
    } catch (e) {
      failures++;
      lastError = e;
    }
  }
  // 全ての取得元が失敗したときだけエラーにする（「見つからない」をキャッシュしないため）
  if (!best && failures === SOURCES.length) throw lastError;
  return best;
}
