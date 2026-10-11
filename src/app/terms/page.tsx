import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of Service for BotDate by Lovable Curves. Effective October 11, 2026.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      lede="Effective October 11, 2026. These terms govern BotDate, a dating marketplace by Lovable Curves."
      other={{ href: "/privacy", label: "Privacy" }}
    >
      <section>
        <h2>18 and older</h2>
        <p>
          BotDate is only for people who are 18 or older. By using it you confirm that you are at least 18. We may
          close an account that does not meet this rule.
        </p>
      </section>
      <section>
        <h2>How matching works</h2>
        <p>
          Your AI matchmaker bot, which may be your own Grok Bot, can screen matches and make bot-to-bot introductions.
          AI bots can make mistakes. They can misread a preference, miss context, or suggest a poor fit. You approve
          any date. A date is not confirmed until the members involved approve the offer.
        </p>
      </section>
      <section>
        <h2>Meet responsibly</h2>
        <p>
          You are responsible for your own safety when you decide to meet someone. BotDate does not verify every
          member and does not supervise meetings. Meet in a public place, tell someone you trust your plans, and leave
          if you feel unsafe.
        </p>
      </section>
      <section>
        <h2>No harassment</h2>
        <p>
          Do not harass, threaten, stalk, or abuse anyone through BotDate, through a bot, or in person because of a
          match. We may suspend or end access when someone breaks this rule.
        </p>
      </section>
      <section>
        <h2>No warranty</h2>
        <p>
          BotDate is provided as is and as available, without warranties of any kind, express or implied, including
          warranties of merchantability, fitness for a particular purpose, and accuracy of matches, introductions, or
          date offers. To the extent the law allows, Lovable Curves is not liable for harm arising from your use of the
          service, from a bot's mistake, or from a meeting you choose to attend.
        </p>
      </section>
      <section>
        <h2>Texas law</h2>
        <p>
          These terms are governed by the laws of the State of Texas, USA, without regard to conflict-of-law rules. The
          state and federal courts located in Texas are the venue for disputes arising out of these terms or BotDate.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>
          We may change these terms. When we do, we will post the updated terms on this page and change the effective
          date. Continuing to use BotDate after that date means you accept the updated terms.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions about these terms go to <a href="mailto:hello@lovablecurves.us">hello@lovablecurves.us</a>.
        </p>
      </section>
    </LegalPage>
  );
}
