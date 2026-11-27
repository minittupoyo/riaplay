import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import {
  IconChevronDown, IconPlayerPlayFilled, IconPlayerPauseFilled, IconPlayerSkipBackFilled, IconPlayerSkipForwardFilled,
  IconArrowsShuffle, IconRepeat, IconRepeatOnce, IconVolume, IconVolume2, IconVolume3, IconQuote, IconListNumbers,
} from "@tabler/icons-solidjs";
import type { Song, SubsonicClient } from "../api";
import {
  current, playing, time, duration, toggle, next, prev, seek,
  shuffle, repeat, volume, muted, toggleShuffle, cycleRepeat, setVolume, toggleMute,
} from "../player";
import { settings } from "../settings";
import { bp, setNowPlayingOpen } from "../store";
import Slider from "./Slider";
import Heart from "./Heart";
import LyricsPanel from "./LyricsPanel";
import NowPlayingQueue from "./NowPlayingQueue";
import { fmt } from "./PlayerBar";

const ctl = "p-3 rounded-full";
const toggled = (on: boolean) => (on ? "text-accent" : "text-white/50 hover:text-white");
const top = "p-2 rounded-full";

function Meta(p: { song: Song; client: SubsonicClient; compact?: boolean }) {
  return (
    <div class={`flex items-center gap-3 w-full min-w-0 ${p.compact ? "px-1" : ""}`}>
      <div class="min-w-0 flex-1">
        <div class={`font-bold truncate ${p.compact ? "text-lg" : "text-2xl"}`}>{p.song.title}</div>
        <div class={`text-white/60 truncate ${p.compact ? "text-sm" : "text-lg"}`}>{p.song.artist}</div>
      </div>
      <Heart client={p.client} kind="song" item={p.song} always />
    </div>
  );
}

function Transport(p: { song: Song }) {
  return (
    <div class="w-full flex flex-col gap-2">
      <div class="flex items-center gap-3 text-xs text-white/60 tabular-nums">
        <span class="w-10 text-right">{fmt(time())}</span>
        <Slider class="flex-1 w-full" value={time()} max={duration() || p.song.duration} onInput={seek} />
        <span class="w-10">{fmt(duration() || p.song.duration)}</span>
      </div>
      <div class="flex items-center justify-center gap-2">
        <button class={`${ctl} ${toggled(shuffle())}`} title="シャッフル" onClick={toggleShuffle}><IconArrowsShuffle size={20} /></button>
        <button class={ctl} onClick={prev}><IconPlayerSkipBackFilled size={28} /></button>
        <button class={`${ctl} hover:bg-white/10`} onClick={toggle}>
          <Show when={playing()} fallback={<IconPlayerPlayFilled size={40} />}><IconPlayerPauseFilled size={40} /></Show>
        </button>
        <button class={ctl} onClick={next}><IconPlayerSkipForwardFilled size={28} /></button>
        <button class={`${ctl} ${toggled(repeat() !== "off")}`} title="リピート" onClick={cycleRepeat}>
          <Show when={repeat() === "one"} fallback={<IconRepeat size={20} />}><IconRepeatOnce size={20} /></Show>
        </button>
      </div>
      <div class="flex items-center gap-3 px-6">
        <button class="p-1 text-white/60 hover:text-white" title="ミュート" onClick={toggleMute}>
          <Show when={!muted() && volume() > 0} fallback={<IconVolume3 size={18} />}>
            <Show when={volume() > 0.5} fallback={<IconVolume2 size={18} />}><IconVolume size={18} /></Show>
          </Show>
        </button>
        <Slider class="flex-1 w-full" max={1} step={0.01} value={muted() ? 0 : volume()} onInput={setVolume} />
      </div>
    </div>
  );
}

/** ウィンドウいっぱいの再生中画面。大きなジャケットと操作、右側（狭い画面では切り替え）に歌詞かキューを出す */
export default function NowPlaying(props: { client: SubsonicClient; ref?: (e: HTMLElement) => void }) {
  // 右側（狭い画面ではジャケットの代わり）に出すもの。同じボタンをもう一度押すと閉じる
  type Pane = "lyrics" | "queue";
  const [pane, setPane] = createSignal<Pane | null>(settings().lyricsEnabled ? "lyrics" : null);
  const togglePane = (p: Pane) => setPane(pane() === p ? null : p);
  const narrow = () => bp() === "narrow";
  const close = () => setNowPlayingOpen(false);

  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  onMount(() => window.addEventListener("keydown", onKey));
  onCleanup(() => window.removeEventListener("keydown", onKey));
  // 再生が無くなった（キューを空にした・サーバーを切り替えた）ら閉じる
  createEffect(() => { if (!current()) close(); });

  return (
    <Show when={current()}>
      {(s) => (
        <section ref={props.ref} class="absolute inset-0 z-50 bg-surface overflow-hidden flex flex-col select-none">
          {/* 背景: ジャケットを大きくぼかして敷く */}
          <Show when={s().coverArt}>
            <img src={props.client.coverUrl(s().coverArt, 64)} class="absolute inset-0 size-full object-cover scale-150 blur-3xl opacity-60" alt="" />
          </Show>
          <div class="absolute inset-0 bg-black/45" />

          <header class="relative flex items-center justify-between px-4 pt-4">
            <button class={`${top} text-white/70 hover:text-white hover:bg-white/10`} title="閉じる (Esc)" onClick={close}><IconChevronDown size={28} /></button>
            <div class="flex items-center gap-1">
              <button class={`${top} ${pane() === "lyrics" ? "text-accent" : "text-white/60 hover:text-white"}`} title="歌詞" onClick={() => togglePane("lyrics")}><IconQuote size={22} /></button>
              <button class={`${top} ${pane() === "queue" ? "text-accent" : "text-white/60 hover:text-white"}`} title="キュー" onClick={() => togglePane("queue")}><IconListNumbers size={22} /></button>
            </div>
          </header>

          <div class={`relative flex-1 min-h-0 flex items-center justify-center gap-10 px-6 md:px-12 pb-6 ${narrow() ? "flex-col" : ""}`}>
            {/* 狭い画面で歌詞を出すときは、ジャケットの代わりに歌詞を出す */}
            <Show when={!(narrow() && pane())}>
              <div class={`flex flex-col items-center justify-center gap-5 min-h-0 ${pane() && !narrow() ? "flex-[4] min-w-0" : "w-full max-w-md"}`}>
                <div class="aspect-square rounded-2xl overflow-hidden bg-white/10 shadow-2xl shadow-black/60" style={{ width: "min(100%, calc(100vh - 22rem))" }}>
                  <Show when={s().coverArt}>
                    <img src={props.client.coverUrl(s().coverArt, 900)} class="size-full object-cover" alt="" />
                  </Show>
                </div>
                <Meta song={s()} client={props.client} />
                <Transport song={s()} />
              </div>
            </Show>
            <Show when={pane()}>
              <div class={`min-h-0 min-w-0 flex flex-col ${narrow() ? "flex-1 w-full" : "flex-[6] h-full"}`}>
                <Show when={narrow()}><Meta song={s()} client={props.client} compact /></Show>
                <Show when={pane() === "lyrics"} fallback={<NowPlayingQueue client={props.client} />}>
                  <div class="np-lyrics flex-1 min-h-0 flex flex-col"><LyricsPanel embedded /></div>
                </Show>
                <Show when={narrow()}><Transport song={s()} /></Show>
              </div>
            </Show>
          </div>
        </section>
      )}
    </Show>
  );
}
