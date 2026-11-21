const formatDate = value => {
  if (!value) return "DATE TBC";
  const date = new Date(value + (String(value).length === 10 ? "T00:00:00Z" : ""));
  if (Number.isNaN(date.getTime())) return "DATE TBC";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date).toUpperCase();
};

const eventPhase = event => {
  const now = new Date();
  const start = event.dateStart ? new Date(event.dateStart) : null;
  const end = event.dateEnd ? new Date(event.dateEnd) : start;
  if (start && !Number.isNaN(start.getTime()) && start > now) return "UPCOMING";
  if (end && !Number.isNaN(end.getTime()) && end < now) return "COMPLETED";
  if (start && !Number.isNaN(start.getTime())) return "IN PROGRESS";
  return "SCHEDULED";
};

function renderRallyEvents(snapshot) {
  const list = document.querySelector("#rally-event-list");
  const status = document.querySelector("#rally-status-copy");
  const count = document.querySelector("#rally-event-count");
  const season = document.querySelector("#rally-season");
  if (!list || !status) return;

  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  if (!events.length) {
    status.textContent = "The provider has not returned any rally events for this season.";
    list.replaceChildren();
    return;
  }

  if (count) count.textContent = String(events.length).padStart(2, "0") + " EVENTS";
  if (season) season.textContent = String(snapshot.season || "WRC") + " SEASON";
  status.textContent = "Schedule supplied by " + (snapshot.provider || "Moto-DB schedule") +
    " · Updated " + new Intl.DateTimeFormat("en-MY", {
      timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short",
      year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date(snapshot.fetchedAt)) + " MYT";

  const fragment = document.createDocumentFragment();
  for (const event of events) {
    const row = document.createElement("article");
    row.className = "rally-event-row";
    const round = document.createElement("span");
    round.className = "rally-event-round";
    round.textContent = event.round ? "R" + String(event.round).padStart(2, "0") : "—";
    const details = document.createElement("div");
    details.className = "rally-event-details";
    const name = document.createElement("strong");
    name.textContent = event.name || "Unnamed rally";
    const place = document.createElement("span");
    place.textContent = [event.location, event.country].filter(Boolean).join(", ") || "Location not supplied";
    details.append(name, place);
    const dates = document.createElement("span");
    dates.className = "rally-event-dates";
    dates.textContent = formatDate(event.dateStart) + (event.dateEnd && event.dateEnd !== event.dateStart ? " — " + formatDate(event.dateEnd) : "");
    const phase = document.createElement("span");
    phase.className = "rally-event-phase";
    phase.textContent = eventPhase(event);
    row.append(round, details, dates, phase);
    fragment.append(row);
  }
  list.replaceChildren(fragment);
}

async function loadRallyControl() {
  const status = document.querySelector("#rally-status-copy");
  const list = document.querySelector("#rally-event-list");
  if (!status || !list) return;
  status.textContent = "Loading verified WRC event schedule…";
  try {
    const response = await fetch(new URL("./data/rally-control.json", document.baseURI), { cache: "no-store" });
    if (!response.ok) throw new Error("Rally schedule request returned " + response.status);
    const snapshot = await response.json();
    if (snapshot.championship !== "WRC" || !Array.isArray(snapshot.events) || !snapshot.events.length) {
      throw new Error("Rally schedule snapshot is incomplete.");
    }
    renderRallyEvents(snapshot);
  } catch (error) {
    status.textContent = "Verified WRC event schedule is currently unavailable. Please try again after the next data refresh.";
    console.warn("Redline Tarmac Rally Control could not load the WRC calendar:", error);
  }
}

window.initTarmacRallyControl = loadRallyControl;
if (document.body.dataset.page === "rally-control") loadRallyControl();
