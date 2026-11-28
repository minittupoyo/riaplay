<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { IconLoader2 } from "@tabler/icons-vue";
import { NetworkError, SubsonicClient } from "./api";
import Login from "./components/Login.vue";
import Library from "./components/Library.vue";
import ConnectionError from "./components/ConnectionError.vue";
import ServerDialog from "./components/ServerDialog.vue";
import Toaster from "./components/Toaster.vue";
import ContextMenu from "./components/ContextMenu.vue";
import { activeId, addServer, getPassword, passwordsReady, servers, setActive, type Server, type ServerInput } from "./servers";
import { clearQueue } from "./player";
import { clearFavorites } from "./favorites";
import { downloadsReady, hasDownloads } from "./downloads";
import { toast } from "./toast";

type Status = "idle" | "connecting" | "ready" | "error" | "offline";

const active = computed<Server | null>(() => servers().find((s) => s.id === activeId()) ?? null);
const client = shallowRef<SubsonicClient | null>(null);
const status = ref<Status>("idle");
const error = ref("");
let token = 0; // 古い接続の結果を捨てるための世代番号

/** サーバーへ接続する。切り替え時は、前のサーバーの再生・お気に入り・歌詞キャッシュを破棄する */
const connect = async (s: Server | null) => {
  const my = ++token;
  clearQueue();
  clearFavorites();
  client.value = null;
  if (!s) { status.value = "idle"; return; }
  status.value = "connecting";
  error.value = "";
  try {
    await passwordsReady; // 旧形式のパスワードのキーチェーン移行が終わるのを待つ
    const password = await getPassword(s.id);
    if (my !== token) return;
    if (password === null) throw new Error("パスワードが保存されていません。「編集」からパスワードを入力してください。");
    const c = new SubsonicClient({ ...s, password });
    await c.ping();
    if (my !== token) return;
    client.value = c;
    status.value = "ready";
  } catch (e) {
    if (my !== token) return;
    // サーバーに届かない場合は、ダウンロード済みの曲があればそのままオフラインで使う（エラー画面は出さない）
    if (e instanceof NetworkError) {
      await downloadsReady;
      if (my !== token) return;
      if (hasDownloads(s.id)) {
        goOffline(s);
        toast("サーバーに接続できないため、オフラインで開きました", "info", 4000);
        return;
      }
    }
    error.value = e instanceof Error ? e.message : String(e);
    status.value = "error";
  }
};
// 登録済みなら起動時に自動で接続する（ログイン画面は出さない）。アクティブなサーバーが変わる/編集されたら再接続
watch(active, (s) => { void connect(s); }, { immediate: true });

/** 接続できないとき、ダウンロード済みの曲だけを使う（通信はしない） */
const goOffline = (s: Server) => {
  clearQueue();
  client.value = new SubsonicClient({ ...s, password: "" });
  status.value = "offline";
};

/** 初回: サーバーが 1 つもないときの接続画面 */
const firstRun = async (v: ServerInput) => {
  await new SubsonicClient(v).ping();
  setActive((await addServer(v)).id);
};
</script>

<template>
  <template v-if="servers().length > 0">
    <Library v-if="status === 'ready' && client" :client="client" />
    <Library v-else-if="status === 'offline' && client" :client="client" offline @reconnect="connect(active)" />
    <ConnectionError
      v-else-if="status === 'error'"
      :server="active"
      :message="error"
      @retry="connect(active)"
      @offline="active && goOffline(active)"
    />
    <main v-else class="h-full flex flex-col items-center justify-center gap-3 text-white/50">
      <IconLoader2 :size="28" class="animate-spin text-accent" />
      <p class="text-sm">{{ active?.name }} に接続中…</p>
    </main>
  </template>
  <Login v-else :on-submit="firstRun" />
  <ServerDialog />
  <Toaster />
  <ContextMenu />
</template>
