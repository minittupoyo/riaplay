import { Show } from "solid-js";
import { IconHeart, IconHeartFilled } from "@tabler/icons-solidjs";
import type { Album, Artist, Song, SubsonicClient } from "../api";
import { isFav, toggleFav, type FavKind } from "../favorites";

/** お気に入りボタン。未登録のときは行/カードのホバー時のみ表示（always で常時表示） */
export default function Heart(props: {
  client: SubsonicClient;
  kind: FavKind;
  item: Song | Album | Artist;
  size?: number;
  always?: boolean;
  class?: string;
}) {
  const on = () => isFav(props.kind, props.item.id);
  return (
    <button
      class={`${props.class ?? "p-1 rounded-full"} ${on() ? "text-accent" : "text-white/50 hover:text-white"} ${on() || props.always ? "" : "opacity-0 group-hover:opacity-100"}`}
      title={on() ? "お気に入りから外す" : "お気に入りに追加"}
      onClick={(e) => { e.stopPropagation(); toggleFav(props.client, props.kind, props.item); }}
    >
      <Show when={on()} fallback={<IconHeart size={props.size ?? 18} />}>
        <IconHeartFilled size={props.size ?? 18} />
      </Show>
    </button>
  );
}
