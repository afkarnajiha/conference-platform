// Run only against a dedicated test conference in a connected Supabase project.
// Supply TEST_SUPABASE_URL, TEST_PUBLIC_KEY, TEST_EMPLOYEE_A_JWT,
// TEST_EMPLOYEE_B_JWT, TEST_EXHIBITION_ID via environment, never commit them.
import assert from "node:assert/strict";
const {
  TEST_SUPABASE_URL: url,
  TEST_PUBLIC_KEY: key,
  TEST_EMPLOYEE_A_JWT: a,
  TEST_EMPLOYEE_B_JWT: b,
  TEST_EXHIBITION_ID: id,
} = process.env;
if (!url || !key || !a || !b || !id)
  throw new Error("Missing dedicated integration-test environment variables");
async function rpc(jwt, fn, args) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const body = await r.json();
  assert.ok(r.ok, `RPC failed: HTTP ${r.status}`);
  return body;
}
const results = await Promise.all(
  [a, b].map((jwt) => rpc(jwt, "reserve_exhibition", { p_exhibition: id })),
);
try {
  assert.deepEqual(results.map((r) => r.status).sort(), [
    "accepted",
    "reserved",
  ]);
  console.log(
    "PASS: simultaneous requests yield exactly one reservation owner",
  );
} finally {
  for (let i = 0; i < results.length; i++)
    if (results[i].status === "accepted")
      await rpc([a, b][i], "release_reservation", {
        p_exhibition: id,
        p_token: results[i].token,
      });
}
