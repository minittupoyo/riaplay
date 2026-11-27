import { createEffect, createSignal, on, Show } from "solid-js";
import { animate, createPresence, enter } from "../motion";
import {
  IconPlayerPlayFilled, IconPlayerPauseFilled, IconPlayerSkipBackFilled, IconPlayerSkipForwardFilled,
  IconArrowsShuffle, IconRepeat, IconRepeatOnce, IconVolume, IconVolume2, IconVolume3, IconListNumbers, IconQuote, IconArrowsMaximize,
} from "@tabler/icons-solidjs";
import type { SubsonicClient } from "../api";
import {
  current, playing, time, duration, toggle, next, prev, seek,
  shuffle, repeat, volume, muted, toggleShuffle, cycleRepeat, setVolume, toggleMute,
} from "../player";
import Slider from "./Slider";
import Heart from "./Heart";
import AudioInfo from "./AudioInfo";
import { queueOpen, lyricsOpen, panelOpen, toggleQueue, toggleLyrics, bp, setNowPlayingOpen } from "../store";

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function PlayerBar(props: { client: SubsonicClient }) {
  const ctl = "p-2 rounded-full";
  const narrow = () => bp() === "narrow";
  // サイドバー幅（wide=15rem / medium=4rem レール / narrow=なし）に合わせて左端を決める
  const left = () => (bp() === "wide" ? "left-64" : bp() === "medium" ? "left-20" : "left-4");
  // 右パネルが本文を押し出すのは wide/medium のとき。narrow では本文に重なるのでバーは動かさない
  const right = () => (panelOpen() && !narrow() ? "right-[21rem]" : "right-4");
  let footer: HTMLElement | undefined;

  // 音量: 音量アイコンにホバーすると、歌詞/キューのアイコンの位置にスライダーを重ねて表示する
  const [volHover, setVolHover] = createSignal(false);
  let cluster!: HTMLDivElement;
  let dragging = false;
  const [sliderPresent, sliderRef] = createPresence(
    volHover,
    { keyframes: [{ opacity: 0, transform: "translateX(10px)" }, { opacity: 1, transform: "none" }], options: { duration: 180 } },
    { keyframes: [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(10px)" }], options: { duration: 140 } },
  );
  const startDrag = () => {
    dragging = true;
    const end = () => {
      dragging = false;
      window.removeEventListener("pointerup", end);
      if (!cluster.matches(":hover")) setVolHover(false); // ドラッグ中に外へ出ていたら、離したときに閉じる
    };
    window.addEventListener("pointerup", end);
  };
  let info: HTMLElement | undefined;
  let playBtn: HTMLElement | undefined;

  // 曲が変わったら曲情報をふわっと切り替える
  createEffect(on(() => current()?.id, () => info && animate(info, [{ opacity: 0.2, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 320 }), { defer: true }));
  // 再生/一時停止でボタンをポンと弾ませる
  createEffect(on(playing, () => playBtn && animate(playBtn, [{ transform: "scale(.8)" }, { transform: "scale(1.08)", offset: 0.6 }, { transform: "scale(1)" }], { duration: 260, fill: "none" }), { defer: true }));
  // キューパネルの開閉に合わせて右端をなめらかに動かす
  createEffect(on(panelOpen, (open) => footer && !narrow() && animate(footer, [{ right: open ? "1rem" : "21rem" }, { right: open ? "21rem" : "1rem" }], { duration: open ? 300 : 260, fill: "none" }), { defer: true }));
  const toggled = (on: boolean) => (on ? "text-accent" : "text-white/50 hover:text-white");
  return (
    <Show when={current()}>
      {(s) => (
        <footer ref={(e) => { footer = e; enter(e, { y: 28, duration: 420 }); }} class={`absolute ${left()} ${right()} bottom-4 h-[76px] rounded-2xl bg-neutral-800/70 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/50 grid items-center px-4 ${narrow() ? "grid-cols-[minmax(0,1fr)_auto_auto] gap-2" : "grid-cols-[1fr_minmax(0,1.4fr)_1fr] gap-4"}`}>
          <div ref={(e) => (info = e)} class="flex items-center gap-3 min-w-0">
            <Show when={s().coverArt} fallback={<div class="size-12 rounded-md bg-white/10" />}>
              <img src={props.client.coverUrl(s().coverArt, 100)} class="size-12 rounded-md object-cover shadow cursor-pointer" alt="" title="再生中画面を開く" onClick={() => setNowPlayingOpen(true)} />
            </Show>
            <div class="min-w-0">
              <div class="text-sm font-medium truncate">{s().title}</div>
              <div class="text-xs text-white/50 truncate">{s().artist}</div>
            </div>
            <Heart client={props.client} kind="song" item={s()} always />
          </div>

          <div class="flex flex-col items-center gap-0.5">
            <div class="flex items-center gap-1">
              <button class={`${ctl} ${toggled(shuffle())} ${narrow() ? "hidden" : ""}`} title="シャッフル" onClick={toggleShuffle}><IconArrowsShuffle size={17} /></button>
              <button class={ctl} onClick={prev}><IconPlayerSkipBackFilled size={20} /></button>
              <button ref={(e) => (playBtn = e)} class={`${ctl} hover:bg-white/10`} onClick={toggle}>
                <Show when={playing()} fallback={<IconPlayerPlayFilled size={26} />}><IconPlayerPauseFilled size={26} /></Show>
              </button>
              <button class={ctl} onClick={next}><IconPlayerSkipForwardFilled size={20} /></button>
              <button class={`${ctl} ${toggled(repeat() !== "off")} ${narrow() ? "hidden" : ""}`} title="リピート" onClick={cycleRepeat}>
                <Show when={repeat() === "one"} fallback={<IconRepeat size={17} />}><IconRepeatOnce size={17} /></Show>
              </button>
            </div>
            <div class={narrow() ? "absolute left-5 right-5 bottom-1.5" : "flex items-center gap-2 w-full text-[11px] text-white/50 tabular-nums"}>
              <Show when={!narrow()}><span class="w-9 text-right">{fmt(time())}</span></Show>
              <Slider class="flex-1 w-full" value={time()} max={duration() || s().duration} onInput={seek} />
              <Show when={!narrow()}><span class="w-9">{fmt(duration() || s().duration)}</span></Show>
            </div>
          </div>

          <div
            ref={cluster}
            class="relative flex items-center justify-end gap-1"
            onMouseLeave={() => !dragging && setVolHover(false)}
            onWheel={(e) => volHover() && setVolume(volume() - Math.sign(e.deltaY) * 0.05)}
          >
            <div class={`flex items-center gap-1 transition-opacity duration-200 ${volHover() ? "opacity-0 pointer-events-none" : ""}`}>
              <AudioInfo />
              <button class={`p-2 rounded-full text-white/60 hover:text-white ${narrow() ? "hidden" : ""}`} title="再生中画面" onClick={() => setNowPlayingOpen(true)}>
                <IconArrowsMaximize size={20} />
              </button>
              <button class={`p-2 rounded-full ${lyricsOpen() ? "text-accent" : "text-white/60 hover:text-white"}`} title="歌詞" onClick={toggleLyrics}>
                <IconQuote size={20} />
              </button>
              <button class={`p-2 rounded-full ${queueOpen() ? "text-accent" : "text-white/60 hover:text-white"}`} title="キュー" onClick={toggleQueue}>
                <IconListNumbers size={20} />
              </button>
            </div>
            <Show when={sliderPresent()}>
              <div ref={sliderRef} class="absolute right-10 top-1/2 -translate-y-1/2 w-44 h-9 flex items-center rounded-full bg-white/10 px-4" onPointerDown={startDrag}>
                <Slider class="w-full" max={1} step={0.01} value={muted() ? 0 : volume()} onInput={setVolume} />
              </div>
            </Show>
            <button class={`p-2 text-white/60 hover:text-white ${narrow() ? "hidden" : ""}`} title="ミュート" onMouseEnter={() => setVolHover(true)} onClick={toggleMute}>
              <Show when={!muted() && volume() > 0} fallback={<IconVolume3 size={20} />}>
                <Show when={volume() > 0.5} fallback={<IconVolume2 size={20} />}><IconVolume size={20} /></Show>
              </Show>
            </button>
          </div>
        </footer>
      )}
    </Show>
  );
}
