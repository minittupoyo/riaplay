import { createResource, For, Show } from "solid-js";
import { IconChevronLeft, IconPlayerPlayFilled, IconArrowsShuffle, IconLoader2, IconVolume, IconDisc } from "@tabler/icons-solidjs";
import type { Song, SubsonicClient } from "../api";
import { enter } from "../motion";
import { libraryVersion, refreshed } from "../store";
import { playQueue, current, playing, toggleShuffle, shuffle } from "../player";
import { fmt } from "./PlayerBar";
import SongMenu from "./SongMenu";
import Heart from "./Heart";

/** 複数ディスクのアルバムはディスクごとに見出しを付けて分ける（1枚だけなら見出しなし）。i は全体の再生順での位置 */
function discs(songs: Song[], titles: Record<number, string>) {
  const groups: { disc: number; label: string; items: { s: Song; i: number }[] }[] = [];
  songs.forEach((s, i) => {
    const disc = s.discNumber ?? 1;
    let g = groups[groups.length - 1];
    if (!g || g.disc !== disc) groups.push((g = { disc, label: "", items: [] }));
    g.items.push({ s, i });
  });
  if (groups.length > 1) for (const g of groups) g.label = titles[g.disc] ? `Disc ${g.disc} · ${titles[g.disc]}` : `Disc ${g.disc}`;
  return groups;
}

export default function AlbumDetail(props: { client: SubsonicClient; id: string; onBack: () => void }) {
  const [data] = createResource<Awaited<ReturnType<SubsonicClient["getAlbum"]>>, readonly [string, number]>(() => [props.id, libraryVersion()] as const, ([id], { value }) => refreshed(value, () => props.client.getAlbum(id)));
  return (
    <div ref={(e) => enter(e, { y: 10 })}>
      <button class="flex items-center gap-0.5 text-accent mb-5 -ml-1" onClick={props.onBack}>
        <IconChevronLeft size={20} />戻る
      </button>
      <Show when={data.loading && !data()}><IconLoader2 class="animate-spin text-white/50" /></Show>
      <Show when={data.error}><p class="text-accent">{String(data.error)}</p></Show>
      <Show when={data()}>
        {(d) => (
          <>
            <div class="flex flex-col @xl:flex-row gap-5 @xl:gap-8 mb-8 @xl:items-end">
              <img src={props.client.coverUrl(d().album.coverArt, 400)} class="size-44 @xl:size-60 rounded-xl object-cover bg-white/5 shadow-2xl shadow-black/60" alt="" />
              <div class="flex flex-col gap-1 min-w-0">
                <h1 class="text-3xl font-bold">{d().album.name}</h1>
                <div class="text-xl text-accent truncate">{d().album.artist}</div>
                <div class="text-sm text-white/50 uppercase tracking-wide">
                  {d().album.year ? `${d().album.year} · ` : ""}{d().songs.length} 曲
                </div>
                <div class="mt-4 flex flex-wrap gap-3">
                  <button class="flex items-center gap-2 whitespace-nowrap rounded-lg bg-accent hover:brightness-110 px-6 py-2 font-medium"
                    onClick={() => playQueue(props.client, d().songs, 0)}>
                    <IconPlayerPlayFilled size={18} />再生
                  </button>
                  <button class={`flex items-center gap-2 whitespace-nowrap rounded-lg bg-white/10 hover:bg-white/15 px-6 py-2 font-medium ${shuffle() ? "text-accent" : ""}`}
                    onClick={() => { if (!shuffle()) toggleShuffle(); playQueue(props.client, d().songs, Math.floor(Math.random() * d().songs.length)); }}>
                    <IconArrowsShuffle size={18} />シャッフル
                  </button>
                  <SongMenu client={props.client} songs={() => d().songs}
                    triggerClass="flex items-center rounded-lg bg-white/10 hover:bg-white/15 px-3 py-2.5 h-full" />
                  <Heart client={props.client} kind="album" item={d().album} always class="flex items-center rounded-lg bg-white/10 hover:bg-white/15 px-3 py-2.5" />
                </div>
              </div>
            </div>
            <For each={discs(d().songs, d().discTitles)}>
              {(g) => (
                <section class="mb-6">
                  <Show when={g.label}>
                    <div class="flex items-center gap-2 px-3 pb-2 mb-1 border-b border-white/10 text-sm font-semibold text-white/60">
                      <IconDisc size={16} />{g.label}
                      <span class="ml-auto font-normal text-white/40 tabular-nums">{g.items.length} 曲 · {fmt(g.items.reduce((n, x) => n + x.s.duration, 0))}</span>
                    </div>
                  </Show>
                  <ul>
                    <For each={g.items}>
                      {({ s, i }) => (
                        <li class="group flex items-center gap-4 rounded-md px-3 py-2.5 odd:bg-white/[0.04] hover:bg-white/10 cursor-pointer"
                          onClick={() => playQueue(props.client, d().songs, i)}>
                          <span class="w-6 text-right text-white/40 text-sm tabular-nums">
                            <Show when={current()?.id === s.id && playing()} fallback={s.track ?? i + 1}>
                              <IconVolume size={16} class="inline text-accent" />
                            </Show>
                          </span>
                          <div class="flex-1 min-w-0">
                            <div class={`truncate ${current()?.id === s.id ? "text-accent" : ""}`}>{s.title}</div>
                            <Show when={s.artist && s.artist !== d().album.artist}>
                              <div class="truncate text-xs text-white/50">{s.artist}</div>
                            </Show>
                          </div>
                          <span class="text-sm text-white/40 tabular-nums">{fmt(s.duration)}</span>
                          <Heart client={props.client} kind="song" item={s} />
                          <SongMenu client={props.client} songs={() => [s]} />
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              )}
            </For>
          </>
        )}
      </Show>
    </div>
  );
}
