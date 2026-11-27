import { For, onMount, Show } from "solid-js";
import { IconPlaylist, IconPlayerPlayFilled, IconPlus, IconLoader2 } from "@tabler/icons-solidjs";
import type { Playlist, SubsonicClient } from "../api";
import { playQueue } from "../player";
import { enter, hoverAnim, stagger } from "../motion";
import { firstShow } from "../firstShow";
import { openCreateDialog } from "../store";

function PlaylistCard(props: { client: SubsonicClient; playlist: Playlist; i: number; onOpen: (id: string) => void }) {
  let cover!: HTMLDivElement;
  let btn!: HTMLButtonElement;
  let hover: { in(): void; out(): void }[] = [];
  onMount(() => {
    hover = [
      hoverAnim(cover, [{ transform: "scale(1)" }, { transform: "scale(1.04)" }]),
      hoverAnim(btn, [{ opacity: 0, transform: "translateY(6px) scale(.9)" }, { opacity: 1, transform: "none" }]),
    ];
  });
  const play = async (e: Event) => {
    e.stopPropagation();
    const { songs } = await props.client.getPlaylist(props.playlist.id);
    if (songs.length) playQueue(props.client, songs, 0);
  };
  return (
    <div
      ref={(e) => { if (firstShow("playlists:cards")) enter(e, { delay: stagger(props.i), y: 14 }); }}
      class="cursor-pointer"
      onMouseEnter={() => hover.forEach((h) => h.in())}
      onMouseLeave={() => hover.forEach((h) => h.out())}
      onClick={() => props.onOpen(props.playlist.id)}
    >
      <div class="relative">
        <div ref={cover} class="aspect-square rounded-lg bg-white/5 overflow-hidden flex items-center justify-center shadow-lg shadow-black/40">
          <Show when={props.playlist.coverArt} fallback={<IconPlaylist size={44} class="text-white/20" />}>
            <img src={props.client.coverUrl(props.playlist.coverArt)} loading="lazy" decoding="async" class="w-full h-full object-cover" alt="" />
          </Show>
        </div>
        <button
          ref={btn}
          class="absolute left-2 bottom-2 size-9 rounded-full bg-white/80 backdrop-blur text-black flex items-center justify-center hover:bg-white disabled:hidden"
          disabled={!props.playlist.songCount}
          onClick={play}
          title="再生"
        >
          <IconPlayerPlayFilled size={18} />
        </button>
      </div>
      <div class="mt-2 text-[13px] font-medium truncate" title={props.playlist.name}>{props.playlist.name}</div>
      <div class="text-[13px] text-white/50">{props.playlist.songCount} 曲</div>
    </div>
  );
}

export default function PlaylistList(props: {
  client: SubsonicClient;
  playlists: Playlist[] | undefined;
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <div>
      <div class="flex items-center justify-between gap-4 mb-6" ref={(e) => { if (firstShow("playlists:title")) enter(e, { y: 10 }); }}>
        <h1 class="text-3xl font-bold">プレイリスト</h1>
        <button class="flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-medium whitespace-nowrap" onClick={() => openCreateDialog()}>
          <IconPlus size={16} class="text-accent" />新規プレイリスト
        </button>
      </div>
      <Show when={props.loading && !props.playlists}>
        <div class="flex items-center gap-2 text-white/50"><IconLoader2 size={18} class="animate-spin" />読み込み中…</div>
      </Show>
      <Show when={!props.loading && !props.playlists?.length}>
        <div class="flex flex-col items-center gap-3 mt-24 text-white/40">
          <IconPlaylist size={48} />
          <p>プレイリストはまだありません</p>
        </div>
      </Show>
      <div class="card-grid">
        <For each={props.playlists}>{(p, i) => <PlaylistCard client={props.client} playlist={p} i={i()} onOpen={props.onOpen} />}</For>
      </div>
    </div>
  );
}
