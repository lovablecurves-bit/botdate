const HEART =
  "M16 28C16 28 2 18.5 2 11 2 6.5 5.5 3 10 3 12.6 3 14.6 4.3 16 6.6 17.4 4.3 19.4 3 22 3 26.5 3 30 6.5 30 11 30 18.5 16 28 16 28Z";

export function Wordmark() {
  return (
    <>
      <svg className="brand-mark" viewBox="0 0 84 34" aria-hidden="true">
        <path fill="var(--pop)" transform="translate(0 2)" d={HEART} />
        <path fill="var(--rose)" transform="translate(52 2)" d={HEART} />
        <g fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinejoin="round">
          <rect x="32.5" y="12.5" width="12" height="10" rx="5" />
          <rect x="39.5" y="12.5" width="12" height="10" rx="5" />
        </g>
      </svg>
      <span>BotDate</span>
    </>
  );
}
