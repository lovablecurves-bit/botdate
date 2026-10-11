const HEART =
  "M16 28C16 28 2 18.5 2 11 2 6.5 5.5 3 10 3 12.6 3 14.6 4.3 16 6.6 17.4 4.3 19.4 3 22 3 26.5 3 30 6.5 30 11 30 18.5 16 28 16 28Z";

export function Wordmark() {
  return (
    <>
      <svg className="brand-mark" viewBox="0 0 64 34" aria-hidden="true">
        <path fill="var(--heart-bubble)" transform="translate(0 3) rotate(-18 16 15.5)" d={HEART} />
        <path fill="var(--heart-candy)" transform="translate(32 3) rotate(18 16 15.5)" d={HEART} />
        <circle cx="32" cy="15" r="11.6" fill="var(--bot)" />
        <ellipse cx="28.85" cy="14.7" rx="1.75" ry="4.15" fill="#fff" />
        <ellipse cx="35.15" cy="14.7" rx="1.75" ry="4.15" fill="#fff" />
      </svg>
      <span>BotDate</span>
    </>
  );
}
