import { For, Show, type JSX } from "solid-js";

/** 設定の 1 行: 左に名前と説明、右にコントロール */
export function Row(props: { title: string; desc?: string; children: JSX.Element }) {
  return (
    <div class="flex flex-col @xl:flex-row @xl:items-center justify-between gap-3 @xl:gap-6 px-5 py-4">
      <div class="min-w-0">
        <div class="text-[15px] font-medium">{props.title}</div>
        <Show when={props.desc}><div class="text-sm text-white/50 mt-0.5">{props.desc}</div></Show>
      </div>
      <div class="shrink-0">{props.children}</div>
    </div>
  );
}
/** 設定のまとまり（見出し + 角丸のカード） */
export function Section(props: { title: string; children: JSX.Element }) {
  return (
    <section>
      <h2 class="px-1 mb-2 text-sm font-semibold text-white/50">{props.title}</h2>
      <div class="rounded-2xl bg-white/[0.04] divide-y divide-white/5">{props.children}</div>
    </section>
  );
}

/** オン/オフのスイッチ */
export function Toggle(props: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={props.value}
      aria-label={props.label}
      class={`relative w-11 h-6 rounded-full transition-colors ${props.value ? "bg-accent" : "bg-white/20"}`}
      onClick={() => props.onChange(!props.value)}
    >
      <span class={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${props.value ? "translate-x-5" : ""}`} />
    </button>
  );
}

/** 横並びの選択肢（セグメントコントロール） */
export function Segmented<T extends string | number>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" class="inline-flex flex-wrap rounded-xl bg-white/10 p-0.5">
      <For each={props.options}>
        {(o) => (
          <button
            role="radio"
            aria-checked={props.value === o.value}
            class={`rounded-[10px] px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${props.value === o.value ? "bg-white/20 text-white shadow" : "text-white/60 hover:text-white"}`}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}
