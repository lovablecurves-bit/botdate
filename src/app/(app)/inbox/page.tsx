import Link from "next/link";
import { headers } from "next/headers";
import { DateOffer } from "@/components/date-offer";
import { requireOnboarded } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { listShortlist } from "@/lib/domain";
import { appOrigin } from "@/lib/http/origin";
import { representedBy } from "@/lib/labels";
import { dateOfferIntent } from "@/lib/share";

export const metadata = { title: "Notifications" };

export default async function InboxPage() {
  const member = await requireOnboarded();
  const shareHref = dateOfferIntent(appOrigin(await headers()));
  const offers = (await withDb((db) => listShortlist(db, member.id))).cards.filter((card) => card.offerWaiting && card.offer);
  return (
    <div className="stack" data-testid="date-inbox">
      <header className="page-head">
        <h1>Notifications</h1>
        <p className="lede">Bot conversations stay private. This is the only thing they send you: a date, when one is ready.</p>
      </header>
      {offers.length === 0 ? (
        <section className="empty">
          <p>Nothing yet. You'll see who, why you matched, and a time and place when your bots are ready.</p>
          <Link className="btn ghost wide" href="/members">
            Browse members
          </Link>
        </section>
      ) : (
        offers.map((card) =>
          card.offer ? (
            <div key={card.offer.id} className="stack tight">
              <p className="bot-badge">{representedBy(card.person.displayName, false)}</p>
              <DateOffer
                matchId={card.matchId}
                proposalId={card.offer.id}
                personName={card.person.displayName}
                whenLabel={card.offer.whenLabel}
                local={card.offer.local}
                place={card.offer.place}
                note={card.offer.note}
                why={card.why}
                shareHref={shareHref}
                lookingFor={card.person.lookingFor}
                targetId={card.person.id}
                xHandle={card.person.xHandle}
                xVerified={card.person.xVerified}
              />
            </div>
          ) : null,
        )
      )}
    </div>
  );
}
