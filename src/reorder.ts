import { ref } from "vue";
import { flip } from "./motion";

/**
 * 同じ id が並ぶ一覧（キューやプレイリストは重複を許す）の v-for 用に、一意なキーを作る。
 * 2 回目以降の同じ id には出現回数を付ける
 */
export function uniqueKeys(list: { id: string }[]): string[] {
  const seen = new Map<string, number>();
  return list.map((x) => {
    const n = seen.get(x.id) ?? 0;
    seen.set(x.id, n + 1);
    return n ? `${x.id}#${n}` : x.id;
  });
}

/**
 * HTML5 ドラッグ&ドロップによる並べ替え。ul に `:ref="setList"`、li に `v-bind="bind(i)"` と `:style="indicator(i)"` を渡す。
 * 並べ替え後に DOM が動く（v-for のキーが並べ替えに追従する）ことが前提
 */
export function createReorder(onMove: (from: number, to: number) => void) {
  const from = ref<number | null>(null);
  const over = ref<number | null>(null);
  const list = ref<HTMLElement | null>(null);
  /** ul の `:ref` に渡す（v-if や v-for の中でも使える） */
  const setList = (e: unknown) => { list.value = e as HTMLElement | null; };

  // イベント名は Vue が小文字に正規化するため、camelCase にしない（onDragStart は効かない）
  const bind = (i: number) => ({
    draggable: true,
    onDragstart: (e: DragEvent) => {
      from.value = i;
      e.dataTransfer!.effectAllowed = "move";
      e.dataTransfer!.setData("text/plain", String(i));
    },
    onDragover: (e: DragEvent) => {
      if (from.value === null) return;
      e.preventDefault();
      over.value = i;
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const f = from.value;
      from.value = null;
      over.value = null;
      if (f === null || f === i) return;
      if (list.value) void flip(list.value, () => onMove(f, i));
      else onMove(f, i);
    },
    onDragend: () => {
      from.value = null;
      over.value = null;
    },
  });

  // 下方向へ動かすなら対象の下、上方向なら上に線を出す
  const indicator = (i: number): Record<string, string> => {
    const f = from.value;
    if (f === null || over.value !== i || f === i) return {};
    return f < i ? { "border-bottom-color": "var(--color-accent)" } : { "border-top-color": "var(--color-accent)" };
  };

  return { bind, indicator, list, setList };
}
