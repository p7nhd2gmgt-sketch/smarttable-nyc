import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [migration, appCore, envExample] = await Promise.all([
  read("supabase/migrations/0070_distributed_api_rate_limits.sql"),
  read("src/app-core.js"),
  read(".env.example")
]);

assert.match(migration, /create table if not exists public\.api_rate_limits/i, "A persistent rate-limit table is required.");
assert.match(migration, /alter table public\.api_rate_limits enable row level security/i, "The rate-limit table must have RLS enabled.");
assert.match(migration, /revoke all privileges on table public\.api_rate_limits from public, anon, authenticated/i, "Direct client table access must be revoked.");
assert.match(migration, /security definer/i, "The atomic consume RPC must use a hardened server boundary.");
assert.match(migration, /auth\.role\(\)::text, ''\) <> 'service_role'/i, "The consume RPC must enforce service_role internally.");
assert.match(migration, /on conflict \(bucket_key_hash\) do update/i, "Rate-limit consumption must be atomic.");
assert(!migration.includes("p_ip"), "Raw IP addresses must not be accepted by the persistence layer.");
assert(appCore.includes('createHash("sha256")'), "The server must hash bucket identifiers before persistence.");
assert(appCore.includes("DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED"), "Distributed rate limiting must support fail-closed enforcement.");
assert(appCore.includes('await mutationRateLimit(method, pathname, headers)'), "The API boundary must await the persistent limiter.");
for (const key of [
  "DISTRIBUTED_RATE_LIMIT_ENABLED=false",
  "DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED=true",
  "DISTRIBUTED_RATE_LIMIT_TIMEOUT_MS=1500"
]) {
  assert(envExample.includes(key), `.env.example must document ${key.split("=")[0]}.`);
}

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
for (const key of Object.keys(process.env)) {
  if (key.startsWith("SUPABASE_") || key.startsWith("DISTRIBUTED_RATE_LIMIT") || key.startsWith("API_") || key.startsWith("AUTH_")) {
    delete process.env[key];
  }
}
process.env.SMARTTABLE_ENV = "staging";
process.env.PUBLIC_BASE_URL = "https://staging.smarttable.example";
process.env.SUPABASE_URL = "https://staging-test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.IMPERSONATION_SECRET = "distributed-rate-limit-test-secret-32";
process.env.DISTRIBUTED_RATE_LIMIT_ENABLED = "true";
process.env.DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED = "true";
process.env.DISTRIBUTED_RATE_LIMIT_TIMEOUT_MS = "1000";
process.env.API_MUTATION_RATE_LIMIT = "2";
process.env.API_RATE_LIMIT_WINDOW_MS = "60000";
process.env.AUTH_RECOVERY_RATE_LIMIT = "3";
process.env.AUTH_RECOVERY_RATE_LIMIT_WINDOW_MS = "600000";

const sharedBuckets = new Map();
let forceFailure = false;
let downstreamRequests = 0;
globalThis.fetch = async (url, options = {}) => {
  const href = String(url || "");
  if (href.endsWith("/rest/v1/rpc/consume_api_rate_limit")) {
    if (forceFailure) {
      return new Response(JSON.stringify({ message: "simulated unavailable limiter" }), {
        status: 503,
        headers: { "content-type": "application/json" }
      });
    }
    const body = JSON.parse(String(options.body || "{}"));
    assert.match(body.p_bucket_key_hash, /^[a-f0-9]{64}$/, "Only a SHA-256 bucket hash may leave the server.");
    assert(!String(options.body || "").includes("198.51.100.42"), "The persisted payload must not contain the raw client IP.");
    const current = sharedBuckets.get(body.p_bucket_key_hash) || 0;
    const next = current + 1;
    sharedBuckets.set(body.p_bucket_key_hash, next);
    return new Response(JSON.stringify([{
      allowed: next <= body.p_limit,
      remaining: Math.max(body.p_limit - next, 0),
      retry_after_seconds: next <= body.p_limit ? 0 : body.p_window_seconds
    }]), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (href.includes("/auth/v1/resend")) {
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }
  if (href.includes("/rest/v1/email_logs")) {
    return new Response(JSON.stringify([{ id: "distributed-verification-log" }]), {
      status: 201,
      headers: { "content-type": "application/json" }
    });
  }
  if (href.includes("/rest/v1/")) {
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }
  downstreamRequests += 1;
  return new Response(JSON.stringify({ message: "unexpected downstream request" }), {
    status: 500,
    headers: { "content-type": "application/json" }
  });
};

const coreA = await import(`../src/app-core.js?distributed-rate-limit-a=${Date.now()}-${Math.random()}`);
const coreB = await import(`../src/app-core.js?distributed-rate-limit-b=${Date.now()}-${Math.random()}`);
const request = (core) => core.handleApiRequest({
  method: "POST",
  url: "/api/not-a-real-route",
  headers: { "x-forwarded-for": "198.51.100.42" },
  body: {}
});

assert.equal((await request(coreA)).status, 404, "The first server instance request should pass the limiter.");
assert.equal((await request(coreB)).status, 404, "A second server instance must share the same persistent bucket.");
const limited = await request(coreA);
assert.equal(limited.status, 429, "The shared third request must be rate limited across server instances.");
assert.equal(limited.body?.code, "RATE_LIMITED", "The client must receive the generic rate-limit code.");
assert.equal(downstreamRequests, 0, "Unknown routes must not trigger an upstream data request in this regression.");

sharedBuckets.clear();
const verificationRequest = (core) => core.handleApiRequest({
  method: "POST",
  url: "/api/auth/resend-verification",
  headers: { "x-forwarded-for": "198.51.100.43" },
  body: { email: "persistent-verification@smarttablenyc.test" }
});
for (const core of [coreA, coreB, coreA]) {
  assert.equal((await verificationRequest(core)).status, 200, "The first three verification resend requests should keep the neutral success contract.");
}
const verificationLimited = await verificationRequest(coreB);
assert.equal(verificationLimited.status, 429, "Verification resend must be limited across application instances.");
assert.equal(verificationLimited.body?.code, "VERIFICATION_RESEND_RATE_LIMITED", "The persistent limiter must preserve the verification-specific client contract.");

forceFailure = true;
const coreFailClosed = await import(`../src/app-core.js?distributed-rate-limit-fail-closed=${Date.now()}-${Math.random()}`);
const unavailable = await request(coreFailClosed);
assert.equal(unavailable.status, 503, "Staging must fail closed when the persistent limiter is unavailable.");
assert.equal(unavailable.body?.code, "RATE_LIMIT_UNAVAILABLE", "Limiter outages must use a safe generic code.");
assert(!JSON.stringify(unavailable.body).includes("simulated unavailable limiter"), "Upstream limiter errors must not be exposed to clients.");

globalThis.fetch = originalFetch;
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, originalEnv);

console.log("Distributed multi-instance rate limiting checks passed.");
