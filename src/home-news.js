const formatDate = value => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.valueOf())) return "DATE UNAVAILABLE";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date).toUpperCase();
};

function renderHeadline(article) {
  const item = document.createElement("article");
  item.className = "home-news-item";
  const meta = document.createElement("div");
  meta.className = "home-news-meta";
  const source = document.createElement("span");
  source.textContent = (article.sourceType === "OFFICIAL" ? "OFFICIAL / " : "INDEPENDENT / ") + (article.source || "PUBLISHER");
  const date = document.createElement("time");
  date.textContent = formatDate(article.publishedAt);
  if (article.publishedAt) date.dateTime = article.publishedAt;
  meta.append(source, date);
  const heading = document.createElement("h3");
  const link = document.createElement("a");
  link.textContent = article.title || "Untitled dispatch";
  try {
    const url = new URL(article.url);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("Unsafe URL");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } catch { link.removeAttribute("href"); }
  heading.append(link);
  item.append(meta, heading);
  return item;
}

async function loadHomeNews() {
  const feed = document.querySelector("#home-news-feed");
  const status = document.querySelector("#home-news-status");
  if (!feed || !status) return;
  feed.replaceChildren();
  try {
    const response = await fetch(new URL("./data/rally-news.json", document.baseURI), { cache: "no-store" });
    if (!response.ok) throw new Error("News snapshot request returned " + response.status);
    const snapshot = await response.json();
    const articles = Array.isArray(snapshot.articles) ? snapshot.articles.slice(0, 3) : [];
    if (!articles.length) throw new Error("No verified headlines available");
    articles.forEach(article => feed.append(renderHeadline(article)));
    status.textContent = "■ " + articles.length + " LATEST HEADLINES · " +
      (snapshot.updatedAt ? "FEED UPDATED " + formatDate(snapshot.updatedAt) : "UPDATE TIME UNAVAILABLE");
  } catch (error) {
    const message = document.createElement("p");
    message.className = "data-note";
    message.textContent = "Verified headlines are temporarily unavailable. Visit the Newsroom for the latest feed status.";
    feed.append(message);
    status.textContent = "■ NEWS SNAPSHOT UNAVAILABLE";
    console.warn("Redline Tarmac Home could not load newsroom headlines:", error);
  }
}

window.initTarmacHomeNews = loadHomeNews;
if (document.body.dataset.page === "home") loadHomeNews();
