import type { Metadata } from "next";
import { HowItWorksVideo } from "@/components/how-it-works-video";
import { VIDEO_DESCRIPTION, VIDEO_TITLE } from "@/lib/video";

export const metadata: Metadata = {
  title: VIDEO_TITLE,
  description: VIDEO_DESCRIPTION,
  robots: { index: false, follow: false },
};

export default function HowItWorksEmbedPage() {
  return (
    <main className="video-embed">
      <HowItWorksVideo />
    </main>
  );
}
