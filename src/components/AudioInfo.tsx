import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { IconInfoCircle } from "@tabler/icons-solidjs";
import { enter } from "../motion";
import { audioInfo, isTranscoded } from "../player";
import { settings } from "../settings";

const channelLabel = (n: number) => (n === 1 ? "モノラル" : n === 2 ? "ステレオ" : `${n} ch`);
const khz = (hz: number) => `${+(hz / 1000).toFixed(1)} kHz`;

/** 再生中ストリームの技術情報。libmpv で再生しているとき（情報が届くとき）だけボタンを出す */
export default function AudioInfo() {
  const [open, setOpen] = createSignal(false);
  let root!: HTMLDivElement;
  const away = (e: PointerEvent) => { if (!root.contains(e.target as Node)) setOpen(false); };
  onMount(() => window.addEventListener("pointerdown", away));
  onCleanup(() => window.removeEventListener("pointerdown", away));

  const rows = () => {
    const i = audioInfo();
    if (!i) return [];
    const r: [string, string][] = [];
    if (i.codec) r.push(["コーデック", i.codec.toUpperCase()]);
    if (i.format && i.format !== i.codec) r.push(["コンテナ", i.format]);
    if (i.sampleRate) r.push(["サンプルレート", khz(i.sampleRate)]);
    if (i.channels) r.push(["チャンネル", channelLabel(i.channels)]);
    if (i.bitrate) r.push(["ビットレート", `${Math.round(i.bitrate / 1000)} kbps`]);
    r.push(["配信", isTranscoded() ? `トランスコード（最大 ${settings().maxBitRate} kbps）` : "原音"]);
    return r;
  };

  return (
    <Show when={settings().showAudioInfo && audioInfo()?.codec}>
      <div ref={root} class="relative">
        <button class={`p-2 rounded-full ${open() ? "text-accent" : "text-white/60 hover:text-white"}`} title="音声の情報" onClick={() => setOpen(!open())}>
          <IconInfoCircle size={20} />
        </button>
        <Show when={open()}>
          <div
            ref={(e) => enter(e, { y: 8, duration: 200 })}
            class="absolute bottom-full right-0 mb-4 w-64 rounded-xl bg-neutral-800/90 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/50 p-3 text-xs"
          >
            <div class="text-white/50 mb-2">音声の情報</div>
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              {rows().map(([k, v]) => (
                <>
                  <dt class="text-white/50">{k}</dt>
                  <dd class="text-right tabular-nums">{v}</dd>
                </>
              ))}
            </dl>
          </div>
        </Show>
      </div>
    </Show>
  );
}
