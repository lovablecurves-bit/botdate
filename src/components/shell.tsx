import { loginAction, logoutAction } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { Nav } from "@/components/nav";
import type { RosterEntry } from "@/lib/domain";
import type { Member } from "@/lib/types";

export function Shell({
  member,
  roster,
  pending,
  children,
}: {
  member: Member;
  roster: RosterEntry[];
  pending: number;
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <aside className="rail">
        <Logo />
        <Nav variant="rail" pending={pending} />
        <p className="rail-note">Bots draft. You approve. BotDate does not read private human chats.</p>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="mobile-logo">
              <Logo />
            </div>
            <details className="switcher">
              <summary>
                <Avatar name={member.displayName} accent={member.profile.accent} size="sm" />
                <span>{member.displayName}</span>
              </summary>
              <div className="switcher-panel">
                <p className="switcher-label">Demo members</p>
                {roster.map((person) => (
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
          </div>
        </header>
        <main id="content" className="content">
          {children}
          <p className="privacy">Bot-to-bot runs only with consent. Pause or wipe matchmaker memory from Profile.</p>
        </main>
      </div>
      <Nav variant="tab" pending={pending} />
    </div>
  );
}

function Logo() {
  return (
    <a className="logo" href="/shortlist">
      <span className="logo-mark">BotDate</span>
      <span className="logo-sub">Matchmaker desk</span>
    </a>
  );
}
