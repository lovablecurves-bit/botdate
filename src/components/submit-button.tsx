"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  className,
  testId,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  testId?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} data-testid={testId}>
      {pending ? pendingLabel : children}
    </button>
  );
}
