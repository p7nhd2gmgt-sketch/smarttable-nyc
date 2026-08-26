#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const vercelJson = await readFile(new URL("../vercel.json", import.meta.url), "utf8");

function includesAll(source, values, message) {
  for (const value of values) {
    assert(source.includes(value), `${message}: missing ${value}`);
  }
}

assert(packageJson.dependencies?.["@vercel/analytics"], "Official @vercel/analytics package must be installed.");
assert.equal(packageJson.scripts?.["check:visitor-analytics"], "node scripts/check-visitor-analytics.js", "Visitor analytics check script must be exposed.");
assert.equal((indexHtml.match(/data-smarttable-analytics/g) || []).length, 1, "Vercel Web Analytics script marker must be configured once.");
assert(indexHtml.includes('script.setAttribute("data-smarttable-analytics", "vercel-web-analytics")'), "Vercel Web Analytics script must be injected once.");
assert(indexHtml.includes('/_vercel/insights/script.js'), "Vercel Web Analytics must use the Vercel insights script route.");
assert(indexHtml.includes('window.va("beforeSend"'), "Vercel Web Analytics must use beforeSend for privacy filtering.");
assert(indexHtml.includes("productionHosts"), "Analytics must be production-host gated.");
includesAll(indexHtml, [
  '"smarttablenyc.com"',
  '"www.smarttablenyc.com"',
  '"/admin"',
  '"/superadmin"',
  '"/partner"',
  '"/api"',
  '"/auth"',
  '"/reset-password"',
  '"/review/verified"',
  '"/post-visit/action"',
  '"token"',
  '"code"',
  '"access_token"',
  '"refresh_token"',
  '"email"',
  '"phone"',
  '"reservation_id"',
  '"user_id"',
  '"guest_id"',
  "return null",
  "return `${url.origin}${pathname === \"/\" ? \"/\" : pathname}`"
], "Analytics privacy guard");
assert(!indexHtml.includes("googletagmanager.com"), "Google Tag Manager must not be added.");
assert(!indexHtml.includes("google-analytics.com"), "Google Analytics must not be added.");
assert(!indexHtml.includes("GTM-"), "GTM IDs must not be present.");
assert(!indexHtml.includes("gtag("), "gtag must not be present.");
assert(vercelJson.includes("connect-src 'self'"), "CSP must allow same-origin Vercel Analytics intake only.");
assert(vercelJson.includes("script-src 'self'"), "CSP must allow same-origin Vercel Analytics script only.");

console.log("Privacy-conscious visitor analytics checks passed.");
