# Deploying Rosetta

Two Vercel projects from this one repository: the backend (API) and the frontend. Allow about 20 minutes.

## 1. Firestore

Vercel can't keep files, so production data lives in Firestore.

1. In the [Firebase console](https://console.firebase.google.com), open your project, then **Build → Firestore Database → Create database** (production mode, region `asia-south1` for India).
2. **Project settings → Service accounts → Generate new private key**. Keep the downloaded JSON safe; never commit it.
3. From that JSON you need `project_id`, `client_email` and `private_key`.

No indexes to create: Rosetta only uses single-field queries.

Already have data in `backend/.data/store.json` from local testing? Copy it across once:

```bash
cd backend
npm run migrate              # dry run: shows what would be copied
npm run migrate -- --write   # copies; documents already in Firestore are kept
```

## 2. Backend on Vercel

1. **Add New → Project**, import the repository, set **Root Directory** to `backend`. Framework: Next.js.
2. Environment variables (Production):

| Variable | Value |
| --- | --- |
| `SESSION_SECRET` | A long random string, e.g. from `openssl rand -hex 32` |
| `FIREBASE_PROJECT_ID` · `FIREBASE_CLIENT_EMAIL` | From the service account JSON |
| `FIREBASE_PRIVATE_KEY` | The `private_key` value, pasted as is (with its `\n`s) |
| `GEMINI_API_KEY` | From [Google AI Studio](https://aistudio.google.com/apikey) |
| `FALLBACK_API_KEY` | From [Groq](https://console.groq.com/keys) |
| `GITHUB_TOKEN` | A fine-grained token with public repository read access |
| `SMTP_USER` · `SMTP_PASS` | Gmail address and an app password (optional; without it, no emails) |
| `ALLOWED_ORIGINS` | The frontend's URL, e.g. `https://rosetta.vercel.app` (fill in after step 3) |
| `APP_URL` | The same frontend URL |
| `CRON_SECRET` | Any long random string. Turns on the Monday weekly report email to each workspace owner and the daily run of the explain queue (`vercel.json`) |
| `GITHUB_APP_*` · `QSTASH_*` | The GitHub App, so pushes arrive by themselves: see step 4 |

3. Deploy, then open `https://<backend>/api/health`. `store` should say `firestore`, and `warnings` should be empty once step 3 is done.

Long requests (explaining, checking and rewriting a commit) are allowed up to 300 seconds, the Hobby plan's maximum.

## 3. Frontend on Vercel

1. **Add New → Project**, same repository, **Root Directory** `frontend`.
2. Environment variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_BASE` | The backend's URL, e.g. `https://rosetta-api.vercel.app` |
| `NEXT_PUBLIC_DEMO_REPO` | Same as the backend's `DEMO_REPO` (leave both unset to keep the default) |

3. Deploy. Then go back to the backend, set `ALLOWED_ORIGINS` and `APP_URL` to this URL, and redeploy the backend.

## 4. Create the GitHub App (pushes arrive by themselves, private repos too)

One GitHub App serves every workspace. A company's owner presses **Connect GitHub** once, installs it on their repos (private ones too), picks which to watch, and from then on every `git push` to a watched branch is explained and lands with the right manager. No webhook per repo, no personal token, no links to paste.

1. On GitHub: **Settings → Developer settings → GitHub Apps → New GitHub App** (to own it as an organisation: the organisation's **Settings → Developer settings → GitHub Apps**).
2. Fill in, with `<backend>` your backend's URL, e.g. `https://rosetta-api.vercel.app`:

| Field | Value |
| --- | --- |
| GitHub App name | e.g. `Rosetta for Acme`. Its URL name (shown after saving, `github.com/apps/<slug>`) is `GITHUB_APP_SLUG` |
| Homepage URL | The frontend's URL |
| Callback URL | `<backend>/api/github/link/callback` |
| Expire user authorization tokens | On (Rosetta uses the user token once and never stores it) |
| Request user authorization (OAuth) during installation | **Off** |
| Setup URL | `<backend>/api/github/callback` |
| Redirect on update | **On** |
| Webhook: Active | On |
| Webhook URL | `<backend>/api/webhooks/github-app` |
| Webhook secret | A long random string (`openssl rand -hex 32`). The same value goes in `GITHUB_APP_WEBHOOK_SECRET` |

3. **Permissions → Repository permissions**:
   - **Contents: Read-only** (commits and their diffs)
   - **Metadata: Read-only** (required by GitHub)
   - **Pull requests: Read-only** (pasted pull request links, review comments)
   - **Issues: Read-only**, optional: only for issue and pull request comments

   Nothing else, and no account permissions.
4. **Subscribe to events**: **Push**, **Commit comment**, **Issue comment** (and **Pull request review comment** if you want those comments too). Installation events (`installation`, `installation_repositories`) are always sent to GitHub Apps; there's nothing to tick.
5. **Where can this GitHub App be installed?** **Any account**, so other companies can install it. Create the App.
6. On the App's page: note the **App ID** and the **Client ID**, press **Generate a new client secret**, and under **Private keys** press **Generate a private key** (a `.pem` file downloads).
7. Backend environment variables, then redeploy:

| Variable | Value |
| --- | --- |
| `GITHUB_APP_ID` | The App ID |
| `GITHUB_APP_SLUG` | The URL name from `github.com/apps/<slug>` |
| `GITHUB_APP_PRIVATE_KEY` | The whole `.pem` file. On Vercel paste it as is; in a `.env` file put it on one line with `\n` for each line break |
| `GITHUB_APP_WEBHOOK_SECRET` | The webhook secret from step 2 |
| `GITHUB_APP_CLIENT_ID` · `GITHUB_APP_CLIENT_SECRET` | The Client ID and client secret. They let people **Link your GitHub account** (so their pushes are matched to them for sure), and let Rosetta confirm that whoever connects an installation can see it on GitHub. Without them, an installation is accepted only within an hour of being made |

8. In Rosetta, the owner opens **My team**, presses **Connect GitHub**, installs the App, and ticks the repos to watch. The GitHub panel (`GET /api/github/status`) shows the last event received and the explain queue.

**Branches.** Only each repo's default branch is explained, unless the owner lists branches for it (`PATCH /api/org { branches: { "owner/repo": ["main", "release"] } }`). Branch deletions and tags are ignored. Commits by bots (`…[bot]`), merge commits, `style:` commits and commits that only touch lockfiles are recorded as skipped and cost nothing.

**Whose push is it?** In order: the GitHub account someone linked (by id, then username), a GitHub username typed on their profile, their Rosetta email as the commit email, then a lead's assignment. Commits nobody matches wait under **Unassigned commits** (no AI spent) until a lead says whose they are; later pushes by that username or email go to that person directly.

**The explain queue.** Every pushed commit becomes one job (deduplicated, so a re-delivered push or the same commit on two branches is explained once). The webhook answers GitHub at once, then the queue runs:

- with **QStash** (optional, recommended on Vercel): set `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` from the [Upstash console](https://console.upstash.com/qstash) (and `PUBLIC_API_URL=<backend>` if the backend has several domains). Each push publishes one message to `POST /api/jobs/run`, checked with the `Upstash-Signature` header.
- without it, the webhook request runs the queue after answering (up to 300 s).
- either way, feed loads give the queue a turn (at most once a minute per workspace), and a daily Vercel cron (`GET /api/jobs/run`, 04:00 UTC, needs `CRON_SECRET`) runs whatever is left. Vercel Hobby allows only daily crons, which is why it isn't more often.

A failed commit is retried twice more (1 and 2 minutes later), then listed under failures with the reason. When the workspace's AI quota is used up, commits wait for the quota's reset instead of failing.

**Test it locally.** GitHub can't reach `localhost`, so relay the webhook with [smee.io](https://smee.io): open smee.io, press **Start a new channel**, set that URL as the Webhook URL of a separate test App, then run

```bash
npx smee-client --url https://smee.io/<channel> --target http://localhost:4000/api/webhooks/github-app
```

The Setup and Callback URLs are opened by your own browser, so a local test App can use `http://localhost:4000/api/github/callback` and `http://localhost:4000/api/github/link/callback`.

## 5. Older option: a webhook per repository

Kept for workspaces set up before the GitHub App (public repos only). In Rosetta, open **Organisation** (or **My team**), add the repositories to watch, then open **Get changes instantly with a GitHub webhook**. In each repository on GitHub: **Settings → Webhooks → Add webhook**, paste the payload URL and secret shown there, content type `application/json`, events: pushes, commit comments, issue comments. It feeds the same queue as the App.

Without either, **Check GitHub now** and the automatic 5-minute sync still bring changes in (public repos, or private ones once the App is connected).

## 6. A demo workspace for judges

```bash
cd backend
npm run demo -- https://<backend>
```

It creates "Acme Retail" with a CMO, a manager, an engineer, a senior dev and an intern, three explained changes, comments, a question and notifications, and prints every login. Emails use `@demo.rosetta.dev`, which Rosetta never sends mail to.

## The pitch commit

Log in as an engineer, paste this into **Explain a commit**, and press Explain:

```
https://github.com/vaibhav025/Rosetta-NSUT/commit/ca08ab4f0a3ecce71292c0be57ccfbd33ff6024e
```

It always explains the same way (reading, findings, writing, checking, then the card), as many times as you paste it, with no GitHub or AI calls, so it can't fail on stage. It lands in that engineer's manager's feed and bell. **Check accuracy** on it re-runs the real code checks against its diff and shows 95/100, a score recorded from real runs of the judge model (`npm run pitch:judge` re-checks it).

Each paste also creates a question thread on that change, already answered: the engineer's manager asks "Does a low score reach the client?" about the *Still unsure?* step, and the engineer's reply is stored with a version for every reader (plus Hinglish for manager, client and CMO). Log in as the manager and open **Questions** to show it: the answer is unread, written in manager words, with "Show what Arjun wrote" for the original. The engineer sees the same thread in technical words.

**The live exchange** (translations written in advance in `backend/src/lib/demo/pitch-script.ts`, no AI needed):

1. As the manager, open the pitch card, select the box *A second opinion scores it*, and tap the suggested question **"Will this extra checking slow down how fast updates reach me?"**. Rosetta routes it to the engineer: press **Ask Arjun**.
2. As the engineer, open **Questions**: the question reads in technical words. Reply with exactly (copy it, small typos are fine):

   > Only slightly. Each new commit gets one extra judgeExplanation() call, plus one rewrite if it scores under 75, so most cards are saved a few seconds later. Commits that were already explained, and the sample commits, aren't checked again, so they stay instant.

3. As the manager, open the thread: the answer reads *"Only by a few seconds. Each new update gets one extra check…"*, with **Show what Arjun wrote** for the original. Set the profile language to Hinglish to show *"Bas kuch seconds ka fark…"*.

Then log in as the CMO, open **This week**, and under **Weekly report email** press **Preview** (sample week on) to show the Monday email with every change's flowchart.

## Before the demo

- `GET /api/health` shows no warnings.
- The **AI use today** card (Organisation page) has quota left. Gemini's free tier allows about 20 explanations a day; the samples cost nothing.
- Explain one real commit end to end, so the badge shows a real score.
