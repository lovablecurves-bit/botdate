import { loginAction, resetDemoAction } from "@/app/actions";
import { Portrait } from "@/components/person";
import { Wordmark } from "@/components/wordmark";
import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { DEMO_NOTES, DEMO_ORDER } from "@/lib/demo/members";
import { withDb } from "@/lib/db/open";
import { listRoster } from "@/lib/domain";

export const metadata = { title: "Enter" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const order = new Map(DEMO_ORDER.map((id, index) => [id, index]));
  const roster = (await withDb((db) => listRoster(db))).sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  const [featured, ...rest] = roster;

  return (
    <main className="login">
      <header className="page-head">
        <p className="wordmark splash">
          <Wordmark />
        </p>
        <h1>Your matchmaker does the first pass.</h1>
        <p className="lede">The bots do the small talk. You only step in when there is a date to approve, tweak, or pass.</p>
      </header>
      <Banner>{error}</Banner>
      {featured ? (
        <section className="featured">
          <Portrait name={featured.displayName} accent={featured.accent} />
          <div className="person-copy">
            <h2>{featured.displayName}</h2>
            <p className="demo-note">{DEMO_NOTES[featured.id]}</p>
          </div>
          <form action={loginAction}>
            <input type="hidden" name="userId" value={featured.id} />
            <SubmitButton className="btn primary wide" pendingLabel="Opening…">
              Continue as {featured.displayName}
            </SubmitButton>
          </form>
        </section>
      ) : null}
      {rest.length > 0 ? (
        <section className="stack tight">
          <h2 className="section-label">Other demo members</h2>
          {rest.map((person) => (
            <form key={person.id} action={loginAction} className="member-row">
              <input type="hidden" name="userId" value={person.id} />
              <div>
                <h3>{person.displayName}</h3>
                <p className="demo-note">{person.locked ? DEMO_NOTES[person.id] : "Dealbreakers not locked yet."}</p>
              </div>
              <SubmitButton className="btn ghost wide" pendingLabel="Opening…">
                Enter as {person.displayName.split(" ")[0]}
              </SubmitButton>
            </form>
          ))}
        </section>
      ) : null}
      <form action={resetDemoAction} className="reset-row">
        <p className="help">If a previous pass changed the seed, reset brings every demo member, desk, and date back.</p>
        <SubmitButton className="btn ghost wide" pendingLabel="Resetting…">
          Reset demo data
        </SubmitButton>
      </form>
    </main>
  );
}
