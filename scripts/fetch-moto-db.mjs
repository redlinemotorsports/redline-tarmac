import { mkdir, readFile, writeFile } from "node:fs/promises";

const season = Number(process.env.WRC_SEASON || new Date().getUTCFullYear());
const base = "https://raw.githubusercontent.com/vishwapramuditha/moto-db/main/data/wrc";
const getJson = async url => {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Moto-DB request failed (${response.status}): ${url}`);
  return response.json();
};
const [schedule, results] = await Promise.all([
  getJson(`${base}/${season}/schedule.json`),
  getJson(`${base}/${season}/results.json`)
]);
if (!Array.isArray(schedule.races) || !schedule.races.length) throw new Error("Moto-DB returned no WRC schedule; refusing to publish.");
const resultByRound = new Map((Array.isArray(results) ? results : []).map(row => [String(row.round), row]));
const parseDate = value => {
  if (!value) return null;
  const parsed = new Date(`${value} ${season} UTC`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const normalized = schedule.races.map(row => {
  const result = resultByRound.get(String(row.round)) || null;
  return {
    id: `wrc-${season}-round-${String(row.round).replace(/[^0-9]/g, "")}`,
    round: Number(row.round) || null,
    name: row.name || row.raceName || "Unnamed rally",
    dateStart: parseDate(row.start_date || row.date),
    dateEnd: parseDate(row.finish_date || row.date),
    location: null,
    country: null,
    surface: row.surface || null,
    result: result ? {
      winner: result.winning_driver || null,
      coDriver: result.winning_co_driver || null,
      entrant: result.winning_entrant || null,
      time: result.winning_time || null
    } : null
  };
});
const openPath = "public/data/open-rally.json";
let openRally = null;
try {
  openRally = JSON.parse(await readFile(openPath, "utf8"));
  if (openRally?.product !== "Redline OpenRally" || !Array.isArray(openRally.rallies)) openRally = null;
} catch {}
const nameKey = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
const detailedByName = new Map((openRally?.rallies || []).map(rally => [nameKey(rally.name), rally]));
const events = normalized.map(event => {
  const detail = detailedByName.get(nameKey(event.name));
  return detail ? { ...event, id: String(detail.id), wrcEventId: String(detail.id) } : event;
});
const performanceRallies = (openRally?.rallies || []).map(rally => ({
  ...rally,
  id: String(rally.id),
  stages: (rally.stages || []).map(stage => ({
    ...stage,
    distanceKm: stage.distanceKm ?? null,
    classification: (stage.classification || []).map(row => ({
      ...row,
      seconds: row.timeSeconds ?? null,
      time: row.time || null,
      gap: row.gapFirst || null
    }))
  }))
}));
const timestamp = new Date().toISOString();
const eventSnapshot = {
  provider: "Moto-DB schedule + WRC Live Timing enrichment",
  providerStatus: openRally?.rallies?.length ? "wrc-live-timing-enriched" : "moto-db-schedule-only",
  championship: "WRC",
  season,
  fetchedAt: timestamp,
  source: "https://vishwapramuditha.github.io/moto-db-web/docs.html",
  eventCount: events.length,
  events
};
const performanceSnapshot = {
  provider: openRally?.rallies?.length ? "WRC Live Timing via Redline OpenRally" : "No stage timing provider available",
  providerStatus: openRally?.rallies?.length ? "unofficial-undocumented" : "unavailable",
  championship: "WRC",
  season,
  fetchedAt: openRally?.fetchedAt || timestamp,
  source: openRally?.rallies?.length ? "https://rallydatajunkie.com/visualising-wrc-rally-results/accessing-data-from-the-wrc-live-timing-api.html" : null,
  rallies: performanceRallies
};
await mkdir("public/data", { recursive: true });
await writeFile("public/data/rally-control.json", JSON.stringify(eventSnapshot, null, 2) + "\n");
await writeFile("public/data/performance.json", JSON.stringify(performanceSnapshot, null, 2) + "\n");
console.log(JSON.stringify({
  provider: "Moto-DB secondary schedule / WRC Live Timing primary detail",
  season, events: events.length, enrichedEvents: performanceRallies.length,
  stages: performanceRallies.reduce((n, rally) => n + rally.stages.length, 0),
  stageResults: performanceRallies.reduce((n, rally) => n + rally.stages.reduce((m, stage) => m + (stage.classification || []).length, 0), 0),
  incidents: performanceRallies.reduce((n, rally) => n + (rally.penalties || []).length + (rally.retirements || []).length, 0)
}));
