import { HOW_IT_WORKS_POSTER_PATH, HOW_IT_WORKS_VIDEO_PATH, VIDEO_TITLE } from "@/lib/video";

export function HowItWorksVideo({ className }: { className?: string }) {
  return (
    <video
      className={className}
      src={HOW_IT_WORKS_VIDEO_PATH}
      poster={HOW_IT_WORKS_POSTER_PATH}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={VIDEO_TITLE}
    />
  );
}
