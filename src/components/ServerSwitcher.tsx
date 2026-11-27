import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { IconMusic, IconSelector, IconCheck, IconPencil, IconTrash, IconPlus } from "@tabler/icons-solidjs";
import { activeId, hostOf, removeServer, servers, setActive, setServerDialog } from "../servers";
import { createPresence } from "../motion";

/** サイドバー最上部: 現在のサーバー名。クリックで切り替え・追加・編集・削除のメニュー */
export default function ServerSwitcher(props: { compact: boolean }) {
  const [open, setOpen] = createSignal(false);
  const [confirmId, setConfirmId] = createSignal<string | null>(null);
  let root!: HTMLDivElement;
  const active = () => servers().find((s) => s.id === activeId());

  const [present, ref] = createPresence(
    open,
    { keyframes: [{ opacity: 0, transform: "scale(.96) translateY(-4px)" }, { opacity: 1, transform: "none" }], options: { duration: 160 } },
    { keyframes: [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.98)" }], options: { duration: 120 } },
  );
  const onDoc = (e: MouseEvent) => { if (!root.contains(e.target as Node)) close(); };
  onMount(() => document.addEventListener("mousedown", onDoc));
  onCleanup(() => document.removeEventListener("mousedown", onDoc));
  const close = () => { setOpen(false); setConfirmId(null); };

  const row = "flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/10";
  return (
    <div ref={root} class="relative mb-2">
      <button
        class={`flex items-center w-full rounded-lg hover:bg-white/5 ${props.compact ? "justify-center py-2" : "gap-2 px-3 pt-2 pb-2.5 text-left"}`}
        title={active()?.name ?? "サーバー"}
        onClick={() => (open() ? close() : setOpen(true))}
      >
        <IconMusic size={22} class="text-accent shrink-0" />
        <Show when={!props.compact}>
          <span class="min-w-0 flex-1">
            <span class="block text-lg font-semibold leading-tight truncate">{active()?.name ?? "riaplay"}</span>
            <span class="block text-[11px] text-white/40 truncate">{active() ? `${active()!.username}@${hostOf(active()!.url)}` : ""}</span>
          </span>
          <IconSelector size={16} class="text-white/40 shrink-0" />
        </Show>
      </button>

      <Show when={present()}>
        <div
          ref={ref}
          class={`absolute z-50 w-64 origin-top-left rounded-xl bg-neutral-800 border border-white/10 shadow-2xl shadow-black/60 p-1 ${props.compact ? "left-full top-0 ml-2" : "left-0 top-full mt-1"}`}
        >
          <div class="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-white/40">サーバー</div>
          <div class="max-h-72 overflow-y-auto">
            <For each={servers()}>
              {(s) => (
                <div class="group flex items-center rounded-lg hover:bg-white/10">
                  <button
                    class={`${row} flex-1 min-w-0 hover:bg-transparent`}
                    onClick={() => { close(); if (s.id !== activeId()) setActive(s.id); }}
                  >
                    <span class="w-4 shrink-0"><Show when={s.id === activeId()}><IconCheck size={16} class="text-accent" /></Show></span>
                    <span class="min-w-0">
                      <span class="block truncate">{s.name}</span>
                      <span class="block truncate text-[11px] text-white/40">{s.username}@{hostOf(s.url)}</span>
                    </span>
                  </button>
                  <button class="p-1.5 rounded-full text-white/40 hover:text-white opacity-0 group-hover:opacity-100" title="編集" onClick={() => { close(); setServerDialog({ mode: "edit", id: s.id }); }}>
                    <IconPencil size={15} />
                  </button>
                  <button
                    class={`p-1.5 mr-1 rounded-full ${confirmId() === s.id ? "bg-accent text-white opacity-100" : "text-white/40 hover:text-white opacity-0 group-hover:opacity-100"}`}
                    title={confirmId() === s.id ? "もう一度押して削除" : "削除"}
                    onClick={() => {
                      if (confirmId() !== s.id) { setConfirmId(s.id); setTimeout(() => setConfirmId((c) => (c === s.id ? null : c)), 3000); return; }
                      close();
                      removeServer(s.id);
                    }}
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              )}
            </For>
          </div>
          <div class="border-t border-white/10 mt-1 pt-1">
            <button class={`${row} text-accent`} onClick={() => { close(); setServerDialog({ mode: "add" }); }}>
              <IconPlus size={16} />サーバーを追加…
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
