import { loginAction, logoutAction } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { Nav } from "@/components/nav";
import { Wordmark } from "@/components/wordmark";
import { DEMO_ORDER } from "@/lib/demo/members";
import type { RosterEntry } from "@/lib/domain";
import type { Member } from "@/lib/types";

export function Shell({
  member,
  roster,
  pending,
  demoSwitcher,
  children,
}: {
  member: Member;
  roster: RosterEntry[];
  pending: number;
  demoSwitcher: boolean;
  children: React.ReactNode;
}) {
  const demoIds = new Set<string>(DEMO_ORDER);
  const people = demoSwitcher ? roster.filter((person) => demoIds.has(person.id) || person.id === member.id) : [];
  const first = member.displayName.split(" ")[0];
  return (
    <div className="app">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <div className="frame">
        <header className="topbar">
          <div className="topbar-inner">
            <a className="wordmark" href="/shortlist">
              <Wordmark />
            </a>
            {demoSwitcher ? (
              <details className="switcher">
                <summary>
                  <Avatar name={member.displayName} accent={member.profile.accent} size="sm" imageUrl={member.xAccount?.avatarUrl} />
                  <span>{first}</span>
                </summary>
                <div className="switcher-panel">
                  <p className="switcher-label">Switch member</p>
                  {people.map((person) => (
                    <form key={person.id} action={loginAction}>
                      <input type="hidden" name="userId" value={person.id} />
                      <button type="submit" className={person.id === member.id ? "current" : undefined} disabled={person.id === member.id}>
                        <Avatar name={person.displayName} accent={person.accent} size="sm" />
                        <span>
                          {person.displayName}
                          <small>{person.locked ? person.city : "Onboarding open"}</small>
                        </span>
                      </button>
                    </form>
                  ))}
                  <form action={logoutAction}>
                    <button type="submit" className="signout">
                      Sign out
                    </button>
                  </form>
                </div>
              </details>
            ) : (
              <div className="account">
                <Avatar name={member.displayName} accent={member.profile.accent} size="sm" imageUrl={member.xAccount?.avatarUrl} />
                <span>{first}</span>
                <form action={logoutAction}>
                  <button type="submit">Sign out</button>
                </form>
              </div>
            )}
          </div>
        </header>
        <main id="content" className="content">
          {children}
          <p className="credit">BotDate · by Lovable Curves</p>
        </main>
      </div>
      <Nav pending={pending} />
    </div>
  );
}
