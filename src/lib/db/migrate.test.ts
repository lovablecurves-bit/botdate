import assert from "node:assert/strict";
import { test } from "node:test";
import { missingColumnStatements } from "./migrate";

test("migrations add X profile columns and the held-offer flag only when they are missing", () => {
  const fresh = missingColumnStatements({
    users: ["id", "email", "display_name", "bot_paused", "created_at", "x_user_id", "x_handle", "x_avatar_url"],
    date_proposals: ["id", "released"],
  });
  assert.deepEqual(fresh, []);
  const legacy = missingColumnStatements({
    users: ["id", "email", "display_name", "bot_paused", "created_at"],
    date_proposals: ["id"],
  });
  assert.equal(legacy.length, 4);
  assert.match(legacy[0] ?? "", /x_user_id/);
  assert.match(legacy[3] ?? "", /released/);
});
