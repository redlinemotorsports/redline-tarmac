import { mkdir, writeFile } from "node:fs/promises";

const BASE = "https://api.wrc.com";
const RESULTS = BASE + "/results-api";
const MAX_EVENTS = Math.max(1, Math.min(3, Number(process.env.OPEN_RALLY_MAX_EVENTS || 2)));
const USER_AGENT = "Redline-Tarmac-OpenRally/0.1 (+https://redlinemotorsports.github.io/redline-tarmac/)";

async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error(`WRC public feed returned ${response.status} for ${url}`);
  return response.json();
}
const list = value => Array.isArray(value) ? value : [];
const finite = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const pick = (value, ...keys) => {
  for (const key of keys) if (value?.[key] !== undefined && value[key] !== null && value[key] !== "") return value[key];
  return null;
};
const flatten = (value, depth = 0, found = []) => {
  if (depth > 8 || value == null || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object" && !Array.isArray(item)) found.push(item);
      flatten(item, depth + 1, found);
    }
  } else {
    for (const child of Object.values(value)) flatten(child, depth + 1, found);
  }
  return [...new Set(found)];
};
const dateCandidates = value => {
  const found = [];
  const visit = (node, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) return node.forEach(item => visit(item, depth + 1));
    for (const [key, child] of Object.entries(node)) {
      if (/date|datetime/i.test(key) && typeof child === "string") {
        const parsed = Date.parse(child);
        if (Number.isFinite(parsed)) found.push(parsed);
      } else if (child && typeof child === "object") visit(child, depth + 1);
    }
  };
  visit(value);
  return found;
};
const eventDates = event => {
  const dates = dateCandidates(event);
  return dates.length ? { start: new Date(Math.min(...dates)).toISOString(), end: new Date(Math.max(...dates)).toISOString() } : { start: null, end: null };
};
const durationSeconds = row => {
  const ms = finite(pick(row, "elapsedDurationMs", "stageTimeMs", "totalTimeMs"));
  if (ms !== null) return ms / 1000;
  const raw = pick(row, "elapsedDuration", "stageTime", "totalTime");
  if (typeof raw !== "string") return null;
  const iso = raw.match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (iso) return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
  const clock = raw.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  return clock ? Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) : null;
};
const eventUrl = (id, path) => `${RESULTS}/rally-event/${encodeURIComponent(id)}/${path}`;
const crewName = person => pick(person, "fullName", "abbvName", "name") || null;
const normalizeEntry = row => ({
  entryId: String(pick(row, "entryId", "id") ?? ""),
  driver: crewName(row.driver) || pick(row, "driverName") || null,
  coDriver: crewName(row.codriver) || pick(row, "coDriverName", "codriverName") || null,
  manufacturer: pick(row.manufacturer, "name") || pick(row, "manufacturerName") || null,
  entrant: pick(row.entrant, "name") || null,
  category: pick(row.group, "name") || pick(row.eventClasses?.[0], "name") || null,
  vehicleModel: pick(row, "vehicleModel") || null,
  carNumber: pick(row, "identifier") || null,
  status: pick(row, "status") || null
});
async function optionalJson(url, label) {
  try { return await getJson(url); }
  catch (error) { console.warn(`Optional ${label} unavailable: ${error.message}`); return null; }
}
const calendar = await getJson(BASE + "/contel-page/83388/calendar/active-season/");
const rawEvents = list(calendar?.rallyEvents?.items);
if (!rawEvents.length) throw new Error("WRC calendar returned no rallyEvents.items; refusing to publish an empty snapshot.");
const orderedEvents = rawEvents.map(event => ({ event, dates: eventDates(event) }))
  .sort((a, b) => (Date.parse(b.dates.end || "1970-01-01") || 0) - (Date.parse(a.dates.end || "1970-01-01") || 0));
