# /scripts — One-Off & Utility Scripts

This folder contains **non-production scripts** used for data migrations, fixes, audits, and testing.
These files are **NOT part of the running application**. They were written to solve specific one-time problems.

> ⚠️ Do not import anything from this folder in the main `/src` application code.

---

## Folder Structure

| Folder | Purpose |
|---|---|
| `migrations/` | Data migration scripts — syncing, importing, and transforming database records |
| `fixes/` | One-time data fix scripts — correcting bad data, merging duplicates, zeroing balances |
| `audits/` | Scripts for checking data integrity — duplicate detection, payment mismatches, etc. |
| `reports/` | Scripts that generate HTML/JSON reports from raw data |
| `scratch/` | Numbered scripts (`script.mjs`–`script8.mjs`) and other experimental/temp files |
| `tests/` | Ad-hoc test scripts for individual libraries (OCR, PDF parsing, Puppeteer, Gemini) |

---

## Running a Script

Most scripts use Supabase directly via env vars. Make sure `.env.local` is set up before running.

```bash
# Example
node scripts/audits/check_duplicate_products.mjs
```
