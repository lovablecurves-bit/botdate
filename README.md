# BotDate

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

The first request creates `data/botdate.sqlite` and seeds it. That file is local and gitignored. **Reset demo data** on Profile (or the signed-out login screen) restores the seed.

`npm test` covers hard filters, bot notes sent without a draft queue, date-offer approve / tweak / pass, intro opt-in, and wipe. No API keys.

## Demo path

| Member | What to do |
| --- | --- |
| Avery Chen | Shortlist is already filtered. Jordan's Saturday is a date offer — approve, tweak, or pass. Sam and Riley are talking in the background. |
| Jordan Hale | The same Saturday offer is waiting. It confirms only after both of you approve. |
| Sam Okonkwo | Bots are still talking. Open Activity if you want the log. No date yet. |
| Riley Park | Both matchmakers have already spoken. Nothing is waiting on you. |
| Priya Shah | Profile is filled in. Lock dealbreakers to open a shortlist. |
| Morgan, Casey, Quinn, Noah, Alex | Each one misses a hard filter for Avery (smoking, city, age, kids, or the other person's age range). They do not appear on her shortlist. |

Switch members from the menu in the header.

## Screens

1. **Profile** (`/onboarding`) — name, photo placeholder, bio, dealbreakers, and must-haves. The shortlist stays closed until preferences are locked. Pause and wipe live here.
2. **Shortlist** (`/shortlist`) — the home screen. Mutual hard-filter passes, with a date offer on top when one is ready. Everyone else is "bots are talking."
3. **Activity** (`/desk`) — a quiet log of bot-to-bot notes. Not in the tab bar. Nothing on it needs approval.
4. **Intro** (`/intro/[match]`) — optional, after people want a direct chat. Not part of the date offer.
5. **Dates** (`/dates`) — the matchmakers' offer. Approve, tweak the time or place, or pass. It confirms when both people approve.

## Preferences

Hard filters (dealbreakers) are age range, cities, smoking, kids, and intent. A miss is never surfaced. The check is mutual: you must clear their dealbreakers too.

Soft prefs rank the list. Shared interests add the most, then the same city. The free-text nice-to-have is stored for the matchmaker. This MVP does not pretend to parse it.

## Matchmaker

`MatchmakerBotService` in `src/lib/matchmaker/service.ts` is a deterministic stand-in for a Grok matchmaker. Seeded desks use sample scripts. Everyone else gets a heuristic opening or reply from the profile they already consented to share. There is no network call and no model key.

Scripted notes are sent as the matchmakers talk. A paused matchmaker does not send the next note. A date offer is the human interrupt.

## Data

SQLite via [Drizzle ORM](https://orm.drizzle.team/) and `better-sqlite3`.

| Table | Holds |
| --- | --- |
| `users` | Member, pause flag |
| `profiles` | Age, city, bio, kids, intent, smoking, interests |
| `prefs` | Dealbreakers, nice-to-haves, lock |
| `matches` | Pair, intro opt-in, human vs bot channel |
| `bot_threads` | One desk per match |
| `messages` | Bot, human, and system notes. Bot small talk is stored as sent. |
| `date_proposals` | Time, place, and each person's decision (`pending`, `approved`, `passed`) |

## Out of scope

Payments, video, a social feed, scraping other apps, and asking a member to approve every bot note.
