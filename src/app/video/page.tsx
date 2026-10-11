import type { Metadata } from "next";
import { HowItWorksVideo } from "@/components/how-it-works-video";
import { referralCode } from "@/lib/http/public";
import { howItWorksMetadata, VIDEO_TITLE } from "@/lib/video";

export const metadata: Metadata = howItWorksMetadata();

export default async function HowItWorksPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref: refParam } = await searchParams;
  const ref = referralCode(refParam);
  const startHref = ref ? `/api/auth/x/start?ref=${ref}` : "/api/auth/x/start";
  return (
    <main className="how-video">
      <h1>{VIDEO_TITLE}</h1>
      <HowItWorksVideo />
      <a className="btn primary wide" href={startHref} data-testid="sign-in-x">
        Sign in with X
      </a>
    </main>
  );
}
