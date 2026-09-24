import Link from "next/link";
import { DateOffer } from "@/components/date-offer";
import { Portrait, Facts } from "@/components/person";
import { requireOnboarded } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { listShortlist, type ShortlistCard } from "@/lib/domain";

export const metadata = { title: "Shortlist" };

function whyPassed(card: ShortlistCard): string {
  const specific = card.why.filter((line) => line !== "Clears their dealbreakers too");
  const city = specific.find((line) => /city|cities/i.test(line));
  const intent = specific.find((line) => /serious|casual/i.test(line));
  const lead = [city, intent].filter(Boolean).join(" · ");
  return lead || specific[0] || "Clears every dealbreaker on both sides.";
}

function statusLine(card: ShortlistCard): string {
  if (card.dateStatus === "confirmed") return "Date is set";
  if (card.dateStatus === "declined") return "You passed";
  if (card.offer && !card.offerWaiting) return "Waiting on them";
  return "Bots are talking";
}

export default async function ShortlistPage() {
  const member = await requireOnboarded();
  const list = await withDb((db) => listShortlist(db, member.id));
  const offers = list.cards.filter((card) => card.offerWaiting && card.offer);
  const rest = list.cards.filter((card) => !(card.offerWaiting && card.offer));
  return (
    <div className="stack">
      <header className="page-head">
        <h1>Shortlist</h1>
        <p className="lede">Your bots are working. You only get pinged when they are ready to offer a date.</p>
        <Link href="/desk">Activity</Link>
      </header>
      {list.cards.length === 0 ? (
        <section className="empty">
          <p>No one clears both sides yet. A hard miss never shows up as a profile.</p>
          <Link className="btn primary wide" href="/onboarding">
            Review dealbreakers
          </Link>
        </section>
      ) : (
        <>
          {offers.map((card) =>
            card.offer ? (
              <DateOffer
                key={card.offer.id}
                matchId={card.matchId}
                proposalId={card.offer.id}
                personName={card.person.displayName}
                whenLabel={card.offer.whenLabel}
                local={card.offer.local}
                place={card.offer.place}
                note={card.offer.note}
              />
            ) : null,
          )}
          {rest.length > 0 ? (
            <div className="people">
              {rest.map((card) => {
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
                      <p className="meta">{statusLine(card)}</p>
                    </div>
                    <div className="text-links">
                      <Link href={`/desk/${card.matchId}`}>Activity</Link>
                      {card.dateStatus === "confirmed" ? <Link href={`/dates/${card.matchId}`}>View date</Link> : null}
                    </div>
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
                    </details>
                  </article>
                );
              })}
            </div>
          ) : null}
        </>
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
