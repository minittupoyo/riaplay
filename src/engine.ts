// 再生エンジンの抽象。Tauri では Rust 側の libmpv、ブラウザ（開発用）では <audio> を使う。
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** 実際にデコードしているストリームの情報（不明な項目は null） */
export interface AudioInfo {
  codec: string | null;
  format: string | null; // コンテナ（flac, mp3, ogg など）
  sampleRate: number | null; // Hz
  channels: number | null;
  bitrate: number | null; // bit/s
}

export interface EngineEvents {
  info?(info: AudioInfo): void; // libmpv のときだけ届く
  position(secs: number): void;
  duration(secs: number): void;
  paused(paused: boolean): void;
  ended(): void;
  error(message: string): void;
}

export interface Engine {
  load(url: string, paused?: boolean): void;
  pause(paused: boolean): void;
  seek(secs: number): void;
  stop(): void;
  volume(v: number): void; // 0..1
  mute(m: boolean): void;
}

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function webEngine(ev: EngineEvents, volume: number, muted: boolean): Engine {
  // 起動時ではなく初回再生時に生成する（音声基盤が壊れていても画面は表示できるように）
  let a: HTMLAudioElement | null = null;
  const get = () => {
    if (a) return a;
    a = new Audio();
    a.volume = volume;
    a.muted = muted;
    a.onplay = () => ev.paused(false);
    a.onpause = () => ev.paused(true);
    a.ontimeupdate = () => ev.position(a!.currentTime);
    a.ondurationchange = () => isFinite(a!.duration) && ev.duration(a!.duration);
    a.onended = () => ev.ended();
    a.onerror = () => ev.error("再生できませんでした");
    return a;
  };
  return {
    load(url, paused = false) { const el = get(); el.src = url; if (!paused) el.play().catch(() => {}); },
    pause(p) { const el = get(); if (p) el.pause(); else el.play().catch(() => {}); },
    seek(t) { get().currentTime = t; },
    stop() { if (a) { a.pause(); a.removeAttribute("src"); } },
    volume(v) { volume = v; if (a) a.volume = v; },
    mute(m) { muted = m; if (a) a.muted = m; },
  };
}

function mpvEngine(ev: EngineEvents, volume: number, muted: boolean, fallback: () => void): Engine {
  const call = (cmd: string, args: Record<string, unknown> = {}) =>
    invoke(cmd, args).catch((e) => {
      if (String(e) === "no-engine") fallback(); // libmpv が初期化できなかった環境では <audio> に切り替える
    });
  void listen<{ secs: number }>("audio-position", (e) => ev.position(e.payload.secs));
  void listen<{ secs: number }>("audio-duration", (e) => ev.duration(e.payload.secs));
  void listen<{ paused: boolean }>("audio-paused", (e) => ev.paused(e.payload.paused));
  void listen<AudioInfo>("audio-info", (e) => ev.info?.(e.payload));
  void listen("audio-ended", () => ev.ended());
  void listen<{ message: string }>("audio-error", (e) => ev.error(e.payload.message));
  void call("audio_volume", { volume });
  void call("audio_mute", { muted });
  return {
    load: (url, paused = false) => void call("audio_load", { url, paused }),
    pause: (paused) => void call("audio_pause", { paused }),
    seek: (secs) => void call("audio_seek", { secs }),
    stop: () => void call("audio_stop"),
    volume: (v) => void call("audio_volume", { volume: v }),
    mute: (m) => void call("audio_mute", { muted: m }),
  };
}

export function createEngine(ev: EngineEvents, volume: number, muted: boolean): Engine {
  if (!inTauri) return webEngine(ev, volume, muted);
  let cur: Engine;
  let vol = volume, mut = muted;
  const web = () => {
    const w = webEngine(ev, vol, mut);
    cur = w;
  };
  cur = mpvEngine(ev, volume, muted, web);
  // 切り替え後もこの委譲を通して呼べるようにする
  return {
    load: (u, p) => cur.load(u, p),
    pause: (p) => cur.pause(p),
    seek: (s) => cur.seek(s),
    stop: () => cur.stop(),
    volume: (v) => { vol = v; cur.volume(v); },
    mute: (m) => { mut = m; cur.mute(m); },
  };
}
