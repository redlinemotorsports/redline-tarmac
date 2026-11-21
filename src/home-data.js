const CACHE_KEY = "redline-tarmac:wrc-standings:v2";
const validSnapshot = value => value &&
  value.championship === "WRC" &&
  value.categories &&
  ["drivers", "coDrivers", "manufacturers"].every(key =>
    Array.isArray(value.categories[key]) && value.categories[key].length > 0
  );

const ranked = rows => [...rows].sort((a, b) =>
  Number(a.position ?? 999) - Number(b.position ?? 999)
);
const pointsGapLabel = rows => {
  const ordered = ranked(rows);
  const leader = Number(ordered[0]?.points);
  const second = Number(ordered[1]?.points);
  if (!Number.isFinite(leader)) return "POINTS UNAVAILABLE";
  if (!Number.isFinite(second)) return leader.toLocaleString("en-MY") + " POINTS";
  const gap = Math.max(0, leader - second);
  return leader.toLocaleString("en-MY") + " POINTS · +" + gap.toLocaleString("en-MY") + " GAP";
};

const formatUpdated = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "UPDATE TIME UNAVAILABLE";
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date) + " MYT";
};

function render(snapshot, cached = false) {
  const driver = ranked(snapshot.categories.drivers)[0];
  const coDriver = ranked(snapshot.categories.coDrivers)[0];
  const manufacturer = ranked(snapshot.categories.manufacturers)[0];
  const set = (selector, value) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = value || "—";
  };
  set("#home-driver-leader", driver?.name);
  set("#home-driver-points", pointsGapLabel(snapshot.categories.drivers));
  set("#home-codriver-leader", coDriver?.name);
  set("#home-codriver-points", pointsGapLabel(snapshot.categories.coDrivers));
  set("#home-manufacturer-leader", manufacturer?.name);
  set("#home-manufacturer-points", pointsGapLabel(snapshot.categories.manufacturers));
  const status = document.querySelector("#home-data-status");
  if (status) {
    const provider = snapshot.provider || "Verified data provider";
    status.textContent = "■ " + (cached ? "Showing the last saved championship snapshot" : "Source: " + provider) +
      " · " + formatUpdated(snapshot.fetchedAt) + " · Scheduled standings, not live stage timing.";
  }
}

async function loadSnapshot() {
  const status = document.querySelector("#home-data-status");
  if (!status) return;
  let cached = null;
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (validSnapshot(parsed)) cached = parsed;
    }
  } catch (_) {}

  try {
    const response = await fetch(new URL("./data/standings.json", document.baseURI), { cache: "no-store" });
    if (!response.ok) throw new Error("Snapshot request returned " + response.status);
    const snapshot = await response.json();
    if (!validSnapshot(snapshot)) throw new Error("Snapshot structure is incomplete.");
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)); } catch (_) {}
    render(snapshot);
  } catch (error) {
    if (cached) render(cached, true);
    else {
      status.textContent = "■ Verified championship snapshot unavailable. Visit Standings to check the full data status.";
      console.warn("Redline Tarmac Home could not load standings:", error);
    }
  }
}

window.initTarmacHomeData = loadSnapshot;
if (document.body.dataset.page === "home") loadSnapshot();
