const HEART =
  "M16 28C16 28 2 18.5 2 11 2 6.5 5.5 3 10 3 12.6 3 14.6 4.3 16 6.6 17.4 4.3 19.4 3 22 3 26.5 3 30 6.5 30 11 30 18.5 16 28 16 28Z";

const LEFT_OVER =
  "M 35.31 27.36 A 12.8 12.8 0 0 1 19.64 11.69 L 25.24 13.19 A 7 7 0 0 0 33.81 21.76 Z";
const RIGHT_OVER =
  "M 28.69 2.64 A 12.8 12.8 0 0 1 44.36 18.31 L 38.76 16.81 A 7 7 0 0 0 30.19 8.24 Z";

export function Wordmark() {
  return (
    <>
      <svg className="brand-mark" viewBox="0 0 64 34" aria-hidden="true">
        <defs>
          <clipPath id="bd-heart-left">
            <path d={LEFT_OVER} />
          </clipPath>
          <clipPath id="bd-heart-right">
            <path d={RIGHT_OVER} />
          </clipPath>
        </defs>
        <path fill="var(--pop)" transform="translate(0 3)" d={HEART} />
        <path fill="var(--rose)" transform="translate(32 3)" d={HEART} />
        <circle cx="32" cy="15" r="10" fill="none" stroke="var(--accent)" strokeWidth="4.5" />
        <path fill="var(--pop)" transform="translate(0 3)" d={HEART} clipPath="url(#bd-heart-left)" />
        <path fill="var(--rose)" transform="translate(32 3)" d={HEART} clipPath="url(#bd-heart-right)" />
      </svg>
      <span>BotDate</span>
    </>
  );
}
