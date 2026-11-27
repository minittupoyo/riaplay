import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import { IconLoader2, IconPlaylistAdd, IconAlertCircle } from "@tabler/icons-solidjs";
import type { Playlist, SubsonicClient } from "../api";
import { animate, createPresence } from "../motion";
import { bumpPlaylists, closeCreateDialog, createDialog } from "../store";

/** プレイリスト作成ダイアログ（アプリ全体で 1 つ。openCreateDialog() で開く） */
export default function CreatePlaylistDialog(props: { client: SubsonicClient; onCreated: (p: Playlist | null) => void }) {
  const [name, setName] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const open = () => createDialog() !== null;

  const [present, ref] = createPresence(
    open,
    { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 180 } },
    { keyframes: [{ opacity: 1 }, { opacity: 0 }], options: { duration: 140 } },
  );

  let input: HTMLInputElement | undefined;
  // 開くたびに状態を初期化して入力欄にフォーカス
  createEffect(on(open, (o) => {
    if (!o) return;
    setName(""); setError(""); setBusy(false);
    queueMicrotask(() => input?.focus());
  }));
  // Esc で閉じる
  createEffect(() => {
    if (!open()) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy()) closeCreateDialog(); };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const submit = async (e: Event) => {
    e.preventDefault();
    const n = name().trim();
    if (!n || busy()) return;
    setBusy(true);
    setError("");
    try {
      const songs = (await createDialog()?.songs?.()) ?? [];
      const p = await props.client.createPlaylist(n, songs.map((s) => s.id));
      bumpPlaylists();
      closeCreateDialog();
      props.onCreated(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Show when={present()}>
      <div ref={ref} class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60" onClick={() => !busy() && closeCreateDialog()} />
        <form
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-playlist-title"
          onSubmit={submit}
          ref={(e) => queueMicrotask(() => animate(e, [{ opacity: 0, transform: "scale(.95) translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 220 }))}
          class="relative w-full max-w-sm rounded-2xl bg-neutral-800 border border-white/10 shadow-2xl shadow-black/60 p-6"
        >
          <div class="flex items-center gap-3 mb-5">
            <div class="size-10 rounded-full bg-accent/15 text-accent flex items-center justify-center"><IconPlaylistAdd size={22} /></div>
            <h2 id="create-playlist-title" class="text-lg font-semibold">新規プレイリスト</h2>
          </div>
          <Show when={createDialog()?.songs}>
            <p class="mb-3 text-sm text-white/50">選択した曲をこのプレイリストに追加します。</p>
          </Show>
          <input
            ref={input}
            class="w-full rounded-xl bg-white/10 px-4 py-2.5 outline-none placeholder:text-white/40 focus:ring-2 focus:ring-accent/70 select-text"
            placeholder="プレイリスト名"
            value={name()}
            maxLength={100}
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <Show when={error()}>
            <p class="mt-3 flex items-center gap-2 text-sm text-accent"><IconAlertCircle size={16} />{error()}</p>
          </Show>
          <div class="mt-6 flex justify-end gap-3">
            <button type="button" class="rounded-lg bg-white/10 hover:bg-white/15 px-5 py-2 text-sm font-medium" disabled={busy()} onClick={closeCreateDialog}>キャンセル</button>
            <button type="submit" class="flex items-center gap-2 rounded-lg bg-accent hover:brightness-110 px-5 py-2 text-sm font-medium disabled:opacity-50" disabled={!name().trim() || busy()}>
              <Show when={busy()}><IconLoader2 size={16} class="animate-spin" /></Show>作成
            </button>
          </div>
        </form>
      </div>
    </Show>
  );
}
