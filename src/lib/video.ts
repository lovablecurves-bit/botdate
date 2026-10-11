import type { Metadata } from "next";
import { BOTDATE_PUBLIC_URL } from "./share";

export const HOW_IT_WORKS_VIDEO_PATH = "/video/botdate-how-it-works.mp4";
export const HOW_IT_WORKS_POSTER_PATH = "/video/botdate-how-it-works.png";
export const VIDEO_PAGE_PATH = "/video";
export const VIDEO_EMBED_PATH = "/video/embed";
export const VIDEO_PLAYER_WIDTH = 720;
export const VIDEO_PLAYER_HEIGHT = 1280;
export const VIDEO_TITLE = "How BotDate works";
export const VIDEO_DESCRIPTION = "The bots do the small talk. You only step in when there is a date to approve.";

export function howItWorksMetadata(): Metadata {
  const videoUrl = `${BOTDATE_PUBLIC_URL}${HOW_IT_WORKS_VIDEO_PATH}`;
  const posterUrl = `${BOTDATE_PUBLIC_URL}${HOW_IT_WORKS_POSTER_PATH}`;
  const pageUrl = `${BOTDATE_PUBLIC_URL}${VIDEO_PAGE_PATH}`;
  const embedUrl = `${BOTDATE_PUBLIC_URL}${VIDEO_EMBED_PATH}`;
  return {
    metadataBase: new URL(BOTDATE_PUBLIC_URL),
    title: VIDEO_TITLE,
    description: VIDEO_DESCRIPTION,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: VIDEO_TITLE,
      description: VIDEO_DESCRIPTION,
      url: pageUrl,
      type: "video.other",
      videos: [
        {
          url: videoUrl,
          secureUrl: videoUrl,
          type: "video/mp4",
          width: VIDEO_PLAYER_WIDTH,
          height: VIDEO_PLAYER_HEIGHT,
        },
      ],
      images: [{ url: posterUrl, width: VIDEO_PLAYER_WIDTH, height: VIDEO_PLAYER_HEIGHT, alt: VIDEO_TITLE }],
    },
    twitter: {
      card: "player",
      title: VIDEO_TITLE,
      description: VIDEO_DESCRIPTION,
      images: [{ url: posterUrl, alt: VIDEO_TITLE, width: VIDEO_PLAYER_WIDTH, height: VIDEO_PLAYER_HEIGHT }],
      players: {
        playerUrl: embedUrl,
        streamUrl: videoUrl,
        width: VIDEO_PLAYER_WIDTH,
        height: VIDEO_PLAYER_HEIGHT,
      },
    },
  };
}
