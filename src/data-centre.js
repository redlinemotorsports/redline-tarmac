const CACHE_KEY = "redline-tarmac:wrc-standings:v1";
const categoryLabels = { drivers: "DRIVERS", coDrivers: "CO-DRIVERS", manufacturers: "MANUFACTURERS" };
let snapshot = null;
let calendar = null;
let activeCategory = "drivers";

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const points = row => number(row?.points);
const ranked = rows => [...(Array.isArray(rows) ? rows : [])].sort((a, b) =>
  number(a.position || 999) - number(b.position || 999) || points(b) - points(a)
);
const formatNumber = value => number(value).toLocaleString("en-MY");
const formatUpdated = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TIME UNAVAILABLE";
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date) + " MYT";
};
const validSnapshot = value => value && value.championship === "WRC" && value.categories &&
  ["drivers", "coDrivers", "manufacturers"].every(key => Array.isArray(value.categories[key]) && value.categories[key].length);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
})[char]);

function setStatus(state, message, fetchedAt) {
  const stateNode = document.querySelector("#dc-status-state");
  const messageNode = document.querySelector("#dc-status-message");
  const updatedNode = document.querySelector("#dc-status-updated");
  if (stateNode) stateNode.textContent = state;
  if (messageNode) messageNode.textContent = message;
  if (updatedNode) updatedNode.textContent = "UPDATED / " + (fetchedAt ? formatUpdated(fetchedAt) : "—");
}

function categoryRows(category = activeCategory) {
  return ranked(snapshot?.categories?.[category] || []);
}

function populateCompareSelects() {
  const category = document.querySelector("#dc-compare-category");
  const selectA = document.querySelector("#dc-competitor-a");
  const selectB = document.querySelector("#dc-competitor-b");
  if (!category || !selectA || !selectB || !snapshot) return;
  const rows = categoryRows(category.value);
  const options = rows.map((row, index) =>
    '<option value="' + index + '">' + escapeHtml(String(row.position ?? index + 1).padStart(2, "0") + " / " + (row.name || "Unknown") + " · " + formatNumber(points(row)) + " PTS") + "</option>"
  ).join("");
  selectA.innerHTML = options;
  selectB.innerHTML = options;
  if (rows.length > 1) selectB.value = "1";
  renderComparison();
}

function renderComparison() {
  const category = document.querySelector("#dc-compare-category")?.value || "drivers";
  const rows = categoryRows(category);
  const indexA = Number(document.querySelector("#dc-competitor-a")?.value || 0);
  const indexB = Number(document.querySelector("#dc-competitor-b")?.value || 0);
  const a = rows[indexA], b = rows[indexB];
  if (!a || !b) return;
  const set = (selector, value) => { const node = document.querySelector(selector); if (node) node.textContent = value; };
  set("#dc-name-a", a.name || "Unknown competitor");
  set("#dc-name-b", b.name || "Unknown competitor");
  set("#dc-country-a", a.country || "COUNTRY NOT SUPPLIED");
  set("#dc-country-b", b.country || "COUNTRY NOT SUPPLIED");
  set("#dc-position-a", "#" + String(a.position ?? indexA + 1).padStart(2, "0"));
  set("#dc-position-b", "#" + String(b.position ?? indexB + 1).padStart(2, "0"));
  set("#dc-points-a", formatNumber(points(a)));
  set("#dc-points-b", formatNumber(points(b)));
  const difference = points(a) - points(b);
  set("#dc-delta", formatNumber(Math.abs(difference)));
  set("#dc-delta-copy", difference === 0 ? "LEVEL ON CHAMPIONSHIP POINTS" :
    (difference > 0 ? (a.name || "COMPETITOR A") : (b.name || "COMPETITOR B")) + " LEADS BY " + formatNumber(Math.abs(difference)) + " PTS");
  const maximum = Math.max(1, points(a), points(b));
  const barA = document.querySelector("#dc-bar-a"), barB = document.querySelector("#dc-bar-b");
  if (barA) barA.style.width = (points(a) / maximum * 100) + "%";
  if (barB) barB.style.width = (points(b) / maximum * 100) + "%";
  document.querySelector("#dc-card-a")?.classList.toggle("is-leading", difference > 0);
  document.querySelector("#dc-card-b")?.classList.toggle("is-leading", difference < 0);
}

