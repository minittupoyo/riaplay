import { createSignal } from "solid-js";
import { flip } from "./motion";

/** HTML5 ドラッグ&ドロップによる並べ替え。li に `{...bind(i)}` と `style={indicator(i)}` を渡す */
export function createReorder(onMove: (from: number, to: number) => void) {
  const [from, setFrom] = createSignal<number | null>(null);
  let list: HTMLElement | undefined;
  const [over, setOver] = createSignal<number | null>(null);

  const bind = (i: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      setFrom(i);
      e.dataTransfer!.effectAllowed = "move";
      e.dataTransfer!.setData("text/plain", String(i));
    },
    onDragOver: (e: DragEvent) => {
      if (from() === null) return;
      e.preventDefault();
      setOver(i);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const f = from();
      setFrom(null);
      setOver(null);
      if (f === null || f === i) return;
      if (list) flip(list, () => onMove(f, i));
      else onMove(f, i);
    },
    onDragEnd: () => {
      setFrom(null);
      setOver(null);
    },
  });

  // 下方向へ動かすなら対象の下、上方向なら上に線を出す
  const indicator = (i: number): Record<string, string> => {
    const f = from();
    if (f === null || over() !== i || f === i) return {};
    return f < i ? { "border-bottom-color": "var(--color-accent)" } : { "border-top-color": "var(--color-accent)" };
  };

  return { bind, indicator, ref: (e: HTMLElement) => (list = e) };
}
