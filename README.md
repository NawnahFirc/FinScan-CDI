# FinScan Corporate Decision Intelligence

Client-ready financial screening platform for corporate counterparty review.

FinScan Corporate Decision Intelligence parses financial statements, calculates liquidity and risk indicators, benchmarks performance by sector, and produces an approve / monitor / restrict / reject recommendation with an audit trail.

Version: 3.8.0

## Interface release 3.8.0

- New light and dark workspace with a persistent release badge.
- Mobile bottom navigation, searchable views (Ctrl/Cmd+K), and company switching.
- Decision score ring, expandable score drivers, and evidence filters.
- Keyboard-accessible uploads and reduced-motion support.

The maintained application lives in `FinScan-CDI-v3.7.0/` (directory name retained for compatibility). Root npm commands now run this application; `npm install` also installs its locked dependencies.

## Core Capabilities

- Upload PDF, CSV, XLSX, or enter financials manually.
- Review extracted figures before they enter the analysis workspace.
- Run liquidity, profitability, solvency, efficiency, fraud-signal, and trend analysis.
- Generate a counterparty decision score with recommendation logic.
- Simulate downside scenarios such as revenue decline, margin pressure, and slower collections.
- Compare companies, maintain a watchlist, and export reports or evidence files.
- Use local analyst memo generation without an API key.
- Optionally enable an AI-assisted backend analyst service for richer fallback analysis.

## Data Handling

By default, statement parsing and financial analysis run locally in the browser. The optional backend is used only when it is running and the user enables the AI-assisted fallback mode.

Do not enter third-party API keys into the app unless the optional AI analyst service is required for your deployment.

## Requirements

Install Node.js 22.12 or newer.

Check your version:

```bash
node --version
```

If Node.js is missing or older than v22.12, install the current LTS release from https://nodejs.org.

## Quick Start

### Windows

Double-click:

```text
RUN_WINDOWS.bat
```

The launcher installs dependencies, builds the app, starts the server, and opens the browser.

### macOS or Linux

From this folder:

```bash
chmod +x RUN_MAC_LINUX.sh
./RUN_MAC_LINUX.sh
```

### Manual Terminal Start

```bash
npm install
npm run build
npm start
```

Then open:

```text
http://localhost:3000
```

For development mode:

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Optional AI Analyst Service

Most features work without an API key. To enable the optional AI-assisted analyst service:

1. Copy `.env.example` to `.env`.
2. Add your Anthropic API key to `AI_ANALYST_API_KEY=`.
3. Restart the app.

Without this key, local parsing, ratios, scoring, watchlists, simulations, exports, and local memo generation remain available.

## Recommended Workflow

1. Upload a PDF, CSV, or XLSX statement, or enter figures manually.
2. Review the extracted values in the Extraction Review panel.
3. Confirm the company sector and accounting standard.
4. Open Decision Center for the recommendation and evidence trail.
5. Use Scenario Simulator, Benchmark Radar, Risk Timeline, and Watchlist for follow-up review.
6. Export the report or evidence file for documentation.

## Troubleshooting

`vite is not recognized`

Run `npm install` first, or use the Windows launcher.

`Port already in use`

Close other FinScan terminals. The Windows launcher automatically tries nearby ports.

`PDF did not parse cleanly`

Use the Extraction Review panel to correct values. For low-quality scans, CSV or XLSX is more reliable than OCR.

`Optional AI analyst is disabled`

This is expected unless `AI_ANALYST_API_KEY` is configured in `.env`.

## Project Layout

```text
src/
  components/   Shared interface components
  lib/          Parsing, scoring, finance, and decision logic
  pages/        Upload, decision, reports, scenarios, watchlist, analysis pages
  store/        Local workspace state
samples/        Example financial statement
server.js       Optional backend and production server
```

## Notes

This tool supports financial screening and decision documentation. It does not replace professional accounting, legal, credit, or investment judgment. Always verify extracted figures against official financial statements before making a final decision.
