import { createMemo, createRoot, createSignal } from "solid-js";
import type { Album, Artist, Song, SubsonicClient } from "./api";

export type FavKind = "song" | "album" | "artist";
type Item = Song | Album | Artist;

const [songs, setSongs] = createSignal<Song[]>([]);
const [albums, setAlbums] = createSignal<Album[]>([]);
const [artists, setArtists] = createSignal<Artist[]>([]);
export { songs as favSongs, albums as favAlbums, artists as favArtists };

const ids = createRoot(() => ({
  song: createMemo(() => new Set(songs().map((x) => x.id))),
  album: createMemo(() => new Set(albums().map((x) => x.id))),
  artist: createMemo(() => new Set(artists().map((x) => x.id))),
}));

export const isFav = (kind: FavKind, id: string) => ids[kind]().has(id);

export function clearFavorites() {
  setSongs([]);
  setAlbums([]);
  setArtists([]);
}

export async function loadFavorites(c: SubsonicClient) {
  const s = await c.getStarred();
  setSongs(s.songs);
  setAlbums(s.albums);
  setArtists(s.artists);
}

/** 楽観的に切り替え、失敗したらサーバーの状態に戻す */
export async function toggleFav(c: SubsonicClient, kind: FavKind, item: Item) {
  const on = !isFav(kind, item.id);
  const apply = <T extends { id: string }>(set: (f: (l: T[]) => T[]) => void) =>
    set((l) => (on ? [item as unknown as T, ...l.filter((x) => x.id !== item.id)] : l.filter((x) => x.id !== item.id)));
  if (kind === "song") apply<Song>(setSongs);
  else if (kind === "album") apply<Album>(setAlbums);
  else apply<Artist>(setArtists);
  try {
    await c.setStar(kind, item.id, on);
  } catch {
    loadFavorites(c).catch(() => {});
  }
}
