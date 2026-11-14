# Redline Tarmac

**Rally intelligence, stage by stage.**

Redline Tarmac is the rally-focused sibling in the Redline Motorsports family: an analytics-first experience for rally followers and data enthusiasts.

## Product direction

- Rally Control: overall classification and stage timing in a balanced pitwall layout
- Standings: drivers and manufacturers
- Data Centre: stage performance, time gaps, consistency and comparisons
- Calendar: rally and event schedule
- Drivers & Teams: crew and manufacturer profiles

## Current prototype

The first Rally Control prototype is a lightweight Vite site with responsive styling and small client-side interactions for stage selection and crew detail expansion. All displayed event, crew and timing values are illustrative demo data. No live timing provider is connected and nothing is presented as an official result.

## Local setup

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

The site is configured for GitHub Pages at `https://redlinemotorsports.github.io/redline-tarmac/`. The deployment workflow publishes from `main`; pull requests run a separate build verification workflow.

Data integrations will be provider-independent and added only after reliability, historical coverage and republication rights are assessed.
