import { mkdir, readFile, writeFile } from "node:fs/promises";

const apiKey = process.env.BLACKTOP_API_KEY;
if (!apiKey) throw new Error("BLACKTOP_API_KEY is not configured.");
const base = "https://api.ocblacktop.com/v1/wrc";
const headers = { "x-api-key": apiKey, accept: "application/json" };
const request = async path => {
  const response = await fetch(base + path, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Blacktop request ${path} failed (${response.status}): ${(await response.text()).slice(0, 250)}`);
  return response.json();
};
const unwrap = value => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["data", "results", "stages", "items", "classification", "entries", "splits"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
};
const allArrays = value => {
  const found = [];
  const seen = new Set();
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 7 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      found.push(node);
      node.forEach(item => walk(item, depth + 1));
    } else Object.values(node).forEach(item => walk(item, depth + 1));
  };
  walk(value);
  return found;
};
const first = (obj, keys) => {
  for (const key of keys) if (obj?.[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  return null;
};
const toSeconds = value => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const text = value.trim().replace(",", ".");
  if (!text || /^(—|-|n\/a|dnf|ret)$/i.test(text)) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !/^\d+(\.\d+)?$/.test(part))) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
};
const normalizeCrew = row => {
  const driver = first(row, ["driverName", "driver_name", "driver", "name"]);
  const coDriver = first(row, ["coDriverName", "codriverName", "co_driver", "coDriver", "navigator"]);
  const driverName = typeof driver === "object" ? first(driver, ["name", "fullName", "lastName"]) : driver;
  const coDriverName = typeof coDriver === "object" ? first(coDriver, ["name", "fullName", "lastName"]) : coDriver;
  const rawTime = first(row, ["time", "stageTime", "stage_time", "duration", "totalTime", "result"]);
  const seconds = toSeconds(rawTime);
  return {
    position: Number(first(row, ["position", "pos", "rank", "place"])) || null,
    driver: driverName ? String(driverName) : null,
    coDriver: coDriverName ? String(coDriverName) : null,
    car: first(row, ["car", "vehicle", "model"]) ? String(first(row, ["car", "vehicle", "model"])) : null,
    time: rawTime === null ? null : String(rawTime),
    seconds,
    gap: first(row, ["gap", "diff", "difference", "timeGap"]) ? String(first(row, ["gap", "diff", "difference", "timeGap"])) : null,
    status: first(row, ["status", "resultStatus"]) ? String(first(row, ["status", "resultStatus"])) : null
  };
};
const findResultRows = payload => {
  const arrays = allArrays(payload);
  const candidates = arrays.filter(rows => rows.length && rows.some(row => row && typeof row === "object" &&
    ["position", "pos", "rank", "stageTime", "stage_time", "time", "driver", "driverName", "crew"].some(key => key in row)));
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || [];
};
const findStageArray = payload => {
  const arrays = allArrays(payload);
  const candidates = arrays.filter(rows => rows.length && rows.some(row => row && typeof row === "object" &&
    ["stageId", "id", "number", "stageNumber", "name", "code"].some(key => key in row)));
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || [];
};
const stagesPayload = async rallyId => request(`/rallies/${encodeURIComponent(rallyId)}/stages`);
const readCalendar = JSON.parse(await readFile("public/data/rally-control.json", "utf8"));
const completed = (readCalendar.events || [])
  .filter(event => event.id && event.dateEnd && new Date(event.dateEnd + "T23:59:59Z") < new Date())
  .sort((a, b) => String(b.dateEnd).localeCompare(String(a.dateEnd)))
  .slice(0, 2);
if (!completed.length) throw new Error("No completed WRC rallies found in the current calendar; keeping the previous timing snapshot.");

const rallies = [];
let requestCount = 0;
for (const event of completed) {
  const stagePayload = await stagesPayload(event.id); requestCount++;
  const stageRows = findStageArray(stagePayload);
  if (!stageRows.length) {
    console.warn(`No stage records found for ${event.name}; skipping this rally.`);
    continue;
  }
  const stages = [];
  for (const stage of stageRows) {
    const stageId = first(stage, ["stageId", "id"]);
    if (!stageId) continue;
    const stageName = first(stage, ["name", "stageName", "code", "title"]) || `Stage ${first(stage, ["number", "stageNumber"]) || stages.length + 1}`;
    let resultPayload = null;
    let splitPayload = null;
    try { resultPayload = await request(`/rallies/${encodeURIComponent(event.id)}/stages/${encodeURIComponent(stageId)}`); requestCount++; }
    catch (error) { console.warn(`Stage result unavailable for ${event.name} / ${stageName}: ${error.message}`); }
    try { splitPayload = await request(`/rallies/${encodeURIComponent(event.id)}/stages/${encodeURIComponent(stageId)}/splits`); requestCount++; }
    catch (error) { console.warn(`Split feed unavailable for ${event.name} / ${stageName}: ${error.message}`); }
    const resultRows = resultPayload ? findResultRows(resultPayload) : [];
    const classification = resultRows.map(normalizeCrew).filter(row => row.driver || row.time || row.position);
    const winnerSeconds = classification.find(row => row.position === 1)?.seconds ?? classification.map(row => row.seconds).filter(Number.isFinite).sort((a,b)=>a-b)[0] ?? null;
    const splits = splitPayload ? findResultRows(splitPayload).map(row => ({
      driver: first(row, ["driverName", "driver", "name"]),
      split: first(row, ["splitName", "split", "name", "number", "sequence"]),
      time: first(row, ["time", "splitTime", "split_time", "duration"]),
      seconds: toSeconds(first(row, ["time", "splitTime", "split_time", "duration"])),
      gap: first(row, ["gap", "diff", "difference"])
    })) : [];
    stages.push({
      id: String(stageId), name: String(stageName),
      number: Number(first(stage, ["number", "stageNumber", "sequence"])) || stages.length + 1,
      date: first(stage, ["date", "startDate", "dateStart"]),
      distance: first(stage, ["distance", "length", "distanceKm"]),
      classification,
      splits,
      fastest: classification.find(row => row.position === 1)?.driver || null,
      fastestTime: classification.find(row => row.position === 1)?.time || null,
      winnerSeconds,
      status: classification.length ? "results" : splits.length ? "splits" : "pending"
    });
  }
  if (stages.length) rallies.push({ id: String(event.id), name: event.name, round: event.round, dateStart: event.dateStart, dateEnd: event.dateEnd, stages });
}
if (!rallies.length || !rallies.some(rally => rally.stages.some(stage => stage.classification.length || stage.splits.length))) {
  throw new Error("Stage endpoints returned no recognizable classification or split records; refusing to publish empty telemetry.");
}
const snapshot = {
  provider: "Blacktop Data", championship: "WRC", season: readCalendar.season,
  fetchedAt: new Date().toISOString(), source: "https://api.ocblacktop.com",
  status: "verified-snapshot", requestCount, rallies
};
await mkdir("public/data", { recursive: true });
await writeFile("public/data/performance.json", JSON.stringify(snapshot, null, 2) + "\n");
console.log(`Saved verified stage telemetry for ${rallies.length} rallies, ${rallies.reduce((sum, rally) => sum + rally.stages.length, 0)} stages using ${requestCount} API requests.`);
