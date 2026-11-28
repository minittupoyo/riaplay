import { fetch } from "@tauri-apps/plugin-http";

// Discord用の公開カバー画像。サーバーのURLは認証情報を含むので使わず、
// アーティスト名とアルバム名だけで公開APIから探す。見つからなければnull
const cache = new Map<string, Promise<string | null>>();

export function publicCover(artist: string, album: string): Promise<string | null> {
  if (!album) return Promise.resolve(null);
  const key = `${artist}\0${album}`;
  let p = cache.get(key);
  if (!p) {
    p = search(artist, album).catch(() => null);
    cache.set(key, p);
  }
  return p;
}

// 全角半角・大小文字・記号・空白を揃え、(Deluxe Edition) などの付記を落とす
const norm = (s: string) =>
  s.normalize("NFKC").toLowerCase()
    .replace(/[(\[（【][^)\]）】]*[)\]）】]/g, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
const similar = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  return x !== "" && y !== "" && (x === y || x.includes(y) || y.includes(x));
};

interface Candidate { album: string; artist: string; url?: string }
const pick = (list: Candidate[], artist: string, album: string) =>
  (list.find((c) => similar(c.album, album) && similar(c.artist, artist)) ?? list.find((c) => norm(c.album) === norm(album)))?.url ?? null;

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  return res.ok ? ((await res.json()) as T) : null;
}

async function itunes(artist: string, album: string, country: string) {
  const q = new URLSearchParams({ term: `${artist} ${album}`, entity: "album", limit: "10", country });
  const j = await getJson<{ results: { collectionName: string; artistName: string; artworkUrl100?: string }[] }>(`https://itunes.apple.com/search?${q}`);
  return pick((j?.results ?? []).map((r) => ({ album: r.collectionName, artist: r.artistName, url: r.artworkUrl100?.replace(/\/\d+x\d+bb\./, "/600x600bb.") })), artist, album);
}

async function deezer(artist: string, album: string) {
  const j = await getJson<{ data: { title: string; cover_xl?: string; artist: { name: string } }[] }>(
    `https://api.deezer.com/search/album?limit=10&q=${encodeURIComponent(`${artist} ${album}`)}`,
  );
  return pick((j?.data ?? []).map((r) => ({ album: r.title, artist: r.artist.name, url: r.cover_xl })), artist, album);
}

async function musicBrainz(artist: string, album: string) {
  const q = `release:"${album.replace(/"/g, "")}"${artist ? ` AND artist:"${artist.replace(/"/g, "")}"` : ""}`;
  const j = await getJson<{ releases: { id: string; title: string; "artist-credit"?: { name: string }[] }[] }>(
    `https://musicbrainz.org/ws/2/release/?fmt=json&limit=5&query=${encodeURIComponent(q)}`,
  );
  for (const r of j?.releases ?? []) {
    if (!similar(r.title, album)) continue;
    // Cover Art Archive は画像がなければ404。あればリダイレクト先の https URL を返す
    const res = await fetch(`https://coverartarchive.org/release/${r.id}/front-500`);
    if (res.ok) return res.url;
  }
  return null;
}

// 日本のアルバムはJPストアにしかないことが多いので、JP → US → Deezer → MusicBrainz の順に試す
async function search(artist: string, album: string) {
  const steps = [
    () => itunes(artist, album, "JP"),
    () => itunes(artist, album, "US"),
    () => deezer(artist, album),
    () => musicBrainz(artist, album),
  ];
  for (const step of steps) {
    try {
      const url = await step();
      if (url) return url;
    } catch { /* 次の検索元へ */ }
  }
  return null;
}
