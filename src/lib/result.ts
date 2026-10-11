export type ActionResult = { ok: true } | { ok: false; error: string };

export type CreatedResult = { ok: true; id: string } | { ok: false; error: string };

export function ok(): ActionResult {
  return { ok: true };
}

export function created(id: string): CreatedResult {
  return { ok: true, id };
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
