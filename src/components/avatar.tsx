import { initials } from "@/lib/labels";

export function Avatar({ name, accent, size = "md" }: { name: string; accent: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`avatar ${size}`} style={{ background: accent }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
