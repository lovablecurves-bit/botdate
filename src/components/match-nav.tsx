import Link from "next/link";

export function MatchNav({ matchId, current }: { matchId: string; current?: "desk" | "date" }) {
  const links = [
    { id: "desk", href: `/desk/${matchId}`, label: "Activity" },
    { id: "date", href: `/dates/${matchId}`, label: "Date" },
  ] as const;
  return (
    <div className="match-nav" role="navigation" aria-label="This match">
      {links.map((link) => (
        <Link key={link.id} href={link.href} className={link.id === current ? "active" : undefined} aria-current={link.id === current ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </div>
  );
}
