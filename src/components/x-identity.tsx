export function XIdentity({ handle, verified }: { handle: string | null | undefined; verified?: boolean }) {
  if (!handle) return null;
  return (
    <p className="meta" data-testid="x-handle">
      @{handle.replace(/^@/, "")}
      {verified ? (
        <span className="verified-badge" data-testid="x-verified">
          Verified
        </span>
      ) : null}
    </p>
  );
}
