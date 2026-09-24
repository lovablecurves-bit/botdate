import { loginAction, resetDemoAction } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { DEMO_NOTES, DEMO_ORDER } from "@/lib/demo/members";
import { getDb } from "@/lib/db/open";
import { listRoster } from "@/lib/domain";

export const metadata = { title: "Enter" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const order = new Map(DEMO_ORDER.map((id, index) => [id, index]));
  const roster = listRoster(getDb()).sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));

  return (
    <main className="login">
      <header className="login-hero">
        <p className="eyebrow">BotDate</p>
        <h1>Your matchmaker does the first pass.</h1>
        <p className="lede">
          Each member has a desk. The bot filters on dealbreakers, talks to the other matchmaker, and only then asks for an introduction or a time. Nothing goes out in your name until you approve it.
        </p>
      </header>
      <Banner>{error}</Banner>
      <section className="stack">
        <h2>Demo members</h2>
        <p className="help">No password. Pick a person and use their desk. Switch later from the menu.</p>
        <div className="roster">
          {roster.map((person) => (
            <article key={person.id} className="person-card">
              <div className="person-top">
                <Avatar name={person.displayName} accent={person.accent} />
                <div>
                  <h3>{person.displayName}</h3>
                  <p className="meta">{person.locked ? person.city : "Dealbreakers not locked"}</p>
                </div>
              </div>
              <p className="demo-note">{DEMO_NOTES[person.id]}</p>
              <form action={loginAction}>
                <input type="hidden" name="userId" value={person.id} />
                <SubmitButton className="btn primary wide" pendingLabel="Opening…">
                  Enter desk
                </SubmitButton>
              </form>
            </article>
          ))}
        </div>
      </section>
      <form action={resetDemoAction} className="reset-row">
        <p className="help">If a previous pass changed the seed, reset brings every demo member, desk, and date back.</p>
        <SubmitButton className="btn ghost" pendingLabel="Resetting…">
          Reset demo data
        </SubmitButton>
      </form>
    </main>
  );
}
