import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { IconDots, IconPlayerTrackNext, IconListDetails, IconPlaylistAdd, IconChevronRight, IconTrash, IconPlus } from "@tabler/icons-solidjs";
import type { Playlist, Song, SubsonicClient } from "../api";
import { enqueue, playNext } from "../player";
import { bumpPlaylists, openCreateDialog } from "../store";
import { createPresence } from "../motion";

/** 曲・アルバム・プレイリストなど、曲の集まりに対する共通メニュー */
export default function SongMenu(props: {
  client: SubsonicClient;
  songs: () => Song[] | Promise<Song[]>;
  onRemove?: { label: string; run: () => void };
  triggerClass?: string;
}) {
  const [open, setOpen] = createSignal(false);
  const [sub, setSub] = createSignal(false);
  const [alignLeft, setAlignLeft] = createSignal(false); // 左に収まらないときは、ボタンの左端に揃えて右へ開く
  const [pls, setPls] = createSignal<Playlist[]>([]);
  const [openUp, setOpenUp] = createSignal(false); // 下に収まらないときは上へ開く
  const origin = () =>
    openUp() ? (alignLeft() ? "origin-bottom-left" : "origin-bottom-right") : alignLeft() ? "origin-top-left" : "origin-top-right";
  let root!: HTMLDivElement;

  const close = () => setOpen(false);
  const [present, menuRef] = createPresence(
    open,
    { keyframes: [{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "none" }], options: { duration: 160 } },
    { keyframes: [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.96)" }], options: { duration: 120 } },
  );
  const onDoc = (e: MouseEvent) => { if (!root.contains(e.target as Node)) close(); };
  onMount(() => document.addEventListener("mousedown", onDoc));
  onCleanup(() => document.removeEventListener("mousedown", onDoc));

  const toggle = async (e: Event) => {
    e.stopPropagation();
    const o = !open();
    setSub(false);
    if (o) {
      const edge = root.closest("main")?.getBoundingClientRect().left ?? 0;
      const area = root.closest("main")?.getBoundingClientRect().bottom ?? window.innerHeight;
      // 下端にはプレイヤーバーが重なる分も見込む。サブメニュー展開時の高さ（約 340px）まで入る余地があるか
      setOpenUp(area - 100 - root.getBoundingClientRect().bottom < 340 && root.getBoundingClientRect().top - (root.closest("main")?.getBoundingClientRect().top ?? 0) > 200);
      setAlignLeft(root.getBoundingClientRect().right - 240 < edge + 8); // w-60 = 240px
    }
    setOpen(o);
    if (o) setPls(await props.client.getPlaylists().catch(() => []));
  };
  const act = (e: Event, fn: (songs: Song[]) => void | Promise<void>) => {
    e.stopPropagation();
    Promise.resolve(props.songs()).then(fn).finally(close);
  };

  const item = "flex items-center gap-2.5 w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-white/10";
  return (
    <div ref={root} class="relative" onClick={(e) => e.stopPropagation()}>
      <button
        class={props.triggerClass ?? `p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 group-hover:opacity-100 ${open() ? "opacity-100" : "opacity-0"}`}
        onClick={toggle}
        title="メニュー"
      >
        <IconDots size={18} />
      </button>
      <Show when={present()}>
        <div ref={menuRef} class={`absolute z-30 w-60 ${openUp() ? "bottom-full mb-1" : "top-full mt-1"} ${alignLeft() ? "left-0" : "right-0"} ${origin()} rounded-xl bg-neutral-800 border border-white/10 shadow-2xl shadow-black/60 p-1 text-white font-normal`}>
          <button class={item} onClick={(e) => act(e, (s) => playNext(props.client, s))}>
            <IconPlayerTrackNext size={16} class="text-accent" />次に再生
          </button>
          <button class={item} onClick={(e) => act(e, (s) => enqueue(props.client, s))}>
            <IconListDetails size={16} class="text-accent" />キューに追加
          </button>
          <button class={item} onClick={(e) => { e.stopPropagation(); setSub(!sub()); }}>
            <IconPlaylistAdd size={16} class="text-accent" />プレイリストに追加
            <IconChevronRight size={14} class="ml-auto text-white/40" />
          </button>
          <Show when={sub()}>
            <div class="border-t border-white/10 mt-1 pt-1">
              <button class={`${item} pl-6 text-accent`} onClick={(e) => { e.stopPropagation(); close(); openCreateDialog(props.songs); }}>
                <IconPlus size={14} />新規プレイリスト…
              </button>
              <div class="max-h-44 overflow-y-auto">
                <For each={pls()}>
                  {(p) => (
                    <button class={`${item} pl-6`} onClick={(e) => act(e, async (songs) => { await props.client.updatePlaylist(p.id, { add: songs.map((s) => s.id) }); bumpPlaylists(); })}>
                      <span class="truncate">{p.name}</span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <Show when={props.onRemove}>
            {(r) => (
              <button class={`${item} border-t border-white/10 mt-1 rounded-t-none text-accent`} onClick={(e) => act(e, r().run)}>
                <IconTrash size={16} />{r().label}
              </button>
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}
