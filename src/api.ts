import { fetch } from "@tauri-apps/plugin-http";
import SparkMD5 from "spark-md5";
import { settings } from "./settings";
import { localCoverUrl } from "./downloads";

/** サーバーに届かなかった（ネットワークが無い・名前が引けない・5xx など）。認証エラーなどの「届いたうえでの失敗」とは区別する */
export class NetworkError extends Error {}

export interface Config {
  /** 登録済みサーバーの ID（ダウンロードの保存先の区別に使う） */
  id?: string;
  url: string;
  username: string;
  password: string;
}

export interface Album {
  id: string;
  name: string;
  artist: string;
  coverArt?: string;
  year?: number;
  songCount: number;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  track?: number;
  discNumber?: number;
  duration: number;
  coverArt?: string;
}

export interface Playlist {
  id: string;
  name: string;
  songCount: number;
  duration: number;
  coverArt?: string;
}

export interface Artist {
  id: string;
  name: string;
  albumCount: number;
  coverArt?: string;
}

type Params = Record<string, string | number | (string | number)[]>;

const API_VERSION = "1.16.1";

function randomSalt(): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export class SubsonicClient {
  constructor(private cfg: Config) {}

  get serverId(): string | undefined {
    return this.cfg.id;
  }

  private base(): string {
    return this.cfg.url.replace(/\/+$/, "");
  }

  // カバーアート用に固定の salt/token を使い、URL を安定させてブラウザキャッシュを効かせる
  private fixedSalt = randomSalt();

  private params(extra: Params = {}, fixed = false): URLSearchParams {
    const salt = fixed ? this.fixedSalt : randomSalt();
    const p = new URLSearchParams({
      u: this.cfg.username,
      t: SparkMD5.hash(this.cfg.password + salt),
      s: salt,
      v: API_VERSION,
      c: "riaplay",
      f: "json",
    });
    for (const [k, v] of Object.entries(extra)) {
      if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
      else p.set(k, String(v));
    }
    return p;
  }

  private async call<T = any>(endpoint: string, extra?: Params): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base()}/rest/${endpoint}?${this.params(extra)}`);
    } catch (e) {
      throw new NetworkError(e instanceof Error ? e.message : String(e));
    }
    if (res.status >= 500) throw new NetworkError(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json())["subsonic-response"];
    if (body.status !== "ok") throw new Error(body.error?.message ?? "不明なエラー");
    return body;
  }

  async ping(): Promise<void> {
    await this.call("ping");
  }

  async getAlbums(offset = 0, size = 60, type = "alphabeticalByName"): Promise<Album[]> {
    const r = await this.call("getAlbumList2", { type, size, offset });
    return r.albumList2.album ?? [];
  }

  async getArtists(): Promise<Artist[]> {
    const r = await this.call("getArtists");
    return (r.artists.index ?? []).flatMap((i: any) => i.artist ?? []);
  }

  async getAlbum(id: string): Promise<{ album: Album; songs: Song[]; discTitles: Record<number, string> }> {
    const r = await this.call("getAlbum", { id });
    const { song, discTitles: dt, ...album } = r.album;
    // ディスク番号 → トラック番号の順に並べる（サーバーの返す順は保証されないため）。discTitles は OpenSubsonic 拡張
    const songs: Song[] = [...(song ?? [])].sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.track ?? 0) - (b.track ?? 0));
    const discTitles: Record<number, string> = {};
    for (const d of dt ?? []) if (d.name) discTitles[d.disc] = d.name;
    return { album, songs, discTitles };
  }

  async getArtist(id: string): Promise<{ artist: Artist; albums: Album[] }> {
    const r = await this.call("getArtist", { id });
    const { album, ...artist } = r.artist;
    return { artist, albums: album ?? [] };
  }

  async search(query: string): Promise<{ artists: Artist[]; albums: Album[]; songs: Song[] }> {
    const r = await this.call("search3", { query, artistCount: 10, albumCount: 20, songCount: 30 });
    const x = r.searchResult3 ?? {};
    return { artists: x.artist ?? [], albums: x.album ?? [], songs: x.song ?? [] };
  }

  async getPlaylists(): Promise<Playlist[]> {
    const r = await this.call("getPlaylists");
    return r.playlists.playlist ?? [];
  }

  async getPlaylist(id: string): Promise<{ playlist: Playlist; songs: Song[] }> {
    const r = await this.call("getPlaylist", { id });
    const { entry, ...playlist } = r.playlist;
    return { playlist, songs: entry ?? [] };
  }

  async createPlaylist(name: string, songIds: string[] = []): Promise<Playlist | null> {
    const r = await this.call("createPlaylist", { name, songId: songIds });
    return r.playlist ?? null;
  }

  async updatePlaylist(id: string, opts: { name?: string; add?: string[]; removeIndexes?: number[] }): Promise<void> {
    const p: Params = { playlistId: id };
    if (opts.name !== undefined) p.name = opts.name;
    if (opts.add?.length) p.songIdToAdd = opts.add;
    if (opts.removeIndexes?.length) p.songIndexToRemove = opts.removeIndexes;
    await this.call("updatePlaylist", p);
  }

  /** プレイリストの曲を指定順で置き換える（並べ替え用） */
  async setPlaylistSongs(id: string, songIds: string[]): Promise<void> {
    await this.call("createPlaylist", { playlistId: id, songId: songIds });
  }

  async deletePlaylist(id: string): Promise<void> {
    await this.call("deletePlaylist", { id });
  }

  async getStarred(): Promise<{ songs: Song[]; albums: Album[]; artists: Artist[] }> {
    const r = await this.call("getStarred2");
    const x = r.starred2 ?? {};
    return { songs: x.song ?? [], albums: x.album ?? [], artists: x.artist ?? [] };
  }

  async setStar(kind: "song" | "album" | "artist", id: string, on: boolean): Promise<void> {
    const key = kind === "song" ? "id" : kind === "album" ? "albumId" : "artistId";
    await this.call(on ? "star" : "unstar", { [key]: id });
  }

  /** サーバーが持つ歌詞（OpenSubsonic の getLyricsBySongId）。未対応のサーバーや歌詞なしは空配列 */
  async getLyricsBySongId(id: string): Promise<{ synced: boolean; lines: { start?: number; value: string }[] }[]> {
    try {
      const r = await this.call("getLyricsBySongId", { id });
      return r.lyricsList?.structuredLyrics ?? [];
    } catch (e) {
      if (e instanceof NetworkError) throw e;
      return [];
    }
  }

  /** offset: トランスコード時のシーク位置（秒）。変換ストリームはバイト範囲で飛べないのでサーバー側で頭出しする */
  streamUrl(id: string, offset = 0): string {
    const kbps = settings().maxBitRate; // 0 = 原音。指定時はサーバー側でトランスコードされる
    const extra: Params = kbps > 0 ? { id, maxBitRate: kbps } : { id };
    if (kbps > 0 && offset > 0) extra.timeOffset = Math.floor(offset);
    return `${this.base()}/rest/stream?${this.params(extra, true)}`;
  }

  /** 原音のファイルそのもの（トランスコードしない）。オフライン再生用のダウンロードに使う */
  downloadUrl(id: string): string {
    return `${this.base()}/rest/download?${this.params({ id })}`;
  }

  /** ダウンロード用のジャケット（表示サイズより大きめに保存する） */
  coverDownloadUrl(id: string, size = 800): string {
    return `${this.base()}/rest/getCoverArt?${this.params({ id, size })}`;
  }

  coverUrl(id: string | undefined, size = 200): string | undefined {
    if (!id) return undefined;
    const local = localCoverUrl(this.cfg.id, id); // ダウンロード済みの曲のジャケットは、ローカルのファイルを使う
    if (local) return local;
    return `${this.base()}/rest/getCoverArt?${this.params({ id, size }, true)}`;
  }
}
