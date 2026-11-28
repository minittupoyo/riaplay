<script setup lang="ts">
import { computed } from "vue";
import { IconHeart, IconHeartFilled } from "@tabler/icons-vue";
import type { Album, Artist, Song, SubsonicClient } from "../api";
import { isFav, toggleFav, type FavKind } from "../favorites";

/** お気に入りボタン。未登録のときは行/カードのホバー時のみ表示（always で常時表示） */
const props = defineProps<{
  client: SubsonicClient;
  kind: FavKind;
  item: Song | Album | Artist;
  size?: number;
  always?: boolean;
  btnClass?: string;
}>();
const on = computed(() => isFav(props.kind, props.item.id));
</script>

<template>
  <button
    :class="[btnClass ?? 'p-1 rounded-full', on ? 'text-accent' : 'text-white/50 hover:text-white', on || always ? '' : 'opacity-0 group-hover:opacity-100']"
    :title="on ? 'お気に入りから外す' : 'お気に入りに追加'"
    @click.stop="toggleFav(client, kind, item)"
  >
    <IconHeartFilled v-if="on" :size="size ?? 18" />
    <IconHeart v-else :size="size ?? 18" />
  </button>
</template>
