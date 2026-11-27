import { batch, createEffect, createRoot, createSignal, on } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Song, SubsonicClient } from "./api";
import { settings } from "./settings";
import { createEngine, type AudioInfo, type Engine } from "./engine";
import { downloadedPath } from "./downloads";

export type RepeatMode = "off" | "all" | "one";

const [queue, setQueue] = createSignal<Song[]>([]);
const [index, setIndex] = createSignal(-1);
const [playing, setPlaying] = createSignal(false);
const [time, setTime] = createSignal(0);
const [duration, setDuration] = createSignal(0);
const [shuffle, setShuffle] = createSignal(localStorage.getItem("riaplay.shuffle") === "1");
const [repeat, setRepeat] = createSignal<RepeatMode>((localStorage.getItem("riaplay.repeat") as RepeatMode) || "off");
const [volume, setVolumeSig] = createSignal(Number(localStorage.getItem("riaplay.volume") ?? 1));
const [muted, setMutedSig] = createSignal(localStorage.getItem("riaplay.muted") === "1");
// 再生中ストリームの技術情報（libmpv のときだけ。<audio> フォールバックでは null のまま）
const [audioInfo, setAudioInfo] = createSignal<AudioInfo | null>(null);
// トランスコード中か（設定の最大ビットレートが有効）。load() で更新する
const [isTranscoded, setIsTranscoded] = createSignal(false);
let client: SubsonicClient | null = null;

// シャッフル用: 再生済みインデックスと戻る用の履歴
const played = new Set<number>();
let history: number[] = [];

export const current = () => queue()[index()];
export { queue, index, playing, time, duration, shuffle, repeat, volume, muted, audioInfo, isTranscoded };

// 再生エンジン（Tauri では Rust 側の libmpv）。位置・長さ・一時停止・終了はイベントで届く
let afterSeek: () => void = () => {}; // シーク後に OS へ位置を送る（Tauri のときだけ設定）
// トランスコード中のストリームは先頭からの相対時間になるので、シーク位置をずらして管理する
let offset = 0;
let transcoded = false;
// 位置はイベント（数回/秒）で届くので、その間は経過時間で補間する
let baseTime = 0;
let baseStamp = 0;
let finished = false; // キューの最後まで再生し終えて止まっている（再生ボタンで同じ曲を頭から鳴らし直す）
const setBase = (t: number) => { baseTime = t; baseStamp = performance.now(); setTime(t); };

let _engine: Engine | null = null;
function getEngine(): Engine {
  if (_engine) return _engine;
  return (_engine = createEngine(
    {
      position: (s) => setBase(offset + s),
      duration: (d) => setDuration(transcoded ? current()?.duration ?? d : d),
      paused: (p) => { baseTime = currentTime(); baseStamp = performance.now(); setPlaying(!p); },
      ended: () => {
        const n = nextIndex(true);
        if (n < 0) { finished = true; setPlaying(false); setBase(0); } else load(n);
      },
      info: setAudioInfo,
      error: () => setPlaying(false),
    },
    volume(),
    muted(),
  ));
}

function nextIndex(auto: boolean): number {
  const len = queue().length;
  const cur = index();
  if (!len) return -1;
  if (auto && repeat() === "one") return cur;
  if (shuffle()) {
    let cand = [...Array(len).keys()].filter((i) => !played.has(i));
    if (!cand.length) {
      if (repeat() === "off") return -1;
      played.clear();
      played.add(cur);
      cand = [...Array(len).keys()].filter((i) => i !== cur);
      if (!cand.length) return cur;
    }
    return cand[Math.floor(Math.random() * cand.length)];
  }
  if (cur + 1 < len) return cur + 1;
  return repeat() === "all" ? 0 : -1;
}

/** 直近の曲の切り替えが、どの操作によるものか。表示の切り替えアニメーションの向きに使う（それ以外は null） */
export type NavDirection = "next" | "prev";
let navDir: NavDirection | null = null;
export const lastNavDirection = () => navDir;

function load(i: number, record = true, dir: NavDirection | null = null) {
  const s = queue()[i];
  if (!s || !client) return;
  navDir = dir;
  if (record && index() >= 0 && index() !== i) history.push(index());
  played.add(i);
  setIndex(i);
  offset = 0;
  // ダウンロード済みの曲は、サーバーに繋がなくてもローカルのファイルから再生する（原音なのでトランスコードもしない）
  const local = client.serverId ? downloadedPath(client.serverId, s.id) : undefined;
  transcoded = !local && settings().maxBitRate > 0;
  setIsTranscoded(transcoded);
  setAudioInfo(null);
  finished = false;
  setBase(0);
  setDuration(s.duration);
  setPlaying(true);
  getEngine().load(local ?? client.streamUrl(s.id));
}

export function playQueue(c: SubsonicClient, songs: Song[], start = 0) {
  client = c;
  played.clear();
  history = [];
  // まとめて反映する。別々に更新すると、途中で「再生中の曲なし」の状態が一瞬見えて、プレイヤーバーなどが作り直される
  batch(() => {
    setIndex(-1);
    setQueue(songs);
    load(start);
  });
}

export const toggle = () => {
  if (!current()) return;
  if (finished) return load(index(), false);
  const p = playing();
  setPlaying(!p);
  baseTime = currentTime(); baseStamp = performance.now();
  getEngine().pause(p);
};

export function next() {
  const n = nextIndex(false);
  if (n >= 0) load(n, true, "next");
}

