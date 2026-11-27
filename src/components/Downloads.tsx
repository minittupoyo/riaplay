import { createMemo, createSignal, For, Show } from "solid-js";
import { IconChevronDown, IconDownload, IconPlayerPlayFilled, IconTrash, IconX } from "@tabler/icons-solidjs";
import type { SubsonicClient } from "../api";
import { cancelAllDownloads, cancelDownload, downloadedFor, jobs, removeDownloads, type DownloadedSong } from "../downloads";
import { playQueue } from "../player";
import { enter } from "../motion";
import { toast } from "../toast";
import { Cover } from "./AlbumCard";
import { fmt } from "./PlayerBar";

const fmtSize = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

interface Group { key: string; album: string; artist: string; coverArt?: string; items: DownloadedSong[] }

/** ダウンロード済みの曲の一覧と、進行中のダウンロード。アルバムごとにまとめ、再生・削除ができる */
export default function Downloads(props: { client: SubsonicClient }) {
  const list = createMemo(() => downloadedFor(props.client.serverId));
  const groups = createMemo(() => {
    const m = new Map<string, Group>();
    for (const e of list()) {
      // ジャケット ID は曲ごとに違うので、キーに使わない
      const key = e.song.albumId ?? `${e.song.album}\u0000${e.song.artist}`;
      let g = m.get(key);
      if (!g) m.set(key, (g = { key, album: e.song.album, artist: e.song.artist, coverArt: e.song.coverArt, items: [] }));
      g.items.push(e);
    }
    return [...m.values()];
  });
  const total = () => list().reduce((n, e) => n + e.size, 0);
  const [openKey, setOpenKey] = createSignal<string | null>(null);
  const [confirming, setConfirming] = createSignal<string | null>(null); // 2 回押して削除する対象
  const confirm = (id: string, run: () => void) => {
    if (confirming() !== id) { setConfirming(id); setTimeout(() => confirming() === id && setConfirming(null), 3000); return; }
    setConfirming(null);
    run();
  };
  const remove = async (items: DownloadedSong[]) => { await removeDownloads(items); toast(`${items.length} 曲のダウンロードを削除しました`); };
  const mine = () => jobs.filter((j) => j.serverId === props.client.serverId);

  const btn = "p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10";
  const delBtn = (id: string, run: () => void, label: string) => (
    <button class={`${btn} ${confirming() === id ? "text-accent" : ""}`} title={confirming() === id ? `もう一度押すと${label}を削除` : `${label}を削除`} onClick={() => confirm(id, run)}>
      <IconTrash size={18} />
    </button>
  );

  return (
    <div ref={(e) => enter(e, { y: 10 })}>
      <div class="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 class="text-3xl font-bold">ダウンロード</h1>
          <p class="text-sm text-white/50 mt-1">{list().length} 曲 · {fmtSize(total())}</p>
        </div>
        <Show when={list().length}>
          <button
            class={`rounded-lg px-4 py-2 text-sm ${confirming() === "all" ? "bg-accent" : "bg-white/10 hover:bg-white/15"}`}
            onClick={() => confirm("all", () => remove(list()))}
          >
            {confirming() === "all" ? "もう一度押すと削除" : "すべて削除"}
          </button>
        </Show>
      </div>

      <Show when={mine().length}>
        <section class="mb-8">
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-xl font-semibold">ダウンロード中</h2>
            <button class="text-sm text-white/60 hover:text-white" onClick={cancelAllDownloads}>すべて中止</button>
          </div>
          <ul class="rounded-xl bg-white/[0.04] divide-y divide-white/5">
            <For each={mine()}>
              {(j) => (
                <li class="flex items-center gap-3 px-4 py-2.5">
                  <div class="min-w-0 flex-1">
                    <div class="text-sm truncate">{j.song.title}</div>
                    <div class="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                      <div class="h-full bg-white/80 transition-[width] duration-150" style={{ width: j.total > 0 ? `${Math.min(100, (j.received / j.total) * 100)}%` : "0%" }} />
                    </div>
                  </div>
                  <span class="w-16 text-right text-xs text-white/50 tabular-nums">
                    {j.status === "queued" ? "待機中" : j.total > 0 ? `${Math.floor((j.received / j.total) * 100)}%` : "…"}
                  </span>
                  <button class="p-1 rounded-full text-white/50 hover:text-white" title="中止" onClick={() => cancelDownload(j.key)}><IconX size={16} /></button>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <Show when={groups().length} fallback={
        <Show when={!mine().length}>
          <div class="flex flex-col items-center gap-3 mt-24 text-white/40 text-center">
            <IconDownload size={48} />
            <p>ダウンロードした曲はまだありません。<br />曲やアルバムの「…」メニュー、または右クリックから「ダウンロード」を選ぶと、ここに追加されます。</p>
          </div>
        </Show>
      }>
        <ul class="space-y-2">
          <For each={groups()}>
            {(g) => (
              <li class="rounded-xl bg-white/[0.04]">
                <div class="flex items-center gap-4 p-3">
                  <div class="w-16 shrink-0"><Cover src={props.client.coverUrl(g.coverArt, 120)} /></div>
                  <button class="min-w-0 flex-1 text-left" onClick={() => setOpenKey(openKey() === g.key ? null : g.key)}>
                    <div class="font-medium truncate">{g.album}</div>
                    <div class="text-sm text-white/50 truncate">{g.artist}</div>
                    <div class="text-xs text-white/40 mt-0.5">{g.items.length} 曲 · {fmtSize(g.items.reduce((n, e) => n + e.size, 0))}</div>
                  </button>
                  <button class={btn} title="再生" onClick={() => playQueue(props.client, g.items.map((e) => e.song), 0)}><IconPlayerPlayFilled size={20} /></button>
                  {delBtn(g.key, () => remove(g.items), "このアルバム")}
                  <button class={`${btn} transition-transform ${openKey() === g.key ? "rotate-180" : ""}`} title="曲を表示" onClick={() => setOpenKey(openKey() === g.key ? null : g.key)}>
                    <IconChevronDown size={18} />
                  </button>
                </div>
                <Show when={openKey() === g.key}>
                  <ul class="border-t border-white/5 px-2 py-1">
                    <For each={g.items}>
                      {(e, i) => (
                        <li class="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/10 cursor-pointer" onClick={() => playQueue(props.client, g.items.map((x) => x.song), i())}>
                          <span class="w-6 text-right text-sm text-white/40 tabular-nums">{e.song.track ?? i() + 1}</span>
                          <span class="min-w-0 flex-1 truncate">{e.song.title}</span>
                          <span class="text-xs text-white/40 tabular-nums">{fmtSize(e.size)}</span>
                          <span class="w-10 text-right text-sm text-white/40 tabular-nums">{fmt(e.song.duration)}</span>
                          <button class="p-1 rounded-full text-white/40 hover:text-white" title="削除" onClick={(ev) => { ev.stopPropagation(); void remove([e]); }}>
                            <IconTrash size={16} />
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
