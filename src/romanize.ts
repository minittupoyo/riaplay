import { TokenizerBuilder } from "@patdx/kuromoji";
import { toRomaji } from "wanakana";
type Tokenizer = Awaited<ReturnType<TokenizerBuilder["build"]>>;

// 辞書（gzip）はバンドルに含め、初回の使用時にだけ読み込む
const dictFiles = import.meta.glob("../node_modules/@patdx/kuromoji/dict/*.dat.gz", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const dictUrls = new Map(Object.entries(dictFiles).map(([p, u]) => [p.split("/").pop()!, u]));

async function loadDict(name: string): Promise<ArrayBufferLike> {
  const url = dictUrls.get(name.split("/").pop()!);
  if (!url) throw new Error(`辞書が見つかりません: ${name}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`辞書の読み込みに失敗しました: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const gz = new Uint8Array(buf, 0, 2);
  if (gz[0] !== 0x1f || gz[1] !== 0x8b) return buf; // 配信側で展開済み
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

let tokenizer: Promise<Tokenizer> | undefined;
const getTokenizer = () => (tokenizer ??= new TokenizerBuilder({ loader: { loadArrayBuffer: loadDict } }).build().catch((e) => {
  tokenizer = undefined; // 失敗したら次回やり直す
  throw e;
}));

const JA = /[぀-ヿ㐀-鿿]/;
const NO_SPACE_BEFORE = /^[,.!?;:)\]}、。！？」』）…]/;
const NO_SPACE_AFTER = /[(\[{「『（]$/;

function romanizeLine(t: Tokenizer, line: string): string {
  if (!JA.test(line)) return line;
  let out = "";
  for (const tok of t.tokenize(line)) {
    let s = tok.surface_form;
    if (!s.trim()) { out += " "; continue; }
    if (JA.test(s)) {
      if (tok.pos === "助詞" && tok.reading === "ハ") s = "wa";
      else if (tok.pos === "助詞" && tok.reading === "ヘ") s = "e";
      else if (tok.pos === "助詞" && tok.reading === "ヲ") s = "o";
      else s = tok.reading && tok.reading !== "*" ? toRomaji(tok.reading) : toRomaji(s);
    }
    if (out && !out.endsWith(" ") && !NO_SPACE_BEFORE.test(s) && !NO_SPACE_AFTER.test(out)) out += " ";
    out += s;
  }
  return out.replace(/ +/g, " ").trim();
}

/** 日本語の行をヘボン式ローマ字にする。日本語を含まない行はそのまま返す */
export async function romanize(lines: string[]): Promise<string[]> {
  if (!lines.some((l) => JA.test(l))) return lines;
  const t = await getTokenizer();
  return lines.map((l) => romanizeLine(t, l));
}
