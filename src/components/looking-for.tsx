import { LOOKING_FOR_LABELS, type LookingFor } from "@/lib/types";

export function LookingForBadges({ lookingFor }: { lookingFor: LookingFor[] }) {
  if (lookingFor.length === 0) return null;
  return (
    <p className="looking-badges" data-testid="looking-for">
      {lookingFor.map((id) => (
        <span key={id} className={`looking-badge looking-${id}`} data-looking={id}>
          {LOOKING_FOR_LABELS[id]}
        </span>
      ))}
    </p>
  );
}
