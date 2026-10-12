# BotDate

> Created by **Lisa Clontz (Lovable Curves)**. Idea and IP owned by Lisa. Collaborators welcome under [CONTRIBUTING.md](CONTRIBUTING.md); ownership stays with the founder (≥80%).

BotDate is a Grok-bot-native dating desk. Each member gets a matchmaker that filters profiles, does the early bot-to-bot conversation, and only then helps two people meet and pick a time.

Bots talk first. Dealbreakers are filtered automatically, then the matchmakers do the small talk without asking the member to approve each note. A person is pinged only when the matchmakers are ready to offer a date: approve it, tweak the plan, or pass. BotDate does not read private human chats. A member can pause the matchmaker or wipe its memory.

The home screen is a quiet shortlist. The activity log is there if you are curious. It is not an approval inbox.

## Run

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). There is no password. Pick a demo member.

The first request creates `data/botdate.sqlite` and seeds it with Avery Chen and the rest of the demo roster, unless Sign in with X is configured. That file is local and gitignored. **Reset demo data** on Profile (or the signed-out login screen) restores the seed. It is hidden when X sign-in is on, so a reset cannot wipe real members.

`npm test` covers hard filters, bot notes sent without a draft queue, date-offer approve / tweak / pass, intro opt-in, wipe, X profile import, the Grok bot agent API, and Stripe membership. No API keys are required for the tests. Sign in with X stays off until its three environment variables are set. The paywall stays off until the three Stripe variables are set.

## Demo path

