<script setup lang="ts">
import { onMounted, ref } from "vue";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconServer } from "@tabler/icons-vue";
import { ACCENTS, resetSettings, settings, updateSettings, type BlurLevel, type DiscordStatus, type MotionMode, type RomajiPosition } from "../settings";
import { activeId, hostOf, removeServer, servers, setActive, setServerDialog } from "../servers";
import { vEnter } from "../motion";
import { clearLyricsCache } from "../lyrics";
import { toast } from "../toast";
import { firstShow } from "../firstShow";
import SettingRow from "./SettingRow.vue";
import SettingSection from "./SettingSection.vue";
import Segmented from "./Segmented.vue";
import Toggle from "./Toggle.vue";

const BITRATES = [
  { value: 0, label: "原音" },
  { value: 320, label: "320" },
  { value: 256, label: "256" },
  { value: 192, label: "192" },
  { value: 128, label: "128" },
];
const REFRESH_INTERVALS = [{ value: 0, label: "なし" }, { value: 5, label: "5分" }, { value: 15, label: "15分" }, { value: 30, label: "30分" }, { value: 60, label: "60分" }];
const BLUR_LEVELS: { value: BlurLevel; label: string }[] = [{ value: "off", label: "なし" }, { value: "weak", label: "弱" }, { value: "strong", label: "強" }];
const DISCORD_STATUSES: { value: DiscordStatus; label: string }[] = [{ value: "app", label: "riaplay" }, { value: "title", label: "曲のタイトル" }, { value: "artist", label: "アーティスト名" }];
const ROMAJI_POSITIONS: { value: RomajiPosition; label: string }[] = [{ value: "below", label: "下" }, { value: "above", label: "上" }];
const MOTION_MODES: { value: MotionMode; label: string }[] = [{ value: "system", label: "システム設定に従う" }, { value: "on", label: "オン" }, { value: "off", label: "オフ" }];

const version = ref("");
onMounted(async () => {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    version.value = await getVersion();
  } catch {
    version.value = "dev"; // ブラウザ単体で開発しているとき
  }
});
const confirmDelete = ref<string | null>(null);
const confirmReset = ref(false);

const deleteServer = (id: string) => {
  if (confirmDelete.value !== id) {
    confirmDelete.value = id;
    setTimeout(() => { if (confirmDelete.value === id) confirmDelete.value = null; }, 3000);
    return;
  }
  void removeServer(id);
};
const reset = () => {
  if (!confirmReset.value) { confirmReset.value = true; setTimeout(() => { confirmReset.value = false; }, 3000); return; }
  resetSettings();
  confirmReset.value = false;
};
const clearCache = async () => {
  await clearLyricsCache();
  toast("歌詞のキャッシュを削除しました");
};
</script>

