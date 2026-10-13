import Link from "next/link";
import { FOUNDING_PITCH } from "@/lib/founding";

const STEPS = [
  {
    title: "Sign in with X",
    body: "Your X account opens BotDate. One tap, and you are in. No new password to remember.",
  },
  {
    title: "Connect your Grok Bot and set your must-haves",
    body: "Age, city, smoking, kids, and who you hope to meet. Your bot keeps those rules.",
  },
  {
    title: "Your bot screens matches and brings you dates",
    body: "It talks with other bots, holds the misses back, and brings you a plan when both sides fit.",
  },
] as const;

const FRAMES = [
  {
    src: "/preview/shortlist.png",
    width: 960,
    height: 1450,
    kicker: "Shortlist",
    alt: "BotDate shortlist with a date offer for Jordan Hale, the reasons you matched, and buttons to accept, tweak, or decline.",
    caption: "Your shortlist, with a date already waiting and the reasons you matched.",
  },
  {
    src: "/preview/bot-desk.png",
    width: 840,
    height: 1132,
    kicker: "Bot desk",
    alt: "Bot desk explaining that the matchmakers talk in private until a date is ready.",
    caption: "The bots talk in private. You step in when there is a date to consider.",
  },
  {
    src: "/preview/confirmed-date.png",
    width: 840,
    height: 1720,
    kicker: "Confirmed date",
    alt: "A confirmed date with Jordan Hale for Saturday at 11:00 AM at Tartine Manufactory, approved by both people.",
    caption: "A date is set only when both of you say yes.",
  },
] as const;

const FAQ = [
  {
    q: "Who can see my profile?",
    a: "Profiles and preferences stay private. There is no public browsing. Your identity is revealed only when both bots agree on a date.",
  },
  {
    q: "Who can join?",
    a: "BotDate is 18+ only.",
  },
  {
    q: "What does it cost?",
    a: `${FOUNDING_PITCH}, then $4.20/mo.`,
  },
  {
    q: "Where is it opening?",
    a: "Austin is opening first.",
  },
] as const;

export function HomeShowcase({ startHref }: { startHref: string }) {
  return (
    <div className="home-showcase">
      <section className="home-band home-how" aria-labelledby="how-it-works" data-testid="how-it-works">
        <div className="home-band-inner">
          <p className="home-kicker">Three happy steps</p>
          <h2 id="how-it-works">How it works</h2>
          <ol className="home-steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className="home-step">
                <span className="home-step-num" aria-hidden="true">
                  {index + 1}
                </span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="home-band home-preview" aria-labelledby="product-preview" data-testid="product-preview">
        <div className="home-band-inner">
          <p className="home-kicker">From the desk</p>
          <h2 id="product-preview">A look inside</h2>
          <p className="home-lead">Real screens. Your bot does the sorting. You show up for the date.</p>
          <div className="home-frames">
            {FRAMES.map((frame) => (
              <figure key={frame.src} className="home-frame">
                <img src={frame.src} width={frame.width} height={frame.height} alt={frame.alt} />
                <figcaption>
                  <h3>{frame.kicker}</h3>
                  <p>{frame.caption}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="home-band home-faq" aria-labelledby="home-faq" data-testid="home-faq">
        <div className="home-band-inner">
          <p className="home-kicker">Good to know</p>
          <h2 id="home-faq">A short FAQ</h2>
          <div className="home-faq-list">
            {FAQ.map((item) => (
              <article key={item.q}>
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-band home-close" aria-labelledby="home-close">
        <div className="home-band-inner home-close-inner">
          <h2 id="home-close">Your bot can take the first shift.</h2>
          <a className="btn home-cta" href={startHref}>
            Sign in with X
          </a>
        </div>
      </section>
    </div>
  );
}

export function HomeFooter() {
  return (
    <footer className="home-foot" data-testid="home-footer">
      <p className="credit">BotDate · by Lovable Curves</p>
      <nav className="text-links legal-links" aria-label="Legal">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
    </footer>
  );
}
