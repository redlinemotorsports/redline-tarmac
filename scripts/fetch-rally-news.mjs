import { mkdir, readFile, writeFile } from "node:fs/promises";

const sources = [
  { name: "FIA", kind: "OFFICIAL", url: "https://www.fia.com/rss/press-release" },
  { name: "FIA", kind: "OFFICIAL", url: "https://www.fia.com/rss/news" },
  { name: "DirtFish", kind: "INDEPENDENT", url: "https://dirtfish.com/rally/wrc/feed" }
];

const rallyPattern = /\b(wrc|world rally|rally|rallying|monte[- ]carlo|safari rally|rallye|rally italia|rally japan|rally chile|rally sweden|rally finland|rally portugal|rally croatia|rally greece|rally estonia|rally poland|rally argentina|rally paraguay)\b/i;
const decode = value => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .trim();

function tag(block, name) {
  const match = block.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i"));
  return match ? decode(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")) : "";
}

function parseFeed(xml, source) {
  const blocks = [...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)];
  return blocks.map(([, block]) => {
    const title = tag(block, "title");
    const linkTag = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
    const link = linkTag ? decode(linkTag[1]) : tag(block, "link");
    const publishedAt = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date");
    if (!title || !link || !rallyPattern.test(title + " " + tag(block, "description") + " " + tag(block, "category"))) return null;
    let safeUrl;
    try { safeUrl = new URL(link, source.url); } catch { return null; }
    if (!["https:", "http:"].includes(safeUrl.protocol)) return null;
    const parsedDate = publishedAt ? new Date(publishedAt) : null;
    return {
      title: title.slice(0, 220),
      source: source.name,
      sourceType: source.kind,
      publishedAt: parsedDate && !Number.isNaN(parsedDate.valueOf()) ? parsedDate.toISOString() : null,
      url: safeUrl.href
    };
  }).filter(Boolean);
}

async function loadSource(source) {
  const response = await fetch(source.url, {
    headers: { accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5", "user-agent": "RedlineTarmacNewsBot/1.0 (+https://redlinemotorsports.github.io/redline-tarmac/)" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(source.name + " feed returned HTTP " + response.status);
  const xml = await response.text();
  if (!/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error(source.name + " response was not an RSS or Atom feed");
  return parseFeed(xml, source);
}

const results = await Promise.allSettled(sources.map(loadSource));
const articles = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
const successfulSources = results.filter(result => result.status === "fulfilled").length;
const sourceStatus = sources.map((source, index) => ({
  name: source.name,
  type: source.kind,
  status: results[index].status === "fulfilled" ? "ok" : "unavailable"
}));
const deduped = [...new Map(articles.map(item => [item.url, item])).values()]
  .sort((a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0))
  .slice(0, 60);

await mkdir("public/data", { recursive: true });
const outputPath = "public/data/rally-news.json";
if (successfulSources === 0) {
  try {
    await readFile(outputPath, "utf8");
    console.warn("All rally news feeds were unavailable; preserving the previous snapshot.");
    process.exit(0);
  } catch {}
}
const snapshot = {
  provider: "FIA and DirtFish RSS",
  updatedAt: new Date().toISOString(),
  status: successfulSources ? "ok" : "unavailable",
  articleCount: deduped.length,
  sources: sourceStatus,
  articles: deduped
};
await writeFile(outputPath, JSON.stringify(snapshot, null, 2) + "\n");
console.log("Saved " + deduped.length + " rally headlines from " + successfulSources + "/" + sources.length + " feed endpoints.");
