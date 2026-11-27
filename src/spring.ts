/** 減衰調和振動子（解析解）。goal に向かって収束する。frequency は Hz、damping は減衰比。 */
export default class Spring {
  private _goal: number;
  private x = 0; // goal からの変位
  private v = 0;

  constructor(start: number, private frequency: number, private damping: number) {
    this._goal = start;
  }

  get goal() { return this._goal; }
  /** 目標を変えても現在の位置は保つ（変位だけを取り直す） */
  set goal(g: number) {
    this.x = this.x + this._goal - g;
    this._goal = g;
  }

  get value() { return this.x + this._goal; }

  /** 周波数・減衰比を変更する（現在の位置と速度は保つ） */
  tune(frequency: number, damping: number) {
    this.frequency = frequency;
    this.damping = damping;
  }

  /** 位置を即座に置き換える（速度は0） */
  reset(pos: number) {
    this._goal = pos;
    this.x = 0;
    this.v = 0;
  }

  step(dt: number): number {
    const w = this.frequency * Math.PI * 2;
    const z = this.damping;
    const x0 = this.x; // goal からの変位
    const v0 = this.v;
    let x: number, v: number;
    if (z < 1 - 1e-4) {
      const wd = w * Math.sqrt(1 - z * z);
      const e = Math.exp(-z * w * dt);
      const c = Math.cos(wd * dt), s = Math.sin(wd * dt);
      const b = (v0 + z * w * x0) / wd;
      x = e * (x0 * c + b * s);
      v = e * ((b * wd - z * w * x0) * c + (-x0 * wd - z * w * b) * s);
    } else if (z <= 1 + 1e-4) {
      const e = Math.exp(-w * dt);
      const k = v0 + w * x0;
      x = e * (x0 + k * dt);
      v = e * (v0 - w * k * dt);
    } else {
      const r = Math.sqrt(z * z - 1);
      const r1 = -w * (z - r), r2 = -w * (z + r);
      const c2 = (v0 - r1 * x0) / (r2 - r1);
      const c1 = x0 - c2;
      const e1 = Math.exp(r1 * dt), e2 = Math.exp(r2 * dt);
      x = c1 * e1 + c2 * e2;
      v = c1 * r1 * e1 + c2 * r2 * e2;
    }
    this.x = x;
    this.v = v;
    return this.value;
  }

  /** 目標にほぼ到達して静止したか */
  get asleep() {
    return Math.abs(this.x) < 1e-3 && Math.abs(this.v) < 1e-2;
  }
}
