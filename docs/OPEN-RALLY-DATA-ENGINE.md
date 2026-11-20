# Redline OpenRally data engine

## Purpose

OpenRally is a provider-independent, rally-only ingestion and normalization layer for Redline Tarmac. It publishes a separate JSON snapshot so experimental providers cannot overwrite the existing Blacktop-backed production snapshots.

## Current first adapter

The initial research adapter reads the publicly reachable WRC Live Timing JSON endpoints documented by the RallyDataJunkie community project:

- Active season calendar: `/contel-page/83388/calendar/active-season/`
- Event itinerary: `/results-api/rally-event/{eventId}/itinerary`
- Entry list: `/results-api/rally-event/{eventId}/cars`
- Overall results: `/results-api/rally-event/{eventId}/result`
- Stage winners: `/results-api/rally-event/{eventId}/stage-winners`
- Penalties and retirements: `/penalties`, `/retirements`
- Stage times: `/stage-times/stage-external/{stageId}`
- Overall classification after a stage: `/stage-result/stage-external/{stageId}`
- Split locations and split times: `/split-times/stage-external/{stageId}`

Reference implementation and field descriptions: https://rallydatajunkie.com/visualising-wrc-rally-results/accessing-data-from-the-wrc-live-timing-api.html

## Output

The adapter writes `public/data/open-rally.json` with a versioned, provider-labelled schema:

- event calendar and itinerary-derived stage metadata
- crew and car-entry metadata supplied by the event entry list
- stage classifications and overall classification after each stage
- split point distances and crew split times
- overall rally results, stage winners, penalties and retirements
- derived average speed only when both official stage distance and a valid stage duration are present

It does **not** create RPM, boost, throttle, brake, tyre, suspension, GPS or other vehicle sensor values. Those require an authorized vehicle telemetry feed.

## Safety and publishing policy

The WRC endpoints used by this adapter are community-documented, unofficial and undocumented as a stable public developer API. Their continued availability, rate limits, access terms and public redistribution rights are not guaranteed. This adapter is therefore opt-in and does not replace the existing production feed.

Enable it only after reviewing applicable WRC website/API terms and confirming the intended display rights:

1. Add the repository Actions variable `ENABLE_OPEN_RALLY_FEED=true`.
2. Optionally set `OPEN_RALLY_MAX_EVENTS` (1–3; default 2).
3. Run the deployment workflow manually or wait for the next scheduled build.

If the provider changes its response schema or denies access, the step fails without blocking the current Blacktop-backed site deployment. The previous OpenRally snapshot is not overwritten by an empty or unrecognized response.

## Architecture and next adapters

The normalized output is the contract for future adapters. Add providers behind the same schema rather than coupling UI components to a provider's raw response. Planned source modules:

- historical WRC archive: community SQLite datasets, imported and attributed separately
- weather: Open-Meteo or another source after confirming commercial/public display terms
- car specifications: FIA homologation documents and manufacturer-published technical data
- other rally championships: only after coverage and redistribution rights are verified

## Important distinction

RallyDJ and RallyDataJunkie are useful community tools around WRC's public timing service, not independent timing providers. This adapter uses the underlying WRC endpoints directly so we can own the normalization and caching layer; it does not imply an official WRC partnership or endorsement.
