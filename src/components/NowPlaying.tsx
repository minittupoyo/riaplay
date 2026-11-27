import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import {
  IconChevronDown, IconPlayerPlayFilled, IconPlayerPauseFilled, IconPlayerSkipBackFilled, IconPlayerSkipForwardFilled,
  IconArrowsShuffle, IconRepeat, IconRepeatOnce, IconVolume, IconVolume2, IconVolume3, IconQuote, IconListNumbers,
  IconHeart, IconHeartFilled, IconX,
} from "@tabler/icons-solidjs";
import type { Song, SubsonicClient } from "../api";
import {
  current, playing, time, duration, toggle, next, prev, seek,
  shuffle, repeat, volume, muted, toggleShuffle, cycleRepeat, setVolume, toggleMute,
} from "../player";
import { isFav, toggleFav } from "../favorites";
import { settings } from "../settings";
import { bp, setNowPlayingOpen } from "../store";
import Slider from "./Slider";
import LyricsPanel from "./LyricsPanel";
import NowPlayingQueue from "./NowPlayingQueue";
import { fmt } from "./PlayerBar";

const canHover = typeof matchMedia === "function" && matchMedia("(hover: hover)").matches;

/** ジャケットの色を大きくぼかして敷いた背景。同じ画像を数枚、角度と位置を変えて重ね、ゆっくり動かす */
function Background(props: { src?: string }) {
  return (
    <div class="np-bg" aria-hidden="true">
      <Show when={props.src}>
        <img src={props.src} class="np-bg-a" alt="" />
        <img src={props.src} class="np-bg-b" alt="" />
        <img src={props.src} class="np-bg-c" alt="" />
      </Show>
      <div class="absolute inset-0 bg-black/10" />
    </div>
  );
}

function SeekBar(p: { song: Song }) {
  return (
    <div class="w-full flex items-center gap-3 text-[13px] text-white/80 tabular-nums">
      <span class="w-10 text-right">{fmt(time())}</span>
      <Slider class="np-seek flex-1 w-full" value={time()} max={duration() || p.song.duration} onInput={seek} />
      <span class="w-10">{fmt(duration() || p.song.duration)}</span>
    </div>
  );
}

function Titles(p: { song: Song; compact?: boolean }) {
  return (
    <div class="w-full min-w-0 text-center">
      <div class={`font-extrabold truncate ${p.compact ? "text-xl" : "text-[clamp(1.5rem,2.6vw,2.4rem)] leading-tight"}`}>{p.song.title}</div>
      <div class={`text-white/70 truncate ${p.compact ? "text-sm" : "text-[clamp(1rem,1.5vw,1.4rem)]"}`}>{p.song.artist}</div>
    </div>
  );
}

