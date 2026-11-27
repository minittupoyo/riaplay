import { createSignal, type Accessor } from "solid-js";

/** 画面下に一時的に出す通知（トースト） */
export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error";
  /** 退場アニメーション中か。オブジェクトを作り直すと一覧側が要素を作り直してしまうので、状態は個別のシグナルに持つ */
  leaving: Accessor<boolean>;
  setLeaving: (v: boolean) => void;
}

const LEAVE_MS = 220;
const [toasts, setToasts] = createSignal<Toast[]>([]);
export { toasts };
let seq = 0;

export function dismissToast(id: number) {
  const t = toasts().find((x) => x.id === id);
  if (!t || t.leaving()) return;
  t.setLeaving(true);
  setTimeout(() => setToasts((l) => l.filter((t) => t.id !== id)), LEAVE_MS);
}

export function toast(message: string, kind: Toast["kind"] = "info", ms = 2800) {
  const id = ++seq;
  const [leaving, setLeaving] = createSignal(false);
  setToasts((l) => [...l.slice(-3), { id, message, kind, leaving, setLeaving }]); // 溜まりすぎないよう、新しい 4 件まで
  setTimeout(() => dismissToast(id), ms);
}
