/** IndexedDB の小さなラッパー（キーと値だけのストア）。開けない環境（プライベートモードなど）では、どの操作も何もしない */
export function openStore(dbName: string, store: string) {
  let dbp: Promise<IDBDatabase | null> | null = null;
  const open = () =>
    (dbp ??= new Promise((resolve) => {
      try {
        const r = indexedDB.open(dbName, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(store);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
        r.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));
  async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
    const db = await open();
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const rq = fn(db.transaction(store, mode).objectStore(store));
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => { console.warn(`IndexedDB(${dbName}/${store}):`, rq.error); resolve(undefined); };
      } catch (e) {
        console.warn(`IndexedDB(${dbName}/${store}):`, e); // 複製できない値を渡したときなど
        resolve(undefined);
      }
    });
  }
  return {
    get: <T>(key: string) => run<T>("readonly", (s) => s.get(key)),
    all: async <T>() => (await run<T[]>("readonly", (s) => s.getAll())) ?? [],
    put: (key: string, value: unknown) => run("readwrite", (s) => s.put(value, key)),
    del: (key: string) => run("readwrite", (s) => s.delete(key)),
    clear: () => run("readwrite", (s) => s.clear()),
  };
}