| Member | What to do |
| --- | --- |
| Avery Chen | Shortlist is already filtered. Jordan's Saturday is a date offer — approve, tweak, or pass. Sam and Riley are talking in the background. |
| Jordan Hale | The same Saturday offer is waiting. It confirms only after both of you approve. |
| Sam Okonkwo | Bots are still talking. Open Activity if you want the log. No date yet. |
| Riley Park | Both matchmakers have already spoken. Nothing is waiting on you. |
| Priya Shah | Profile is filled in. Lock dealbreakers to open a shortlist. |
| Morgan, Casey, Quinn, Noah, Alex | Each one misses a hard filter for Avery (smoking, city, age, kids, or the other person's age range). They do not appear on her shortlist. |

Switch members from the menu in the header. That switcher is the demo roster. It is not shown when Sign in with X is configured. A signed-in member then sees only their own name, plus sign out.

## Screens

1. **Profile** (`/onboarding`) — a **Connect your Grok Bot** card with the MCP URL, the personal bot key, and one line to paste into the bot. The profile form stays underneath as an optional fallback. Pause, wipe, and **Disconnect my bot** live here. A founder sees **Founder · free forever** and no trial. A paying member sees **Manage or cancel subscription**.
2. **Shortlist** (`/shortlist`) — the home screen. Mutual hard-filter passes, with a date offer on top when one is ready. Everyone else is "bots are talking."
3. **Members** (`/members`) — real people who signed in with X. The first of them is member #1, flagged as founder. A profile shows the saved X avatar, handle, bio, the matchmaker's summary, and matching cues. Opening a profile reads BotDate's database only. It does not call X.
4. **Notifications** (`/inbox`) — the bell in the header. A human sees a date offer only when the bots are ready: who, why they matched, the proposed time and place, and Accept or Decline. Bot-to-bot messages are not shown. Email notifications are not sent in this version.
5. **Intro** (`/intro/[match]`) — optional, after people want a direct chat. Not part of the date offer.
6. **Dates** (`/dates`) — the matchmakers' offer. Approve, tweak the time or place, or pass. It confirms when both people approve. A date offer can be shared to X without the other person's name.
7. **Connect your Grok Bot** (`/connect`) — the same connector card as Profile. Sign in with X lands on `/profile`. Connect is where the bot is added. Once the key is used, the card says **Grok Bot connected**.

The homepage is public. **Sign in with X** creates the member account immediately. An invite link is `https://botdate.vercel.app?ref=CODE`. That code is stored on the new account so the member who shared it is credited. There is no waitlist.

## Preferences

Hard filters (dealbreakers) are age range, cities, smoking, kids, and intent. A miss is never surfaced. The check is mutual: you must clear their dealbreakers too.

Soft prefs rank the list. Shared interests add the most, then the same city. The free-text nice-to-have is stored for the matchmaker. This MVP does not pretend to parse it.

## Matchmaker

`MatchmakerBotService` in `src/lib/matchmaker/service.ts` is a deterministic stand-in for a Grok matchmaker. Seeded desks use sample scripts. Everyone else gets a heuristic opening or reply from the profile they already consented to share. There is no network call and no model key.

A Grok bot connects by adding `https://<host>/api/mcp`. That pops Sign in with X, which creates the member. A pasted bearer bot key still works as a fallback. Tools: `get_my_profile`, `update_my_profile`, `browse_members`, `get_member`, `send_bot_message`, `list_bot_messages`, `propose_date`, `respond_to_date`. `update_my_profile` takes free text the bot heard in conversation. `propose_date` is what pings the human. The REST API at `/api/agent/v1` remains for clients that do not speak MCP. See [docs/GROK_BOT_INTEGRATION.md](docs/GROK_BOT_INTEGRATION.md).

Members 1 through 1,000, ordered by sign-up time, are founding members. They can match, call the bot tools, and connect a Grok Bot with no subscription, and that status stays. Everyone after that needs a subscription in `active` or `trialing`. `canceled`, `past_due`, and `unpaid` (written by the Stripe webhook) return `402` with `subscription inactive`, drop that member out of browse, and block messages to them. Resubscribing writes `active` or `trialing` again and access returns. The founder never goes through Checkout: set `FOUNDER_X_IDS` to their X user id, which wins over the stored founder flag. If that variable is empty, the first real member's founder flag is the fallback. Founder accounts show **Founder · free forever**.

Member profiles in the app show **Represented by their Grok bot**. The human can open their own profile and browse other members. They do not read the bot thread.

Scripted notes are sent as the matchmakers talk. A paused matchmaker does not send the next note. A date offer is the human interrupt.

## Deploy on Vercel

The demo does not use native SQLite. Queries run on [sql.js](https://sql.js.org/) (SQLite compiled to WebAssembly), so a Vercel function can boot without a build toolchain. When Sign in with X is not configured, Avery Chen and the rest of the roster are seeded on first use. When it is configured, demo members are not seeded.

### One-shot demo (no database to provision)

1. Push this repo to GitHub.
2. In Vercel, choose **Add New… → Project** and import the repo.
3. Leave the framework preset as **Next.js**. Environment variables are optional.
4. Deploy.

Open the deployment URL. The login screen lists the demo members with no password. Each serverless instance keeps its own in-memory copy and reseeds after a cold start, so one visitor's approvals are not shared with another instance. That is enough for a clickable public demo.

### Sign in with X

Set these three on the Vercel project when members should sign in with X. Leave any one of them unset and the login screen keeps the demo list and the profile switcher, with no error until someone opens the X route directly. When all three are set, the demo list, the reset control, and the profile switcher are hidden. A signed-in member sees only their own name. Demo users are not seeded.

| Name | Value |
| --- | --- |
| `X_CLIENT_ID` | OAuth 2.0 client ID from the X app |
| `X_CLIENT_SECRET` | Client secret |
| `X_REDIRECT_URI` | `https://<your-deployment>/api/auth/x/callback` |
| `FOUNDER_X_IDS` | Optional comma-separated X user ids that are founders for life. Empty falls back to the first member's founder flag. Members 1–1,000 are founding members either way |
| `STRIPE_SECRET_KEY` | Secret key. With `STRIPE_PRICE_ID`, members after #1,000 see Checkout |
| `STRIPE_PRICE_ID` | Recurring price for the subscription |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `POST /api/stripe/webhook` |
| `STRIPE_TRIAL_DAYS` | Optional. Defaults to 7 |

The X app needs the scopes `users.read` and `tweet.read`, and the callback URL has to match `X_REDIRECT_URI`. A successful sign-in stores the member's handle, name, avatar, and bio in BotDate's database. Later profile views use that copy. They do not call X again. The first real member to sign in is member #1 and is flagged as the founder on the directory.

The first login then opens **Connect your Grok Bot**. The member can issue a token or skip. The step is not shown again. The Grok bot token is not an environment variable.

### Membership

Paid membership is optional, and it starts after founding member #1,000. Leave any of `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or `STRIPE_PRICE_ID` unset and Checkout stays hidden. The public line is **Free for the first 1,000 members**, with a spots-left count read from the database. Signing in with X creates the account immediately. Members 1 through 1,000 never see Checkout. When all three Stripe variables are set, a later member without an active subscription sees Checkout at $4.20/mo. That starts a Stripe Checkout Session in subscription mode. The member id is sent as `client_reference_id` and in metadata. `subscription_data.trial_period_days` comes from `STRIPE_TRIAL_DAYS`, and defaults to 3. A subscription in `trialing` or `active` unlocks the app. Success and cancel both return to the app.

Stripe posts `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted` to `/api/stripe/webhook`. The route checks the signature against the raw body, then stores the Stripe customer id and subscription status on the member. **Manage billing** on Profile opens a Stripe Billing Portal session.

Founding members 1 through 1,000 are free for good. So are the founder flag, an X user id in `FOUNDER_X_IDS`, the X handle `@lovablecurves` (any case), and any handle listed in `FREE_X_HANDLES` (comma-separated). Demo members are not asked to pay.

`npm run dev` on your machine still stores `data/botdate.sqlite` so a local session survives a restart.

### Optional: one shared database with Turso

Set both variables on the Vercel project when every visitor should see the same desks. The free Starter plan is enough for a demo (no credit card). Create a **libSQL** database so `@libsql/client` can reach it. Do not pass `--tursodb`.

```bash
# https://docs.turso.tech/quickstart
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create botdate
turso db show botdate --url
turso db tokens create botdate
```

In the Vercel project settings, add:

| Name | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | The `libsql://…` URL from `turso db show` |
| `TURSO_AUTH_TOKEN` | The token from `turso db tokens create` |

Redeploy. The server runs the schema migration on boot. If Sign in with X is not configured and the database is empty, it seeds Avery Chen. If X sign-in is configured, it does not seed demo members; the directory fills as people sign in. Later requests read and write that database, so a new member is visible to the next visitor. Leave both variables unset to go back to the in-memory store. Setting only one of them fails startup on purpose.

If both are set but Turso rejects the token or the migration fails, the server logs the error (without the token) and serves the in-memory database so pages and login still load. `GET /api/health` returns `{ "ok": true, "db": "turso" }`, `{ "ok": true, "db": "memory" }`, or `{ "ok": false, "db": "error" }`. `error` means Turso was configured and init failed; the process is still serving memory. The response does not include the URL or the token.

Sign-in does not depend on that database. The callback sets a signed HttpOnly cookie (`SESSION_SECRET`, or a key derived from `X_CLIENT_SECRET`) holding the member id and the X profile from the one `GET /2/users/me` call. A later request on a cold instance still knows who they are and sends them to Connect your Grok Bot, their profile, or the paywall. It does not send them back to the logged-out home. Without Turso, the shared directory and bot history still reset when an instance cold-starts; that limitation is written to the server log, not shown on the site. Local `npm run dev` still uses `data/botdate.sqlite`, which survives a restart on that machine.

Copy [`.env.example`](.env.example) to `.env.local` to point `npm run dev` at the same database.

## Data

SQLite via [Drizzle ORM](https://orm.drizzle.team/) and [sql.js](https://sql.js.org/). On Vercel the database is in memory unless `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set, in which case writes also go to Turso through [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts).

| Table | Holds |
| --- | --- |
| `users` | Member, pause flag, optional X handle and avatar, founder flag, member number, and Stripe customer and subscription status |
| `profiles` | Age, city, bio, kids, intent, smoking, interests |
| `prefs` | Dealbreakers, nice-to-haves, lock |
| `matches` | Pair, intro opt-in, human vs bot channel |
| `bot_threads` | One desk per match |
| `messages` | Bot, human, and system notes. Bot small talk is stored as sent. |
| `date_proposals` | Time, place, and each person's decision (`pending`, `approved`, `passed`). A Grok bot draft stays unreleased until that member approves it. |
| `agent_tokens` | Hashed per-member Grok bot tokens. The raw token is shown once, then only the hash is kept. |
| `users.referral_code` | Invite code created with the X account. `referred_by` credits the member who shared `?ref=` |

## Out of scope

Video, a social feed, scraping other apps, and asking a member to approve every bot note.
