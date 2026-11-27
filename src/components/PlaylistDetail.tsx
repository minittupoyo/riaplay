import { createResource, createSignal, For, Show } from "solid-js";
import { IconChevronLeft, IconPlayerPlayFilled, IconArrowsShuffle, IconLoader2, IconVolume, IconTrash, IconPlaylist, IconPencil } from "@tabler/icons-solidjs";
import type { SubsonicClient } from "../api";
import { playQueue, current, playing, toggleShuffle, shuffle } from "../player";
import { bumpPlaylists, playlistVersion } from "../store";
import { fmt } from "./PlayerBar";
import SongMenu from "./SongMenu";
import Heart from "./Heart";
import { createReorder } from "../reorder";
import { enter } from "../motion";

export default function PlaylistDetail(props: { client: SubsonicClient; id: string; onBack: () => void }) {
  const [data, { refetch, mutate }] = createResource(() => [props.id, playlistVersion()] as const, ([id]) => props.client.getPlaylist(id));
  const [confirming, setConfirming] = createSignal(false);

  const remove = async () => {
    if (!confirming()) { setConfirming(true); setTimeout(() => setConfirming(false), 3000); return; }
    await props.client.deletePlaylist(props.id);
    bumpPlaylists();
    props.onBack();
  };
  const [editing, setEditing] = createSignal(false);
  const rename = async (name: string) => {
    setEditing(false);
    name = name.trim();
    if (!name || name === data()?.playlist.name) return;
    await props.client.updatePlaylist(props.id, { name });
    bumpPlaylists();
  };
  const { bind, indicator, ref } = createReorder(async (from, to) => {
    const d = data();
    if (!d) return;
    const songs = [...d.songs];
    const [x] = songs.splice(from, 1);
    songs.splice(to, 0, x);
    mutate({ ...d, songs }); // 先に画面へ反映
    try {
      await props.client.setPlaylistSongs(props.id, songs.map((s) => s.id));
    } finally {
      refetch();
    }
  });
  const removeSong = async (index: number) => {
    await props.client.updatePlaylist(props.id, { removeIndexes: [index] });
    bumpPlaylists();
    refetch();
  };

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
              <div class="size-44 @xl:size-60 shrink-0 rounded-xl bg-white/5 shadow-2xl shadow-black/60 overflow-hidden flex items-center justify-center">
                <Show when={d().playlist.coverArt} fallback={<IconPlaylist size={64} class="text-white/20" />}>
                  <img src={props.client.coverUrl(d().playlist.coverArt, 400)} class="w-full h-full object-cover" alt="" />
                </Show>
              </div>
              <div class="flex flex-col gap-1 min-w-0">
                <Show
                  when={editing()}
                  fallback={
                    <div class="group/title flex items-center gap-2 min-w-0">
                      <h1 class="text-3xl font-bold truncate">{d().playlist.name}</h1>
                      <button class="p-1 rounded-full text-white/40 hover:text-white opacity-0 group-hover/title:opacity-100" title="名前を変更" onClick={() => setEditing(true)}>
                        <IconPencil size={18} />
                      </button>
                    </div>
                  }
                >
                  <input autofocus class="text-3xl font-bold bg-white/10 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-accent/70 w-full"
                    value={d().playlist.name}
                    onBlur={(e) => rename(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(false); }} />
                </Show>
                <div class="text-sm text-white/50 uppercase tracking-wide">プレイリスト · {d().songs.length} 曲</div>
                <div class="mt-4 flex flex-wrap gap-3">
                  <button class="flex items-center gap-2 whitespace-nowrap rounded-lg bg-accent hover:brightness-110 px-6 py-2 font-medium disabled:opacity-50"
                    disabled={!d().songs.length} onClick={() => playQueue(props.client, d().songs, 0)}>
                    <IconPlayerPlayFilled size={18} />再生
                  </button>
                  <button class={`flex items-center gap-2 whitespace-nowrap rounded-lg bg-white/10 hover:bg-white/15 px-6 py-2 font-medium disabled:opacity-50 ${shuffle() ? "text-accent" : ""}`}
                    disabled={!d().songs.length}
                    onClick={() => { if (!shuffle()) toggleShuffle(); playQueue(props.client, d().songs, Math.floor(Math.random() * d().songs.length)); }}>
                    <IconArrowsShuffle size={18} />シャッフル
                  </button>
                  <button class={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium ${confirming() ? "bg-accent" : "bg-white/10 hover:bg-white/15 text-white/70"}`} onClick={remove}>
                    <IconTrash size={18} />{confirming() ? "もう一度押して削除" : "削除"}
                  </button>
                  <SongMenu client={props.client} songs={() => d().songs}
                    triggerClass="flex items-center rounded-lg bg-white/10 hover:bg-white/15 px-3 py-2.5 h-full" />
                </div>
              </div>
            </div>
            <Show when={d().songs.length} fallback={<p class="text-white/40">曲がありません。曲のメニューから追加できます。</p>}>
              <ul ref={ref}>
                <For each={d().songs}>
                  {(s, i) => (
                    <li class="group flex items-center gap-4 rounded-md px-3 py-2.5 border-y-2 border-transparent odd:bg-white/[0.04] hover:bg-white/10 cursor-pointer"
                      {...bind(i())} style={indicator(i())} onClick={() => playQueue(props.client, d().songs, i())}>
                      <span class="w-6 text-right text-white/40 text-sm tabular-nums">
                        <Show when={current()?.id === s.id && playing()} fallback={i() + 1}>
                          <IconVolume size={16} class="inline text-accent" />
                        </Show>
                      </span>
                      <span class={`flex-1 min-w-0 truncate ${current()?.id === s.id ? "text-accent" : ""}`}>{s.title}</span>
                      <span class="hidden @2xl:block w-40 truncate text-sm text-white/40">{s.artist}</span>
                      <span class="text-sm text-white/40 tabular-nums">{fmt(s.duration)}</span>
                      <Heart client={props.client} kind="song" item={s} />
                      <SongMenu client={props.client} songs={() => [s]} onRemove={{ label: "プレイリストから削除", run: () => removeSong(i()) }} />
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
