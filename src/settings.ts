import { watchEffect } from "vue";
import { signal } from "./reactive";

/** アプリの設定（サーバー接続情報は servers.ts が別に管理する） */
export type MotionMode = "system" | "on" | "off";
export type BlurLevel = "off" | "weak" | "strong";

export interface Settings {
  /** ストリーミングの最大ビットレート(kbps)。0 = 原音（変換しない） */
  maxBitRate: number;
  /** 外部サービス（LRCLIB・NetEase）から歌詞を取得する（曲名・アーティスト等が外部サービスへ送信される） */
  lyricsEnabled: boolean;
  /** 同期歌詞で、現在行から離れた行をぼかす強さ */
  lyricsBlur: BlurLevel;
  /** ライブラリを自動で再読み込みする間隔（分）。0 = しない */
  libraryRefreshMinutes: number;
  /** プレイヤーバーに、再生中の音声の詳細情報（コーデック・サンプルレートなど）を見るボタンを出す */
  showAudioInfo: boolean;
  /** アクセントカラー（ACCENTS の id） */
  accent: string;
  /** アニメーション: システムの「視差効果を減らす」に従う / 常にオン / オフ */
  motion: MotionMode;
}

export const DEFAULTS: Settings = { maxBitRate: 0, lyricsEnabled: true, lyricsBlur: "weak", showAudioInfo: false, libraryRefreshMinutes: 0, accent: "red", motion: "system" };

export const ACCENTS = [
  { id: "red", name: "レッド", color: "#fa2d48" },
  { id: "pink", name: "ピンク", color: "#ff4fa3" },
  { id: "orange", name: "オレンジ", color: "#ff8a1f" },
  { id: "green", name: "グリーン", color: "#2fc46a" },
  { id: "blue", name: "ブルー", color: "#3b82f6" },
  { id: "purple", name: "パープル", color: "#a855f7" },
] as const;

/** 同期歌詞のぼかし: 現在行からの距離 1 あたりの px */
export const BLUR_STEPS: Record<BlurLevel, number> = { off: 0, weak: 0.4, strong: 1.0 };

const KEY = "riaplay.settings";

function load(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { ...DEFAULTS, ...v };
  } catch {
    return { ...DEFAULTS };
  }
}

const [settings, setSettings] = signal<Settings>(load());
export { settings };

export function updateSettings(patch: Partial<Settings>) {
  setSettings((s) => ({ ...s, ...patch }));
  localStorage.setItem(KEY, JSON.stringify(settings()));
}
export function resetSettings() {
  setSettings({ ...DEFAULTS });
  localStorage.removeItem(KEY);
}

const mq = matchMedia("(prefers-reduced-motion: reduce)");
/** アニメーションを抑えるべきか（設定 + OS の「視差効果を減らす」） */
export const motionReduced = () => {
  const m = settings().motion;
  return m === "off" || (m === "system" && mq.matches);
};

// 設定を DOM に反映する（アクセントカラー・アニメーション無効化）
watchEffect(() => {
  const a = ACCENTS.find((x) => x.id === settings().accent) ?? ACCENTS[0];
  document.documentElement.style.setProperty("--color-accent", a.color);
});
const [osReduced, setOsReduced] = signal(mq.matches);
mq.addEventListener("change", () => setOsReduced(mq.matches));
watchEffect(() => {
  const m = settings().motion;
  document.documentElement.classList.toggle("no-motion", m === "off" || (m === "system" && osReduced()));
});