<template>
  <div v-enter="firstShow('settings:page') ? { y: 10 } : false" class="max-w-3xl">
    <h1 class="text-3xl font-bold mb-6">設定</h1>
    <div class="space-y-8">
      <SettingSection title="サーバー">
        <div v-for="sv in servers()" :key="sv.id" class="flex items-center gap-3 px-5 py-3.5">
          <IconServer :size="20" class="text-white/40 shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-medium truncate">{{ sv.name }}</span>
              <span v-if="sv.id === activeId()" class="text-[11px] rounded-full bg-accent/20 text-accent px-2 py-0.5 shrink-0">接続中</span>
            </div>
            <div class="text-sm text-white/50 truncate">{{ sv.username }}@{{ hostOf(sv.url) }}{{ sv.remember ? "" : "（パスワード未保存）" }}</div>
          </div>
          <button v-if="sv.id !== activeId()" class="rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-sm" @click="setActive(sv.id)">切り替え</button>
          <button class="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10" title="編集" @click="setServerDialog({ mode: 'edit', id: sv.id })"><IconPencil :size="17" /></button>
          <button
            :class="['p-2 rounded-full', confirmDelete === sv.id ? 'bg-accent text-white' : 'text-white/50 hover:text-white hover:bg-white/10']"
            :title="confirmDelete === sv.id ? 'もう一度押して削除' : '削除'"
            @click="deleteServer(sv.id)"
          >
            <IconTrash :size="17" />
          </button>
        </div>
        <div class="px-5 py-3">
          <button class="flex items-center gap-2 text-sm font-medium text-accent hover:brightness-125" @click="setServerDialog({ mode: 'add' })">
            <IconPlus :size="16" />サーバーを追加…
          </button>
        </div>
      </SettingSection>

      <SettingSection title="再生">
        <SettingRow title="ストリーミング品質" desc="最大ビットレート(kbps)。「原音」以外はサーバー側で変換して再生します。次に再生する曲から反映されます。">
          <Segmented :value="settings().maxBitRate" :options="BITRATES" @change="updateSettings({ maxBitRate: $event })" />
        </SettingRow>
        <SettingRow title="ライブラリの自動更新" desc="指定した間隔で、アルバム・アーティスト・プレイリスト・お気に入りをサーバーから再読み込みします。サイドバーのボタンで、いつでも手動で再読み込みできます。">
          <Segmented :value="settings().libraryRefreshMinutes" :options="REFRESH_INTERVALS" @change="updateSettings({ libraryRefreshMinutes: $event })" />
        </SettingRow>
        <SettingRow title="詳細情報を表示" desc="プレイヤーバーに、再生中の音声のコーデック・サンプルレート・ビットレートなどを見るボタンを表示します。">
          <Toggle label="詳細情報を表示" :value="settings().showAudioInfo" @change="updateSettings({ showAudioInfo: $event })" />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Discord">
        <SettingRow title="Rich Presence を表示" desc="再生中の曲をDiscordのステータスに表示します。オンにすると、曲名・アーティスト名・アルバム名がDiscordに送られ、ジャケット画像の検索のためアーティスト名とアルバム名が iTunes・Deezer・MusicBrainz にも送信されます。Discordが起動している必要があります。">
          <Toggle label="Rich Presence を表示" :value="settings().discordPresence" @change="updateSettings({ discordPresence: $event })" />
        </SettingRow>
        <SettingRow title="「〇〇を再生中」の表示" desc="Discordのメンバー一覧などで、「〇〇を再生中」の〇〇に出すもの。">
          <Segmented :value="settings().discordStatus" :options="DISCORD_STATUSES" @change="updateSettings({ discordStatus: $event })" />
        </SettingRow>
      </SettingSection>

      <SettingSection title="歌詞">
        <SettingRow title="歌詞を取得する" desc="サーバー、LRCLIB（lrclib.net）、NetEase Cloud Music の順に探します。オンにすると、再生中の曲名・アーティスト名・アルバム名・再生時間が LRCLIB と NetEase Cloud Music に送信されます。">
          <Toggle label="歌詞を取得する" :value="settings().lyricsEnabled" @change="updateSettings({ lyricsEnabled: $event })" />
        </SettingRow>
        <SettingRow title="ぼかし" desc="同期歌詞で、現在の行から離れた行をぼかす強さ。">
          <Segmented :value="settings().lyricsBlur" :options="BLUR_LEVELS" @change="updateSettings({ lyricsBlur: $event })" />
        </SettingRow>
        <SettingRow title="ローマ字で表示" desc="日本語の歌詞のヘボン式ローマ字を、原文と並べて表示します。変換は端末内で行います。">
          <Toggle label="ローマ字で表示" :value="settings().lyricsRomaji" @change="updateSettings({ lyricsRomaji: $event })" />
        </SettingRow>
        <SettingRow title="ローマ字の位置" desc="原文に対して、ローマ字を表示する側。">
          <Segmented :value="settings().lyricsRomajiPosition" :options="ROMAJI_POSITIONS" @change="updateSettings({ lyricsRomajiPosition: $event })" />
        </SettingRow>
        <SettingRow title="歌詞のキャッシュ" desc="一度取得した歌詞は、この端末に保存して再利用します（見つからなかった曲は 7 日後に再確認します）。">
          <button class="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15" @click="clearCache">削除</button>
        </SettingRow>
      </SettingSection>

      <SettingSection title="外観">
        <SettingRow title="アクセントカラー">
          <div class="flex gap-2.5">
            <button
              v-for="a in ACCENTS"
              :key="a.id"
              :class="['size-8 rounded-full flex items-center justify-center ring-offset-2 ring-offset-[#242426] transition-shadow', settings().accent === a.id ? 'ring-2 ring-white' : '']"
              :style="{ background: a.color }"
              :title="a.name"
              :aria-label="a.name"
              :aria-pressed="settings().accent === a.id"
              @click="updateSettings({ accent: a.id })"
            >
              <IconCheck v-if="settings().accent === a.id" :size="16" stroke="3" class="text-white" />
            </button>
          </div>
        </SettingRow>
        <SettingRow title="アニメーション" desc="「システム設定に従う」は、OS の「視差効果を減らす」に連動します。">
          <Segmented :value="settings().motion" :options="MOTION_MODES" @change="updateSettings({ motion: $event })" />
        </SettingRow>
      </SettingSection>

      <SettingSection title="このアプリについて">
        <SettingRow title="riaplay" desc="Navidrome 用のクライアント">
          <span class="text-sm text-white/50 tabular-nums">バージョン {{ version }}</span>
        </SettingRow>
        <SettingRow title="歌詞提供" desc="歌詞は、サーバー、LRCLIB（https://lrclib.net）、NetEase Cloud Music から取得しています。">
          <span />
        </SettingRow>
        <SettingRow title="設定を初期化" desc="再生品質・歌詞・外観の設定を初期値に戻します（登録済みのサーバーは変わりません）。">
          <button :class="['rounded-lg px-4 py-2 text-sm font-medium', confirmReset ? 'bg-accent' : 'bg-white/10 hover:bg-white/15']" @click="reset">
            {{ confirmReset ? "もう一度押して初期化" : "初期化" }}
          </button>
        </SettingRow>
      </SettingSection>
    </div>
  </div>
</template>
