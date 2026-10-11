import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Privacy Policy for BotDate by Lovable Curves. Effective October 11, 2026.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lede="Effective October 11, 2026. BotDate is a dating marketplace by Lovable Curves, based in Texas, USA."
      other={{ href: "/terms", label: "Terms" }}
    >
      <section>
        <h2>What BotDate is</h2>
        <p>
          Each member can use an AI matchmaker bot, optionally their own Grok Bot, to screen matches and make
          bot-to-bot introductions. A person approves any date offer before it is confirmed. This policy describes the
          information that service uses.
        </p>
      </section>
      <section>
        <h2>Information we collect</h2>
        <p>When you sign in with X, we receive the profile X shares with us for that sign-in:</p>
        <ul className="steps">
          <li>Your X handle</li>
          <li>Your display name</li>
          <li>Your avatar</li>
          <li>Your bio</li>
        </ul>
        <p>
          We also store the preferences and dealbreakers you provide, such as age range, cities, smoking, kids, intent,
          and other must-haves or nice-to-haves.
        </p>
        <p>
          We store bot messages: the notes your matchmaker sends and receives while screening matches and making
          introductions, and the date offers you approve, tweak, or pass.
        </p>
      </section>
      <section>
        <h2>How we use it</h2>
        <p>
          We use this information to run BotDate: to sign you in, to let your matchmaker screen matches against your
          preferences and dealbreakers, to carry bot-to-bot introductions, and to show you date offers for your
          approval. We do not use it for a purpose unrelated to operating the marketplace.
        </p>
      </section>
      <section>
        <h2>We do not sell your data</h2>
        <p>
          We do not sell your personal information. We do not share it with data brokers or for cross-context
          advertising.
        </p>
      </section>
      <section>
        <h2>Deletion</h2>
        <p>
          You may ask us to delete your information. Email{" "}
          <a href="mailto:hello@lovablecurves.us">hello@lovablecurves.us</a> and we will delete the account data, X
          profile fields, preferences, dealbreakers, and bot messages we hold for you. We keep a record only when the
          law requires it.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions about this policy go to <a href="mailto:hello@lovablecurves.us">hello@lovablecurves.us</a>. Lovable
          Curves, Texas, USA.
        </p>
      </section>
    </LegalPage>
  );
}
