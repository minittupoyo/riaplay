import { ref, shallowRef, watch, type Ref } from "vue";

/**
 * グローバル状態用の最小のリアクティブ値。`get()` をテンプレートや computed / watch の中で呼ぶと依存として追跡される。
 * 中身は深くリアクティブにしない（オブジェクトは差し替えで更新する）
 */
export function signal<T>(init: T): [get: () => T, set: (v: T | ((prev: T) => T)) => void] {
  const r = shallowRef(init) as Ref<T>;
  return [
    () => r.value,
    (v) => { r.value = typeof v === "function" ? (v as (prev: T) => T)(r.value) : v; },
  ];
}

/**
 * 非同期の取得。`source` が変わるたびに取り直す（false / null / undefined の間は取得しない）。
 * 取得中も前回の値は `data` に残り、失敗しても残る。fetcher には前回の値が渡る
 */
export function useResource<S, T>(
  source: () => S | false | null | undefined,
  fetcher: (s: S, info: { value: T | undefined }) => Promise<T> | T,
) {
  const data = shallowRef<T | undefined>();
  const loading = ref(false);
  const error = shallowRef<unknown>();
  let seq = 0;

  const run = async (s: S | false | null | undefined) => {
    if (s === false || s == null) return;
    const my = ++seq;
    loading.value = true;
    error.value = undefined;
    try {
      const v = await fetcher(s, { value: data.value });
      if (my === seq) data.value = v;
    } catch (e) {
      if (my === seq) error.value = e;
    } finally {
      if (my === seq) loading.value = false;
    }
  };

  watch(source, run, { immediate: true });

  return {
    data,
    loading,
    error,
    /** 現在の source で取り直す */
    refetch: () => run(source()),
    /** 取得を待たずに値を差し替える（楽観的更新） */
    mutate: (v: T | undefined) => { data.value = v; },
  };
}
