import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Facts } from "@/components/person";
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

function pill(card: ShortlistCard): string | null {
  if (card.dateStatus === "confirmed") return "Date confirmed";
  if (card.dateStatus === "proposed" && !card.proposalMine) return "Date to confirm";
  if (card.dateStatus === "proposed") return "Waiting on them";
  if (card.draftWaiting) return "Draft to approve";
  if (card.bothOptedIn && card.channelChoice === "human") return "Human chat open";
  if (card.bothOptedIn) return "Introduced";
  if (card.viewerOptIn) return "Waiting on their intro";
  return null;
}

export default async function ShortlistPage() {
  const member = await requireOnboarded();
  const list = listShortlist(getDb(), member.id);
  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">Shortlist</p>
        <h1>{list.cards.length === 0 ? "No one clears both sides yet" : `${list.cards.length} ${list.cards.length === 1 ? "person clears" : "people clear"} your dealbreakers`}</h1>
        <p className="lede">Ranked by must-haves — shared interests, then city. A hard miss is never shown as a profile.</p>
        {list.niceToHaves ? <p className="note">Nice-to-haves on file: {list.niceToHaves}</p> : null}
      </header>
      {list.cards.length === 0 ? (
        <section className="card empty">
          <p>Loosen a dealbreaker on your profile, or wait for a member who clears the ones you locked.</p>
          <Link className="btn primary" href="/onboarding">
            Review dealbreakers
          </Link>
        </section>
      ) : (
        <div className="stack">
          {list.cards.map((card) => {
            const cta = primaryCta(card);
            const status = pill(card);
            return (
              <article key={card.matchId} className="card person-block" data-testid={`shortlist-${card.person.id}`}>
                <div className="person-top">
                  <Avatar name={card.person.displayName} accent={card.person.accent} />
                  <div>
                    <h2>{card.person.displayName}</h2>
                    <p className="meta">
                      {card.person.age} · {card.person.occupation} · {card.person.city}
                    </p>
                  </div>
                  <p className="score" title="Soft score from shared interests and city">
                    Score {card.score}
                  </p>
                </div>
                {status ? <p className="pill">{status}</p> : null}
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
                <div className="actions">
                  <Link className="btn primary" href={cta.href}>
                    {cta.label}
                  </Link>
                  <Link className="btn ghost" href={`/desk/${card.matchId}`}>
                    Bot desk
                  </Link>
                  <Link className="btn ghost" href={`/intro/${card.matchId}`}>
                    Intro
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <section className="filter-log" data-testid="held-back">
        <h2>Held back by dealbreakers</h2>
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
      </section>
    </div>
  );
}
