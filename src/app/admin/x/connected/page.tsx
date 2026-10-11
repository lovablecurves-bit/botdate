import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export const metadata: Metadata = {
  title: "BotDateApp",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  denied: "X did not grant access. Try connecting again.",
  expired: "That connection attempt expired. Try again.",
  state: "That connection attempt did not match. Try again.",
  account: "The X account must be @BotDateApp.",
  exchange: "X did not finish the connection. Try again.",
  config: "BotDateApp posting is not configured yet.",
  store: "BotDate could not store the connection. Try again.",
};

export default async function BotConnectedPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const problem = error ? (ERRORS[error] ?? "BotDateApp was not connected.") : null;
  return (
    <main className="login">
      <header className="page-head">
        <Link href="/login" className="wordmark splash">
          <Wordmark />
        </Link>
        <h1>{problem ? "BotDateApp was not connected" : "BotDateApp is connected"}</h1>
        <p className="lede">
          {problem ?? "Auto-posting can use @BotDateApp. Access and refresh tokens stay encrypted in the database."}
        </p>
      </header>
    </main>
  );
}
