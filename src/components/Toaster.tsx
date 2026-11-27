import { For } from "solid-js";
import { IconAlertCircle, IconCheck } from "@tabler/icons-solidjs";
import { dismissToast, toasts } from "../toast";
import { enter } from "../motion";

/** トーストの表示場所。再生中画面（z-50）より前面に、プレイヤーバーの上へ出す */
export default function Toaster() {
  return (
    <div class="fixed inset-x-0 bottom-28 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4">
      <For each={toasts()}>
        {(t) => (
          <div
            ref={(e) => enter(e, { y: 12, duration: 240 })}
            role={t.kind === "error" ? "alert" : "status"}
            class={`pointer-events-auto flex items-center gap-2 max-w-md rounded-full bg-neutral-800/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 pl-3 pr-4 py-2 text-sm transition-all duration-200 ${t.leaving() ? "opacity-0 translate-y-2" : ""}`}
            onClick={() => dismissToast(t.id)}
          >
            {t.kind === "error" ? <IconAlertCircle size={18} class="text-accent shrink-0" /> : <IconCheck size={18} class="text-white/70 shrink-0" />}
            <span class="min-w-0">{t.message}</span>
          </div>
        )}
      </For>
    </div>
  );
}
