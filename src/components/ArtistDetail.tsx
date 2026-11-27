import { createResource, For, Show } from "solid-js";
import { IconChevronLeft, IconLoader2 } from "@tabler/icons-solidjs";
import type { SubsonicClient } from "../api";
import { enter } from "../motion";
import { libraryVersion, refreshed } from "../store";
import AlbumCard from "./AlbumCard";
import Heart from "./Heart";

export default function ArtistDetail(props: { client: SubsonicClient; id: string; onBack: () => void; onAlbum: (id: string) => void }) {
  const [data] = createResource<Awaited<ReturnType<SubsonicClient["getArtist"]>>, readonly [string, number]>(() => [props.id, libraryVersion()] as const, ([id], { value }) => refreshed(value, () => props.client.getArtist(id)));
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
            <div class="flex items-center gap-3 mb-8">
              <h1 class="text-4xl font-bold">{d().artist.name}</h1>
              <Heart client={props.client} kind="artist" item={d().artist} always size={24} />
            </div>
            <h2 class="text-xl font-semibold mb-4">アルバム</h2>
            <div class="card-grid">
              <For each={d().albums}>
                {(a) => <AlbumCard client={props.client} album={a} onOpen={props.onAlbum} showArtist={false} />}
              </For>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
