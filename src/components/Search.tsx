import { createResource, createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import { IconSearch, IconX, IconLoader2 } from "@tabler/icons-solidjs";
import type { SubsonicClient } from "../api";
import { enter } from "../motion";
import { firstShow } from "../firstShow";
import { playQueue, current } from "../player";
import { fmt } from "./PlayerBar";
import AlbumCard from "./AlbumCard";
import SongMenu from "./SongMenu";
import Heart from "./Heart";

export default function Search(props: {
  client: SubsonicClient;
  query: string;
  setQuery: (q: string) => void;
  onAlbum: (id: string) => void;
  onArtist: (id: string) => void;
}) {
  // 入力が止まってから検索する（デバウンス）
  const [debounced, setDebounced] = createSignal(props.query.trim());
  createEffect(() => {
    const q = props.query.trim();
    const t = setTimeout(() => setDebounced(q), 300);
    onCleanup(() => clearTimeout(t));
  });
  const [res] = createResource(debounced, (q) => (q ? props.client.search(q) : null));

  const heading = "text-xl font-semibold mb-4";
  const empty = () => res() && !res()!.artists.length && !res()!.albums.length && !res()!.songs.length;

  return (
    <div ref={(e) => { if (firstShow("search:page")) enter(e, { y: 10 }); }}>
      <label class="flex items-center gap-2 rounded-xl bg-white/10 px-3 mb-8 max-w-xl focus-within:ring-2 focus-within:ring-accent/70">
        <IconSearch size={18} class="text-white/40" />
        <input
          autofocus
          class="w-full bg-transparent py-2.5 outline-none placeholder:text-white/40"
          placeholder="アーティスト・アルバム・曲を検索"
          value={props.query}
          onInput={(e) => props.setQuery(e.currentTarget.value)}
        />
        <Show when={props.query}>
          <button type="button" onClick={() => props.setQuery("")}><IconX size={16} class="text-white/40 hover:text-white" /></button>
        </Show>
      </label>

      <Show when={res.loading}><IconLoader2 class="animate-spin text-white/40" /></Show>
      <Show when={res.error}><p class="text-accent">{String(res.error)}</p></Show>
      <Show when={empty()}><p class="text-white/40">「{debounced()}」に一致する結果はありません</p></Show>

      <Show when={res()}>
        {(r) => (
          <div class="space-y-8">
            <Show when={r().artists.length}>
              <section>
                <h2 class={heading}>アーティスト</h2>
                <div class="flex flex-wrap gap-2">
                  <For each={r().artists}>
                    {(a) => (
                      <button class="rounded-full bg-white/10 hover:bg-white/15 px-4 py-1.5 text-sm" onClick={() => props.onArtist(a.id)}>{a.name}</button>
                    )}
                  </For>
                </div>
              </section>
            </Show>

            <Show when={r().albums.length}>
              <section>
                <h2 class={heading}>アルバム</h2>
                <div class="card-grid">
                  <For each={r().albums}>
                    {(a) => (
                      <AlbumCard client={props.client} album={a} onOpen={props.onAlbum} />
                    )}
                  </For>
                </div>
              </section>
            </Show>

            <Show when={r().songs.length}>
              <section>
                <h2 class={heading}>曲</h2>
                <ul>
                  <For each={r().songs}>
                    {(s, i) => (
                      <li class="group flex items-center gap-4 rounded px-3 py-2 odd:bg-white/[0.04] hover:bg-white/10 cursor-pointer"
                        onClick={() => playQueue(props.client, r().songs, i())}>
                        <span class={`flex-1 truncate ${current()?.id === s.id ? "text-accent" : ""}`}>{s.title}</span>
                        <span class="hidden @2xl:block w-48 truncate text-sm text-white/40">{s.artist}</span>
                        <span class="hidden @3xl:block w-48 truncate text-sm text-white/40">{s.album}</span>
                        <span class="text-sm text-white/40 tabular-nums">{fmt(s.duration)}</span>
                        <Heart client={props.client} kind="song" item={s} />
                        <SongMenu client={props.client} songs={() => [s]} />
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