const selected = orderedEvents.slice(0, MAX_EVENTS);
const rallies = [];
let requestCount = 1;
for (const item of selected) {
  const event = item.event;
  const eventId = pick(event, "id", "rallyId");
  if (!eventId) continue;
  const [itineraryPayload, carsPayload, penaltiesPayload, retirementsPayload, overallPayload, winnersPayload] = await Promise.all([
    optionalJson(eventUrl(eventId, "itinerary"), "itinerary"),
    optionalJson(eventUrl(eventId, "cars"), "entry list"),
    optionalJson(eventUrl(eventId, "penalties"), "penalties"),
    optionalJson(eventUrl(eventId, "retirements"), "retirements"),
    optionalJson(eventUrl(eventId, "result"), "overall result"),
    optionalJson(eventUrl(eventId, "stage-winners"), "stage winners")
  ]);
  requestCount += 6;
  const legs = list(itineraryPayload?.itineraryLegs);
  const stages = legs.flatMap(leg => list(leg.itinerarySections).flatMap(section => list(section.stages).map(stage => ({
    ...stage,
    legName: leg.name || null,
    legDate: leg.legDate || null,
    sectionName: section.name || null
  })))).filter(stage => pick(stage, "stageId"));
  const entries = flatten(carsPayload).filter(row => row && typeof row === "object" && pick(row, "entryId"));
  const crews = entries.map(normalizeEntry);
  const crewByEntry = new Map(crews.map(crew => [crew.entryId, crew]));
  const normalizedStages = [];
  for (const stage of stages.slice(0, 30)) {
    const stageId = pick(stage, "stageId");
    const [timesPayload, splitsPayload, overallStagePayload] = await Promise.all([
      optionalJson(eventUrl(eventId, `stage-times/stage-external/${encodeURIComponent(stageId)}`), "stage times"),
      optionalJson(eventUrl(eventId, `split-times/stage-external/${encodeURIComponent(stageId)}`), "split times"),
      optionalJson(eventUrl(eventId, `stage-result/stage-external/${encodeURIComponent(stageId)}`), "overall classification after stage")
    ]);
    requestCount += 3;
    const stageTimes = flatten(timesPayload).filter(row => row && typeof row === "object" && pick(row, "entryId"));
    const classification = stageTimes.map(row => {
      const crew = crewByEntry.get(String(row.entryId)) || {};
      return {
        entryId: String(row.entryId),
        position: finite(row.position),
        driver: crew.driver || null,
        coDriver: crew.coDriver || null,
        manufacturer: crew.manufacturer || null,
        car: crew.vehicleModel || null,
        category: crew.category || null,
        timeSeconds: durationSeconds(row),
        time: pick(row, "elapsedDuration", "stageTime") || null,
        gapFirst: pick(row, "diffFirst") || null,
        gapPrevious: pick(row, "diffPrev") || null,
        status: pick(row, "status") || crew.status || null
      };
    }).sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
    const splitPoints = list(splitsPayload?.splitPoints).map(point => ({
      id: String(pick(point, "splitPointId") ?? ""),
      number: finite(point.number),
      distanceKm: finite(point.distance)
    })).sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    const splitRows = list(splitsPayload?.entrySplitPointTimes).flatMap(entry => {
      const crew = crewByEntry.get(String(entry.entryId)) || {};
      return list(entry.splitPointTimes).map(split => ({
        entryId: String(entry.entryId),
        driver: crew.driver || null,
        splitPointId: String(pick(split, "splitPointId") ?? ""),
        elapsedSeconds: finite(split.elapsedDurationMs) !== null ? Number(split.elapsedDurationMs) / 1000 : durationSeconds(split),
        elapsedDuration: pick(split, "elapsedDuration") || null,
        splitDateTime: pick(split, "splitDateTime") || null
      }));
    });
    const overallClassification = flatten(overallStagePayload).filter(row => row && typeof row === "object" && pick(row, "entryId")).map(row => {
      const crew = crewByEntry.get(String(row.entryId)) || {};
      return {
        entryId: String(row.entryId), position: finite(row.position),
        driver: crew.driver || null, coDriver: crew.coDriver || null,
        totalTime: pick(row, "totalTime") || null,
        totalTimeMs: finite(row.totalTimeMs),
        gapFirst: pick(row, "diffFirst") || null,
        gapPrevious: pick(row, "diffPrev") || null
      };
    }).sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
    const distanceKm = finite(pick(stage, "distance"));
    const winnerSeconds = classification.find(row => row.position === 1)?.timeSeconds ?? null;
    normalizedStages.push({
      id: String(stageId),
      code: pick(stage, "code") || null,
      number: finite(stage.number),
      name: pick(stage, "name") || "Unnamed stage",
      date: pick(stage, "date") || stage.legDate || null,
      distanceKm,
      status: pick(stage, "status") || null,
      classification,
      overallClassification,
      splitPoints,
      splitTimes: splitRows,
      winnerSeconds,
      averageSpeedKph: winnerSeconds && distanceKm ? distanceKm / (winnerSeconds / 3600) : null
    });
  }
  const penalties = flatten(penaltiesPayload).filter(row => row && typeof row === "object").map(row => ({
    entryId: String(pick(row, "entryId") ?? ""),
    duration: pick(row, "penaltyDuration") || null,
    durationMs: finite(row.penaltyDurationMs),
    reason: pick(row, "reason") || null
  }));
  const retirements = flatten(retirementsPayload).filter(row => row && typeof row === "object").map(row => ({
    entryId: String(pick(row, "entryId") ?? ""),
    reason: pick(row, "reason") || null,
    dateTime: pick(row, "retirementDateTime") || null,
    status: pick(row, "status") || null
  }));
  const winners = flatten(winnersPayload).filter(row => row && typeof row === "object").map(row => ({
    stageId: String(pick(row, "stageId") ?? ""),
    entryId: String(pick(row, "entryId") ?? ""),
    stageName: pick(row, "stageName") || null,
    elapsedDuration: pick(row, "elapsedDuration") || null,
    elapsedDurationMs: finite(row.elapsedDurationMs)
  }));
  const overallResults = flatten(overallPayload).filter(row => row && typeof row === "object" && pick(row, "entryId")).map(row => {
    const crew = crewByEntry.get(String(row.entryId)) || {};
    return {
      entryId: String(row.entryId), position: finite(row.position),
      driver: crew.driver || null, coDriver: crew.coDriver || null,
      manufacturer: crew.manufacturer || null, car: crew.vehicleModel || null,
      totalTime: pick(row, "totalTime") || null,
      totalTimeMs: finite(row.totalTimeMs),
      gapFirst: pick(row, "diffFirst") || null,
      gapPrevious: pick(row, "diffPrev") || null
    };
  }).sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
  const dates = item.dates;
  rallies.push({
    id: String(eventId),
    name: pick(event, "name") || "Unnamed rally",
    status: pick(event, "status") || null,
    dateStart: dates.start,
    dateEnd: dates.end,
    crews,
    stages: normalizedStages,
    overallResults,
    stageWinners: winners,
    penalties,
    retirements
  });
}
if (!rallies.length) throw new Error("No rally records could be normalized; refusing to publish.");
const snapshot = {
  schemaVersion: 1,
  product: "Redline OpenRally",
  provider: "WRC Live Timing public JSON endpoints",
  providerStatus: "unofficial-undocumented",
  fetchedAt: new Date().toISOString(),
  requestCount,
  season: new Date().getUTCFullYear(),
  rallies
};
if (!rallies.some(rally => rally.crews.length || rally.stages.length || rally.overallResults.length)) {
  throw new Error("WRC feed returned no recognizable crew, stage or classification data; refusing to publish.");
}
const summary = {
  mode: process.env.OPEN_RALLY_DRY_RUN === "true" ? "validation-only" : "publish",
  rallies: rallies.length,
  crews: rallies.reduce((n, rally) => n + rally.crews.length, 0),
  stages: rallies.reduce((n, rally) => n + rally.stages.length, 0),
  stageClassifications: rallies.reduce((n, rally) => n + rally.stages.reduce((m, stage) => m + stage.classification.length, 0), 0),
  splitTimes: rallies.reduce((n, rally) => n + rally.stages.reduce((m, stage) => m + stage.splitTimes.length, 0), 0),
  overallResults: rallies.reduce((n, rally) => n + rally.overallResults.length, 0),
  requestCount
};
if (process.env.OPEN_RALLY_DRY_RUN === "true") {
  console.log("OpenRally validation passed: " + JSON.stringify(summary));
} else {
  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/open-rally.json", JSON.stringify(snapshot, null, 2) + "\\n");
  console.log("Published OpenRally research snapshot: " + JSON.stringify(summary));
}
