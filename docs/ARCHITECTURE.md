# Fintom — Architecture

## Overview

Fintom is a privacy-first, offline-first personal finance app.
The guiding principle: **your phone is the source of truth.**
No cloud database, no subscription, no vendor lock-in.

---

## System Architecture
┌─────────────────────────────────────────────────────┐ │ iPhone 12 (iOS 26) │ │ │ │ ┌─────────────────────────────────────────────┐ │ │ │ React Native + Expo SDK 54 │ │ │ │ TypeScript + Expo Router │ │ │ │ │ │ │ │ Timeline │ Wallets │ Budgets │ Goals │ More │ │ │ └─────────────────┬────────────────────────────┘ │ │ │ reads/writes │ │ ┌─────────────────▼────────────────────────────┐ │ │ │ SQLite (expo-sqlite) │ │ │ │ Source of truth — offline first │ │ │ │ │ │ │ │ wallets │ transactions │ categories │ goals │ │ │ │ budgets │ recurring_rules │ tags │ snapshots│ │ │ └──────────────────────────────────────────────┘ │ │ │ iCloud backup │ │ ┌─────────────────▼────────────────────────────┐ │ │ │ iCloud Drive (backup only) │ │ │ │ fintom_backup_YYYY-MM-DD.db │ │ │ └──────────────────────────────────────────────┘ │ └─────────────────────────────────────────────────────┘ │ │ Phase 2: Python sync (twice monthly) ▼ ┌─────────────────────────────────────────────────────┐ │ Laptop (Mac) │ │ │ │ ┌──────────────────┐ ┌───────────────────────┐ │ │ │ Python sync │ │ DuckDB (Phase 4) │ │ │ │ script │───▶│ SQL analytics on │ │ │ │ (exports SQLite │ │ flat file exports │ │ │ │ → Sheets API) │ └───────────────────────┘ │ │ └────────┬─────────┘ │ └───────────┼─────────────────────────────────────────┘ │ Google Sheets API ▼ ┌─────────────────────────────────────────────────────┐ │ Google Sheets (reporting layer) │ │ │ │ 2026 tab │ Budget tab │ Net Worth tab │ CoastFI │ │ (mirrors existing sheet structure) │ └─────────────────────────────────────────────────────┘ │ │ git push ▼ ┌─────────────────────────────────────────────────────┐ │ GitHub (github.com/hayderalijaan/fintom) │ │ Code + docs + portfolio │ └─────────────────────────────────────────────────────┘
---

## Layer Responsibilities

### Layer 1: iOS App (Phase 1)
- **What:** React Native + Expo SDK 54, TypeScript, Expo Router
- **Responsibility:** All user interaction, data entry, visualization
- **Key decision:** Expo Router for file-based, type-safe navigation
- **Offline-first:** app works with zero internet connectivity

### Layer 2: SQLite — Source of Truth (Phase 1)
- **What:** On-device SQLite via `expo-sqlite`
- **Responsibility:** Primary database, all financial data lives here
- **Key decision:** Money stored as integers (cents) — never floats
- **Backup:** SQLite `.db` file copied to iCloud Drive on app launch

### Layer 3: Python Sync Layer (Phase 2)
- **What:** Python script run from Mac, twice monthly
- **Responsibility:** Export SQLite → transform → push to Google Sheets
- **Key decision:** App is source of truth, Sheets is read-only mirror
- **Trigger:** Manual (run script) or scheduled via Mac cron

### Layer 4: Google Sheets (Phase 2)
- **What:** Existing personal finance spreadsheet
- **Responsibility:** Reporting, net worth snapshots, tax table
- **Key decision:** Sheets receives data, never sends it back to app
- **Preserves:** Existing tab structure (2026, Budget, Net Worth, CoastFI)

### Layer 5: DuckDB (Phase 4)
- **What:** Analytical SQL engine on exported flat files
- **Responsibility:** Cross-year queries, trend analysis, ad-hoc analytics
- **Key decision:** Run from laptop, not embedded in app
- **Example queries:**
  - "What did I spend on Travel in every May since 2021?"
  - "What is my 6-month rolling average on Food & Drink?"
  - "How has my savings rate evolved year over year?"

---

## Data Flow

### Daily (Phase 1 only)
User logs transaction → SQLite write → Wallet balance recalculated → Monthly budget updated → Goal progress updated (if linked wallet) → iCloud backup on next app open

### Twice monthly (Phase 2+)
Run Python sync script on Mac → Read SQLite export → Transform to Sheets schema → Push to Google Sheets via API → Log sync timestamp

### Twice yearly (Phase 3+)
User enters net worth snapshot in app → Stored in net_worth_snapshots table → Synced to Net Worth tab in Sheets → Coast FI progress recalculated

---

## Key Architectural Decisions

See `docs/DECISIONS.md` for full ADRs. Summary:

| Decision | Choice | Alternative rejected |
|---|---|---|
| App framework | React Native + Expo | Swift + SwiftUI |
| Local DB | SQLite (expo-sqlite) | Realm, WatermelonDB |
| Money storage | Integer cents | Float euros |
| Cloud DB | None (by design) | Firebase, Supabase |
| Sync target | Google Sheets (existing) | Notion, Airtable |
| Analytics engine | DuckDB (Phase 4) | Pandas, Excel |
| Routing | Expo Router | React Navigation |

---

## Phase Roadmap

| Phase | Scope | Status |
|---|---|---|
| **1** | iOS app + SQLite + CSV import | 🚧 In progress |
| **2** | Google Sheets sync + tax export + recurring rules | Planned |
| **3** | Net worth dashboard + Coast FI tracker | Planned |
| **4** | DuckDB analytics layer | Planned |
| **5** | Apple Shortcuts for Apple Pay logging | Planned |

---

## Security Model

- **No backend server** — no attack surface for financial data
- **No cloud database** — data never leaves your devices
- **Face ID lock** — app locks on background
- **iCloud backup** — encrypted by Apple's iCloud encryption
- **Git hygiene** — `.db` files, real CSVs, personal data gitignored
- **Sample data only** — synthetic transactions in public repo

---

## Portfolio Notes

This architecture is intentionally designed as a
**personal-scale ELT pipeline:**
Extract: SQLite (app) → Python export Transform: Python script → Sheets-compatible schema Load: Google Sheets API → existing spreadsheet
Analytics: DuckDB queries on exported flat files
The same pattern — ELT + analytical query layer —
is used at scale in modern data stacks
(Fivetran → Snowflake → dbt → BI tool).
Fintom is that pattern at personal scale, built from scratch.
