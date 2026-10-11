import assert from "node:assert/strict";
import { test } from "node:test";
import { missingColumnStatements } from "./migrate";

test("migrations add X profile columns and the held-offer flag only when they are missing", () => {
  const fresh = missingColumnStatements({
    users: ["id", "email", "display_name", "bot_paused", "created_at", "x_user_id", "x_handle", "x_avatar_url", "founder", "member_number", "connect_seen", "stripe_customer_id", "stripe_subscription_id", "stripe_subscription_status", "x_created_at", "x_followers", "x_verified", "share_in_activity", "safety_status", "safety_reason", "referral_code"],
    date_proposals: ["id", "released"],
    agent_tokens: ["id", "user_id", "token_hash", "token_prefix", "created_at", "revoked_at", "last_used_at"],
    prefs: ["onboarding"],
  });
  assert.deepEqual(fresh, []);
  const legacy = missingColumnStatements({
    users: ["id", "email", "display_name", "bot_paused", "created_at"],
    date_proposals: ["id"],
  });
  assert.equal(legacy.length, 19);
  assert.match(legacy[0] ?? "", /x_user_id/);
  assert.match(legacy[3] ?? "", /released/);
  assert.match(legacy.join("\n"), /founder/);
  assert.match(legacy.join("\n"), /member_number/);
  assert.match(legacy.join("\n"), /connect_seen/);
  assert.match(legacy.join("\n"), /stripe_customer_id/);
  assert.match(legacy.join("\n"), /stripe_subscription_id/);
  assert.match(legacy.join("\n"), /stripe_subscription_status/);
  assert.match(legacy.join("\n"), /last_used_at/);
  assert.match(legacy.join("\n"), /onboarding/);
  assert.match(legacy.join("\n"), /x_created_at/);
  assert.match(legacy.join("\n"), /x_followers/);
  assert.match(legacy.join("\n"), /x_verified/);
  assert.match(legacy.join("\n"), /share_in_activity/);
  assert.match(legacy.join("\n"), /safety_status/);
  assert.match(legacy.join("\n"), /safety_reason/);
  assert.match(legacy.join("\n"), /referral_code/);
});
