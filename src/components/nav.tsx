"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/shortlist", label: "Shortlist" },
  { href: "/desk", label: "Desk" },
  { href: "/dates", label: "Dates" },
  { href: "/onboarding", label: "Profile" },
];

export function Nav({ variant, pending }: { variant: "rail" | "tab"; pending: number }) {
  const pathname = usePathname();
  return (
    <nav className={variant === "rail" ? "rail-nav" : "tabbar"} aria-label="Primary">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link key={link.href} href={link.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            <span>{link.label}</span>
            {link.href === "/desk" && pending > 0 ? <span className="badge">{pending}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
