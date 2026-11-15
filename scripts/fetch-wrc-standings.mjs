import { mkdir, writeFile } from "node:fs/promises";

const apiKey = process.env.BLACKTOP_API_KEY;
if (!apiKey) throw new Error("BLACKTOP_API_KEY is not configured.");

const season = Number(process.env.WRC_SEASON || new Date().getUTCFullYear());
if (!Number.isInteger(season) || season < 2018) throw new Error("Invalid WRC_SEASON.");

const endpoints = {
  drivers: "drivers",
  coDrivers: "co-drivers",
  manufacturers: "manufacturers"
};

async function fetchStandings(category, endpoint) {
  const url = new URL(`https://api.ocblacktop.com/v1/wrc/standings/${endpoint}`);
  url.searchParams.set("year", String(season));

  const response = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      "accept": "application/json"
    },
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`${category} request failed (${response.status}): ${detail}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload !== "object") {
    throw new Error(`${category} response was not a JSON object or array.`);
  }

  return payload;
}

const results = {};
for (const [category, endpoint] of Object.entries(endpoints)) {
  results[category] = await fetchStandings(category, endpoint);
}

const snapshot = {
  provider: "Blacktop Data",
  championship: "WRC",
  season,
  fetchedAt: new Date().toISOString(),
  source: "https://api.ocblacktop.com",
  categories: results
};

await mkdir("public/data", { recursive: true });
await writeFile("public/data/standings.json", `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Saved WRC ${season} standings snapshot (${Object.keys(results).length} categories).`);
