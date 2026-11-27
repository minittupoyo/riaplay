import { createEffect, For, on, Show } from "solid-js";
import { IconX, IconTrash, IconVolume } from "@tabler/icons-solidjs";
import type { SubsonicClient } from "../api";
import { queue, index, playing, jumpTo, removeFromQueue, clearQueue, moveInQueue } from "../player";
import { fmt } from "./PlayerBar";
import { createReorder } from "../reorder";

/** 再生中画面専用のキュー。サイドパネルより大きく、曲が変わると現在の曲が見える位置までスクロールする */
export default function NowPlayingQueue(props: { client: SubsonicClient }) {
  const { bind, indicator, ref } = createReorder(moveInQueue);
  let scroller!: HTMLDivElement;
  let list: HTMLElement | undefined;

  const reveal = (smooth: boolean) => {
    const el = list?.children[index()] as HTMLElement | undefined;
    if (!el) return;
    const sr = scroller.getBoundingClientRect(), er = el.getBoundingClientRect();
    scroller.scrollTo({ top: scroller.scrollTop + (er.top - sr.top) - scroller.clientHeight / 3, behavior: smooth ? "smooth" : "auto" });
  };
  // 開いた直後は一気に、曲が変わったときはなめらかに、現在の曲へ合わせる
  createEffect(on(() => queue().length && index(), () => queueMicrotask(() => reveal(true)), { defer: true }));
  const mounted = (e: HTMLElement) => { list = e; ref(e); queueMicrotask(() => reveal(false)); };

  return (
    <div class="flex-1 min-h-0 flex flex-col">
      <div class="flex items-center justify-between px-3 pb-3">
        <h2 class="text-2xl font-bold">キュー</h2>
        <Show when={queue().length}>
          <button class="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10" title="キューを空にする" onClick={clearQueue}><IconTrash size={20} /></button>
        </Show>
      </div>
      <div ref={scroller} class="fade-y flex-1 min-h-0 overflow-y-scroll px-1">
        <Show when={queue().length} fallback={<p class="px-3 text-white/40">キューは空です</p>}>
          <ul ref={mounted}>
            <For each={queue()}>
              {(s, i) => (
                <li
                  class={`group flex items-center gap-4 rounded-xl px-3 py-2 cursor-pointer hover:bg-white/10 border-y-2 border-transparent ${i() === index() ? "bg-white/25" : ""}`}
                  {...bind(i())} style={indicator(i())} onClick={() => jumpTo(i())}
                >
                  <div class="relative size-14 shrink-0">
                    <Show when={s.coverArt} fallback={<div class="size-14 rounded-lg bg-white/10" />}>
                      <img src={props.client.coverUrl(s.coverArt, 120)} loading="lazy" class="size-14 rounded-lg object-cover" alt="" />
                    </Show>
                    <Show when={i() === index() && playing()}>
                      <div class="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center"><IconVolume size={20} class="text-white" /></div>
                    </Show>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class={`text-lg truncate ${i() === index() ? "font-extrabold text-white" : "font-medium text-white/80"}`}>{s.title}</div>
                    <div class="text-sm text-white/55 truncate">{s.artist}</div>
                  </div>
                  <span class="text-sm text-white/40 tabular-nums group-hover:hidden">{fmt(s.duration)}</span>
                  <button class="hidden group-hover:block p-1.5 rounded-full text-white/60 hover:text-white" title="キューから削除"
                    onClick={(e) => { e.stopPropagation(); removeFromQueue(i()); }}>
                    <IconX size={18} />
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <div class="h-[30vh]" />
      </div>
    </div>
  );
}
