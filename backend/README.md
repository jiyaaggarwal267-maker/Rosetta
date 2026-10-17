# Rosetta backend

API-only Next.js 16 app between the browser and GitHub, Gemini, Groq and Firestore. Every key lives here.

## Run

```bash
npm install
cp .env.example .env.local   # set SESSION_SECRET at least for `npm start`
npm run dev                  # http://localhost:4000
```

With no keys it still runs: the three demo commits are served from hand-written explanations, Ask Why answers them from written notes, and data goes to `.data/store.json`. Add keys as you need them:

| Key | Unlocks |
| --- | --- |
| `GITHUB_TOKEN` | Real commits beyond 60 requests an hour, repository sync |
| `GEMINI_API_KEY` | Explaining any commit (Gemini is kept for this, the big job) |
| `FALLBACK_API_KEY` | Groq or OpenRouter: the judge that checks explanations, Ask Why, rewriting messages for each role, personal notes, and explaining when Gemini is out |
| `GEMINI_DAILY_LIMIT` · `FALLBACK_DAILY_LIMIT` | Free-tier daily limits (20 and 1000). Rosetta stops calling a provider before it fails, and leads see the count |
| `FIREBASE_*` | Firestore instead of the local file (required on Vercel) |
| `SESSION_SECRET` | Signs login tokens; required in production |
| `ALLOWED_ORIGINS` | The frontend's origin(s) for CORS |
| `SMTP_USER` · `SMTP_PASS` | Email: invites, questions, replies, reports, new changes, password reset |
| `APP_URL` | The frontend's address, for links in emails |

## Before real customers: AI providers and their data

Explaining a change sends its diff, commit message and file names to the AI provider, and Ask Why, comments and messages are sent too (see `/privacy` on the frontend).

- **Gemini's unpaid tier** (Google AI Studio free key): under Google's Gemini API terms, Google uses content sent to unpaid services to improve its products, and human reviewers may read it. Google also requires paid services for apps offered to users in the EEA, UK and Switzerland. **Move to a paid Gemini tier before real customers connect private code.**
- **Groq**: by default it keeps no inference data, but may log inputs and outputs for up to 30 days for reliability and abuse checks. Turn on **Zero Data Retention** in Groq's Data Controls, and confirm in Groq's Services Agreement whether API data can be used for training.
- Update the Privacy Policy (`frontend/src/app/privacy/page.tsx`) whenever the providers or their terms change.

## Consent and personal data

- Signup and join require `acceptTerms: true` (else `400 { code: "terms_required" }`) and take an optional `marketingOptIn`. The user records `termsAcceptedAt`, `termsVersion`, `privacyVersion` and `marketingOptIn`. Versions live in `src/lib/legal.ts` and must match `POLICY_VERSION` in `frontend/src/lib/legal.ts`.
- `GET /api/me/export` returns everything about the signed-in user as JSON (never the password hash).
- `DELETE /api/me` (`{ confirm: "<email>", deleteWorkspace? }`) deletes the account as described in `src/lib/account.ts`: comments and messages stay as "Former member", reports move up, notifications, notes and reset links go. Owners hand the workspace over (`POST /api/org/owner`) or delete all of it.

## Commands

| Command | Does |
| --- | --- |
| `npm test` | API tests on an isolated server (throwaway file store, no AI, no email), plus unit tests for the verifier and message rewriting. Run `npm run build` first |
| `npm run demo -- <api-url>` | Creates a ready-to-show workspace (CMO, manager, engineer, senior dev, intern, three changes) and prints the logins |
| `npm run pitch:judge` | Re-scores the pitch commit's explanation with the real judge model (3 runs), to keep its recorded 95/100 honest after edits |
| `npm run migrate` | Copies `.data/store.json` into Firestore. Dry run by default; `-- --write` to copy, `-- --write --overwrite` to replace existing documents |

## How it's organised

