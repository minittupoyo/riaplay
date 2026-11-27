import { createSignal, Show } from "solid-js";
import { IconServer, IconUser, IconLock, IconLoader2, IconAlertCircle, IconTag, IconShieldLock } from "@tabler/icons-solidjs";
import type { ServerInput } from "../servers";
import { animate } from "../motion";

/** サーバー接続情報の入力フォーム。onSubmit が例外を投げたらエラー表示してフォームを揺らす */
export default function LoginForm(props: {
  initial?: Partial<ServerInput>;
  /** 編集時: パスワード欄を空にすると既存のパスワードを保つ */
  passwordOptional?: boolean;
  notice?: string;
  submitLabel: string;
  onSubmit: (v: ServerInput) => Promise<void>;
  onCancel?: () => void;
  formRef?: (e: HTMLFormElement) => void;
}) {
  const [name, setName] = createSignal(props.initial?.name ?? "");
  const [url, setUrl] = createSignal(props.initial?.url ?? "");
  const [username, setUsername] = createSignal(props.initial?.username ?? "");
  const [password, setPassword] = createSignal(props.initial?.password ?? "");
  const [remember, setRemember] = createSignal(props.initial?.remember ?? true);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  let form!: HTMLFormElement;

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await props.onSubmit({ name: name(), url: url().trim(), username: username().trim(), password: password(), remember: remember() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      animate(form, [0, -10, 10, -6, 6, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 380, fill: "none" });
    } finally {
      setBusy(false);
    }
  };

  const field = "flex items-center gap-2 rounded-xl bg-white/10 px-3 focus-within:ring-2 focus-within:ring-accent/70";
  const input = "w-full bg-transparent py-2.5 outline-none placeholder:text-white/40 select-text";

  return (
    <form ref={(e) => { form = e; props.formRef?.(e); }} onSubmit={submit} class="space-y-4">
      <label class={field}>
        <IconTag size={18} class="text-white/40" />
        <input class={input} placeholder="表示名（任意）" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <label class={field}>
        <IconServer size={18} class="text-white/40" />
        <input class={input} type="url" required placeholder="https://music.example.com" value={url()} onInput={(e) => setUrl(e.currentTarget.value)} />
      </label>
      <label class={field}>
        <IconUser size={18} class="text-white/40" />
        <input class={input} required placeholder="ユーザー名" autocomplete="username" value={username()} onInput={(e) => setUsername(e.currentTarget.value)} />
      </label>
      <label class={field}>
        <IconLock size={18} class="text-white/40" />
        <input class={input} type="password" required={!props.passwordOptional} placeholder={props.passwordOptional ? "パスワード（変更しない場合は空欄）" : "パスワード"} autocomplete="current-password" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} />
      </label>
      <label class="flex items-start gap-2.5 px-1 cursor-pointer">
        <input type="checkbox" class="mt-0.5 size-4 accent-[var(--color-accent)]" checked={remember()} onChange={(e) => setRemember(e.currentTarget.checked)} />
        <span class="text-sm">
          パスワードを保存する
          <span class="flex items-center gap-1 text-xs text-white/40 mt-0.5"><IconShieldLock size={13} />OS のキーチェーンに暗号化して保存します。外すと起動のたびに入力が必要です</span>
        </span>
      </label>
      <Show when={props.notice}><p class="text-sm text-white/60 px-1">{props.notice}</p></Show>
      <Show when={error()}>
        <p class="flex items-center gap-2 text-sm text-accent"><IconAlertCircle size={16} />{error()}</p>
      </Show>
      <div class="flex gap-3 pt-1">
        <Show when={props.onCancel}>
          <button type="button" disabled={busy()} class="flex-1 rounded-xl bg-white/10 hover:bg-white/15 py-2.5 font-medium" onClick={props.onCancel}>キャンセル</button>
        </Show>
        <button disabled={busy()} class="flex-1 flex items-center justify-center gap-2 rounded-xl bg-accent hover:brightness-110 disabled:opacity-60 py-2.5 font-medium">
          <Show when={busy()}><IconLoader2 size={18} class="animate-spin" /></Show>
          {props.submitLabel}
        </button>
      </div>
    </form>
  );
}
