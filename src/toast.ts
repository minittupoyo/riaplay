import { signal } from "./reactive";

/** 画面下に一時的に出す通知（トースト） */
export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error";
  /** 退場アニメーション中か */
  leaving: boolean;
}

const LEAVE_MS = 220;
const [toasts, setToasts] = signal<Toast[]>([]);
export { toasts };
let seq = 0;

export function dismissToast(id: number) {
  const t = toasts().find((x) => x.id === id);
  if (!t || t.leaving) return;
  setToasts((l) => l.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
  setTimeout(() => setToasts((l) => l.filter((t) => t.id !== id)), LEAVE_MS);
}

export function toast(message: string, kind: Toast["kind"] = "info", ms = 2800) {
  const id = ++seq;
  setToasts((l) => [...l.slice(-3), { id, message, kind, leaving: false }]); // 溜まりすぎないよう、新しい 4 件まで
  setTimeout(() => dismissToast(id), ms);
}
