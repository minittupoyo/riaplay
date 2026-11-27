import { For, Show } from "solid-js";
import { IconHeart, IconVolume } from "@tabler/icons-solidjs";
import type { SubsonicClient } from "../api";
import { favSongs, favAlbums, favArtists } from "../favorites";
import { playQueue, current, playing } from "../player";
import { enter, stagger } from "../motion";
import { firstShow } from "../firstShow";
import AlbumCard, { Cover } from "./AlbumCard";
import Heart from "./Heart";
import SongMenu from "./SongMenu";
import { fmt } from "./PlayerBar";

export default function Favorites(props: { client: SubsonicClient; onAlbum: (id: string) => void; onArtist: (id: string) => void }) {
  const empty = () => !favSongs().length && !favAlbums().length && !favArtists().length;
  const grid = "card-grid";
  const h2 = "text-xl font-semibold mb-4";
  return (
    <div ref={(e) => { if (firstShow("favorites:page")) enter(e, { y: 10 }); }}>
      <h1 class="text-3xl font-bold mb-6">お気に入り</h1>
      <Show when={empty()}>
        <div class="flex flex-col items-center gap-3 mt-24 text-white/40">
          <IconHeart size={48} />
          <p>お気に入りはまだありません。曲やアルバムのハートを押して追加できます。</p>
        </div>
      </Show>
      <div class="space-y-10">
        <Show when={favArtists().length}>
          <section>
            <h2 class={h2}>アーティスト</h2>
            <div class={grid}>
              <For each={favArtists()}>
                {(a, i) => (
                  <div ref={(e) => { if (firstShow("favorites:artists")) enter(e, { delay: stagger(i()), y: 14 }); }} class="group cursor-pointer relative" onClick={() => props.onArtist(a.id)}>
                    <Cover src={props.client.coverUrl(a.coverArt)} round />
                    <div class="mt-2 text-[13px] font-medium truncate text-center">{a.name}</div>
                    <div class="absolute top-1 right-3"><Heart client={props.client} kind="artist" item={a} class="p-1.5 rounded-full bg-black/50" /></div>
                  </div>
                )}
              </For>
            </div>
          </section>
        </Show>
        <Show when={favAlbums().length}>
          <section>
            <h2 class={h2}>アルバム</h2>
            <div class={grid}>
              <For each={favAlbums()}>{(a, i) => { const anim = firstShow("favorites:albums"); return <AlbumCard i={i()} animate={anim} client={props.client} album={a} onOpen={props.onAlbum} />; }}</For>
            </div>
          </section>
        </Show>
        <Show when={favSongs().length}>
          <section>
            <h2 class={h2}>曲</h2>
            <ul>
              <For each={favSongs()}>
                {(s, i) => (
                  <li class="group flex items-center gap-4 rounded-md px-3 py-2.5 odd:bg-white/[0.04] hover:bg-white/10 cursor-pointer"
                    onClick={() => playQueue(props.client, favSongs(), i())}>
                    <span class="w-6 text-right text-white/40 text-sm tabular-nums">
                      <Show when={current()?.id === s.id && playing()} fallback={i() + 1}><IconVolume size={16} class="inline text-accent" /></Show>
                    </span>
                    <span class={`flex-1 min-w-0 truncate ${current()?.id === s.id ? "text-accent" : ""}`}>{s.title}</span>
                    <span class="hidden @2xl:block w-40 truncate text-sm text-white/40">{s.artist}</span>
                    <Heart client={props.client} kind="song" item={s} />
                    <span class="text-sm text-white/40 tabular-nums">{fmt(s.duration)}</span>
                    <SongMenu client={props.client} songs={() => [s]} />
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>
      </div>
    </div>
  );
}
