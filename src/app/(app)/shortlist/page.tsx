import Link from "next/link";
import { Portrait, Facts } from "@/components/person";
import { requireOnboarded } from "@/lib/auth";
import { getDb } from "@/lib/db/open";
import { listShortlist, type ShortlistCard } from "@/lib/domain";

export const metadata = { title: "Shortlist" };

function primaryCta(card: ShortlistCard): { href: string; label: string } {
  if (card.dateStatus === "proposed" && !card.proposalMine) return { href: `/dates/${card.matchId}`, label: "Confirm date" };
  if (card.dateStatus === "confirmed") return { href: `/dates/${card.matchId}`, label: "View date" };
  if (card.dateStatus === "proposed") return { href: `/dates/${card.matchId}`, label: "Date proposed" };
  if (card.draftWaiting) return { href: `/desk/${card.matchId}`, label: "Review draft" };
  if (card.bothOptedIn) return { href: `/intro/${card.matchId}`, label: "Open intro" };
  return { href: `/desk/${card.matchId}`, label: "Open bot desk" };
}

function whyPassed(card: ShortlistCard): string {
  const specific = card.why.filter((line) => line !== "Clears their dealbreakers too");
  const city = specific.find((line) => /city|cities/i.test(line));
  const intent = specific.find((line) => /serious|casual/i.test(line));
  const lead = [city, intent].filter(Boolean).join(" · ");
  return lead || specific[0] || "Clears every dealbreaker on both sides.";
}

export default async function ShortlistPage() {
  const member = await requireOnboarded();
  const list = listShortlist(getDb(), member.id);
  const count = list.cards.length;
  return (
    <div className="stack">
      <header className="page-head">
        <h1>Shortlist</h1>
        <p className="lede">
          {count === 0
            ? "No one clears both sides yet. A hard miss never shows up as a profile."
            : `${count} ${count === 1 ? "person clears" : "people clear"} your dealbreakers. Ranked by shared interests, then city.`}
        </p>
      </header>
      {count === 0 ? (
        <section className="empty">
          <p>Loosen a dealbreaker on your profile, or wait for someone who clears the ones you locked.</p>
          <Link className="btn primary wide" href="/onboarding">
            Review dealbreakers
          </Link>
        </section>
      ) : (
        <div className="people">
          {list.cards.map((card) => {
            const cta = primaryCta(card);
            const first = card.person.displayName.split(" ")[0];
            return (
              <article key={card.matchId} className="person-card" data-testid={`shortlist-${card.person.id}`}>
                <Portrait name={card.person.displayName} accent={card.person.accent} />
                <div className="person-copy">
                  <h2>{card.person.displayName}</h2>
                  <p className="meta">
                    {card.person.age} · {card.person.occupation}
                  </p>
                  <p className="why-line">{whyPassed(card)}</p>
                </div>
                <Link className="btn primary wide" href={cta.href}>
                  {cta.label}
                </Link>
                <details className="more">
                  <summary>More about {first}</summary>
                  <p>{card.person.bio}</p>
                  <Facts person={card.person} />
                  <div>
                    <h3>Why it passed</h3>
                    <ul className="why">
                      {card.why.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3>Why it ranks here</h3>
                    {card.rankNotes.length ? (
                      <ul className="why soft">
                        {card.rankNotes.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="help">No extra must-have overlap. They still clear every dealbreaker.</p>
                    )}
                  </div>
                  <div className="text-links">
                    <Link href={`/desk/${card.matchId}`}>Bot desk</Link>
                    <Link href={`/intro/${card.matchId}`}>Intro</Link>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
      <details className="quiet-fold" data-testid="held-back">
        <summary>Held back by dealbreakers</summary>
        <div className="filter-log">
          {list.niceToHaves ? <p className="help">Nice-to-haves on file: {list.niceToHaves}</p> : null}
          <p className="help">Counts only. These people are not shown as profiles.</p>
          {list.heldBack.length === 0 ? (
            <p>No locked profile is currently held back.</p>
          ) : (
            <ul>
              {list.heldBack.map((row) => (
                <li key={row.label}>
                  <strong>{row.count}</strong> {row.label.toLowerCase()}
                </li>
              ))}
            </ul>
          )}
          {list.inactive > 0 ? (
            <p className="help">
              {list.inactive} {list.inactive === 1 ? "profile hasn't" : "profiles haven't"} locked dealbreakers yet.
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
