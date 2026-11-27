import { createEffect, onCleanup, onMount, Show } from "solid-js";
import { closeContextMenu, contextMenu } from "../contextMenu";
import { animate } from "../motion";
import { SongMenuPanel } from "./SongMenu";

const W = 240; // w-60
const MARGIN = 8;

/** 独自の右クリックメニュー。入力欄などテキストを扱う場所では標準メニューを残し、それ以外では標準メニューを出さない */
export default function ContextMenu() {
  onMount(() => {
    const onCtx = (e: MouseEvent) => {
      // 行・カードの右クリックは、それぞれがメニューを開く（ここへ届く前に処理済み）。ここへ届くのはそれ以外
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable=''], [contenteditable='true'], .select-text")) return closeContextMenu();
      e.preventDefault();
      closeContextMenu();
    };
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-context-menu]")) closeContextMenu(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeContextMenu(); };
    document.addEventListener("contextmenu", onCtx);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("blur", closeContextMenu);
    // ホイールで画面をスクロールしたら、位置がずれるので閉じる（歌詞などの自動スクロールでは閉じない）
    const onWheel = (e: WheelEvent) => { if (!(e.target as HTMLElement).closest("[data-context-menu]")) closeContextMenu(); };
    document.addEventListener("wheel", onWheel, { passive: true });
    onCleanup(() => {
      document.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("blur", closeContextMenu);
      document.removeEventListener("wheel", onWheel);
    });
  });

  return (
    <Show when={contextMenu()}>
      {(m) => {
        // 右端に収まらないときは左へ、下半分で開いたときは上へ伸ばす（プレイリスト一覧の展開で高さが変わるため）
        const left = () => Math.max(MARGIN, Math.min(m().x, window.innerWidth - W - MARGIN));
        const down = () => m().y < window.innerHeight / 2;
        let el!: HTMLDivElement;
        createEffect(() => { m(); animate(el, [{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 130 }); });
        return (
          <div
            ref={el}
            data-context-menu
            class={`fixed z-[90] w-60 rounded-xl bg-neutral-800/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/60 p-1 text-white font-normal ${down() ? "origin-top-left" : "origin-bottom-left"}`}
            style={{ left: `${left()}px`, ...(down() ? { top: `${m().y}px` } : { bottom: `${window.innerHeight - m().y}px` }) }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <SongMenuPanel client={m().client} songs={m().songs} onRemove={m().onRemove} close={closeContextMenu} play />
          </div>
        );
      }}
    </Show>
  );
}
