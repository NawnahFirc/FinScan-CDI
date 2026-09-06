# FinScan Corporate Decision Intelligence

Client-ready financial screening platform for corporate counterparty review.

FinScan Corporate Decision Intelligence parses financial statements, calculates liquidity and risk indicators, benchmarks performance by sector, and produces an approve / monitor / restrict / reject recommendation with an audit trail.

Version: 3.7.0

## Core Capabilities

- Upload PDF, scanned/image PDF, PNG/JPG, CSV, XLSX, or enter financials manually.
- Review extracted, derived, and missing figures before they enter the analysis workspace.
- Start each app session with an empty analysis workspace while keeping prior reviewed statements in a manual restore cache.
- Preserve source evidence for parsed values, including PDF page, spreadsheet cell, and derivation formulas where available.
- Run liquidity, profitability, solvency, efficiency, fraud-signal, and trend analysis.
- Generate a counterparty decision score with recommendation logic.
- Simulate downside scenarios such as revenue decline, margin pressure, and slower collections.
- Compare companies, maintain a watchlist, and export reports or evidence files.
- Use local analyst memo generation without an API key.
- Optionally enable Gemini-assisted backend extraction for hard PDFs and images, and richer fallback analysis.

## Data Handling

By default, statement parsing and financial analysis run locally in the browser. The optional backend is used only when it is running and the user enables the AI-assisted fallback mode.

Gemini-assisted extraction is used when the user selects Local + AI Analyst mode for PDFs, scans, and images. Local Only remains deterministic and API-free. Do not enter third-party API keys into the app unless the optional AI analyst service is required for your deployment.

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
npm ci
npm run build
npm start
```

Then open:

```text
http://localhost:3000
```

For development mode:

```bash
npm ci
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Optional AI Analyst Service

Most features work without an API key. To enable the optional AI-assisted analyst service:

1. Copy `.env.example` to `.env`.
2. Add your Gemini API key to `GEMINI_API_KEY=`.
3. Keep `GEMINI_EXTRACTION_MODEL=gemini-3.5-flash` and `GEMINI_REPORT_MODEL=gemini-3.5-flash`, or override them for your deployment.
4. Restart the app.

Without this key, local parsing, ratios, scoring, watchlists, simulations, exports, and local memo generation remain available.

Legacy OpenAI and Anthropic deployments can still use `OPENAI_API_KEY` or `AI_ANALYST_API_KEY`, but Gemini is the primary v3.7 provider when configured.

## Recommended Workflow

1. Choose accounting standard, sector benchmark, and report language on Upload.
2. Upload a PDF, image, CSV, XLSX, or legacy XLS statement, or enter figures manually.
3. Review extracted, derived, and missing values in the Extraction Review panel.
4. Confirm source currency before accepting the company into analysis.
5. Open Decision Center for the recommendation and evidence trail.
6. Use Scenario Simulator, Benchmark Radar, Risk Timeline, and Watchlist for follow-up review.
7. Export the financial-only full report as PDF/PNG.

## Troubleshooting

`vite is not recognized`

Run `npm ci` first, or use the Windows launcher.

`Port already in use`

Close other FinScan terminals. The Windows launcher automatically tries nearby ports.

`PDF did not parse cleanly`

Use the Extraction Review panel to correct values. For low-quality scans, use Local + AI Analyst mode or upload CSV/XLS/XLSX when available.

`Optional AI analyst is disabled`

This is expected unless `GEMINI_API_KEY`, legacy `OPENAI_API_KEY`, or legacy `AI_ANALYST_API_KEY` is configured in `.env`.

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
