const DB_NAME = "redline-tarmac-data";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";
const SNAPSHOTS = {
  events: { url: "./data/rally-control.json", valid: value => value?.championship === "WRC" && Array.isArray(value.events) && value.events.length > 0 },
  standings: { url: "./data/standings.json", valid: value => value?.championship === "WRC" && value?.categories && ["drivers", "coDrivers", "manufacturers"].every(key => Array.isArray(value.categories[key]) && value.categories[key].length > 0) }
};
const formatDate = value => {
  if (!value) return "DATES TO BE CONFIRMED";
  const date = new Date(value + (String(value).length === 10 ? "T00:00:00Z" : ""));
  if (Number.isNaN(date.getTime())) return "DATES TO BE CONFIRMED";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date).toUpperCase();
};
const formatUpdated = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TIME UNAVAILABLE";
  return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date) + " MYT";
};
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const eventPhase = event => {
  const now = new Date();
  const start = event.dateStart ? new Date(event.dateStart) : null;
  const end = event.dateEnd ? new Date(event.dateEnd) : start;
  if (start && !Number.isNaN(start.getTime()) && start > now) return "UPCOMING";
  if (end && !Number.isNaN(end.getTime()) && end < now) return "COMPLETED";
  if (start && !Number.isNaN(start.getTime())) return "IN PROGRESS";
  return "SCHEDULED";
};
let eventSnapshot = null;
let standingsSnapshot = null;
let cacheDbPromise;
function openCache() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  if (!cacheDbPromise) cacheDbPromise = new Promise(resolve => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return cacheDbPromise;
}
async function readCached(key) {
  const db = await openCache();
  if (!db) return null;
  return new Promise(resolve => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}
async function writeCached(key, payload) {
  const db = await openCache();
  if (!db) return false;
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ key, payload, fetchedAt: payload.fetchedAt || new Date().toISOString(), schemaVersion: DB_VERSION, savedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}
function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}
function setFeed(state, message, updated, mode = "online") {
  setText("#tt-feed-state", state);
  setText("#tt-feed-message", message);
  setText("#tt-feed-updated", "UPDATED / " + (updated ? formatUpdated(updated) : "—"));
  const bar = document.querySelector(".tt-feedbar");
  if (bar) {
    bar.dataset.connection = mode;
    const indicator = bar.querySelector(".tt-feed-indicator");
    if (indicator) indicator.dataset.connection = mode;
  }
}
function renderSelectedEvent() {
  const select = document.querySelector("#tt-event-select");
  const event = eventSnapshot?.events?.[Number(select?.value)];
  if (!event) return;
  setText("#tt-event-round", "ROUND / " + String(event.round ?? "—").padStart(2, "0"));
  setText("#tt-event-name", event.name || "Unnamed rally");
  setText("#tt-event-location", [event.location, event.country].filter(Boolean).join(" / ").toUpperCase() || "EVENT LOCATION / NOT SUPPLIED");
  setText("#tt-event-timing", "NOT CONNECTED");
}
function renderEvents(snapshot) {
  const select = document.querySelector("#tt-event-select");
  if (!select) return;
  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  if (!events.length) {
    select.innerHTML = '<option value="">No events in the verified snapshot</option>';
    setText("#tt-event-name", "No events available");
    return;
  }
  select.innerHTML = events.map((event, index) =>
    '<option value="' + index + '">' + escapeHtml("R" + String(event.round ?? "—").padStart(2, "0") + " / " + (event.name || "Unnamed rally") + " / " + formatDate(event.dateStart)) + "</option>"
  ).join("");
  const next = events.findIndex(event => eventPhase(event) === "UPCOMING" || eventPhase(event) === "IN PROGRESS");
  select.value = String(next >= 0 ? next : 0);
  select.onchange = renderSelectedEvent;
  renderSelectedEvent();
}
function ordered(rows) {
  return [...rows].sort((a, b) => Number(a.position ?? 999) - Number(b.position ?? 999));
}
function renderCategory(key, target, countTarget) {
  const rows = ordered(standingsSnapshot?.categories?.[key] || []);
  setText(countTarget, rows.length + " ENTRIES");
  const node = document.querySelector(target);
  if (!node) return;
  node.innerHTML = rows.slice(0, 5).map((entry, index) => {
    const rank = entry.position ?? index + 1;
    const name = entry.name || entry.driverName || entry.team || entry.manufacturer || "Unlisted competitor";
    const detail = [entry.country, entry.team && entry.team !== name ? entry.team : null].filter(Boolean).join(" / ");
    const points = Number.isFinite(Number(entry.points)) ? Number(entry.points).toLocaleString("en-MY") + " PTS" : "— PTS";
    return '<div class="tt-standing-row"><span class="tt-standing-rank">' + escapeHtml(String(rank).padStart(2, "0")) + '</span><div class="tt-standing-identity"><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(detail || "CHAMPIONSHIP ENTRY") + '</small></div><b>' + escapeHtml(points) + '</b></div>';
  }).join("") || '<p class="tt-data-placeholder">No verified entries in this category.</p>';
}
function renderStandings(snapshot, cached = false) {
  standingsSnapshot = snapshot;
  renderCategory("drivers", "#tt-drivers-list", "#tt-driver-count");
  renderCategory("coDrivers", "#tt-codrivers-list", "#tt-codriver-count");
  renderCategory("manufacturers", "#tt-manufacturers-list", "#tt-manufacturer-count");
  const updated = snapshot.fetchedAt;
  setText("#tt-standings-updated", (cached ? "CACHED / " : "UPDATED / ") + (updated ? formatUpdated(updated) : "TIME UNKNOWN"));
  setText("#tt-standings-note", (cached ? "OFFLINE CACHE · " : "CHAMPIONSHIP SNAPSHOT · ") + (snapshot.provider || "Verified data provider") + " · " + formatUpdated(updated) + " · Scheduled standings, not live stage timing.");
}
async function loadSnapshot(key, cachedFirst = true) {
  const config = SNAPSHOTS[key];
  if (!config) return { snapshot: null, cached: false, error: new Error("Unknown snapshot") };
  let cached = await readCached(key);
  if (cachedFirst && cached?.payload && config.valid(cached.payload)) {
    if (key === "events") { eventSnapshot = cached.payload; renderEvents(cached.payload); }
    if (key === "standings") renderStandings(cached.payload, true);
  }
  try {
    const response = await fetch(new URL(config.url, document.baseURI), { cache: "no-store" });
    if (!response.ok) throw new Error("Snapshot request returned " + response.status);
    const snapshot = await response.json();
    if (!config.valid(snapshot)) throw new Error("Snapshot structure is incomplete.");
    await writeCached(key, snapshot);
    if (key === "events") { eventSnapshot = snapshot; renderEvents(snapshot); }
    if (key === "standings") renderStandings(snapshot, false);
    return { snapshot, cached: false };
  } catch (error) {
    if (cached?.payload && config.valid(cached.payload)) return { snapshot: cached.payload, cached: true };
    return { snapshot: null, cached: false, error };
  }
}
async function loadDataCentre() {
  if (!document.querySelector(".telemetry-page")) return;
  setFeed("CONNECTING TO DATA FEED", "Checking verified event calendar and championship snapshots…", null);
  const results = await Promise.all([loadSnapshot("events"), loadSnapshot("standings")]);
  const eventResult = results[0];
  const standingsResult = results[1];
  const hasCached = results.some(result => result.cached);
  const hasError = results.some(result => !result.snapshot);
  const newest = results.map(result => result.snapshot?.fetchedAt).filter(Boolean).sort().at(-1);
  if (eventResult.snapshot && !eventSnapshot) { eventSnapshot = eventResult.snapshot; renderEvents(eventSnapshot); }
  if (standingsResult.snapshot && !standingsSnapshot) renderStandings(standingsResult.snapshot, standingsResult.cached);
  if (!eventResult.snapshot) {
    setText("#tt-event-select", ""); 
    const select = document.querySelector("#tt-event-select");
    if (select) select.innerHTML = '<option value="">Event schedule unavailable</option>';
    setText("#tt-event-name", "Event schedule unavailable");
  }
  const offline = !navigator.onLine;
  const mode = offline || hasCached ? "cached" : hasError ? "error" : "online";
  const state = offline ? "OFFLINE · SAVED DATA" : hasCached ? "CACHED DATA AVAILABLE" : hasError ? "PARTIAL DATA" : "VERIFIED SNAPSHOTS LOADED";
  const message = offline ? "Showing the last successfully saved event and championship data." : hasCached ? "A saved snapshot is being shown where the network feed is unavailable." : hasError ? "One or more verified snapshots could not be loaded." : "WRC event calendar and championship standings connected.";
  setFeed(state, message, newest, mode);
}
function refreshOnReconnect() {
  if (navigator.onLine) loadDataCentre();
}
window.initTarmacDataCentre = loadDataCentre;
window.addEventListener("online", refreshOnReconnect);
window.addEventListener("offline", () => setFeed("OFFLINE · SAVED DATA", "Network unavailable. Showing the last successfully cached snapshots.", standingsSnapshot?.fetchedAt || eventSnapshot?.fetchedAt, "cached"));
if (document.body.dataset.page === "data-centre") loadDataCentre();
