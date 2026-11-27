import Spring from "./spring";

/**
 * 同期歌詞のアニメーション制御。
 * - 再生位置（rAFごとに audio.currentTime を直接参照）から各行を idle / active / sung に分類
 * - 現在行: バネによる発光 + 拡大
 * - 現在行からの距離に応じたぼかし
 * - 現在行が中央に来るようスクロール（手動操作中は自動追従を止め、止まって 0.75 秒後に復帰）
 * - 無言行（間奏）は、その行に来たときだけ 3 つのドットで進行を表示（バネで出現・消滅、行の高さも滑らかに開閉）
 */

import { BLUR_STEPS, settings } from "./settings";

const BLUR_MAX_DISTANCE = 4;
const RESUME_AFTER = 750; // ms
const SCROLL_MS = 500;
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
  private anim: { from: number; to: number; start: number } | null = null;

  constructor(private scroller: HTMLElement, private lines: LyricLine[], private getTime: () => number) {
    this.states = lines.map(() => "idle");
    this.blurs = lines.map(() => -1);
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
    this.anim = null;
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

    if (this.anim) this.stepScroll(now);
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
      to = this.scroller.scrollTop + (er.top - sr.top) - this.scroller.clientHeight / 2 + er.height / 2;
    } else {
      to = this.states[0] === "sung" ? max : 0;
    }
    return clamp(to, 0, max);
  }

  private scrollToActive(instant: boolean) {
    const line = this.active >= 0 ? this.lines[this.active] : undefined;
    if (this.blocked) {
      // 手動スクロール中。止まって一定時間後、かつ現在行が見えているときだけ復帰する
      if (!this.userIdle || !line || !this.inView(line.li)) return;
      this.unblock();
    }
    const to = this.computeTarget();
    if (instant) {
      this.anim = null;
      this.setScrollTop(to);
    } else if (Math.abs(to - this.scroller.scrollTop) >= 1) {
      this.anim = { from: this.scroller.scrollTop, to, start: performance.now() };
    }
  }

  /** 間奏行などの高さが変化している間、スクロール先を追従させる */
  private retarget() {
    const to = this.computeTarget();
    if (this.anim) this.anim.to = to;
    else if (Math.abs(to - this.scroller.scrollTop) >= 1) this.anim = { from: this.scroller.scrollTop, to, start: performance.now() };
  }

  private stepScroll(now: number) {
    const a = this.anim!;
    const k = Math.min(1, (now - a.start) / SCROLL_MS);
    this.setScrollTop(a.from + (a.to - a.from) * (1 - Math.pow(1 - k, 3))); // easeOutCubic
    if (k >= 1) this.anim = null;
  }

  private setScrollTop(y: number) {
    this.ignoreScrollUntil = performance.now() + 80;
    this.scroller.scrollTop = y;
  }
}
