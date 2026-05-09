# Fintom — Personal Finance Companion

A privacy-first personal finance app for iOS, built to replace [Spendee](https://www.spendee.com) with deeper analytics, Google Sheets sync, and a personal data pipeline.

> **Status:** 🚧 In active development — Week 1 of 7. See [milestones](#roadmap).

---

## Why this exists

Existing personal finance apps — Spendee, Mint, YNAB — treat your data as theirs. You log thousands of transactions, then export a clunky CSV when you want to do real analysis.

Fintom inverts that:

- **Your phone is the source of truth** — SQLite, on-device, offline-first.
- **Your data flows to your tools** — Google Sheets for reporting, DuckDB for SQL analytics.
- **You own the pipeline** — every layer is open and inspectable.

Built as a [portfolio project](#portfolio-context) for analytics engineering work.

---

## Features (Phase 1)

- ✅ Multi-wallet transaction logging (Cash, Comdirect, Trade Republic, Monefit)
- ✅ 23 categories, fully customizable
- ✅ Tags (free-form labels for cards, merchants, contexts)
- ✅ Transfers between wallets (paired records)
- ✅ Recurring/scheduled transactions
- ✅ Monthly budget tracking with carry-forward
- ✅ Goal tracking (savings, debt payoff, FI/Coast FI milestones)
- ✅ Light theme, EUR primary, colorful category icons
- ✅ Tax-relevant flagging on transactions
- ✅ CSV import (Spendee export format)
- ✅ Search and filter transactions

## Roadmap

| Phase | Focus | Status |
|---|---|---|
| 1 | Core app — replace Spendee | 🚧 Week 1 of 7 |
| 2 | Google Sheets sync, tax export, recurring rules | Planned |
| 3 | Net worth dashboard, Coast FI tracker | Planned |
| 4 | DuckDB analytics layer | Planned |
| 5 | Apple Shortcuts integration for Apple Pay logging | Planned |

---

## Architecture
iPhone (React Native + Expo)
↓
SQLite (source of truth)
↓
Python sync layer
↙        ↘
DuckDB    Google Sheets
(analytics) (reporting)
↓
GitHub
(version control)

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for detail.

## Tech Stack

- **App:** React Native + Expo SDK 54 + TypeScript
- **DB (local):** SQLite via `expo-sqlite`
- **Routing:** Expo Router (file-based, type-safe)
- **State:** React Context + hooks
- **Charts:** Victory Native
- **Sync (Phase 2):** Python + Google Sheets API
- **Analytics (Phase 4):** DuckDB
- **CI/CD:** EAS Build (planned)

---

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system design and data flow
- [`docs/SCHEMA.md`](./docs/SCHEMA.md) — database schema and rationale
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — Architecture Decision Records (ADRs)
- [`CLAUDE.md`](./CLAUDE.md) — context for AI coding agents

---

## Portfolio Context

This project is a learning artifact for the path from **Data Analyst → Analytics Engineer**. It exercises:

- SQL schema design under real constraints (multi-currency, transfers, tax)
- TypeScript end-to-end (type-safe queries, type-safe routes)
- Data pipeline thinking (ELT: app → SQLite → Sheets/DuckDB)
- Documentation-first engineering (ADRs, schema docs, public README)
- AI-augmented development (Claude Code)
- Git workflow on a solo project (feature branches, PRs to self, semantic commits)

All code, schema, and decisions are public. **Real financial data is never committed.** Sample data in [`data/sample/`](./data/sample) is synthetic.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Author

**Hayder Ali**
Munich · Analytics Engineer
[github.com/hayderalijaan](https://github.com/hayderalijaan)
