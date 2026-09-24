# BotDate

BotDate is a Grok-bot-native dating desk. Each member gets a matchmaker that filters profiles, does the early bot-to-bot conversation, and only then helps two people meet and pick a time.

Humans stay in control. Anything that speaks for a member is a draft until they approve it. BotDate does not read private human chats. Bot-to-bot is the product surface, and only with consent. A member can pause the matchmaker or wipe its memory.

The posture is professional dating ops: a shortlist, a desk, an introduction, a date. Not a feed.

## Run

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). There is no password. Pick a demo member.

The first request creates `data/botdate.sqlite` and seeds it with Avery Chen and the rest of the demo roster. That file is local and gitignored. **Reset demo data** on Profile (or the signed-out login screen) restores the seed.

`npm test` covers hard filters, draft privacy, approve / edit / kill, intro opt-in, and date confirm. No API keys.

## Demo path

| Member | What to do |
| --- | --- |
| Avery Chen | Shortlist is already filtered. Confirm Jordan's Saturday on Dates. Approve, edit, or kill the draft on Sam's bot desk. |
| Jordan Hale | You proposed the Saturday. Open Dates to see it from your side. |
| Sam Okonkwo | Read Avery's desk, then opt in on Intro. |
| Riley Park | Your matchmaker is holding a reply. It stays invisible to Avery until you approve it. |
| Priya Shah | Profile is filled in. Lock dealbreakers to open a shortlist. |
| Morgan, Casey, Quinn, Noah, Alex | Each one misses a hard filter for Avery (smoking, city, age, kids, or the other person's age range). They do not appear on her shortlist. |

Switch members from the menu in the header.

## Screens

1. **Profile** (`/onboarding`) — name, photo placeholder, bio, dealbreakers, and must-haves. The shortlist stays closed until preferences are locked. Pause and wipe live here.
2. **Shortlist** (`/shortlist`) — only mutual hard-filter passes, with why each one passed and why it ranks. Held-back people are a count, not a card.
3. **Bot desk** (`/desk`) — the bot-to-bot thread. Approve, edit, or kill any outbound draft. The other person's unapproved draft is not readable.
4. **Intro** (`/intro/[match]`) — both people opt in, then open human chat or stay bot-mediated.
5. **Date desk** (`/dates`) — propose a Pacific time and place. The other person confirms or declines. The proposer can withdraw.

## Preferences

Hard filters (dealbreakers) are age range, cities, smoking, kids, and intent. A miss is never surfaced. The check is mutual: you must clear their dealbreakers too.

Soft prefs rank the list. Shared interests add the most, then the same city. The free-text nice-to-have is stored for the matchmaker. This MVP does not pretend to parse it.

## Matchmaker

`MatchmakerBotService` in `src/lib/matchmaker/service.ts` is a deterministic stand-in for a Grok matchmaker. Seeded desks use sample scripts. Everyone else gets a heuristic opening or reply from the profile they already consented to share. There is no network call and no model key.

Approving a draft can queue the other side's next note as *their* draft. It does not auto-send.

## Deploy on Vercel

The demo does not use native SQLite. Queries run on [sql.js](https://sql.js.org/) (SQLite compiled to WebAssembly), so a Vercel function can boot without a build toolchain. Avery Chen and the rest of the roster are seeded on first use.

### One-shot demo (no database to provision)

1. Push this repo to GitHub.
2. In Vercel, choose **Add New… → Project** and import the repo.
3. Leave the framework preset as **Next.js**. Do not set environment variables.
4. Deploy.

Open the deployment URL. The login screen lists the demo members with no password. Each serverless instance keeps its own in-memory copy and reseeds after a cold start, so one visitor's approvals are not shared with another instance. That is enough for a clickable public demo.

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

Redeploy. The first request creates the tables and seeds Avery Chen if the database is empty. Later requests read and write that database, so a reset or an approval is visible to the next visitor. Leave both variables unset to go back to the in-memory demo. Setting only one of them fails startup on purpose.

Copy [`.env.example`](.env.example) to `.env.local` to point `npm run dev` at the same database.

## Data

SQLite via [Drizzle ORM](https://orm.drizzle.team/) and [sql.js](https://sql.js.org/). On Vercel the database is in memory unless `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set, in which case writes also go to Turso through [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts).

| Table | Holds |
| --- | --- |
| `users` | Member, pause flag |
| `profiles` | Age, city, bio, kids, intent, smoking, interests |
| `prefs` | Dealbreakers, nice-to-haves, lock |
| `matches` | Pair, intro opt-in, human vs bot channel |
| `bot_threads` | One desk per match |
| `messages` | Bot, human, and system notes, with `approval_status` (`pending`, `sent`, `killed`) |
| `date_proposals` | Time, place, proposed / confirmed / declined / withdrawn |

## Out of scope

Payments, video, a social feed, scraping other apps, and sending anything in a member's name without approval.
