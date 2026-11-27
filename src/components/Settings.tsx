import { createSignal, For, onMount, Show } from "solid-js";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconServer } from "@tabler/icons-solidjs";
import { ACCENTS, resetSettings, settings, updateSettings, type BlurLevel, type MotionMode } from "../settings";
import { activeId, hostOf, removeServer, servers, setActive, setServerDialog } from "../servers";
import { enter } from "../motion";
import { firstShow } from "../firstShow";
import { Row, Section, Segmented, Toggle } from "./controls";

const BITRATES = [
  { value: 0, label: "原音" },
  { value: 320, label: "320" },
  { value: 256, label: "256" },
  { value: 192, label: "192" },
  { value: 128, label: "128" },
];

export default function Settings() {
  const [version, setVersion] = createSignal("");
  onMount(async () => {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      setVersion(await getVersion());
    } catch {
      setVersion("dev"); // ブラウザ単体で開発しているとき
    }
  });
  const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null);
  const [confirmReset, setConfirmReset] = createSignal(false);
  const s = settings;

  return (
    <div ref={(e) => { if (firstShow("settings:page")) enter(e, { y: 10 }); }} class="max-w-3xl">
      <h1 class="text-3xl font-bold mb-6">設定</h1>
      <div class="space-y-8">
        <Section title="サーバー">
          <For each={servers()}>
            {(sv) => (
              <div class="flex items-center gap-3 px-5 py-3.5">
                <IconServer size={20} class="text-white/40 shrink-0" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-medium truncate">{sv.name}</span>
                    <Show when={sv.id === activeId()}><span class="text-[11px] rounded-full bg-accent/20 text-accent px-2 py-0.5 shrink-0">接続中</span></Show>
                  </div>
                  <div class="text-sm text-white/50 truncate">{sv.username}@{hostOf(sv.url)}{sv.remember ? "" : "（パスワード未保存）"}</div>
                </div>
                <Show when={sv.id !== activeId()}>
                  <button class="rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-sm" onClick={() => setActive(sv.id)}>切り替え</button>
                </Show>
                <button class="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10" title="編集" onClick={() => setServerDialog({ mode: "edit", id: sv.id })}><IconPencil size={17} /></button>
                <button
                  class={`p-2 rounded-full ${confirmDelete() === sv.id ? "bg-accent text-white" : "text-white/50 hover:text-white hover:bg-white/10"}`}
                  title={confirmDelete() === sv.id ? "もう一度押して削除" : "削除"}
                  onClick={() => {
                    if (confirmDelete() !== sv.id) { setConfirmDelete(sv.id); setTimeout(() => setConfirmDelete((c) => (c === sv.id ? null : c)), 3000); return; }
                    removeServer(sv.id);
                  }}
                >
                  <IconTrash size={17} />
                </button>
              </div>
            )}
          </For>
          <div class="px-5 py-3">
            <button class="flex items-center gap-2 text-sm font-medium text-accent hover:brightness-125" onClick={() => setServerDialog({ mode: "add" })}>
              <IconPlus size={16} />サーバーを追加…
            </button>
          </div>
        </Section>

        <Section title="再生">
          <Row title="ストリーミング品質" desc="最大ビットレート(kbps)。「原音」以外はサーバー側で変換して再生します。次に再生する曲から反映されます。">
            <Segmented value={s().maxBitRate} options={BITRATES} onChange={(v) => updateSettings({ maxBitRate: v })} />
          </Row>
          <Row title="詳細情報を表示" desc="プレイヤーバーに、再生中の音声のコーデック・サンプルレート・ビットレートなどを見るボタンを表示します。">
            <Toggle label="詳細情報を表示" value={s().showAudioInfo} onChange={(v) => updateSettings({ showAudioInfo: v })} />
          </Row>
        </Section>

        <Section title="歌詞">
          <Row title="歌詞を取得する" desc="LRCLIB（lrclib.net）から取得します。オンにすると、再生中の曲名・アーティスト名・アルバム名・再生時間が LRCLIB に送信されます。">
            <Toggle label="歌詞を取得する" value={s().lyricsEnabled} onChange={(v) => updateSettings({ lyricsEnabled: v })} />
          </Row>
          <Row title="ぼかし" desc="同期歌詞で、現在の行から離れた行をぼかす強さ。">
            <Segmented<BlurLevel>
              value={s().lyricsBlur}
              options={[{ value: "off", label: "なし" }, { value: "weak", label: "弱" }, { value: "strong", label: "強" }]}
              onChange={(v) => updateSettings({ lyricsBlur: v })}
            />
          </Row>
        </Section>

        <Section title="外観">
          <Row title="アクセントカラー">
            <div class="flex gap-2.5">
              <For each={ACCENTS}>
                {(a) => (
                  <button
                    class="size-8 rounded-full flex items-center justify-center ring-offset-2 ring-offset-[#242426] transition-shadow"
                    classList={{ "ring-2 ring-white": s().accent === a.id }}
                    style={{ background: a.color }}
                    title={a.name}
                    aria-label={a.name}
                    aria-pressed={s().accent === a.id}
                    onClick={() => updateSettings({ accent: a.id })}
                  >
                    <Show when={s().accent === a.id}><IconCheck size={16} stroke="3" class="text-white" /></Show>
                  </button>
                )}
              </For>
            </div>
          </Row>
          <Row title="アニメーション" desc="「システム設定に従う」は、OS の「視差効果を減らす」に連動します。">
            <Segmented<MotionMode>
              value={s().motion}
              options={[{ value: "system", label: "システム設定に従う" }, { value: "on", label: "オン" }, { value: "off", label: "オフ" }]}
              onChange={(v) => updateSettings({ motion: v })}
            />
          </Row>
        </Section>

        <Section title="このアプリについて">
          <Row title="riaplay" desc="Navidrome 用のクライアント">
            <span class="text-sm text-white/50 tabular-nums">バージョン {version()}</span>
          </Row>
          <Row title="歌詞提供" desc="歌詞は LRCLIB（https://lrclib.net）から取得しています。">
            <span />
          </Row>
          <Row title="設定を初期化" desc="再生品質・歌詞・外観の設定を初期値に戻します（登録済みのサーバーは変わりません）。">
            <button
              class={`rounded-lg px-4 py-2 text-sm font-medium ${confirmReset() ? "bg-accent" : "bg-white/10 hover:bg-white/15"}`}
              onClick={() => {
                if (!confirmReset()) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 3000); return; }
                resetSettings();
                setConfirmReset(false);
              }}
            >
              {confirmReset() ? "もう一度押して初期化" : "初期化"}
            </button>
          </Row>
        </Section>
      </div>
    </div>
  );
}
