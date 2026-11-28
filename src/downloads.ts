// オフライン再生用のダウンロード。ファイルの取得・削除は Rust 側（download.rs）、
// どの曲を保存したかの一覧は IndexedDB に持つ。保存済みの曲は、再生時にローカルファイルを使う。
import { computed } from "vue";
import { signal } from "./reactive";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Song, SubsonicClient } from "./api";
import { openStore } from "./idb";
import { toast } from "./toast";

/** ブラウザ（開発用）ではファイルを保存できない */
export const downloadsSupported = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface DownloadedSong {
  key: string; // `${serverId}:${songId}`
  serverId: string;
  song: Song;
  path: string;
  coverPath?: string;
  size: number;
  at: number;
}

const keyOf = (serverId: string, songId: string) => `${serverId}:${songId}`;
const db = openStore("riaplay-downloads", "songs");

const [entries, setEntries] = signal<Record<string, DownloadedSong>>({});
/** 保存済みの一覧を読み込み終えたら解決する */
export const downloadsReady: Promise<void> = downloadsSupported
  ? db.all<DownloadedSong>().then((list) => { setEntries(Object.fromEntries(list.map((e) => [e.key, e]))); })
  : Promise.resolve();

/** そのサーバーの保存済みの曲（アルバム名、ディスク、トラックの順） */
export const downloadedFor = (serverId: string | undefined) =>
  Object.values(entries())
    .filter((e) => e.serverId === serverId)
    .sort((a, b) => a.song.album.localeCompare(b.song.album) || (a.song.discNumber ?? 1) - (b.song.discNumber ?? 1) || (a.song.track ?? 0) - (b.song.track ?? 0));

export const downloadedPath = (serverId: string, songId: string) => entries()[keyOf(serverId, songId)]?.path;
export const hasDownloads = (serverId: string | undefined) => Object.values(entries()).some((e) => e.serverId === serverId);

// ジャケット: 保存済みの曲のものはローカルから表示する（サーバーに繋がらなくても出る）
const covers = computed(() => {
  const m = new Map<string, string>();
  for (const e of Object.values(entries())) if (e.coverPath && e.song.coverArt) m.set(`${e.serverId}:${e.song.coverArt}`, e.coverPath);
  return m;
});
export const localCoverUrl = (serverId: string | undefined, coverId: string): string | undefined => {
  const p = serverId ? covers.value.get(`${serverId}:${coverId}`) : undefined;
  return p ? convertFileSrc(p) : undefined;
};

// ---- ダウンロードの実行（2 曲まで同時） ----
export interface Job {
  key: string;
  serverId: string;
  song: Song;
  client: SubsonicClient;
  status: "queued" | "active";
  received: number;
  total: number;
}
const [jobs, setJobs] = signal<Job[]>([]);
export { jobs };
const patchJob = (key: string, patch: Partial<Job>) => setJobs((l) => l.map((j) => (j.key === key ? { ...j, ...patch } : j)));

const MAX_PARALLEL = 2;
let batch = { done: 0, failed: 0 };

if (downloadsSupported) {
  void listen<{ id: string; received: number; total: number }>("download-progress", ({ payload: p }) => {
    patchJob(p.id, { received: p.received, total: p.total });
  });
}

// ジャケット ID は曲ごとに違うが、画像は同じアルバムなら同じ。アルバム単位で 1 回だけ取得し、ファイルを共有する
const coverInflight = new Map<string, Promise<string | undefined>>();
const albumCovers = () => {
  const m = new Map<string, string>(); // `${serverId}:${albumId}` → 保存済みのジャケットのパス
  for (const e of Object.values(entries())) if (e.coverPath && e.song.albumId) m.set(`${e.serverId}:${e.song.albumId}`, e.coverPath);
  return m;
};
function fetchCover(client: SubsonicClient, serverId: string, song: Song): Promise<string | undefined> {
  const coverId = song.coverArt!;
  const k = `${serverId}:${song.albumId ?? coverId}`;
  const have = (song.albumId && albumCovers().get(k)) || covers.value.get(`${serverId}:${coverId}`);
  if (have) return Promise.resolve(have);
  let p = coverInflight.get(k);
  if (!p) {
    p = invoke<{ path: string }>("download_file", { id: `${k}#cover`, url: client.coverDownloadUrl(coverId), dir: serverId, name: `cover-${song.albumId ?? coverId}` })
      .then((r) => r.path)
      .catch(() => undefined) // ジャケットが取れなくても、曲の保存は成功させる
      .finally(() => coverInflight.delete(k));
    coverInflight.set(k, p);
  }
  return p;
}

