export function Banner({ tone = "bad", children }: { tone?: "bad" | "good"; children?: string | null }) {
  if (!children) return null;
  return (
    <p className={`banner ${tone}`} role="status">
      {children}
    </p>
  );
}
