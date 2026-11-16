const CACHE_KEY = "redline-tarmac:wrc-standings:v1";
const snapshotUrl = new URL("./data/standings.json", document.baseURI);
const fields = {
  driver: document.querySelector("#home-driver-leader"),
  driverPoints: document.querySelector("#home-driver-points"),
  coDriver: document.querySelector("#home-codriver-leader"),
  coDriverPoints: document.querySelector("#home-codriver-points"),
  manufacturer: document.querySelector("#home-manufacturer-leader"),
  manufacturerPoints: document.querySelector("#home-manufacturer-points"),
  status: document.querySelector("#home-data-status")
};

const validSnapshot = value => value &&
  value.championship === "WRC" &&
  value.categories &&
  ["drivers", "coDrivers", "manufacturers"].every(key =>
    Array.isArray(value.categories[key]) && value.categories[key].length > 0
  );

const rankedLeader = rows => [...rows].sort((a, b) =>
  Number(a.position ?? 999) - Number(b.position ?? 999)
)[0];

const pointsLabel = row => Number.isFinite(Number(row?.points))
  ? Number(row.points).toLocaleString("en-MY") + " POINTS"
  : "POINTS UNAVAILABLE";

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
  const driver = rankedLeader(snapshot.categories.drivers);
  const coDriver = rankedLeader(snapshot.categories.coDrivers);
  const manufacturer = rankedLeader(snapshot.categories.manufacturers);

  fields.driver.textContent = driver?.name || "—";
  fields.driverPoints.textContent = pointsLabel(driver);
  fields.coDriver.textContent = coDriver?.name || "—";
  fields.coDriverPoints.textContent = pointsLabel(coDriver);
  fields.manufacturer.textContent = manufacturer?.name || "—";
  fields.manufacturerPoints.textContent = pointsLabel(manufacturer);

  const provider = snapshot.provider || "Verified data provider";
  const updated = formatUpdated(snapshot.fetchedAt);
  fields.status.textContent = "■ " + (cached ? "Showing the last saved championship snapshot" : "Source: " + provider) +
    " · " + updated + " · Scheduled standings, not live stage timing.";
}

async function loadSnapshot() {
  if (!fields.status) return;
  let cached = null;

  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (validSnapshot(parsed)) cached = parsed;
    }
  } catch (_) {
    // Storage can be unavailable; continue with the network request.
  }

  try {
    const response = await fetch(snapshotUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("Snapshot request returned " + response.status);
    const snapshot = await response.json();
    if (!validSnapshot(snapshot)) throw new Error("Snapshot structure is incomplete.");
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)); } catch (_) {}
    render(snapshot);
  } catch (error) {
    if (cached) {
      render(cached, true);
    } else {
      fields.status.textContent = "■ Verified championship snapshot unavailable. Visit Standings to check the full data status.";
      console.warn("Redline Tarmac Home could not load standings:", error);
    }
  }
}

loadSnapshot();
