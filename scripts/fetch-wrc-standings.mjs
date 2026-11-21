import { mkdir, writeFile } from "node:fs/promises";

const season = Number(process.env.WRC_SEASON || new Date().getUTCFullYear());
const url = `https://api.fia.com/events/world-rally-championship/season-${season}/standings`;
const response = await fetch(url, {
  headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Redline-Tarmac/1.0" },
  signal: AbortSignal.timeout(30000)
});
if (!response.ok) throw new Error(`FIA standings request failed (${response.status}).`);
const html = await response.text();
const clean = value => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0*39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)];
const categories = { drivers: [], coDrivers: [], manufacturers: [] };
for (const match of tables) {
  const before = html.slice(Math.max(0, match.index - 1400), match.index);
  const heading = clean([...before.matchAll(/<(?:h[1-6]|strong)[^>]*>([\s\S]*?)<\/(?:h[1-6]|strong)>/gi)].at(-1)?.[1] || "").toLowerCase();
  const key = /manufacturer|constructors|teams/.test(heading) ? "manufacturers" : /co.?drivers/.test(heading) ? "coDrivers" : /drivers/.test(heading) ? "drivers" : null;
  if (!key) continue;
  const rows = [...match[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => clean(cell[1]));
    if (cells.length < 3 || !/^\d+$/.test(cells[0])) continue;
    const points = Number(cells.at(-1).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(points)) continue;
    categories[key].push({ position: Number(cells[0]), name: cells[1], points });
  }
}
if (!categories.drivers.length || !categories.coDrivers.length || !categories.manufacturers.length) {
  throw new Error("FIA standings page did not expose all three expected championship tables; refusing to publish incomplete standings.");
}
const snapshot = {
  provider: "FIA official championship standings",
  championship: "WRC", season, fetchedAt: new Date().toISOString(),
  source: url, categories
};
await mkdir("public/data", { recursive: true });
await writeFile("public/data/standings.json", JSON.stringify(snapshot, null, 2) + "\n");
console.log(`Saved FIA WRC ${season} standings: ${categories.drivers.length} drivers, ${categories.coDrivers.length} co-drivers, ${categories.manufacturers.length} manufacturers.`);
