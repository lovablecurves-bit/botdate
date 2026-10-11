import { initials } from "@/lib/labels";

export function Avatar({
  name,
  accent,
  size = "md",
  imageUrl,
}: {
  name: string;
  accent: string;
  size?: "sm" | "md" | "lg";
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      <span className={`avatar ${size} has-photo`} style={{ background: accent }} aria-hidden="true">
        <img src={imageUrl} alt="" />
      </span>
    );
  }
  return (
    <span className={`avatar ${size}`} style={{ background: accent }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
