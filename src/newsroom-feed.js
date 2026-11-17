const feed = document.querySelector("#nr-feed");
const status = document.querySelector("#nr-feed-status");
const updated = document.querySelector("#nr-feed-updated");

const formatDate = value => {
  if (!value) return "DATE UNAVAILABLE";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "DATE UNAVAILABLE";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date).toUpperCase();
};

function renderMessage(message) {
  feed.replaceChildren();
  const panel = document.createElement("div");
  panel.className = "nr-feed-empty";
  const title = document.createElement("strong");
  title.textContent = message;
  const copy = document.createElement("p");
  copy.textContent = "The desk only publishes attributed headlines with a direct link to the original publisher.";
  panel.append(title, copy);
  feed.append(panel);
}

function renderArticle(article) {
  const card = document.createElement("article");
  card.className = "nr-story";
  const meta = document.createElement("div");
  meta.className = "nr-story-meta";
  const source = document.createElement("span");
  source.className = "nr-story-source";
  source.textContent = article.sourceType === "OFFICIAL" ? "OFFICIAL / " + article.source : "INDEPENDENT / " + article.source;
  const date = document.createElement("time");
  date.textContent = formatDate(article.publishedAt);
  if (article.publishedAt) date.dateTime = article.publishedAt;
  meta.append(source, date);
  const heading = document.createElement("h4");
  const link = document.createElement("a");
  link.textContent = article.title;
  try {
    const url = new URL(article.url);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("Unsafe URL");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } catch {
    link.removeAttribute("href");
  }
  heading.append(link);
  const footer = document.createElement("div");
  footer.className = "nr-story-footer";
  footer.textContent = "READ AT SOURCE ↗";
  card.append(meta, heading, footer);
  return card;
}

async function loadNews() {
  if (!feed) return;
  try {
    const response = await fetch("./data/rally-news.json", { cache: "no-store" });
    if (!response.ok) throw new Error("News snapshot unavailable (" + response.status + ")");
    const snapshot = await response.json();
    const articles = Array.isArray(snapshot.articles) ? snapshot.articles : [];
    feed.replaceChildren();
    if (!articles.length) {
      renderMessage("THE NEWS DESK IS WAITING FOR ITS FIRST VERIFIED HEADLINES.");
    } else {
      articles.forEach(article => feed.append(renderArticle(article)));
    }
    const sources = snapshot.sources || [];
    const ready = sources.filter(source => source.status === "ok").length;
    const countLabel = sources.length + " SOURCE FEEDS / " + ready + " ONLINE";
    status.textContent = articles.length + " HEADLINES / " + countLabel;
    updated.textContent = snapshot.updatedAt ? "UPDATED " + formatDate(snapshot.updatedAt) : "UPDATE TIME UNAVAILABLE";
  } catch (error) {
    renderMessage("THE EDITORIAL FEED IS TEMPORARILY UNAVAILABLE.");
    status.textContent = "FEED CONNECTION / OFFLINE";
    updated.textContent = "LAST SNAPSHOT NOT AVAILABLE";
    console.warn("Tarmac Dispatch could not load its news snapshot:", error);
  }
}

// Expose an initializer so in-place navigation can refresh this view when revisited.
window.initTarmacNewsroom = loadNews;
if (document.body.dataset.page === "newsroom") loadNews();
