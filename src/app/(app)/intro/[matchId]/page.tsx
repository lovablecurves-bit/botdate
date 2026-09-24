import { notFound } from "next/navigation";
import { chooseChannelAction, optInAction, sendHumanAction } from "@/app/actions";
import { Banner } from "@/components/banner";
import { MatchNav } from "@/components/match-nav";
import { PersonStrip } from "@/components/person";
import { SubmitButton } from "@/components/submit-button";
import { requireOnboarded } from "@/lib/auth";
import { getDb } from "@/lib/db/open";
import { getIntro } from "@/lib/domain";
import { formatPacific } from "@/lib/time";

export const metadata = { title: "Introduction" };

export default async function IntroPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const member = await requireOnboarded();
  const { matchId } = await params;
  const { error } = await searchParams;
  const intro = getIntro(getDb(), member.id, matchId);
  if (!intro) notFound();
  const other = intro.person.displayName.split(" ")[0];
  const both = intro.viewerOptIn && intro.otherOptIn;

  return (
    <div className="stack">
      <header className="page-head">
        <PersonStrip person={intro.person} />
        <p className="lede">Opting in says you are willing to meet. It does not send a note, and it does not open a private chat by itself.</p>
      </header>
      <MatchNav matchId={matchId} current="intro" />
      <Banner>{error}</Banner>
      <section className="stack tight">
        <h2>Opt in</h2>
        <ul className="status-list">
          <li>{intro.viewerOptIn ? "You opted in." : "You have not opted in."}</li>
          <li>{intro.otherOptIn ? `${other} opted in.` : `Waiting on ${other}.`}</li>
        </ul>
        {!intro.viewerOptIn ? (
          <form action={optInAction}>
            <input type="hidden" name="matchId" value={matchId} />
            <SubmitButton className="btn primary wide" pendingLabel="Saving…" testId="opt-in">
              Opt in to an introduction
            </SubmitButton>
          </form>
        ) : null}
        {both && intro.channelChoice === "unset" ? (
          <div className="decision">
            <form action={chooseChannelAction}>
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="choice" value="human" />
              <SubmitButton className="btn primary" pendingLabel="Opening…" testId="open-human">
                Open human chat
              </SubmitButton>
            </form>
            <form action={chooseChannelAction}>
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="choice" value="bot" />
              <SubmitButton className="btn ghost" pendingLabel="Saving…" testId="stay-bot">
                Stay bot-mediated
              </SubmitButton>
            </form>
          </div>
        ) : null}
        {both && intro.channelChoice === "bot" ? (
          <div className="stack tight">
            <p>You both opted in and chose to keep the matchmakers in the middle. Every outbound bot note still needs approval.</p>
            <form action={chooseChannelAction}>
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="choice" value="human" />
              <SubmitButton className="btn primary wide" pendingLabel="Opening…">
                Switch to human chat
              </SubmitButton>
            </form>
          </div>
        ) : null}
        {both && intro.channelChoice === "human" ? (
          <form action={chooseChannelAction}>
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="choice" value="bot" />
            <SubmitButton className="btn ghost wide" pendingLabel="Saving…">
              Return to bot-mediated
            </SubmitButton>
          </form>
        ) : null}
      </section>
      <section className="stack tight">
        <h2>Already sent</h2>
        {intro.recap.length === 0 ? <p className="help">No approved bot notes yet. The bot desk is where that starts.</p> : null}
        <div className="thread">
          {intro.recap.map((note) => (
            <article key={note.id} className="bubble">
              <p className="who">{note.authorName}</p>
              <p>{note.body}</p>
            </article>
          ))}
        </div>
      </section>
      {both && intro.channelChoice === "human" ? (
        <section className="stack" aria-label="Human chat">
          <h2>Human chat</h2>
          <p className="help">These messages are yours. They send when you send them. Bot drafts still live on the desk.</p>
          <div className="thread">
            {intro.humanMessages.map((message) => (
              <article key={message.id} className={message.mine ? "bubble mine human" : "bubble human"}>
                <p className="who">
                  {message.authorName} · {formatPacific(message.at)}
                </p>
                <p>{message.body}</p>
              </article>
            ))}
          </div>
          <form action={sendHumanAction} className="stack tight">
            <input type="hidden" name="matchId" value={matchId} />
            <label className="field">
              <span>Message as yourself</span>
              <textarea name="body" required maxLength={800} placeholder="This sends as you, not as your matchmaker." />
            </label>
            <SubmitButton className="btn primary wide" pendingLabel="Sending…" testId="send-human">
              Send
            </SubmitButton>
          </form>
        </section>
      ) : null}
    </div>
  );
}
