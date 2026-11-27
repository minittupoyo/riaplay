import { createEffect, createMemo, createSignal, For, Match, on, Show, Switch } from "solid-js";
import { IconAlertCircle, IconLoader2, IconPencil, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-solidjs";
import { SubsonicClient } from "./api";
import Login from "./components/Login";
import Library from "./components/Library";
import ServerDialog from "./components/ServerDialog";
import Toaster from "./components/Toaster";
import { activeId, addServer, getPassword, hostOf, passwordsReady, removeServer, servers, setActive, setServerDialog, type Server, type ServerInput } from "./servers";
import { clearQueue } from "./player";
import { clearFavorites } from "./favorites";

type Status = "idle" | "connecting" | "ready" | "error";

export default function App() {
  const active = createMemo<Server | null>(() => servers().find((s) => s.id === activeId()) ?? null);
  const [client, setClient] = createSignal<SubsonicClient | null>(null);
  const [status, setStatus] = createSignal<Status>("idle");
  const [error, setError] = createSignal("");
  let token = 0; // 古い接続の結果を捨てるための世代番号

  /** サーバーへ接続する。切り替え時は、前のサーバーの再生・お気に入り・歌詞キャッシュを破棄する */
  const connect = async (s: Server | null) => {
    const my = ++token;
    clearQueue();
    clearFavorites();
    setClient(null);
    if (!s) return setStatus("idle");
    setStatus("connecting");
    setError("");
    try {
      await passwordsReady; // 旧形式のパスワードのキーチェーン移行が終わるのを待つ
      const password = await getPassword(s.id);
      if (my !== token) return;
      if (password === null) throw new Error("パスワードが保存されていません。「編集」からパスワードを入力してください。");
      const c = new SubsonicClient({ ...s, password });
      await c.ping();
      if (my !== token) return;
      setClient(c);
      setStatus("ready");
    } catch (e) {
      if (my !== token) return;
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };
  // 登録済みなら起動時に自動で接続する（ログイン画面は出さない）。アクティブなサーバーが変わる/編集されたら再接続
  createEffect(on(active, (s) => { connect(s); }));

  /** 初回: サーバーが 1 つもないときの接続画面 */
  const firstRun = async (v: ServerInput) => {
    await new SubsonicClient(v).ping();
    setActive((await addServer(v)).id);
  };

  return (
    <>
      <Show when={servers().length > 0} fallback={<Login onSubmit={firstRun} />}>
        <Switch>
          <Match when={status() === "ready" && client()}>{(c) => <Library client={c()} />}</Match>
          <Match when={status() === "error"}>
            <ConnectionError server={active()} message={error()} onRetry={() => connect(active())} />
          </Match>
          <Match when={true}>
            <main class="h-full flex flex-col items-center justify-center gap-3 text-white/50">
              <IconLoader2 size={28} class="animate-spin text-accent" />
              <p class="text-sm">{active()?.name} に接続中…</p>
            </main>
          </Match>
        </Switch>
      </Show>
      <ServerDialog />
      <Toaster />
    </>
  );
}

/** 接続できなかったとき: 再試行・編集・別のサーバーへ切り替え・削除 */
function ConnectionError(props: { server: Server | null; message: string; onRetry: () => void }) {
  const others = () => servers().filter((s) => s.id !== props.server?.id);
  const btn = "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium";
  return (
    <main class="h-full flex items-center justify-center p-6 select-text">
      <div class="w-full max-w-sm">
        <div class="flex items-center gap-3 mb-2">
          <IconAlertCircle size={28} class="text-accent shrink-0" />
          <h1 class="text-xl font-bold">接続できませんでした</h1>
        </div>
        <Show when={props.server}>
          {(s) => <p class="text-sm text-white/50 mb-1">{s().name}（{s().username}@{hostOf(s().url)}）</p>}
        </Show>
        <p class="text-sm text-accent mb-6 break-words">{props.message}</p>
        <div class="flex flex-wrap gap-3">
          <button class={`${btn} bg-accent hover:brightness-110`} onClick={props.onRetry}><IconRefresh size={16} />再試行</button>
          <Show when={props.server}>
            {(s) => <button class={`${btn} bg-white/10 hover:bg-white/15`} onClick={() => setServerDialog({ mode: "edit", id: s().id })}><IconPencil size={16} />編集</button>}
          </Show>
          <Show when={props.server}>
            {(s) => <button class={`${btn} bg-white/10 hover:bg-white/15 text-white/70`} onClick={() => removeServer(s().id)}><IconTrash size={16} />削除</button>}
          </Show>
        </div>
        <Show when={others().length}>
          <div class="mt-8">
            <p class="text-xs font-semibold text-white/40 mb-2">別のサーバーに切り替え</p>
            <For each={others()}>
              {(s) => (
                <button class="flex items-center w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10" onClick={() => setActive(s.id)}>
                  <span class="min-w-0"><span class="block truncate">{s.name}</span><span class="block truncate text-[11px] text-white/40">{s.username}@{hostOf(s.url)}</span></span>
                </button>
              )}
            </For>
          </div>
        </Show>
        <button class="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-accent hover:bg-white/10" onClick={() => setServerDialog({ mode: "add" })}>
          <IconPlus size={16} />サーバーを追加…
        </button>
      </div>
    </main>
  );
}
