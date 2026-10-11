import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/wordmark";

export function LegalPage({
  title,
  lede,
  other,
  children,
}: {
  title: string;
  lede: string;
  other: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <main className="login legal">
      <header className="page-head">
        <Link href="/login" className="wordmark splash">
          <Wordmark />
        </Link>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
      </header>
      {children}
      <footer className="login-foot">
        <p className="credit">BotDate · by Lovable Curves</p>
        <nav className="text-links legal-links" aria-label="Legal">
          <Link href="/login">Sign in</Link>
          <Link href={other.href}>{other.label}</Link>
        </nav>
      </footer>
    </main>
  );
}
