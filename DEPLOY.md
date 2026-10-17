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
| `CRON_SECRET` | Any long random string. Turns on the Monday weekly report email to each workspace owner (`vercel.json`) |

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

## 4. GitHub webhook (changes arrive instantly)

In Rosetta, open **Organisation** (or **My team**), add the repositories to watch, then open **Get changes instantly with a GitHub webhook**. In each repository on GitHub: **Settings → Webhooks → Add webhook**, paste the payload URL and secret shown there, content type `application/json`, events: pushes, commit comments, issue comments.

Without a webhook, **Check GitHub now** and the automatic 5-minute sync still bring changes in.

## 5. A demo workspace for judges

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
