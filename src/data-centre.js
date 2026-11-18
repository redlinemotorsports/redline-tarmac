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
function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}
function setFeed(state, message, updated) {
  setText("#tt-feed-state", state);
  setText("#tt-feed-message", message);
  setText("#tt-feed-updated", "UPDATED / " + (updated ? formatUpdated(updated) : "—"));
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
  select.addEventListener("change", renderSelectedEvent);
  renderSelectedEvent();
}
async function loadDataCentre() {
  if (!document.querySelector(".telemetry-page")) return;
  setFeed("CONNECTING TO DATA FEED", "Checking verified WRC event schedule…", null);
  try {
    const response = await fetch(new URL("./data/rally-control.json", document.baseURI), { cache: "no-store" });
    if (!response.ok) throw new Error("Event schedule request returned " + response.status);
    const snapshot = await response.json();
    if (snapshot.championship !== "WRC" || !Array.isArray(snapshot.events)) throw new Error("Event schedule snapshot is incomplete.");
    eventSnapshot = snapshot;
    renderEvents(snapshot);
    setFeed("EVENT SCHEDULE AVAILABLE", "WRC calendar connected · stage timing feed not yet verified", snapshot.fetchedAt);
  } catch (error) {
    setFeed("EVENT SCHEDULE UNAVAILABLE", "The verified event calendar could not be loaded. Timing data remains unavailable.", null);
    const select = document.querySelector("#tt-event-select");
    if (select) select.innerHTML = '<option value="">Event schedule unavailable</option>';
    setText("#tt-event-name", "Event schedule unavailable");
    console.warn("Redline Tarmac Tarmac Telemetry could not load the WRC calendar:", error);
  }
}
window.initTarmacDataCentre = loadDataCentre;
if (document.body.dataset.page === "data-centre") loadDataCentre();
