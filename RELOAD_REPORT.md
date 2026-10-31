# FinScan 3.7.0 verification and deployment notes

The reload improves document ingestion, review, calculations and deployment packaging. It does not guarantee error-free OCR or turn screening scores into independently validated credit decisions.

## Parsing and review

- Scanned PDFs and images use locally bundled French/English OCR, table geometry, line removal and numeric-cell refinement. No OCR CDN is required after the app is built.
- Three-decimal dinar amounts, signed expenses and opposite year orders across statements are preserved. Ambiguous digits remain blank with page evidence and a warning.
- CSV supports comma, semicolon, tab and pipe delimiters, quoted fields and Excel separator declarations. XLSX reads all worksheets and merges compatible statements. Convert legacy XLS files to XLSX first.
- Reporting years are ordered chronologically. Missing values remain missing; explicit zero is retained. Review edits recalculate dependent figures. Source files can be opened from review.
- Incomplete figures, ambiguous currency or an inconsistent balance sheet prevent a commercial recommendation. Review each source and confirm currency before accepting a scan. Confidence is an OCR estimate, not an accuracy guarantee.

## Calculations

Cash ratio uses cash/current liabilities. Gross margin index uses prior/current gross margins. Signed depreciation is normalized to an expense magnitude for the depreciation index. Missing model inputs withhold the composite Beneish score. Arbitrary supplier-payables and financial-debt proxies were removed. Restoring a cached company does not apply currency conversion twice.

These formulas were checked against the variable definitions in [Cassell et al., Appendix A](https://gattonweb.uky.edu/FACULTY/PAYNE/acc490/Graduate%20Student%20Articles/Cassell%20et%20al.%20Does%20Auditor%20Tenure%20Impact%20the%20Effectiveness%20of%20Auditors%E2%80%99%20Response%20to%20Fraud%20Risk.pdf). Screening thresholds and exposure policies remain heuristics, and fixed assets may need review to isolate net PPE for forensic models.

## Run and verify

Use Node 22.12+ (Node 24 was used locally):

```sh
npm ci
npm run check
npm start
```

Open http://localhost:3000. `check` builds before testing because the HTTP integration tests verify the actual production files and OCR assets. `npm run dev` runs Vite on 5173 with API proxy to 3000.

For a Node hosting service, build with `npm ci && npm run build` and start with `npm start`. The server honors the host's PORT. Keep the browser backend URL empty for same-origin deployment. If using a separate backend, set VITE_BACKEND_URL at build time and explicitly configure its CORS_ORIGINS.

Docker packaging uses a multi-stage Node 24 build, a non-root runtime and a health check at `/api/health`. Local Docker execution and live paid AI calls require separate validation in the destination environment.

API keys belong in hosting environment variables, never VITE variables or committed files. Local Only works without keys. If enabling paid AI extraction on an internet-facing deployment, restrict access through your hosting authentication gateway; this app does not implement user accounts. Configure TRUST_PROXY only to match the actual proxy topology.

## Sample document findings

Both supplied PDFs are scans. Regression checks cover their statement totals, year alignment and cash-flow columns. The current revenue cell in MZABI is blank in the supplied statement; it remains missing. Some damaged MZABI numeric cells require source review. GEMS uses dinar amounts and Tunisian accounting context, so inferred TND requires confirmation. Exact digits can differ between OCR runs and browser rendering; the review step remains necessary.

Embedded FX rates are a dated snapshot, not live exchange rates. Source amounts and conversion metadata are retained. Reports are screening aids and depend on the reviewed input.

Private source PDFs and extracted OCR fixtures are local verification material and should not be published with the application.
