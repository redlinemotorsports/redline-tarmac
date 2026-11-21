# Redline Tarmac rally data providers

## Provider policy

Redline Tarmac no longer uses Blacktop Data. No Blacktop API key, secret, endpoint, or feed is required by the deployment workflow.

### Primary: WRC Live Timing public JSON

The adapter in `scripts/fetch-open-rally.mjs` requests the community-documented WRC public JSON endpoints. When reachable, it normalizes event itineraries, entries, stage classifications, split times, overall classifications, stage winners, penalties and retirements.

This is an unofficial, undocumented interface, not an official developer API. Availability, schema stability, rate limits and redistribution rights are not guaranteed. A successful fetch is not proof of permission to redistribute the data.

### Secondary: Moto-DB

The deployment always retrieves the WRC season schedule and final event winners from Moto-DB. It is an unauthenticated, community-maintained JSON dataset served from GitHub. Its published WRC schema currently covers schedules and event-level final winners; it does not provide stage-by-stage classifications, split timing, incident feeds or complete championship points tables. Tarmac does not fabricate those missing records.

Reference: https://vishwapramuditha.github.io/moto-db-web/docs.html

### Future candidate: RallySafe Results API (StatusAS)

The API exposes event and rally entries, itineraries, stage/split times, penalties and retirements. However, its documentation requires a JWT generated from a StatusAS account; it is not an anonymous free endpoint. It remains a future adapter until Redline has an account, confirms access and reviews usage/redistribution terms.

Reference: https://results-api.statusas.com/documentation/index.html

## Published snapshots

- `public/data/rally-control.json`: season calendar, Moto-DB schedule with WRC event enrichment when IDs can be matched.
- `public/data/performance.json`: detailed stage data only when the WRC Live Timing adapter returns verified records.
- `public/data/open-rally.json`: normalized raw provider-independent WRC timing snapshot.
- `public/data/standings.json`: FIA official standings when the FIA page can be parsed completely.

No fabricated stage timing, incidents, championship points or vehicle sensor telemetry are published. Missing data remains explicitly unavailable.

## Validation notes

The WRC public endpoint previously failed DNS resolution in GitHub Actions. This workflow retries it on each deployment but allows the Moto-DB schedule to keep the site build available. Stage timing and incident coverage remain unavailable until the WRC endpoint succeeds or an authenticated alternative is configured.