- **Workspaces and a reporting tree.** A CMO or a manager creates the workspace (`/api/auth/signup`). Leads add people under them (`/api/team/members`), who join with an invite code (`/api/auth/join`). CMO → managers → engineers, senior devs, interns; clients sit under the manager who added them. The owner can change roles, move people and remove them.
- **Role = reading level.** Every response is written at the viewer's role. A manager can't switch to the intern version. Only the author of a change, while reviewing it, can preview all six versions.
- **Who sees what.** Engineers and interns see their own changes. A manager sees everyone below them. A CMO sees the whole workspace. Clients see reviewed changes of their manager's team. Cards outside that answer `404`.
- **Changes arrive by themselves.** Leads list repositories to watch (`PATCH /api/org`). New commits by members (matched by GitHub username) are explained through a GitHub webhook (`/api/webhooks/github?org=…`, signed with the workspace secret) or a sync (`POST /api/sync`, also run in the background when a feed is older than 5 minutes).
- **Every explanation is checked** (`src/lib/verify.ts`). Plain code rules (no code words for manager, client and CMO; no names that aren't in the diff; before and after must differ) plus a second model that scores accuracy, completeness, the flowchart and reader fit. Below 75 it's rewritten once with the problems as feedback, and the better one is kept; still below 75 is flagged "Needs engineer review". Each flowchart step stores the diff lines behind it (`evidence`), so any reader can see the proof.
- **Messages for each reader.** Comments, questions and replies are rewritten once for all six levels, plus Hinglish for manager, client and CMO. A rewrite that adds a number the original didn't have is thrown away (fact guard).
- **Notifications.** Questions, replies, reports, new changes, reviews and joins appear in the bell, as well as by email.

## Routes

Send `Authorization: Bearer <token>` once logged in. Errors are `{ code, message }`.

| Route | Who | Does |
| --- | --- | --- |
| `POST /api/auth/signup` | anyone | Create a workspace as `cmo` or `manager` (needs `acceptTerms: true`) |
| `POST /api/auth/login` | anyone | Email + password (rate limited) |
| `POST /api/auth/forgot` · `POST /api/auth/reset` | anyone | Email a reset link · set a new password with it |
| `GET /api/invites/:code` · `POST /api/auth/join` | invitee | Look up and accept an invite |
| `GET` · `PATCH /api/me` | signed in | Profile and preferences (not role) |
| `POST /api/me/password` | signed in | Change password (needs the current one) |
| `GET /api/team` | signed in | People, who you manage and can message, invite codes, repos, webhook |
| `POST /api/team/members` · `PATCH` · `DELETE /api/team/members/:id` | leads · owner | Add someone · edit (owner: role, manager) · remove (owner) |
| `PATCH /api/org` | leads | Watched repositories; name (owner only) |
| `POST /api/sync` | leads | Pull new commits and comments now |
| `POST /api/webhooks/github?org=` | GitHub | Pushes and comments, HMAC-verified |
| `GET /api/feed?author=&team=&status=&q=&risk=&repo=&days=&offset=&limit=` | signed in | Changes for this person at their level, searchable, paged |
| `GET /api/digest?week=` | leads, clients | The week on one page: headline, what changed, what needs attention, who shipped what |
| `POST /api/explain` | signed in | Explain a pasted link (NDJSON stream: start, finding, writing, checking, rewriting, card) |
| `GET /api/cards/:id` | can see it | The change at the viewer's level, with comments, verification and evidence |
| `POST /api/cards/:id/reexplain` | author, leads | Explain again from the code |
| `DELETE /api/cards/:id` | author, owner | Delete a change with its comments and notifications; sync won't re-add it, pasting the link again does |
| `POST /api/cards/:id/report` | readers | Report a possible mistake to the author |
| `GET /api/cards/:id/for-me` | can see it | A two-sentence personal note |
| `POST /api/cards/:id/comments` | engineers | Add a comment |
| `GET /api/comments?author=&team=` | signed in | Comments from people you can see |
| `POST /api/approve` | the author | Edit and mark reviewed |
| `POST /api/ask` | can see it | Answer from the code, or who to ask |
| `GET` · `POST /api/tickets` | signed in | Your questions · ask someone |
| `GET` · `POST` · `PATCH /api/tickets/:id` | participants | Read (marks read) · reply · close or reopen |
| `GET` · `POST /api/notifications` | signed in | The bell · mark read |
| `GET /api/usage` | leads | Today's AI calls against the daily limits |
| `POST /api/cards/:id/check` | can see it | Check accuracy: re-runs every check against the real diff, streamed step by step (NDJSON); the same card always gets the same score |
| `GET` · `POST /api/digest/report` | leads | Weekly report email: who it can cover · preview (and optionally send to the owner), real week or the sample week |
| `GET /api/cron/weekly` | Vercel cron | Monday 9:00 IST: emails each owner their engineers' week (needs `CRON_SECRET`) |
| `POST /api/demo/seed` | leads | Add a sample team with changes, comments, a question and notifications |
| `GET /api/me/export` | signed in | Download my data (JSON) |
| `DELETE /api/me` | signed in | Delete my account (type your email); owners must hand over or delete the workspace |
| `POST /api/org/owner` | owner | Hand the workspace to another CMO or manager |
| `GET /api/health` | anyone | What's configured (never values), and deploy warnings |

## Sample team

On an empty workspace, "Add a sample team" creates Arjun (engineer), Priya (senior dev) and Rahul (intern) under the manager (a CMO also gets a manager, Neha). Each can log in with the email shown and the password `rosetta-demo`, so every role's view can be tried.

## Known limits

- Rate limits are kept in memory, so each server instance counts on its own.
- Login tokens last 30 days and aren't revoked when a password changes.
- The webhook needs the server reachable from GitHub (deployed, or a tunnel).
- Sync explains at most 6 new commits per run to bound model calls.
- Free tiers: Gemini allows about 20 explanations a day; Groq allows 8,000 tokens a minute, so a busy minute waits a few seconds.
