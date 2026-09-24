import type { StageState } from "@/lib/domain";

const STEPS: { key: keyof StageState; label: string }[] = [
  { key: "filters", label: "Filters" },
  { key: "talk", label: "Bot desk" },
  { key: "intro", label: "Intro" },
  { key: "date", label: "Date" },
];

export function StageTrail({ stage }: { stage: StageState }) {
  return (
    <ol className="stage" aria-label="Match progress">
      {STEPS.map((step) => (
        <li key={step.key} className={stage[step.key]}>
          {step.label}
        </li>
      ))}
    </ol>
  );
}
