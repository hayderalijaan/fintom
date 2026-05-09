# Sample Data

This folder contains **synthetic** transaction data for development, testing, and the public repo. None of these numbers reflect real finances.

Real CSV exports go in `data/personal/` (gitignored).

## Contents

- `sample_transactions.csv` (coming Week 1 Day 2) — synthetic Spendee-format export
- `sample_seed.sql` (coming Week 2) — seed data for local DB

## Why a separate sample folder?

The app's CSV import will be tested against this synthetic data so the import logic works for any user, not just for the project author.