export function prev() {
  if (currentTime() > 3) {
    seek(0);
    return;
  }
  if (shuffle() && history.length) load(history.pop()!, false, "prev");
  else if (!shuffle() && index() > 0) load(index() - 1, true, "prev");
  else seek(0);
}

/** rAF から参照する、補間済みの現在位置（秒） */
export const currentTime = () => {
  const t = playing() ? baseTime + (performance.now() - baseStamp) / 1000 : baseTime;
  const d = duration();
  return d > 0 ? Math.min(t, d) : t;
};
export function seek(t: number) {
  const s = current();
  if (!s) return;
  if (transcoded && client) {
    offset = Math.max(0, t);
    setBase(offset);
    afterSeek();
    getEngine().load(client.streamUrl(s.id, offset), !playing());
  } else {
    setBase(t);
    getEngine().seek(t);
    afterSeek();
  }
}

export function toggleShuffle() {
  const v = !shuffle();
  setShuffle(v);
  localStorage.setItem("riaplay.shuffle", v ? "1" : "0");
  // 切り替え時点から「未再生」を数え直す
  played.clear();
  if (index() >= 0) played.add(index());
}

export function cycleRepeat() {
  const v: RepeatMode = repeat() === "off" ? "all" : repeat() === "all" ? "one" : "off";
  setRepeat(v);
  localStorage.setItem("riaplay.repeat", v);
}

export function setVolume(v: number) {
  v = Math.min(1, Math.max(0, v));
  setVolumeSig(v);
  localStorage.setItem("riaplay.volume", String(v));
  if (v > 0 && muted()) toggleMute();
  getEngine().volume(v);
}

export function toggleMute() {
  const m = !muted();
  setMutedSig(m);
  localStorage.setItem("riaplay.muted", m ? "1" : "0");
  getEngine().mute(m);
}

// ---- キュー操作 ----
function remap(f: (i: number) => number | null) {
  const np = new Set<number>();
  played.forEach((i) => {
    const j = f(i);
    if (j !== null) np.add(j);
  });
  played.clear();
  np.forEach((x) => played.add(x));
  history = history.map(f).filter((x): x is number => x !== null);
}

export const jumpTo = (i: number) => load(i);

/** 現在の曲の直後に挿入する */
export function playNext(c: SubsonicClient, songs: Song[]) {
  if (!queue().length) return playQueue(c, songs, 0);
  client = c;
  const pos = index() + 1;
  remap((i) => (i >= pos ? i + songs.length : i));
  setQueue((q) => [...q.slice(0, pos), ...songs, ...q.slice(pos)]);
}

/** キューの末尾に追加する */
export function enqueue(c: SubsonicClient, songs: Song[]) {
  if (!queue().length) return playQueue(c, songs, 0);
  client = c;
  setQueue((q) => [...q, ...songs]);
}

export function clearQueue() {
  getEngine().stop();
  played.clear();
  history = [];
  setQueue([]);
  setIndex(-1);
  setPlaying(false);
  setTime(0);
  setDuration(0);
}

export function removeFromQueue(i: number) {
  if (queue().length <= 1) return clearQueue();
  const wasCurrent = i === index();
  batch(() => {
    remap((j) => (j === i ? null : j > i ? j - 1 : j));
    setQueue((q) => q.filter((_, k) => k !== i));
    if (wasCurrent) load(Math.min(i, queue().length - 1), false);
    else if (i < index()) setIndex(index() - 1);
  });
}

export function moveInQueue(from: number, to: number) {
  if (from === to) return;
  const f = (i: number) => {
    if (i === from) return to;
    if (from < to && i > from && i <= to) return i - 1;
    if (from > to && i >= to && i < from) return i + 1;
    return i;
  };
  const cur = index();
  batch(() => {
    remap(f);
    setQueue((q) => {
      const a = [...q];
      const [x] = a.splice(from, 1);
      a.splice(to, 0, x);
      return a;
    });
    if (cur >= 0) setIndex(f(cur));
  });
}

// ---- OS 連携（Rust 側の souvlaki 経由。Linux は MPRIS、macOS / Windows は OS のメディアコントロール）----
// WebKit の Media Session 任せだとシークが効かなかったので、Rust 側で直接公開している。ブラウザ（dev）では何もしない。
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
if (inTauri) {
  const status = () => (!current() ? "stopped" : playing() ? "playing" : "paused");
  const sendPlayback = () => { void invoke("media_playback", { status: status(), position: currentTime() }).catch(() => {}); };

  afterSeek = sendPlayback;
  void listen<{ kind: string; dir?: number; secs?: number }>("media-control", ({ payload: p }) => {
    switch (p.kind) {
      case "play": if (!playing()) void toggle(); break;
      case "pause": case "stop": if (playing()) void toggle(); break;
      case "toggle": void toggle(); break;
      case "next": next(); break;
      case "previous": prev(); break;
      case "seek_to": seek(Math.min(p.secs ?? 0, duration() || Infinity)); break;
      case "seek_by": seek(Math.min(Math.max(0, time() + (p.dir ?? 1) * (p.secs ?? 10)), duration() || Infinity)); break;
    }
  });

  createRoot(() => {
    createEffect(() => {
      const s = current();
      if (!s || !client) return;
      void invoke("media_update", {
        title: s.title, artist: s.artist, album: s.album,
        coverUrl: s.coverArt ? client.coverUrl(s.coverArt, 512) : null,
        duration: s.duration,
      }).catch(() => {});
    });
    // 曲の切り替え・再生/一時停止のたびに状態と位置を送る（再生中の位置は Rust 側が libmpv の値をそのまま送る）
    createEffect(on([() => current()?.id, playing], () => sendPlayback()));
  });
}
