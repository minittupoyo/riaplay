import Spring from "./spring";

/**
 * 同期歌詞のアニメーション制御。
 * - 再生位置（rAFごとに audio.currentTime を直接参照）から各行を idle / active / sung に分類
 * - 現在行: バネによる発光 + 拡大
 * - 現在行からの距離に応じたぼかし
 * - 現在行が中央に来るようスクロール。スクロール自体は一瞬で行い、各行を元の位置から動かして時間差（現在行が先、後ろの行ほど遅れる）で収める
 *   （手動操作中は自動追従を止め、止まって 0.75 秒後に復帰）
 * - 無言行（間奏）は、その行に来たときだけ 3 つのドットで進行を表示（バネで出現・消滅、行の高さも滑らかに開閉）
 */

import { BLUR_STEPS, settings } from "./settings";
import { animate } from "./motion";

const BLUR_MAX_DISTANCE = 4;
const RESUME_AFTER = 750; // ms
const SCROLL_MS = 700; // 各行が定位置に収まるまでの時間
const STAGGER_MS = 55; // 現在行から 1 行離れるごとの遅れ
const STAGGER_MAX = 8; // 遅れを付ける行数の上限
const SCROLL_EASE = "cubic-bezier(.3,.7,.2,1)";
const INTERLUDE_EXIT = 0.4; // 間奏の終了の何秒前から消え始める（行も同時に閉じ始める）

export interface LyricLine {
  li: HTMLElement;
  start: number;
  end: number;
  interlude: boolean;
  dots: HTMLElement[];
  group: HTMLElement | null;
}

