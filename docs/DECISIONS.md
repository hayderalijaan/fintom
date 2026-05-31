# Fintom — Architecture Decision Records (ADRs)

ADRs document *why* each major technical decision was made.
This is the most valuable document for future maintainers and portfolio reviewers.

Format: Status · Context · Decision · Consequences

---

## ADR-001: React Native + Expo over Swift + SwiftUI

**Status:** Accepted
**Date:** 2026-05

**Context:**
Building a personal iOS finance app. Options considered:
- Swift + SwiftUI: native iOS, best performance, Apple-maintained
- React Native + Expo: JavaScript/TypeScript, cross-platform capable

**Decision:**
React Native + Expo SDK 54 with TypeScript.

**Reasons:**
1. TypeScript skills transfer directly to Analytics Engineering work
   (dbt, modern data tools increasingly use TypeScript)
2. React Native has a larger training corpus for AI coding agents,
   meaning Claude Code produces higher-quality output
3. Expo simplifies iOS deployment significantly for a solo developer
4. Cross-platform optionality (Android, web) preserved if needed
5. File-based routing (Expo Router) produces clean, navigable code

**Consequences:**
- App is not pixel-perfect native iOS (acceptable for personal use)
- Requires JavaScript/TypeScript knowledge (intentional learning goal)
- Some native iOS features require additional bridging
- Cannot use SwiftUI-exclusive components directly

---

## ADR-002: SQLite over Cloud Database

**Status:** Accepted
**Date:** 2026-05

**Context:**
Personal finance app needs a database. Options considered:
- Firebase / Supabase: cloud-hosted, real-time sync
- Realm: mobile-first, offline-capable, proprietary
- WatermelonDB: React Native optimized, complex setup
- SQLite (expo-sqlite): on-device, SQL standard, simple

**Decision:**
SQLite via `expo-sqlite`.

**Reasons:**
1. Personal finance data should not live on third-party servers
2. Zero latency — all reads/writes are local
3. Works fully offline — no connectivity required
4. Standard SQL — skills directly transfer to data engineering work
5. DuckDB (Phase 4) can query SQLite exports directly
6. No ongoing cost (Firebase free tier has limits)
7. expo-sqlite is officially maintained by Expo

**Consequences:**
- No multi-device sync without additional engineering (acceptable)
- Backup requires explicit implementation (iCloud copy of .db file)
- No real-time collaboration (not needed for personal app)

---

## ADR-003: Money Stored as Integer Cents

**Status:** Accepted
**Date:** 2026-05

**Context:**
Storing monetary values in a database.

**Decision:**
All monetary values stored as INTEGER representing euro cents.
€12.50 → 1250. €-80.34 → -8034.

**Reasons:**
1. Floating point arithmetic is imprecise:
   `0.1 + 0.2 === 0.30000000000000004` in JavaScript
2. Integer arithmetic is exact — critical for financial data
3. Standard practice in financial systems (Stripe, Square, etc.)
4. SQLite INTEGER type handles amounts up to €92 trillion

**Consequences:**
- All display logic must divide by 100: `cents / 100`
- All input logic must multiply by 100: `parseFloat(input) * 100`
- A `formatEur()` utility handles all display formatting
- German locale formatting: 1250 → "12,50 €" (comma decimal)

---

## ADR-004: App is Source of Truth, Sheets is Mirror

**Status:** Accepted
**Date:** 2026-05

**Context:**
The project owner has an existing Google Sheets financial tracker
with 5+ years of data across multiple tabs (2026, Budget, Net Worth,
CoastFI, Archive, Trading, Tax).

Two options:
- Sheets as source of truth: app reads from Sheets
- App as source of truth: app writes to Sheets

**Decision:**
App (SQLite) is the source of truth. Google Sheets is a read-only
reporting mirror, updated by Python sync script.

**Reasons:**
1. Sheets has API rate limits (60 reads/min) — unsuitable for
   real-time transaction logging