/** ウィンドウいっぱいの再生中画面。ジャケットにホバーすると操作が重なって出る。右側（狭い画面では切り替え）に歌詞かキューを出す */
export default function NowPlaying(props: { client: SubsonicClient; ref?: (e: HTMLElement) => void }) {
  type Pane = "lyrics" | "queue";
  const [pane, setPane] = createSignal<Pane | null>(settings().lyricsEnabled ? "lyrics" : null);
  const togglePane = (p: Pane) => setPane(pane() === p ? null : p);
  const [pinned, setPinned] = createSignal(false); // ホバーできない端末では、ジャケットのタップで操作を出し入れする
  // 歌詞/キューの切り替えバー: ポインターが動いたときだけ出し、止まって少し経つと隠す（バーの上にいる間は出したまま）
  const [showSwitch, setShowSwitch] = createSignal(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let overSwitch = false;
  const wake = () => {
    setShowSwitch(true);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!overSwitch) setShowSwitch(false); }, 2500);
  };
  onCleanup(() => clearTimeout(hideTimer));
  const narrow = () => bp() === "narrow";
  const close = () => setNowPlayingOpen(false);

  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  onMount(() => window.addEventListener("keydown", onKey));
  onCleanup(() => window.removeEventListener("keydown", onKey));
  // 再生が無くなった（キューを空にした・サーバーを切り替えた）ら閉じる
  createEffect(() => { if (!current()) close(); });

  const round = "rounded-full text-white/90 hover:bg-white/20 active:scale-95 transition";
  const on = (b: boolean) => (b ? "text-white" : "text-white/55");

  return (
    <Show when={current()}>
      {(s) => (
        <section ref={props.ref} class="absolute inset-0 z-50 overflow-hidden flex flex-col select-none text-white bg-[#18181b]" onPointerMove={wake} onPointerDown={wake}>
          <Background src={props.client.coverUrl(s().coverArt, 64)} />

          <button class="absolute left-3 top-3 z-10 p-2 rounded-full text-white/50 hover:text-white hover:bg-white/15" title="閉じる (Esc)" onClick={close}>
            <IconChevronDown size={26} />
          </button>

          <div class={`relative flex-1 min-h-0 flex items-center justify-center gap-[clamp(2rem,5vw,6rem)] px-[clamp(1.5rem,5vw,5rem)] py-8 ${narrow() ? "flex-col" : ""}`}>
            {/* 狭い画面で歌詞・キューを出すときは、ジャケットの代わりにそれを出す */}
            <Show when={!(narrow() && pane())}>
              <div class={`flex flex-col items-center justify-center gap-4 min-h-0 ${pane() && !narrow() ? "flex-[4] min-w-0" : "w-full max-w-xl"}`}>
                <div
                  class="np-cover group relative aspect-square rounded-xl overflow-hidden bg-white/10 shadow-2xl shadow-black/50"
                  style={{ width: "min(100%, calc(100vh - 17rem))" }}
                  data-pinned={pinned()}
                  onClick={(e) => { if (!canHover && !(e.target as HTMLElement).closest("button, [data-keep]")) setPinned(!pinned()); }}
                >
                  <Show when={s().coverArt}>
                    <img src={props.client.coverUrl(s().coverArt, 900)} class="size-full object-cover" alt="" />
                  </Show>

                  {/* ホバー時に重ねる操作 */}
                  <div class="np-controls absolute inset-0 bg-gradient-to-b from-black/45 via-black/25 to-black/55">
                    <div class="absolute left-1/2 top-4 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/35 backdrop-blur-md px-2 py-1.5">
                      <button class={`p-2 ${round}`} title="閉じる" onClick={close}><IconX size={20} /></button>
                    </div>

                    <button
                      class="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2 p-4 rounded-full hover:scale-105 active:scale-95 transition text-white drop-shadow-lg"
                      title={isFav("song", s().id) ? "お気に入りから外す" : "お気に入りに追加"}
                      onClick={() => toggleFav(props.client, "song", s())}
                    >
                      <Show when={isFav("song", s().id)} fallback={<IconHeart size={120} stroke="1.6" />}>
                        <IconHeartFilled size={120} class="text-accent" />
                      </Show>
                    </button>

                    <div class="absolute inset-x-0 bottom-5 flex items-center justify-center gap-3">
                      <button class={`p-3 ${round} ${on(shuffle())}`} title="シャッフル" onClick={toggleShuffle}><IconArrowsShuffle size={22} /></button>
                      <button class={`p-3 ${round}`} onClick={prev}><IconPlayerSkipBackFilled size={30} /></button>
                      <button class={`p-3 ${round}`} onClick={toggle}>
                        <Show when={playing()} fallback={<IconPlayerPlayFilled size={44} />}><IconPlayerPauseFilled size={44} /></Show>
                      </button>
                      <button class={`p-3 ${round}`} onClick={next}><IconPlayerSkipForwardFilled size={30} /></button>
                      <button class={`p-3 ${round} ${on(repeat() !== "off")}`} title="リピート" onClick={cycleRepeat}>
                        <Show when={repeat() === "one"} fallback={<IconRepeat size={22} />}><IconRepeatOnce size={22} /></Show>
                      </button>
                    </div>

                    {/* 音量（縦） */}
                    <div class="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 rounded-full bg-black/30 backdrop-blur-md py-3 px-1.5" data-keep>
                      <div class="relative w-5 h-28">
                        <div class="absolute left-1/2 top-1/2 w-28 -translate-x-1/2 -translate-y-1/2 -rotate-90">
                          <Slider class="w-full" max={1} step={0.01} value={muted() ? 0 : volume()} onInput={setVolume} />
                        </div>
                      </div>
                      <button class="p-1 text-white/80 hover:text-white" title="ミュート" onClick={toggleMute}>
                        <Show when={!muted() && volume() > 0} fallback={<IconVolume3 size={18} />}>
                          <Show when={volume() > 0.5} fallback={<IconVolume2 size={18} />}><IconVolume size={18} /></Show>
                        </Show>
                      </button>
                    </div>
                  </div>
                </div>

                <SeekBar song={s()} />
                <Titles song={s()} />
              </div>
            </Show>

            <Show when={pane()}>
              <div class={`min-h-0 min-w-0 flex flex-col ${narrow() ? "flex-1 w-full" : "flex-[6] h-full"}`}>
                <Show when={narrow()}><Titles song={s()} compact /></Show>
                <Show when={pane() === "lyrics"} fallback={<NowPlayingQueue client={props.client} />}>
                  <div class="np-lyrics flex-1 min-h-0 flex flex-col"><LyricsPanel embedded /></div>
                </Show>
                {/* ジャケットが無いときの最小限の操作 */}
                <Show when={narrow()}>
                  <div class="flex flex-col gap-2 pt-2">
                    <SeekBar song={s()} />
                    <div class="flex items-center justify-center gap-4">
                      <button class={`p-2 ${round}`} onClick={prev}><IconPlayerSkipBackFilled size={26} /></button>
                      <button class={`p-2 ${round}`} onClick={toggle}>
                        <Show when={playing()} fallback={<IconPlayerPlayFilled size={36} />}><IconPlayerPauseFilled size={36} /></Show>
                      </button>
                      <button class={`p-2 ${round}`} onClick={next}><IconPlayerSkipForwardFilled size={26} /></button>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
          </div>

          {/* 右下: 歌詞 / キューの切り替え */}
          <div
            class={`absolute right-4 bottom-4 z-10 flex items-center gap-1 rounded-full bg-black/30 backdrop-blur-md p-1.5 transition-opacity duration-300 ${showSwitch() ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            onPointerEnter={() => { overSwitch = true; wake(); }}
            onPointerLeave={() => { overSwitch = false; wake(); }}
          >
            <button class={`p-2 rounded-full ${pane() === "lyrics" ? "bg-white/25 text-white" : "text-white/70 hover:text-white hover:bg-white/15"}`} title="歌詞" onClick={() => togglePane("lyrics")}><IconQuote size={20} /></button>
            <button class={`p-2 rounded-full ${pane() === "queue" ? "bg-white/25 text-white" : "text-white/70 hover:text-white hover:bg-white/15"}`} title="キュー" onClick={() => togglePane("queue")}><IconListNumbers size={20} /></button>
          </div>
        </section>
      )}
    </Show>
  );
}
