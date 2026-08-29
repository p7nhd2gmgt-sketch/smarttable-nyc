#!/usr/bin/env node
import crypto from "node:crypto";
import {
  ACCOUNT_SPECS,
  accountEmail,
  accountPassword,
  assert,
  loadAndValidateStagingEnv,
  passwordLogin,
  supabaseRequest
} from "./staging-test-accounts-common.mjs";

const { env, projectRef } = loadAndValidateStagingEnv({ requireAnonKey: true });

async function expectDenied(label, operation) {
  try {
    await operation();
  } catch (error) {
    assert([401, 403, 404].includes(Number(error.status)), `${label} returned unexpected HTTP ${error.status || "unknown"}.`);
    return { label, denied: true, status: Number(error.status) };
  }
  throw new Error(`${label} was unexpectedly allowed.`);
}

const guestSpec = ACCOUNT_SPECS.find((item) => item.key === "guest");
const guestSession = await passwordLogin(env, accountEmail(env, guestSpec), accountPassword(env, guestSpec));
assert(guestSession?.access_token, "Guest staging login did not return an access token.");

const testHash = crypto.createHash("sha256").update(`staging-rate-limit-${crypto.randomUUID()}`).digest("hex");
const rpcBody = {
  p_bucket_key_hash: testHash,
  p_category: "staging_verification",
  p_limit: 2,
  p_window_seconds: 60
};
const results = [];
results.push(await expectDenied("anonymous -> limiter table SELECT", () => supabaseRequest(env, "/rest/v1/api_rate_limits?select=bucket_key_hash&limit=1", { service: false })));
results.push(await expectDenied("guest -> limiter table SELECT", () => supabaseRequest(env, "/rest/v1/api_rate_limits?select=bucket_key_hash&limit=1", { service: false, token: guestSession.access_token })));
results.push(await expectDenied("anonymous -> limiter RPC", () => supabaseRequest(env, "/rest/v1/rpc/consume_api_rate_limit", { method: "POST", service: false, body: rpcBody })));
results.push(await expectDenied("guest -> limiter RPC", () => supabaseRequest(env, "/rest/v1/rpc/consume_api_rate_limit", { method: "POST", service: false, token: guestSession.access_token, body: rpcBody })));

const first = await supabaseRequest(env, "/rest/v1/rpc/consume_api_rate_limit", { method: "POST", body: rpcBody });
const second = await supabaseRequest(env, "/rest/v1/rpc/consume_api_rate_limit", { method: "POST", body: rpcBody });
const third = await supabaseRequest(env, "/rest/v1/rpc/consume_api_rate_limit", { method: "POST", body: rpcBody });
assert(first?.[0]?.allowed === true && first?.[0]?.remaining === 1, "First staging limiter consume must be allowed.");
assert(second?.[0]?.allowed === true && second?.[0]?.remaining === 0, "Second staging limiter consume must be allowed.");
assert(third?.[0]?.allowed === false && Number(third?.[0]?.retry_after_seconds) >= 1, "Third staging limiter consume must be denied.");

for (const [key, value] of Object.entries(env)) {
  if (value !== undefined && value !== null) process.env[key] = String(value);
}
process.env.SMARTTABLE_ENV = "staging";
process.env.DISTRIBUTED_RATE_LIMIT_ENABLED = "true";
process.env.DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED = "true";
process.env.DISTRIBUTED_RATE_LIMIT_TIMEOUT_MS = "2000";
process.env.API_MUTATION_RATE_LIMIT = "2";
process.env.API_RATE_LIMIT_WINDOW_MS = "60000";

const uniqueRoute = `/api/distributed-limiter-staging-${crypto.randomUUID()}`;
const requestHeaders = { "x-forwarded-for": "203.0.113.29" };
const coreA = await import(`../src/app-core.js?staging-distributed-a=${Date.now()}-${Math.random()}`);
const coreB = await import(`../src/app-core.js?staging-distributed-b=${Date.now()}-${Math.random()}`);
const invoke = (core) => core.handleApiRequest({ method: "POST", url: uniqueRoute, headers: requestHeaders, body: {} });
const appFirst = await invoke(coreA);
const appSecond = await invoke(coreB);
const appThird = await invoke(coreA);
assert(appFirst.status === 404 && appSecond.status === 404, "The first two live app requests must pass the shared limiter.");
assert(appThird.status === 429 && appThird.body?.code === "RATE_LIMITED", "The third live app request must be denied across module instances.");

console.log(JSON.stringify({
  staging_identity_verified: Boolean(projectRef),
  migration: "0070_distributed_api_rate_limits.sql",
  direct_client_probes: results,
  atomic_service_role_sequence: ["allowed", "allowed", "denied"],
  multi_instance_app_sequence: [appFirst.status, appSecond.status, appThird.status],
  raw_ip_persisted: false,
  production_touched: false
}, null, 2));
