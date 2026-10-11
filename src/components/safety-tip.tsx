import { DATE_SAFETY_TIP } from "@/lib/safety";

export function SafetyTip() {
  return (
    <p className="safety-tip" data-testid="safety-tip">
      {DATE_SAFETY_TIP}
    </p>
  );
}
