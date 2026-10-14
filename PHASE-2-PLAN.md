# Phase 2 — Remediation Plan: Matokeo Platform

**Date:** 2026-10-14 · **Branch:** `security-audit` (all work happens here; `main` untouched until you approve)

## Decisions from you (Phase 1 questions)

| Question | Your answer | Implementation |
|---|---|---|
| Authentication | Firebase Auth | Email/password via `firebase-auth-compat.js`, session managed by Firebase (`onAuthStateChanged`) |
| Grading scale | "Wataset wenyewe" (teachers set it) | Grade boundaries become **editable in Settings** (A/B/C/D minimums). Defaults keep current scale: A≥75, B≥60, C≥45, D≥30, F<30 |
| Average | "Vyote hivyo watafanya wenyewe" | Average mode becomes **a setting**: "divide by all 6 subjects" (default, fairer) or "divide by scored subjects only" (current behavior) |
| Roles | Admin + Teacher | Admin: full control (delete, settings, users). Teacher: add/edit scores, import, export, reports — **no delete, no settings** |
| Firebase config | Provided | Embedded as default (web configs are public by design); still overridable in Settings |

## Stated assumption (flag if wrong)

Roles only make sense if Admin and Teacher work on **one shared school dataset**. So: the first person to sign up **creates a school** and becomes its Admin, receiving a **join code**. Teachers sign up with that code and share the same students. Each Firebase project can host multiple schools (each school's data is isolated by rules). If you actually wanted per-teacher private data, tell me and I will change the data path back.

## Work items, ranked

### CRITICAL

| ID | Finding | Fix | Regression risk |
|---|---|---|---|
| C1 | Auth fully client-side, bypassable via DevTools | Replace with Firebase Auth. Session from `onAuthStateChanged`, no more `matokeo_session` localStorage | Login flow changes (email instead of username). Old local accounts **cannot** be migrated — password hashes are unrecoverable. Mitigation: Settings gets "Import old local data" that scans old `localStorage` keys into the new school |
| C2 | djb2/sdbm "hashing" | Removed entirely — Firebase Auth stores passwords server-side | None (old accounts dead, see C1) |
| C3+C4 | No Firebase Auth; no Firestore rules → anyone with config reads/writes everything | New `firestore.rules` file: users can only touch their school's data; role checks enforced **in rules**, not just UI. You must paste rules into Firebase Console (or Firebase CLI). Exact instructions in final report | If rules deployed before app update, old localStorage-only users lose cloud access — acceptable: they were unauthenticated anyway |
| C5 | `zarem/zarem` in README | README rewritten: no credentials, correct setup instructions | None |
| C6 | No multi-tenant isolation | Data moves from `users/{uid}/data` to `schools/{schoolId}/students`; rules tie access to `userDoc().schoolId` | Existing cloud data (if any) under old path needs manual export/import; document |

### HIGH

| ID | Finding | Fix | Regression risk |
|---|---|---|---|
| H1 | Session in localStorage | Gone with C1 | None |
| H2 | CDN scripts without SRI | Add `integrity="sha384-…"` + `crossorigin` to all 6 CDN scripts (hashes computed from actual files, verified by browser acceptance) | If a CDN file updates at same URL, browser blocks it — pinned versions already prevent this |
| H3 | No RBAC | `role` field in `users/{uid}`; admin-only UI sections hidden for teachers **and** rules reject their writes (`delete` on students, update on school settings, role changes) | Teacher who needs to delete a student must ask an admin — intended |
| H4 | Backup import silently overwrites | Import now shows a **preview with counts** (to add / to update) and requires explicit confirmation before any write | None |
| H5 | No CSP | `<meta http-equiv="Content-Security-Policy">` allowing only needed origins. Note: `'unsafe-inline'` remains required for scripts because the app uses inline `onclick` handlers — documented honestly; still blocks all non-allowlisted external scripts | If a future CDN origin is added without updating CSP, script is blocked — visible in console |

### MEDIUM

| ID | Finding | Fix | Regression risk |
|---|---|---|---|
| M1 | Import converts invalid scores to `null` silently | Import now **rejects bad rows** with per-row, per-subject error list in preview; nothing imports until errors fixed or rows removed | Files that "worked" before (with silent data loss) now show errors — intended |
| M2 | Positions ignore ties | Competition ranking (1,2,2,4) in `computePositions` — standard Tanzanian practice | Positions shift vs old behavior; PDFs and tables change consistently |
| M3 | Pass rate (≥40) inconsistent with grades (F<30) | Pass = "grade D or above" i.e. `avg ≥ D-min` from the configurable boundaries — always consistent with grading | Dashboard pass % changes |
| M4 | Average inflated for incomplete records | Default divides by all 6 subjects (missing = 0), switchable in Settings (M-answer: teachers choose) | Averages change; consistent everywhere (tables, PDFs, charts) |
| M5 | Cloud save failures silent | Sync badge shows error state + toast + retry button; saves fall back to local with dirty flag | None |
| M6 | Import ID collisions / weak duplicate handling | IDs from `crypto.randomUUID()`; duplicates listed in preview with Skip/Update choice | None |

### LOW

| ID | Fix |
|---|---|
| L1 | Extract pure logic to `js/core.js` (calculations, validation, import parsing); auth → `js/auth.js`; cloud → `js/cloud.js`. UI stays in `index.html` — no framework added |
| L2 | Zero-dependency test runner `tests/run-tests.js` (Node) covering `grade`, `avg`, `totalMarks`, `computePositions` (incl. ties), `validateScores`, import row parsing, backup merge |
| L3 | Inactivity logout kept, but labeled as convenience (already documented as not a security control) |
| L4 | Placeholder icon replaced with inline SVG data-URI |

## Files

| File | Action |
|---|---|
| `index.html` | Edited: CSP, CDN+SRI, auth forms (email), roles-aware UI, settings additions (grading, avg mode, join code, users), import/backup rewrite |
| `js/core.js` | **New** — pure functions, Node-testable |
| `js/auth.js` | **New** — Firebase Auth |
| `js/cloud.js` | **New** — Firestore data layer + offline cache + sync |
| `firestore.rules` | **New** — deployable security rules |
| `tests/run-tests.js` | **New** — zero-dep runner |
| `README.md` | Rewritten — no credentials, setup + deploy instructions |

## What I need from you later (not blocking implementation)

1. **Approval to test against your real Firebase project** — Phase 4 live tests create 1 test user + clearly-labeled test students (e.g. `TEST-DELETE-ME`). You can also give me a throwaway project instead.
2. **Deploy Firestore rules** (I give exact Console steps; I cannot do it without your Firebase account).
3. **Approval to merge to `main` / deploy** — nothing goes live without your go-ahead.
