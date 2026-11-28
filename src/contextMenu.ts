import { signal } from "./reactive";
import type { Song, SubsonicClient } from "./api";

/** 右クリックメニューの内容と位置（ウィンドウ座標） */
export interface ContextMenuSpec {
  x: number;
  y: number;
  client: SubsonicClient;
  songs: () => Song[] | Promise<Song[]>;
  onRemove?: { label: string; run: () => void };
}

const [contextMenu, setContextMenu] = signal<ContextMenuSpec | null>(null);
export { contextMenu };
export const openContextMenu = (spec: ContextMenuSpec) => setContextMenu(spec);
export const closeContextMenu = () => setContextMenu(null);