/** 間奏ドット用のバネ群 */
interface Interlude {
  appear: Spring; // 出現(0→1)・消滅(→0)
  scale: Spring[];
  opacity: Spring[];
}
type State = "idle" | "active" | "sung";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class LyricsAnimator {
  private raf = 0;
  private last = 0;
  private lastT = 0;
  private active = -2; // 未初期化
  private lastActive = 0;
  private states: State[];
  private blurs: number[];
  private interludes = new Map<number, Interlude>();
  private settleUntil = 0;
  private closing = false; // 間奏が閉じ始めている（スクロール先を次の行にする）
  private first = true;

  private blocked = false;
  private userIdle = false;
  private timer = 0;
  private ignoreScrollUntil = 0;
  private shifts: (Animation | undefined)[];

  constructor(private scroller: HTMLElement, private lines: LyricLine[], private getTime: () => number) {
    this.states = lines.map(() => "idle");
    this.blurs = lines.map(() => -1);
    this.shifts = lines.map(() => undefined);
    lines.forEach((l, i) => {
      if (l.interlude)
        this.interludes.set(i, {
          appear: new Spring(0, 2.2, 0.85),
          scale: l.dots.map(() => new Spring(0.75, 2.5, 0.8)),
          opacity: l.dots.map(() => new Spring(0.3, 2.5, 0.8)),
        });
    });
    scroller.addEventListener("wheel", this.onUser, { passive: true });
    scroller.addEventListener("touchstart", this.onUser, { passive: true });
    scroller.addEventListener("pointerdown", this.onUser);
    scroller.addEventListener("scroll", this.onScroll, { passive: true });
    scroller.addEventListener("pointermove", this.onMove);
    scroller.classList.add("lyric-scroll");
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.shifts.forEach((a) => a?.cancel());
    clearTimeout(this.timer);
    this.scroller.removeEventListener("wheel", this.onUser);
    this.scroller.removeEventListener("touchstart", this.onUser);
    this.scroller.removeEventListener("pointerdown", this.onUser);
    this.scroller.removeEventListener("scroll", this.onScroll);
    this.scroller.removeEventListener("pointermove", this.onMove);
    this.scroller.classList.remove("user-scrolling", "auto-scrolling");
  }
  private onMove = () => this.scroller.classList.remove("auto-scrolling");

  // ---- ユーザー操作 ----
  private onScroll = () => {
    if (performance.now() < this.ignoreScrollUntil) return; // 自分のスクロールは無視
    this.onUser();
  };
  private onUser = () => {
    if (!this.blocked) {
      this.blocked = true;
      this.scroller.classList.add("user-scrolling"); // ぼかしを解除
    }
    this.userIdle = false;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.userIdle = true;
      this.scrollToActive(false);
    }, RESUME_AFTER);
  };
  private unblock() {
    this.blocked = false;
    this.scroller.classList.remove("user-scrolling");
  }

  // ---- メインループ ----
  private tick = (now: number) => {
    const dt = clamp((now - (this.last || now)) / 1000, 0, 0.05);
    this.last = now;
    const t = this.getTime();
    const jumped = Math.abs(t - this.lastT) > 1.5; // シーク
    this.lastT = t;
    const immediate = this.first || jumped;

    const a = this.findActive(t);
    if (a !== this.active || immediate) {
      this.setActive(a, t);
      this.scroller.classList.add("auto-scrolling"); // スクロールで行がカーソルの下に来ても、ホバー扱いにしない
      this.settleUntil = now + 600; // 間奏行の高さが開閉し終えるまで、スクロール先を追従させる
      this.scrollToActive(this.first);
      this.first = false;
    }
    if (now < this.settleUntil && !this.blocked) this.retarget();
    if (a >= 0) this.updateActive(a, t, dt, immediate);

    this.raf = requestAnimationFrame(this.tick);
  };

  private findActive(t: number): number {
    let lo = 0, hi = this.lines.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.lines[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans >= 0 && t < this.lines[ans].end ? ans : -1;
  }

  private setActive(a: number, t: number) {
    this.active = a;
    this.closing = false;
    if (a >= 0) this.lastActive = a;
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      const st: State = i === a ? "active" : a >= 0 ? (i < a ? "sung" : "idle") : t >= line.start ? "sung" : "idle";
      if (st !== this.states[i]) {
        const old = this.states[i];
        line.li.classList.toggle("active", st === "active");
        line.li.classList.toggle("sung", st === "sung");
        this.states[i] = st;
        if (old === "active") {
          if (line.interlude) this.hideDots(line);
        }
        if (st === "active" && line.interlude) this.resetInterlude(i);
      }
    }
    this.applyBlurs();
  }

  /** 現在行からの距離でぼかす（強さは設定による） */
  applyBlurs() {
    const step = BLUR_STEPS[settings().lyricsBlur];
    const ref = this.active >= 0 ? this.active : this.lastActive;
    for (let i = 0; i < this.lines.length; i++) {
      // これから歌う行は一定のぼかしにする（距離で段階的に変えると、行が進むたびに先の行がくっきりして「光る」ように見えるため）
      const dist = i > ref ? 2 : Math.min(ref - i, BLUR_MAX_DISTANCE);
      const blur = this.lines[i].interlude ? 0 : dist * step;
      if (blur !== this.blurs[i]) {
        this.blurs[i] = blur;
        this.applyFilter(i);
      }
    }
  }

  private updateActive(a: number, t: number, dt: number, immediate: boolean) {
    const line = this.lines[a];
    const progress = clamp((t - line.start) / Math.max(line.end - line.start, 0.01), 0, 1);
    if (line.interlude) {
      this.updateInterlude(a, progress, line.end - t, dt, immediate);
      return;
    }
  }

  /** ぼかし・発光が不要な行には filter を付けない（全行に付けると描画レイヤーが増えて重くなる） */
  private applyFilter(i: number) {
    const b = this.blurs[i];
    this.lines[i].li.style.filter = b > 0.01 ? `blur(${b}px)` : "none";
  }

  /** 間奏: 出現はバネで膨らみ、各ドットは順に点灯、終わり際はふわっと拡大しながら消える */
  private updateInterlude(i: number, progress: number, remaining: number, dt: number, immediate: boolean) {
    const line = this.lines[i], st = this.interludes.get(i)!;
    const fadingOut = remaining < INTERLUDE_EXIT;
    if (fadingOut && !this.closing) {
      // ドットのフェードアウトと同時に行を閉じ、スクロールも次の行へ向かわせる
      this.closing = true;
      line.li.classList.add("closing");
      st.appear.tune(4, 1);
      this.settleUntil = performance.now() + 700;
    }
    st.appear.goal = fadingOut ? 0 : 1;
    if (immediate && !fadingOut) st.appear.reset(1);
    const ap = clamp(st.appear.step(dt), 0, 1);
    line.dots.forEach((d, k) => {
      const lit = clamp(progress * 3 - k, 0, 1);
      st.scale[k].goal = 0.75 + 0.25 * lit;
      st.opacity[k].goal = 0.3 + 0.7 * lit;
      if (immediate) { st.scale[k].reset(st.scale[k].goal); st.opacity[k].reset(st.opacity[k].goal); }
      d.style.transform = `scale(${st.scale[k].step(dt).toFixed(3)})`;
      d.style.opacity = st.opacity[k].step(dt).toFixed(3);
    });
    if (line.group) {
      // 出現: 0.6→1 / 消滅: 1→1.25 に広がりながら透明に（潰れて見えないよう拡大方向のみ）
      const scale = fadingOut ? 1 + (1 - ap) * 0.25 : 0.6 + 0.4 * ap;
      line.group.style.transform = `scale(${scale.toFixed(3)})`;
      line.group.style.opacity = ap.toFixed(3);
    }
  }

  private resetInterlude(i: number) {
    const st = this.interludes.get(i);
    if (!st) return;
    st.appear.tune(2.2, 0.85);
    st.appear.reset(0);
    this.lines[i].li.classList.remove("closing");
    st.scale.forEach((sp) => sp.reset(0.75));
    st.opacity.forEach((sp) => sp.reset(0.3));
    const g = this.lines[i].group;
    if (g) { g.style.opacity = "0"; g.style.transform = "scale(0.6)"; }
  }

  private hideDots(line: LyricLine) {
    if (line.group) line.group.style.opacity = "0";
  }

  // ---- スクロール ----
  private inView(el: HTMLElement) {
    const s = this.scroller.getBoundingClientRect(), e = el.getBoundingClientRect();
    return e.bottom > s.top && e.top < s.bottom;
  }

  /** 現在行を中央に置くスクロール位置（全行終了後は末尾、開始前は先頭） */
  private computeTarget(): number {
    // 間奏が閉じ始めたら、中心にする行は次の行
    const focus = this.closing ? Math.min(this.active + 1, this.lines.length - 1) : this.active;
    const line = focus >= 0 ? this.lines[focus] : undefined;
    const max = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
    let to: number;
    if (line) {
      const sr = this.scroller.getBoundingClientRect(), er = line.li.getBoundingClientRect();
      // 時間差アニメーション中の ty は見た目だけのずれなので、レイアウト上の位置から外して測る
      to = this.scroller.scrollTop + (er.top - this.shiftOf(line.li) - sr.top) - this.scroller.clientHeight / 2 + er.height / 2;
    } else {
      to = this.states[0] === "sung" ? max : 0;
    }
    return clamp(to, 0, max);
  }

  /** 行の高さが変わったあとに、現在行を中央へ取り直す（動かさずに即座に） */
  relayout() {
    this.shifts.forEach((a) => a?.cancel());
    this.scrollToActive(true);
  }

  private scrollToActive(instant: boolean) {
    const line = this.active >= 0 ? this.lines[this.active] : undefined;
    if (this.blocked) {
      // 手動スクロール中。止まって一定時間後、かつ現在行が見えているときだけ復帰する
      if (!this.userIdle || !line || !this.inView(line.li)) return;
      this.unblock();
    }
    this.scrollTo(this.computeTarget(), !instant);
  }

  /** 間奏行などの高さが変化している間、スクロール先を追従させる（各行の動きは既存の時間差に任せる） */
  private retarget() {
    this.scrollTo(this.computeTarget(), false);
  }

  /** 現在の ty（時間差アニメーションで付いている見た目のずれ）。レイアウトには影響しない */
  private shiftOf(el: HTMLElement) {
    const t = getComputedStyle(el).transform;
    return t && t !== "none" ? new DOMMatrixReadOnly(t).m42 : 0;
  }

  /** スクロールは即座に行い、見えている行を元の位置から時間差で定位置へ動かす */
  private scrollTo(to: number, staggered: boolean) {
    const d = to - this.scroller.scrollTop;
    if (Math.abs(d) < 1) return;
    const sr = this.scroller.getBoundingClientRect();
    if (!staggered || Math.abs(d) >= sr.height * 1.5) return this.setScrollTop(to); // 追従中・大きく飛ぶときは動かさずに切り替える
    // スクロールで layout が変わる前に、動いている行の現在のずれを読み取り、そこから繋ぐ
    const starts = this.shifts.map((a, i) => (a ? this.shiftOf(this.lines[i].li) : 0));
    this.setScrollTop(to);
    this.shifts.forEach((a) => a?.cancel());
    const ref = this.active >= 0 ? this.active : this.lastActive;
    const lo = sr.top - 40, hi = sr.bottom + 40;
    this.lines.forEach((l, i) => {
      const r = l.li.getBoundingClientRect(); // 定位置（アニメーションは取り消し済み）
      const visible = (r.bottom > lo && r.top < hi) || (r.bottom + d > lo && r.top + d < hi); // 動かす前か後に見える行
      if (!visible) { this.shifts[i] = undefined; return; }
      // 進む向きに対して、現在行が先頭で、その後ろの行ほど遅れて動く
      const lag = d > 0 ? Math.max(0, i - ref) : Math.max(0, ref - i);
      this.shifts[i] = animate(l.li, [{ transform: `translateY(${d + starts[i]}px)` }, { transform: "none" }], {
        duration: SCROLL_MS,
        delay: Math.min(lag, STAGGER_MAX) * STAGGER_MS,
        easing: SCROLL_EASE,
      });
    });
  }

  private setScrollTop(y: number) {
    this.ignoreScrollUntil = performance.now() + 80;
    this.scroller.scrollTop = y;
  }
}
