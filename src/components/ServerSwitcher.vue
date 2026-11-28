<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { IconMusic, IconSelector, IconCheck, IconPencil, IconTrash, IconPlus } from "@tabler/icons-vue";
import { activeId, hostOf, removeServer, servers, setActive, setServerDialog } from "../servers";
import { usePresence } from "../motion";

/** サイドバー最上部: 現在のサーバー名。クリックで切り替え・追加・編集・削除のメニュー */
defineProps<{ compact: boolean }>();

const open = ref(false);
const confirmId = ref<string | null>(null);
const root = ref<HTMLDivElement | null>(null);
const active = computed(() => servers().find((s) => s.id === activeId()));

const { present, setEl } = usePresence(
  () => open.value,
  { keyframes: [{ opacity: 0, transform: "scale(.96) translateY(-4px)" }, { opacity: 1, transform: "none" }], options: { duration: 160 } },
  { keyframes: [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.98)" }], options: { duration: 120 } },
);
const close = () => { open.value = false; confirmId.value = null; };
const onDoc = (e: MouseEvent) => { if (!root.value?.contains(e.target as Node)) close(); };
onMounted(() => document.addEventListener("mousedown", onDoc));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDoc));

const select = (id: string) => { close(); if (id !== activeId()) setActive(id); };
const edit = (id: string) => { close(); setServerDialog({ mode: "edit", id }); };
const remove = (id: string) => {
  if (confirmId.value !== id) {
    confirmId.value = id;
    setTimeout(() => { if (confirmId.value === id) confirmId.value = null; }, 3000);
    return;
  }
  close();
  void removeServer(id);
};
const add = () => { close(); setServerDialog({ mode: "add" }); };

const row = "flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/10";
</script>

<template>
  <div ref="root" class="relative mb-2">
    <button
      :class="`flex items-center w-full rounded-lg hover:bg-white/5 ${compact ? 'justify-center py-2' : 'gap-2 px-3 pt-2 pb-2.5 text-left'}`"
      :title="active?.name ?? 'サーバー'"
      @click="open ? close() : (open = true)"
    >
      <IconMusic :size="22" class="text-accent shrink-0" />
      <template v-if="!compact">
        <span class="min-w-0 flex-1">
          <span class="block text-lg font-semibold leading-tight truncate">{{ active?.name ?? "riaplay" }}</span>
          <span class="block text-[11px] text-white/40 truncate">{{ active ? `${active.username}@${hostOf(active.url)}` : "" }}</span>
        </span>
        <IconSelector :size="16" class="text-white/40 shrink-0" />
      </template>
    </button>

    <div
      v-if="present"
      :ref="setEl"
      :class="`absolute z-50 w-64 origin-top-left rounded-xl bg-neutral-800 border border-white/10 shadow-2xl shadow-black/60 p-1 ${compact ? 'left-full top-0 ml-2' : 'left-0 top-full mt-1'}`"
    >
      <div class="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-white/40">サーバー</div>
      <div class="max-h-72 overflow-y-auto">
        <div v-for="s in servers()" :key="s.id" class="group flex items-center rounded-lg hover:bg-white/10">
          <button :class="`${row} flex-1 min-w-0 hover:bg-transparent`" @click="select(s.id)">
            <span class="w-4 shrink-0"><IconCheck v-if="s.id === activeId()" :size="16" class="text-accent" /></span>
            <span class="min-w-0">
              <span class="block truncate">{{ s.name }}</span>
              <span class="block truncate text-[11px] text-white/40">{{ s.username }}@{{ hostOf(s.url) }}</span>
            </span>
          </button>
          <button class="p-1.5 rounded-full text-white/40 hover:text-white opacity-0 group-hover:opacity-100" title="編集" @click="edit(s.id)">
            <IconPencil :size="15" />
          </button>
          <button
            :class="`p-1.5 mr-1 rounded-full ${confirmId === s.id ? 'bg-accent text-white opacity-100' : 'text-white/40 hover:text-white opacity-0 group-hover:opacity-100'}`"
            :title="confirmId === s.id ? 'もう一度押して削除' : '削除'"
            @click="remove(s.id)"
          >
            <IconTrash :size="15" />
          </button>
        </div>
      </div>
      <div class="border-t border-white/10 mt-1 pt-1">
        <button :class="`${row} text-accent`" @click="add">
          <IconPlus :size="16" />サーバーを追加…
        </button>
      </div>
    </div>
  </div>
</template>
