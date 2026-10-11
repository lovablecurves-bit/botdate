const HEART =
  "M400 700 C 160 540 90 400 90 290 C 90 180 175 105 270 105 C 330 105 375 135 400 180 C 425 135 470 105 530 105 C 625 105 710 180 710 290 C 710 400 640 540 400 700 Z";

export function Wordmark() {
  return (
    <>
      <svg className="brand-mark" viewBox="90 105 620 595" aria-hidden="true">
        <path d={HEART} fill="#E8173A" />
        <ellipse cx="320" cy="330" rx="38" ry="78" fill="#fff" />
        <ellipse cx="480" cy="330" rx="38" ry="78" fill="#fff" />
      </svg>
      <span>BotDate</span>
    </>
  );
}
