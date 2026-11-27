import { createEffect, createSignal, on, type Accessor } from "solid-js";

/** Web Animations API の共通ヘルパー */
export const EASE = "cubic-bezier(.2,.8,.2,1)";
import { motionReduced as reduced } from "./settings";

export function animate(el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions = {}): Animation {
  const duration = reduced() ? 1 : (options.duration as number) ?? 250;
  return el.animate(keyframes, { easing: EASE, fill: "backwards", ...options, duration });
}

/** 要素の登場: フェード + 少し下から */
export function enter(el: Element, o: { delay?: number; y?: number; scale?: number; duration?: number } = {}, deferred = false) {
  // ref コールバック時点の要素は、Solid のテンプレート複製元（inert なドキュメント）に属しており、
  // ここで animate() すると永久に開始されず開始状態（opacity:0）で固まる。DOM 挿入後（マイクロタスク）に開始する。
  if (!el.isConnected && !deferred) {
    queueMicrotask(() => enter(el, o, true));
    return;
  }
  const { delay = 0, y = 8, scale = 1, duration = 280 } = o;
  animate(
    el,
    [
      { opacity: 0, transform: `translateY(${y}px) scale(${scale})` },
      { opacity: 1, transform: "none" },
    ],
    { delay, duration },
  );
}

/** 一覧の時間差表示用の遅延（先頭ほど早い・上限あり） */
export const stagger = (i: number, step = 28, max = 12) => Math.min(i, max) * step;

/** ホバーで往復するアニメーション（途中で戻しても滑らか） */
export function hoverAnim(el: Element, keyframes: Keyframe[], duration = 200) {
  const a = animate(el, keyframes, { duration, fill: "both" });
  a.pause();
  return {
    in() { a.playbackRate = 1; a.play(); },
    out() { a.playbackRate = -1; a.play(); },
  };
}

/** 要素の出入り（マウント/アンマウント）を、退場アニメーション完了まで保持する */
export function createPresence(
  show: Accessor<boolean>,
  enterAnim: { keyframes: Keyframe[]; options?: KeyframeAnimationOptions },
  exitAnim: { keyframes: Keyframe[]; options?: KeyframeAnimationOptions },
) {
  const [present, setPresent] = createSignal(show());
  let el: HTMLElement | undefined;
  let current: Animation | undefined;
  const run = (a: typeof enterAnim) => {
    current?.cancel();
    if (el?.isConnected) current = animate(el, a.keyframes, { fill: "both", duration: 220, ...a.options });
    return current;
  };
  createEffect(
    on(
      show,
      (s) => {
        if (s) {
          setPresent(true);
          queueMicrotask(() => run(enterAnim));
        } else {
          const a = run(exitAnim);
          if (a) a.finished.then(() => setPresent(false)).catch(() => {});
          else setPresent(false);
        }
      },
      { defer: true },
    ),
  );
  return [present, (e: HTMLElement) => (el = e)] as const;
}

/** 並べ替えの FLIP: change() の前後で各子要素の位置差を補間する */
export function flip(container: HTMLElement, change: () => void) {
  const first = new Map<Element, number>();
  for (const c of Array.from(container.children)) first.set(c, c.getBoundingClientRect().top);
  change();
  for (const c of Array.from(container.children)) {
    const t = first.get(c);
    if (t === undefined) continue;
    const dy = t - c.getBoundingClientRect().top;
    if (dy) animate(c, [{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 260, fill: "none" });
  }
}
