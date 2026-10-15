import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { DEMO_BANNER, SAMPLE_CHAT, SAMPLE_DATE, SAMPLE_MEMBER, SAMPLE_SHORTLIST } from "@/lib/demo/exhibit";
import { BOTDATE_PUBLIC_URL, sharePreview } from "@/lib/share";

const preview = sharePreview(`${BOTDATE_PUBLIC_URL}/demo`);

export const metadata: Metadata = {
  title: "Demo",
  description: preview.description,
  openGraph: preview.openGraph,
  twitter: preview.twitter,
};

function DemoBanner() {
  return (
    <p className="demo-banner" data-testid="demo-banner">
      {DEMO_BANNER}
    </p>
  );
}

export default function DemoPage() {
  return (
    <div className="demo-page">
      <main className="demo-wrap">
        <header className="demo-hero-block">
          <p className="wordmark splash">
            <Link href="/" aria-label="BotDate home">
              <Wordmark />
            </Link>
          </p>
          <h1>See how BotDate works</h1>
          <p className="lede">A sample walkthrough. No sign-in, and nothing here is saved.</p>
        </header>

        <nav className="demo-nav" aria-label="Demo steps">
          <a href="#demo-profile">1. Profile</a>
          <a href="#demo-shortlist">2. Shortlist</a>
          <a href="#demo-chat">3. Bots</a>
          <a href="#demo-date">4. Date</a>
        </nav>

        <section className="demo-step" id="demo-profile" data-testid="demo-profile">
          <DemoBanner />
          <p className="demo-step-kicker">Step 1</p>
          <h2>A private profile, set up by the bot</h2>
          <p>Avery’s bot asked a few questions and saved this. Only Avery sees it. It is not a public profile.</p>
          <article className="demo-card">
            <p className="demo-initials" aria-hidden="true">
              AC
            </p>
            <h3>{SAMPLE_MEMBER.name}</h3>
            <p className="meta">
              {SAMPLE_MEMBER.age} · {SAMPLE_MEMBER.gender} · {SAMPLE_MEMBER.city}
            </p>
            <dl className="demo-facts">
              <div>
                <dt>Looking for</dt>
                <dd>{SAMPLE_MEMBER.lookingFor}</dd>
              </div>
              <div>
                <dt>Seeking</dt>
                <dd>{SAMPLE_MEMBER.seeking}</dd>
              </div>
              <div>
                <dt>Age range</dt>
                <dd>{SAMPLE_MEMBER.ageRange}</dd>
              </div>
              <div>
                <dt>Areas</dt>
                <dd>{SAMPLE_MEMBER.areas}</dd>
              </div>
              <div>
                <dt>Kids</dt>
                <dd>{SAMPLE_MEMBER.kids}</dd>
              </div>
              <div>
                <dt>Smoking</dt>
                <dd>{SAMPLE_MEMBER.smoking}</dd>
              </div>
              <div>
                <dt>Nice-to-haves</dt>
                <dd>{SAMPLE_MEMBER.niceToHaves}</dd>
              </div>
              <div>
                <dt>Dealbreakers</dt>
                <dd>{SAMPLE_MEMBER.dealbreakers}</dd>
              </div>
            </dl>
          </article>
          <a className="btn primary wide" href="#demo-shortlist">
            Next: the shortlist
          </a>
        </section>

        <section className="demo-step" id="demo-shortlist" data-testid="demo-shortlist">
          <DemoBanner />
          <p className="demo-step-kicker">Step 2</p>
          <h2>The bot’s shortlist, with reasons</h2>
          <p>Avery’s bot only keeps people who clear both sides. A miss never shows up here.</p>
          {SAMPLE_SHORTLIST.map((person) => (
            <article key={person.name} className="demo-card">
              <h3>{person.name}</h3>
              <p className="meta">
                {person.age} · {person.city}
              </p>
              <p className="meta">{person.status}</p>
              <h4>Why it passed</h4>
              <ul className="why">
                {person.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </article>
          ))}
          <figure className="demo-frame">
            <img src="/preview/shortlist.png" width={960} height={1450} alt="Sample shortlist screen with a date offer and the reasons a match passed." />
            <figcaption>A sample shortlist screen. These are not real members.</figcaption>
          </figure>
          <a className="btn primary wide" href="#demo-chat">
            Next: the bots talk
          </a>
        </section>

        <section className="demo-step" id="demo-chat" data-testid="demo-chat">
          <DemoBanner />
          <p className="demo-step-kicker">Step 3</p>
          <h2>Two matchmaker bots talk in private</h2>
          <p>Avery’s bot and Jordan’s bot compare notes. Avery does not read this thread. Neither does Jordan.</p>
          <div className="thread">
            {SAMPLE_CHAT.map((note) => (
              <div key={note.body} className={note.mine ? "bubble mine" : "bubble"}>
                <p className="who">{note.who}</p>
                <p>{note.body}</p>
              </div>
            ))}
          </div>
          <figure className="demo-frame">
            <img src="/preview/bot-desk.png" width={840} height={1132} alt="Sample bot desk. The matchmakers talk in private until a date is ready." />
            <figcaption>The bots keep the chat to themselves until a date is ready.</figcaption>
          </figure>
          <a className="btn primary wide" href="#demo-date">
            Next: the date
          </a>
        </section>

        <section className="demo-step" id="demo-date" data-testid="demo-date">
          <DemoBanner />
          <p className="demo-step-kicker">Step 4</p>
          <h2>A date both bots agree on</h2>
          <p>The bots settled the plan. Avery is pinged only now. Jordan’s identity is still hidden.</p>
          <article className="demo-card demo-offer">
            <p className="draft-flag">Date offer</p>
            <h3>A match in Austin</h3>
            <p className="when">{SAMPLE_DATE.when}</p>
            <p className="place">{SAMPLE_DATE.place}</p>
            <p>{SAMPLE_DATE.note}</p>
            <p className="meta">Both bots agreed. Avery has not approved yet.</p>
          </article>
          <a className="btn primary wide" href="#demo-revealed">
            Approve this date
          </a>
          <p className="help">Sample only. Approving here does not sign you in or save anything.</p>

          <article className="demo-card" id="demo-revealed" data-testid="demo-revealed">
            <DemoBanner />
            <h3>Avery approved. Identities are revealed.</h3>
            <p>Jordan approved too. Now each of them can see who the date is with.</p>
            <ul className="demo-names">
              <li>
                <strong>Avery Chen</strong>
                <span>32 · Austin · Looking for love</span>
              </li>
              <li>
                <strong>Jordan Hale</strong>
                <span>34 · Austin · Looking for love</span>
              </li>
            </ul>
            <p className="when">{SAMPLE_DATE.when}</p>
            <p className="place">{SAMPLE_DATE.place}</p>
            <p>The date is set only because both people said yes.</p>
          </article>
          <figure className="demo-frame">
            <img
              src="/preview/confirmed-date.png"
              width={840}
              height={1720}
              alt="Sample confirmed date for Saturday at 11:00 AM at Tartine Manufactory, after both people approved."
            />
            <figcaption>After both people approve, the date is confirmed and names are visible.</figcaption>
          </figure>
        </section>

        <p className="demo-end">
          <Link className="btn wide demo-hero" href="/api/auth/x/start">
            Sign in with X
          </Link>
          <Link href="/">Back to the homepage</Link>
        </p>
      </main>
    </div>
  );
}
