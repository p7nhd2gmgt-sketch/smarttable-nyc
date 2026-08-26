import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "scripts", "load-test-staging.mjs"), "utf8");

assert.match(source, /PRODUCTION_HOSTNAMES/);
assert.match(source, /smarttablenyc\.com/);
assert.match(source, /PRODUCTION_PROJECT_REFS/);
assert.match(source, /kkcmfolzrdvzrnmehkd/);
assert.match(source, /STAGING_SUPABASE_PROJECT_REF/);
assert.match(source, /--confirm-staging-load-test/);
assert.match(source, /const LOAD_METHOD = "GET"/);
assert.match(source, /redirect: "manual"/);
assert.match(source, /test-results", "load"/);

const routeBlock = source.match(/export const SAFE_GET_ROUTES = Object\.freeze\(([\s\S]*?)\n\}\);/);
assert.ok(routeBlock, "Safe GET route allowlist is missing.");
const forbiddenRouteFragments = [
  "/api/admin",
  "/api/superadmin",
  "/api/stripe",
  "/checkout",
  "/send",
  "/test-alert",
  "/create",
  "/cancel",
  "/accept",
  "/decline",
  "/acknowledge"
];
for (const fragment of forbiddenRouteFragments) {
  assert.equal(routeBlock[1].includes(fragment), false, `Unsafe load-test route found: ${fragment}`);
}

assert.equal(/SUPABASE_SERVICE_ROLE_KEY[^\n]*(Authorization|Bearer|headers)/.test(source), false);
assert.equal(/console\.(log|error)\([^\n]*(password|access_token|refresh_token|service.role)/i.test(source), false);
assert.equal(/writeFile\([^\n]*(password|access_token|refresh_token)/i.test(source), false);

console.log("Load-test safety check passed: staging-only guards and read-only route allowlist verified.");
