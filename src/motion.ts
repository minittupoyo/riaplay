import { nextTick, ref, watch, type Directive } from "vue";
import { motionReduced as reduced } from "./settings";

/** Web Animations API の共通ヘルパー */
export const EASE = "cubic-bezier(.2,.8,.2,1)";

export function animate(el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions = {}): Animation {
  const duration = reduced() ? 1 : (options.duration as number) ?? 250;
  return el.animate(keyframes, { easing: EASE, fill: "backwards", ...options, duration });
}

export interface EnterOptions { delay?: number; y?: number; scale?: number; duration?: number }

/** 要素の登場: フェード + 少し下から */
export function enter(el: Element, o: EnterOptions = {}) {
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

/** `v-enter="{ y: 10 }"`: マウント時に登場アニメーションをかける。false / undefined なら何もしない */
export const vEnter: Directive<Element, EnterOptions | false | null | undefined> = {
  mounted(el, { value }) {
    if (value) enter(el, value);
  },
};

/** `v-pop`: ダイアログの登場（少し縮小・下から） */
export const vPop: Directive<Element> = {
  mounted(el) {
    animate(el, [{ opacity: 0, transform: "scale(.95) translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 220 });
  },
};

/** `v-slide-in`: 左から滑り込む（ドロワー） */
export const vSlideIn: Directive<Element> = {
  mounted(el) {
    animate(el, [{ transform: "translateX(-100%)" }, { transform: "none" }], { duration: 280 });
  },
};

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

/**
 * 要素の出入り（マウント/アンマウント）を、退場アニメーション完了まで保持する。
 * `present` を v-if に、`setEl` を `:ref` に渡す（コンポーネントの ref も受け取れる）
 */
export function usePresence(
  show: () => boolean,
  enterAnim: { keyframes: Keyframe[]; options?: KeyframeAnimationOptions },
  exitAnim: { keyframes: Keyframe[]; options?: KeyframeAnimationOptions },
) {
  const present = ref(show());
  let el: Element | null = null;
  let current: Animation | undefined;
  const run = (a: typeof enterAnim) => {
    current?.cancel();
    if (el?.isConnected && "animate" in el) current = animate(el, a.keyframes, { fill: "both", duration: 220, ...a.options });
    return current;
  };
  watch(show, (s) => {
    if (s) {
      present.value = true;
      void nextTick(() => run(enterAnim));
    } else {
      const a = run(exitAnim);
      if (a) a.finished.then(() => { present.value = false; }).catch(() => {});
      else present.value = false;
    }
  });
  const setEl = (e: unknown) => {
    el = e && typeof e === "object" && "$el" in e ? (e.$el as Element) : (e as Element | null);
  };
  return { present, setEl };
}

/** 並べ替えの FLIP: change() の前後で各子要素の位置差を補間する（DOM の更新を待ってから測る） */
export async function flip(container: HTMLElement, change: () => void) {
  const first = new Map<Element, number>();
  for (const c of Array.from(container.children)) first.set(c, c.getBoundingClientRect().top);
  change();
  await nextTick();
  for (const c of Array.from(container.children)) {
    const t = first.get(c);
    if (t === undefined) continue;
    const dy = t - c.getBoundingClientRect().top;
    if (dy) animate(c, [{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 260, fill: "none" });
  }
}
