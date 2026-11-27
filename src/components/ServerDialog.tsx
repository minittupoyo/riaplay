import { createMemo, createEffect, onCleanup, Show } from "solid-js";
import { IconServer } from "@tabler/icons-solidjs";
import { SubsonicClient } from "../api";
import { animate, createPresence } from "../motion";
import { addServer, getPassword, servers, serverDialog, setActive, setServerDialog, updateServer, type ServerInput } from "../servers";
import LoginForm from "./LoginForm";

/** サーバーの追加・編集ダイアログ。接続確認（ping）に成功したときだけ保存する */
export default function ServerDialog() {
  const open = () => serverDialog() !== null;
  const close = () => setServerDialog(null);
  const [present, ref] = createPresence(
    open,
    { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 180 } },
    { keyframes: [{ opacity: 1 }, { opacity: 0 }], options: { duration: 140 } },
  );
  // 閉じるアニメーション中も内容を保持する
  let last: NonNullable<ReturnType<typeof serverDialog>> = { mode: "add" };
  const state = createMemo(() => (last = serverDialog() ?? last));
  const editing = () => { const s = state(); return s.mode === "edit" ? servers().find((x) => x.id === s.id) : undefined; };

  createEffect(() => {
    if (!open()) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const submit = async (v: ServerInput) => {
    const s = state();
    // 編集でパスワード欄が空なら、保存済みのパスワードで接続確認する
    const password = v.password || (s.mode === "edit" ? await getPassword(s.id) : null) || "";
    if (!password) throw new Error("パスワードを入力してください");
    await new SubsonicClient({ ...v, password }).ping(); // 失敗すると例外 → フォームにエラー表示
    if (s.mode === "edit") await updateServer(s.id, { ...v, password });
    else setActive((await addServer({ ...v, password })).id); // 追加したらそのサーバーへ切り替える（キーチェーン保存に失敗したら例外）
    close();
  };

  return (
    <Show when={present()}>
      <div ref={ref} class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60" onClick={close} />
        <div
          role="dialog"
          aria-modal="true"
          ref={(e) => queueMicrotask(() => animate(e, [{ opacity: 0, transform: "scale(.95) translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 220 }))}
          class="relative w-full max-w-sm rounded-2xl bg-neutral-800 border border-white/10 shadow-2xl shadow-black/60 p-6"
        >
          <div class="flex items-center gap-3 mb-5">
            <div class="size-10 rounded-full bg-accent/15 text-accent flex items-center justify-center"><IconServer size={22} /></div>
            <h2 class="text-lg font-semibold">{state().mode === "edit" ? "サーバーを編集" : "サーバーを追加"}</h2>
          </div>
          <LoginForm
            // 開くたびに初期値を作り直すため、対象ごとに別インスタンスにする
            initial={editing() && { name: editing()!.name, url: editing()!.url, username: editing()!.username, password: "", remember: editing()!.remember }}
            passwordOptional={state().mode === "edit"}
            notice={state().mode === "edit" && !editing()?.remember ? "このサーバーのパスワードは保存されていません。接続するには入力してください。" : undefined}
            submitLabel={state().mode === "edit" ? "保存" : "追加"}
            onSubmit={submit}
            onCancel={close}
          />
        </div>
      </div>
    </Show>
  );
}
