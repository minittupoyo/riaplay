import { onMount, Show } from "solid-js";
import { enter, hoverAnim, stagger } from "../motion";
import { IconDisc, IconPlayerPlayFilled } from "@tabler/icons-solidjs";
import type { Album, SubsonicClient } from "../api";
import { playQueue } from "../player";
import SongMenu from "./SongMenu";
import Heart from "./Heart";

export function Cover(props: { src?: string; round?: boolean; ref?: (e: HTMLDivElement) => void }) {
  return (
    <div ref={props.ref} class={`aspect-square bg-white/5 overflow-hidden flex items-center justify-center shadow-lg shadow-black/40 ${props.round ? "rounded-full" : "rounded-lg"}`}>
      <Show when={props.src} fallback={<IconDisc size={40} class="text-white/20" />}>
        <img src={props.src} loading="lazy" decoding="async" class="w-full h-full object-cover" alt="" />
      </Show>
    </div>
  );
}

export default function AlbumCard(props: { client: SubsonicClient; album: Album; onOpen: (id: string) => void; showArtist?: boolean; i?: number; animate?: boolean }) {
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
    const { songs } = await props.client.getAlbum(props.album.id);
    playQueue(props.client, songs, 0);
  };
  return (
    <div
      ref={(e) => { if (props.animate !== false) enter(e, { delay: stagger(props.i ?? 0), y: 14 }); }}
      class="group cursor-pointer"
      onMouseEnter={() => hover.forEach((h) => h.in())}
      onMouseLeave={() => hover.forEach((h) => h.out())}
      onClick={() => props.onOpen(props.album.id)}
    >
      <div class="relative">
        <Cover ref={(e) => (cover = e)} src={props.client.coverUrl(props.album.coverArt)} />
        <button
          ref={btn}
          class="absolute left-2 bottom-2 size-9 rounded-full bg-white/80 backdrop-blur text-black flex items-center justify-center hover:bg-white"
          onClick={play}
          title="再生"
        >
          <IconPlayerPlayFilled size={18} />
        </button>
        <div class="absolute left-2 top-2">
          <Heart client={props.client} kind="album" item={props.album} size={16} class="p-1.5 rounded-full bg-black/50 backdrop-blur" />
        </div>
        <div class="absolute right-2 top-2">
          <SongMenu client={props.client} songs={async () => (await props.client.getAlbum(props.album.id)).songs}
            triggerClass="p-1 rounded-full bg-black/50 backdrop-blur text-white opacity-0 group-hover:opacity-100 hover:bg-black/70" />
        </div>
      </div>
      <div class="mt-2 text-[13px] font-medium truncate" title={props.album.name}>{props.album.name}</div>
      <div class="text-[13px] text-white/50 truncate">
        {props.showArtist === false ? props.album.year : props.album.artist}
      </div>
    </div>
  );
}
