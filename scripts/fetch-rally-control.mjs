import { mkdir, readFile, writeFile } from "node:fs/promises";

const apiKey = process.env.BLACKTOP_API_KEY;
if (!apiKey) throw new Error("BLACKTOP_API_KEY is not configured.");

const season = Number(process.env.WRC_SEASON || new Date().getUTCFullYear());
if (!Number.isInteger(season) || season < 2018) throw new Error("Invalid WRC_SEASON.");

const endpoint = new URL("https://api.ocblacktop.com/v1/wrc/rallies");
endpoint.searchParams.set("year", String(season));

const response = await fetch(endpoint, {
  headers: { "x-api-key": apiKey, accept: "application/json" },
  signal: AbortSignal.timeout(30000)
});
if (!response.ok) {
  const detail = (await response.text()).slice(0, 500);
  throw new Error("WRC rally calendar request failed (" + response.status + "): " + detail);
}
const payload = await response.json();

const eventArrays = [];
const visited = new Set();
function collectArrays(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 5 || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    if (value.some(item => item && typeof item === "object" && (item.id || item.rallyId) && (item.name || item.title))) {
      eventArrays.push(value);
    }
    for (const item of value) collectArrays(item, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (["upcoming", "completed", "past", "rallies", "events", "rounds", "data", "results"].includes(key.toLowerCase())) {
      collectArrays(child, depth + 1);
    } else if (child && typeof child === "object") {
      collectArrays(child, depth + 1);
    }
  }
}
collectArrays(payload);

const byId = new Map();
for (const rows of eventArrays) {
  for (const item of rows) {
    const id = item.id ?? item.rallyId;
    const name = item.name ?? item.title;
    if (!id || !name) continue;
    const location = item.location;
    byId.set(String(id), {
      id: String(id),
      name: String(name),
      round: Number.isFinite(Number(item.round ?? item.roundNumber)) ? Number(item.round ?? item.roundNumber) : null,
      dateStart: item.dateStart ?? item.startDate ?? item.date ?? null,
      dateEnd: item.dateEnd ?? item.endDate ?? null,
      location: typeof location === "string" ? location : location?.name ?? null,
      country: typeof location === "object" ? location?.country?.name ?? location?.country ?? null : null,
      status: item.status ?? item.state ?? null
    });
  }
}
const events = [...byId.values()].sort((a, b) =>
  String(a.dateStart ?? "").localeCompare(String(b.dateStart ?? "")) ||
  (a.round ?? 999) - (b.round ?? 999)
);

if (!events.length) {
  throw new Error("The WRC rally endpoint returned no recognizable event records; refusing to publish an empty Rally Control snapshot.");
}

const snapshot = {
  provider: "Blacktop Data",
  championship: "WRC",
  season,
  fetchedAt: new Date().toISOString(),
  source: "https://api.ocblacktop.com/v1/wrc/rallies",
  status: "ok",
  eventCount: events.length,
  events
};

await mkdir("public/data", { recursive: true });
await writeFile("public/data/rally-control.json", JSON.stringify(snapshot, null, 2) + "\n");
console.log("Saved " + events.length + " WRC " + season + " rally events.");