2. Offline-first requirement: app must work without internet
3. Sheets has no referential integrity — data corruption risk
4. Python sync → Sheets is a one-way push: simpler, no conflicts
5. Existing Sheets structure preserved — no migration needed

**Consequences:**
- Google Sheets data is always slightly behind app (sync lag)
- Manual sync required (twice monthly — matches existing habit)
- Python script must handle Sheets schema mapping
- Sheets tabs remain unchanged for existing formulas/charts

---

## ADR-005: Expo SDK 54 over SDK 55/56

**Status:** Accepted
**Date:** 2026-05

**Context:**
Project started during Expo SDK 55 transition period.
SDK 55 Expo Go app stuck in Apple App Store review (May 2026).
SDK 56 in beta.

**Decision:**
Use Expo SDK 54 (stable).

**Reasons:**
1. Expo Go on App Store supports SDK 54 — works for development
2. SDK 55 Expo Go pending Apple approval — uncertain timeline
3. SDK 56 is beta — not appropriate for a learning project
4. SDK 54 is battle-tested with large community and documentation
5. Upgrade path is straightforward: `npx expo install expo@^55`

**Consequences:**
- Missing some SDK 55/56 features (Expo UI stable components)
- Will need upgrade in future — low effort
- Development workflow works immediately via Expo Go

---

## ADR-006: Public GitHub Repo with Strict Data Gitignore

**Status:** Accepted
**Date:** 2026-05

**Context:**
Project is both a personal tool and a portfolio piece.
Contains real personal financial data (CSV exports, SQLite DB).

**Decision:**
Public repo with strict `.gitignore` rules separating
personal data from sample/synthetic data.

**Reasons:**
1. Portfolio visibility: recruiters can see full commit history,
   ADRs, schema design, documentation quality
2. `.gitignore` prevents accidental data exposure
3. `data/sample/` contains synthetic data for public viewers
4. `data/personal/` is gitignored — real exports stay local
5. No `.db` files ever committed (SQLite database)

**Consequences:**
- Real financial data requires developer discipline to never
  manually `git add` personal data files
- Sample data must be maintained to be realistic but fake
- All screenshots in docs must use synthetic data

---

## ADR-007: No `npm audit fix --force` on Expo Projects

**Status:** Accepted
**Date:** 2026-05

**Context:**
npm audit reports vulnerabilities in Expo project dependencies.
`npm audit fix --force` can resolve these but bypasses Expo's
curated dependency version matrix.

**Decision:**
Never use `npm audit fix --force`. Use Expo-aware commands instead:
- `npx expo install --check` to identify mismatches
- `npx expo install --fix` to resolve them
- `npx expo-doctor` to validate overall project health

**Reasons:**
1. Expo carefully pins dependency versions for compatibility
2. `--force` can upgrade transitive deps to versions Expo hasn't tested
3. Most npm audit warnings in Expo projects are in build-time deps
   not accessible to end users
4. `npx expo-doctor` is the authoritative health check

**Consequences:**
- Some npm audit warnings remain — acceptable
- Project health measured by `expo-doctor` (17/17 target)

---

## ADR-008: Tags as Single Free-Form Table

**Status:** Accepted
**Date:** 2026-05

**Context:**
Spendee uses "Labels" to tag transactions with free-form strings.
Analysis of export data showed two main use cases:
- Payment method tracking: "💳 Master", "💳 Amex"
- Merchant/service tracking: "Pro-kitchen iQ"

Options:
- Separate tables: `payment_methods` + `merchants`
- Single `tags` table: free-form, user-managed

**Decision:**
Single `tags` table. Free-form, user-created, many-to-many
with transactions via `transaction_tags` junction table.

**Reasons:**
1. Matches existing Spendee mental model — no re-learning
2. Simpler schema — fewer tables, fewer joins
3. User can create any tag they want without app updates
4. Seed with "💳 Master" and "💳 Amex" to preserve existing usage
5. Can always split into typed tables in Phase 2 if needed

**Consequences:**
- No enforcement of tag "type" (card vs merchant vs context)
- User responsible for tag naming consistency
- Migration to typed tags possible later without data loss
