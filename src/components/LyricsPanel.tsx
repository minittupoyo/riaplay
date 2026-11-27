import { createEffect, createMemo, createResource, For, on, onCleanup, Show } from "solid-js";
import { IconX, IconLoader2, IconMicrophone2Off } from "@tabler/icons-solidjs";
import { current, currentTime, seek } from "../player";
import { LyricsAnimator, type LyricLine } from "../lyricsAnimator";
import { setLyricsOpen } from "../store";
import { fetchLyrics } from "../lyrics";
import { settings } from "../settings";

const INTRO_MIN = 4; // 最初の行までこの秒数以上あれば、冒頭に間奏を表示する

interface ViewLine { time: number; end: number; text: string }

/** 同期歌詞を表示用に整える: 冒頭の間奏を補い、末尾の空行（終了マーカー）は表示しない */
function toView(synced: { time: number; text: string }[] | null | undefined): ViewLine[] | null {
  if (!synced) return null;
  let last = synced.length - 1;
  while (last >= 0 && !synced[last].text) last--; // 末尾の空行は間奏として出さない
  if (last < 0) return [];
  const body = synced.slice(0, last + 1);
  const tailEnd = synced[last + 1]?.time; // 終了マーカーがあれば、最後の行の終了時刻に使う
  const out = body.map((l, i) => ({ time: l.time, text: l.text, end: i < last ? body[i + 1].time : (tailEnd ?? l.time + 5) }));
  if (out[0].text && out[0].time >= INTRO_MIN) out.unshift({ time: 0, text: "", end: out[0].time });
  return out;
}

/** embedded: 再生中画面の中に置く。幅は親に任せ、見出しと閉じるボタンは出さない */
export default function LyricsPanel(props: { ref?: (e: HTMLElement) => void; overlay?: boolean; embedded?: boolean }) {
  const [lyrics] = createResource(
    () => (settings().lyricsEnabled ? current() : undefined), // 設定でオフなら LRCLIB へ問い合わせない
    (s) => fetchLyrics(s),
  );

  const view = createMemo(() => toView(lyrics()?.synced));

  // 同期歌詞のアニメーション（再生位置・スクロール・ぼかし・発光）は LyricsAnimator が担当
  let scroller!: HTMLDivElement;
  const lis: HTMLElement[] = [];
  const dots: HTMLElement[][] = [];
  const groups: HTMLElement[] = [];
  createEffect(() => {
    const v = view();
    if (!v?.length || !scroller) return;
    // For がこの曲の行を描画し終えてから（refs が新しい要素を指してから）アニメーターを作る
    let animator: LyricsAnimator | undefined;
    let dead = false;
    // 要素は ref 配列ではなく DOM から直接集める（曲切り替え直後の古い参照を避ける）。描画が揃うまで待つ
    const build = () => {
      if (dead) return;
      const els = Array.from(scroller.querySelectorAll<HTMLElement>("li.lyric-line"));
      if (els.length !== v.length || !els[0].isConnected || v.some((l, i) => l.text && !els[i].textContent?.includes(l.text.trim()))) return void requestAnimationFrame(build);
      const lines: LyricLine[] = v.map((l, i) => ({
        li: els[i],
        start: l.time,
        end: l.end,
        interlude: !l.text,
        dots: Array.from(els[i].querySelectorAll<HTMLElement>(".lyric-dots i")),
        group: els[i].querySelector<HTMLElement>(".lyric-dots"),
      }));
      animator = new LyricsAnimator(scroller, lines, currentTime);
      animator.applyBlurs();
    };
    queueMicrotask(build);
    createEffect(() => { settings().lyricsBlur; animator?.applyBlurs(); }); // ぼかし設定の変更を即反映
    onCleanup(() => { dead = true; animator?.destroy(); });
  });
  // 曲が変わったら先頭へ戻す
  createEffect(on(() => current()?.id, () => scroller?.scrollTo({ top: 0 }), { defer: true }));

  const credit = "text-[11px] text-white/25";
  const msg = "text-white/40 text-sm";
  return (
    <aside
      ref={props.ref}
      class={props.embedded ? "flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col" : `w-80 shrink-0 overflow-hidden border-l flex flex-col ${props.overlay ? "absolute right-0 top-0 z-30 border-white/10 bg-[#262629] shadow-2xl shadow-black/60" : "border-white/5 bg-white/[0.04]"}`}
      style={!props.embedded && props.overlay ? { bottom: current() ? "6.5rem" : "0" } : undefined}
    >
      <div class={`${props.embedded ? "w-full" : "w-80"} flex-1 min-h-0 flex flex-col`}>
        <Show when={!props.embedded} fallback={<div class="pt-4" />}>
          <div class="flex items-center justify-between px-4 pt-5 pb-3">
            <h2 class="text-xl font-bold">歌詞</h2>
            <button class="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10" onClick={() => setLyricsOpen(false)}><IconX size={18} /></button>
          </div>
        </Show>
        <div ref={scroller} class={`flex-1 overflow-y-scroll px-4 ${props.embedded ? "" : "fade-y-sm"}`}>
          <Show when={current()} fallback={<p class={msg}>曲を再生すると歌詞が表示されます</p>}>
            <Show when={settings().lyricsEnabled} fallback={<p class={msg}>歌詞の取得がオフになっています。設定の「歌詞」から有効にできます。</p>}>
            <Show when={lyrics.loading}><div class="flex items-center gap-2 text-white/50 text-sm"><IconLoader2 size={16} class="animate-spin" />取得中…</div></Show>
            <Show when={lyrics.error}><p class="text-accent text-sm">取得に失敗しました: {String(lyrics.error?.message ?? lyrics.error)}</p></Show>
            <Show when={!lyrics.loading && !lyrics.error}>
              <Show
                when={lyrics()}
                fallback={<div class="flex flex-col items-center gap-2 mt-16 text-white/40"><IconMicrophone2Off size={32} /><p class="text-sm">歌詞が見つかりません</p></div>}
              >
                {(l) => (
                  <Show
                    when={l().synced}
                    fallback={
                      <Show when={l().plain} fallback={<p class={msg}>{l().instrumental ? "インストゥルメンタル" : "歌詞がありません"}</p>}>
                        <p class="whitespace-pre-wrap text-[15px] leading-8 text-white/80">{l().plain}</p>
                        <p class={`${credit} pt-4 pb-8`}>歌詞提供: LRCLIB</p>
                      </Show>
                    }
                  >
                    {(_) => (
                      <ul class="pt-2">
                        <For each={view() ?? []}>
                          {(line, i) => (
                            <li ref={(e) => (lis[i()] = e)} class={`lyric-line ${line.text ? "" : "interlude"}`} onClick={() => seek(line.time)}>
                              <Show when={line.text} fallback={
                                <div class="lyric-collapse">
                                  <span class="lyric-dots" ref={(e) => (groups[i()] = e)}>
                                    <i ref={(e) => ((dots[i()] ??= [])[0] = e)} /><i ref={(e) => ((dots[i()] ??= [])[1] = e)} /><i ref={(e) => ((dots[i()] ??= [])[2] = e)} />
                                  </span>
                                </div>
                              }>
                                <span class="lyric-text">{line.text}</span>
                              </Show>
                            </li>
                          )}
                        </For>
                        <li class={`${credit} pt-6 pb-[35vh]`}>歌詞提供: LRCLIB</li>
                      </ul>
                    )}
                  </Show>
                )}
              </Show>
            </Show>
            </Show>
          </Show>
        </div>
      </div>
    </aside>
  );
}