function renderExplorer() {
  if (!snapshot) return;
  const rows = categoryRows();
  const leaderPoints = rows.length ? points(rows[0]) : 0;
  const query = (document.querySelector("#dc-search")?.value || "").trim().toLowerCase();
  const filtered = rows.filter(row => [row.name, row.country].some(value => String(value || "").toLowerCase().includes(query)));
  const body = document.querySelector("#dc-table-body");
  if (!body) return;
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="5">No entries match this search.</td></tr>';
  } else {
    body.innerHTML = filtered.map((row, index) => {
      const position = Number(row.position ?? rows.indexOf(row) + 1);
      const gap = Math.max(0, leaderPoints - points(row));
      return "<tr" + (position === 1 ? " class='is-leader'" : "") + ">" +
        "<td class='dc-position'>" + String(position).padStart(2, "0") + "</td>" +
        "<td><strong>" + escapeHtml(row.name || "Unknown competitor") + "</strong></td>" +
        "<td class='dc-country'>" + escapeHtml(row.country || "—") + "</td>" +
        "<td class='numeric dc-points'>" + formatNumber(points(row)) + "</td>" +
        "<td class='numeric dc-gap'>" + (gap ? "−" + formatNumber(gap) : "—") + "</td></tr>";
    }).join("");
  }
  const count = document.querySelector("#dc-result-count");
  if (count) count.textContent = filtered.length + " / " + rows.length + " ENTRIES";
  const context = document.querySelector("#dc-explorer-season");
  if (context) context.textContent = snapshot.season + " / " + categoryLabels[activeCategory];
}

function renderOverview() {
  if (!snapshot) return;
  const categories = snapshot.categories;
  const total = ["drivers", "coDrivers", "manufacturers"].reduce((sum, key) => sum + categories[key].length, 0);
  const drivers = ranked(categories.drivers);
  const gap = drivers.length > 1 ? Math.max(0, points(drivers[0]) - points(drivers[1])) : null;
  const set = (selector, value) => { const node = document.querySelector(selector); if (node) node.textContent = value; };
  set("#dc-season", String(snapshot.season || "WRC"));
  set("#dc-entry-count", formatNumber(total));
  set("#dc-title-gap", gap === null ? "—" : formatNumber(gap) + " PTS");
  set("#dc-title-gap-caption", drivers.length > 1 ? "LEADER TO " + String(drivers[1].name || "SECOND").toUpperCase() : "DRIVERS’ LEADER TO SECOND");
  set("#dc-coverage-entries", "3 CATEGORIES / " + total + " ENTRIES");
  setStatus("API SNAPSHOT", "Verified championship standings · scheduled refresh, not live timing", snapshot.fetchedAt);
}

function renderCalendarCoverage() {
  const node = document.querySelector("#dc-coverage-calendar");
  if (!node) return;
  if (calendar && calendar.championship === "WRC" && Array.isArray(calendar.events) && calendar.events.length) {
    node.textContent = calendar.events.length + " EVENTS / " + (calendar.season || "WRC") + " SEASON";
  } else {
    node.textContent = "CALENDAR SNAPSHOT NOT AVAILABLE";
  }
}

function bindControls() {
  const compareCategory = document.querySelector("#dc-compare-category");
  compareCategory?.addEventListener("change", populateCompareSelects);
  document.querySelector("#dc-competitor-a")?.addEventListener("change", renderComparison);
  document.querySelector("#dc-competitor-b")?.addEventListener("change", renderComparison);
  document.querySelector("#dc-search")?.addEventListener("input", renderExplorer);
  document.querySelectorAll(".dc-tab").forEach(tab => tab.addEventListener("click", () => {
    activeCategory = tab.dataset.category;
    document.querySelectorAll(".dc-tab").forEach(item => {
      const selected = item === tab;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-selected", String(selected));
    });
    renderExplorer();
  }));
}

async function loadDataCentre() {
  if (!document.querySelector(".data-centre-page")) return;
  bindControls();
  snapshot = null;
  calendar = null;
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const cached = JSON.parse(stored);
      if (validSnapshot(cached)) snapshot = cached;
    }
  } catch (_) {}
  try {
    const [standingsResponse, calendarResponse] = await Promise.all([
      fetch(new URL("./data/standings.json", document.baseURI), { cache: "no-store" }),
      fetch(new URL("./data/rally-control.json", document.baseURI), { cache: "no-store" }).catch(() => null)
    ]);
    if (!standingsResponse.ok) throw new Error("Standings snapshot request returned " + standingsResponse.status);
    const fresh = await standingsResponse.json();
    if (!validSnapshot(fresh)) throw new Error("Standings snapshot is incomplete.");
    snapshot = fresh;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(fresh)); } catch (_) {}
    if (calendarResponse?.ok) {
      const value = await calendarResponse.json();
      if (value.championship === "WRC" && Array.isArray(value.events)) calendar = value;
    }
    setStatus("API SNAPSHOT", "Verified championship data · scheduled refresh, not live timing", fresh.fetchedAt);
  } catch (error) {
    if (!snapshot) {
      setStatus("DATA UNAVAILABLE", "The verified standings snapshot could not be loaded.", null);
      const body = document.querySelector("#dc-table-body");
      if (body) body.innerHTML = "<tr><td colspan='5'>Championship data is temporarily unavailable.</td></tr>";
      return;
    }
    setStatus("CACHED SNAPSHOT", "Refresh unavailable · showing the last saved standings snapshot", snapshot.fetchedAt);
  }
  renderOverview();
  renderExplorer();
  renderCalendarCoverage();
  populateCompareSelects();
}

window.initTarmacDataCentre = loadDataCentre;
if (document.body.dataset.page === "data-centre") loadDataCentre();