async function run(job: Job) {
  const r = await invoke<{ path: string; size: number }>("download_file", { id: job.key, url: job.client.downloadUrl(job.song.id), dir: job.serverId, name: job.song.id });
  const coverPath = job.song.coverArt ? await fetchCover(job.client, job.serverId, job.song) : undefined;
  const entry: DownloadedSong = { key: job.key, serverId: job.serverId, song: job.song, path: r.path, coverPath, size: r.size, at: Date.now() };
  // 記録に失敗すると、再起動後に「保存した曲なし」になる。黙って進めず、失敗として扱ってファイルも消す
  if ((await db.put(job.key, entry)) === undefined) {
    await invoke("download_delete", { path: r.path }).catch(() => {});
    throw new Error("保存の記録に失敗しました");
  }
  setEntries((cur) => ({ ...cur, [job.key]: entry }));
}

async function start(job: Job) {
  patchJob(job.key, { status: "active" });
  try {
    await run(job);
    batch.done++;
  } catch (e) {
    if (String(e) !== "cancelled") {
      batch.failed++;
      toast(`ダウンロードに失敗しました: ${job.song.title}(${String(e)})`, "error", 5000);
    }
  } finally {
    setJobs((js) => js.filter((j) => j.key !== job.key));
    pump();
  }
}

function pump() {
  let active = jobs().filter((j) => j.status === "active").length;
  for (const j of jobs()) {
    if (active >= MAX_PARALLEL) break;
    if (j.status === "queued") {
      active++;
      void start(j);
    }
  }
  if (!jobs().length && (batch.done || batch.failed)) {
    if (batch.done) toast(`${batch.done} 曲をダウンロードしました`);
    batch = { done: 0, failed: 0 };
  }
}

/** 曲をダウンロードの待ち行列に入れる。保存済み・待機中の曲は飛ばす */
export function enqueueDownloads(client: SubsonicClient, songs: Song[]): { added: number; skipped: number } {
  const serverId = client.serverId;
  if (!serverId || !downloadsSupported) return { added: 0, skipped: songs.length };
  let added = 0;
  for (const song of songs) {
    const key = keyOf(serverId, song.id);
    if (entries()[key] || jobs().some((j) => j.key === key)) continue;
    setJobs((js) => [...js, { key, serverId, song, client, status: "queued", received: 0, total: 0 }]);
    added++;
  }
  pump();
  return { added, skipped: songs.length - added };
}

export function cancelDownload(key: string) {
  const j = jobs().find((x) => x.key === key);
  if (!j) return;
  if (j.status === "active") void invoke("download_cancel", { id: key }); // 中止すると run が "cancelled" で失敗し、start が後始末する
  else setJobs((js) => js.filter((x) => x.key !== key));
}
export const cancelAllDownloads = () => jobs().forEach((j) => cancelDownload(j.key));

/** 保存した曲を消す。ジャケットは、使う曲がなくなったときだけ消す */
export async function removeDownloads(list: DownloadedSong[]) {
  const gone = new Set(list.map((e) => e.key));
  for (const e of list) {
    await invoke("download_delete", { path: e.path }).catch(() => {});
    await db.del(e.key);
  }
  setEntries((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => !gone.has(k))));
  const used = new Set(Object.values(entries()).map((e) => e.coverPath));
  for (const p of new Set(list.map((e) => e.coverPath))) {
    if (p && !used.has(p)) await invoke("download_delete", { path: p }).catch(() => {});
  }
}
