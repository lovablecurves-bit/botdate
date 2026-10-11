const HEART =
  "M16 28C16 28 2 18.5 2 11 2 6.5 5.5 3 10 3 12.6 3 14.6 4.3 16 6.6 17.4 4.3 19.4 3 22 3 26.5 3 30 6.5 30 11 30 18.5 16 28 16 28Z";

export function Wordmark() {
  return (
    <>
      <svg className="brand-mark" viewBox="0 0 64 34" aria-hidden="true">
        <path fill="var(--heart-bubble)" transform="translate(0 3)" d={HEART} />
        <path fill="var(--heart-candy)" transform="translate(32 3)" d={HEART} />
        <rect x="20" y="3" width="24" height="24" rx="6.5" fill="var(--bot)" />
        <ellipse cx="28.7" cy="15" rx="2" ry="5" fill="#fff" />
        <ellipse cx="35.3" cy="15" rx="2" ry="5" fill="#fff" />
      </svg>
      <span>BotDate</span>
    </>
  );
}
