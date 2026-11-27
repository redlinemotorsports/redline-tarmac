import { mkdir, writeFile } from "node:fs/promises";

const season = Number(process.env.WRC_SEASON || new Date().getUTCFullYear());
const source = "https://www.fia.com/events/world-rally-championship/season-" + season + "/standings";

const decode = value => String(value || "")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const text = html => decode(String(html || "")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " "))
  .replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim();

const response = await fetch(source, {
  headers: {
    accept: "text/html,application/xhtml+xml",
    "user-agent": "Mozilla/5.0 (compatible; RedlineTarmac/1.0; +https://redlinemotorsports.github.io/redline-tarmac/)"
  },
  signal: AbortSignal.timeout(30000)
});
if (!response.ok) throw new Error("FIA standings request failed (" + response.status + ")");
const html = await response.text();
const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(match => {
  const rows = [...match[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => text(cell[1]))
  ).filter(row => row.length >= 3);
  return { header: (rows[0] || []).join(" ").toLowerCase(), rows: rows.slice(1) };
}).filter(table => table.rows.length);

const driverTables = tables.filter(table => /\bpos\b/.test(table.header) && /\bpts\b/.test(table.header) && /drivers?/.test(table.header));
const manufacturerTable = tables.find(table => /\bpos\b/.test(table.header) && /\bpts\b/.test(table.header) && /manufacturers?/.test(table.header));
if (driverTables.length < 2 || !manufacturerTable) {
  throw new Error("FIA standings table structure changed; found " + tables.length + " tables and " + driverTables.length + " driver tables.");
}

function normalizeRows(rows, category) {
  return rows.map(cells => {
    const position = Number((cells[0] || "").match(/\d+/)?.[0]);
    const rawName = cells[1] || "";
    const countryMatch = category === "manufacturers" ? null : rawName.match(/\b([A-Z]{3})\s*$/);
    const name = (countryMatch ? rawName.slice(0, countryMatch.index) : rawName)
      .replace(/\bImage\b/gi, "").replace(/\s+/g, " ").trim();
    const pointsCell = cells[cells.length - 1] || "";
    const pointsMatch = pointsCell.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    const points = pointsMatch ? Number(pointsMatch[0]) : NaN;
    if (!Number.isInteger(position) || !name || !Number.isFinite(points)) return null;
    return { position, name, ...(countryMatch ? { country: countryMatch[1] } : {}), points };
  }).filter(Boolean).sort((a, b) => a.position - b.position);
}

const categories = {
  drivers: normalizeRows(driverTables[0].rows, "drivers"),
  coDrivers: normalizeRows(driverTables[1].rows, "coDrivers"),
  manufacturers: normalizeRows(manufacturerTable.rows, "manufacturers")
};
for (const [key, rows] of Object.entries(categories)) {
  if (rows.length < (key === "manufacturers" ? 2 : 5)) {
    throw new Error("FIA " + key + " table parsed too few rows (" + rows.length + "); refusing to publish an incomplete snapshot.");
  }
}
const snapshot = {
  provider: "FIA official championship standings",
  championship: "WRC",
  season,
  fetchedAt: new Date().toISOString(),
  source,
  categories
};
await mkdir("public/data", { recursive: true });
await writeFile("public/data/standings.json", JSON.stringify(snapshot, null, 2) + "\n");
console.log(JSON.stringify({
  provider: snapshot.provider,
  season,
  drivers: categories.drivers.length,
  coDrivers: categories.coDrivers.length,
  manufacturers: categories.manufacturers.length,
  leaders: Object.fromEntries(Object.entries(categories).map(([key, rows]) => [key, rows[0]?.name]))
}));
