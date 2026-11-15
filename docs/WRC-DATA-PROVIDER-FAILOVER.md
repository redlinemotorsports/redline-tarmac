# WRC data provider resilience plan

## Current primary

- Provider: Blacktop Data
- API root: `https://api.ocblacktop.com`
- Current standings endpoints: `/v1/wrc/standings/drivers`, `/co-drivers`, and `/manufacturers`
- Authentication: GitHub Actions secret `BLACKTOP_API_KEY`
- Published format: `public/data/standings.json`

The scheduled workflow must only publish a new snapshot after all required categories have been fetched and validated. If the primary provider fails, the workflow must fail closed and leave the last successfully deployed Pages snapshot in place. Never publish a partial or empty snapshot.

## Backup candidate under evaluation: RallySafe / StatusAS

Documentation: https://results-api.statusas.com/documentation/index.html

The documented API exposes season/championship discovery and results endpoints, including season championship results and overall results. This makes it a candidate for a second-source adapter, but it is **not yet an approved automatic WRC fallback**.

Before enabling it, verify all of the following with the provider:
1. The 2026 FIA World Rally Championship is available in its championship catalogue.
2. Driver, co-driver and manufacturer overall classifications are available, with stable identifiers and position/points fields.
3. The API permits scheduled server-side retrieval and public display of the resulting standings.
4. Authentication, rate limits, service availability and commercial/data redistribution terms are understood.
5. A real response can be mapped to the Redline normalized schema and cross-checked against Blacktop and official FIA published standings.

No RallySafe key, endpoint identifiers or WRC coverage have been assumed. Do not call undocumented endpoints or silently switch to this provider until the checks above pass.

## Normalized snapshot contract

A provider adapter must output all three non-empty categories:
- `drivers`
- `coDrivers`
- `manufacturers`

Each row must include a usable `position`, `name` and numeric `points`; `country` may be absent. Preserve provider identity, source URL and fetch timestamp in snapshot metadata. The UI may derive point gaps from the points field, but must not invent wins, podiums, stage times, crew pairings or progression history.

## Failover policy when backup access is approved

1. Try the primary provider with a bounded timeout.
2. Validate all three categories and the season before accepting the result.
3. If primary fails, try the configured and independently validated backup adapter.
4. Mark the snapshot provider and fallback state explicitly; never label backup data as Blacktop data.
5. If both providers fail, do not overwrite the last successful deployed snapshot.
6. Alert on failed scheduled refreshes; do not expose provider credentials to browser code or commit them to the repository.

Suggested future GitHub Actions secret names (only after provider access is approved): `WRCSAFE_API_KEY` and any non-secret championship/season identifiers as repository variables. Do not create empty placeholder secrets or enable a nonfunctional fallback.

## Verification source

Use official FIA WRC championship standings as an independent reconciliation reference where available: https://api.fia.com/events/world-rally-championship/season-2026/standings

A discrepancy must be investigated; do not silently blend rows from different providers or publication times.
