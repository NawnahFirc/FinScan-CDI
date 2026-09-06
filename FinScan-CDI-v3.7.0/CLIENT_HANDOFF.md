# Client Handoff

Package name: FinScan Corporate Decision Intelligence v3.7

This archive contains the source code, lockfile, launcher scripts, OCR language data, parser tests, and sample statements needed to run the application.

FinScan v3.7 starts with an empty analysis workspace on each app launch. Previously reviewed statements remain available only through the manual cached-statement restore flow on the Upload page.

Gemini is the primary AI-assisted parser and report provider when `GEMINI_API_KEY` is configured.

Excluded from the client archive:

- `node_modules/`
- `dist/`
- `legacy/`
- `.claude/`
- empty or generated working folders

The client can run the application with `RUN_WINDOWS.bat` on Windows or `RUN_MAC_LINUX.sh` on macOS/Linux. The full setup instructions are in `README.md`.
