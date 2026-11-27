/**
 * 一覧画面の登場アニメーションを「そのセッションで最初に表示するときだけ」にするための記録。
 * 戻る操作やタブの行き来で、毎回アニメーションしないようにする。サーバー切り替え時にリセットする。
 */
const seen = new Set<string>();

/**
 * 最初の表示なら true。同じキーを同じ描画バッチ内で何度呼んでも（カード全件など）、全て true になる。
 * 見出しとカードのようにデータの到着時期が違うものは、別々のキーにすること。
 */
export function firstShow(key: string): boolean {
  const first = !seen.has(key);
  if (first) queueMicrotask(() => seen.add(key)); // 同一バッチ内の全要素が判定し終えてから記録する
  return first;
}

export const resetFirstShow = () => seen.clear();
