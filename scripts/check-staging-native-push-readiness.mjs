#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertEnvFileIgnored, readStagingEnvFile, supabaseRequest } from "./staging-test-accounts-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const productionHosts = new Set(["smarttablenyc.com", "www.smarttablenyc.com"]);

function clean(value = "") {
  return String(value || "").trim();
}

function stagingOrigin(env = {}) {
  return clean(
    process.env.SMARTTABLE_STAGING_ORIGIN
    || process.env.SMARTTABLE_STAGING_SITE_URL
    || process.env.STAGING_SITE_URL
    || env.SMARTTABLE_STAGING_ORIGIN
    || env.SMARTTABLE_STAGING_SITE_URL
    || env.STAGING_SITE_URL
    || env.PLAYWRIGHT_STAGING_BASE_URL
    || ""
  ).replace(/\/+$/, "");
}

function encryptionKeyValid(value = "") {
  const source = clean(value);
  if (/^[0-9a-f]{64}$/i.test(source)) return true;
  try { return Buffer.from(source, "base64").length === 32; }
  catch { return false; }
}

function projectRefFromUrl(value = "") {
  try {
    const parsed = new URL(clean(value));
    if (parsed.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)) return "";
    return parsed.hostname.split(".")[0];
  } catch {
    return "";
  }
}

function linkedProjectRef() {
  const target = path.join(projectRoot, "supabase", ".temp", "project-ref");
  return existsSync(target) ? clean(readFileSync(target, "utf8")) : "";
}

async function main() {
  assertEnvFileIgnored();
  const { values: env } = readStagingEnvFile();
  const missing = ["STAGING_SUPABASE_PROJECT_REF", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    .filter((name) => !clean(env[name]));
  const stagingRef = clean(env.STAGING_SUPABASE_PROJECT_REF);
  const urlRef = projectRefFromUrl(env.SUPABASE_URL);
  const linkedRef = linkedProjectRef();
  const productionRef = clean(env.PRODUCTION_SUPABASE_PROJECT_REF || env.SMARTTABLE_PRODUCTION_SUPABASE_PROJECT_REF);
  const identitySafe = Boolean(
    !missing.length
    && stagingRef
    && urlRef === stagingRef
    && (!linkedRef || linkedRef === stagingRef)
    && (!productionRef || productionRef !== stagingRef)
  );

  const origin = stagingOrigin(env);
  let originSafe = false;
  if (origin) {
    try {
      const parsed = new URL(origin);
      originSafe = parsed.protocol === "https:" && !productionHosts.has(parsed.hostname.toLowerCase());
    } catch {
      originSafe = false;
    }
  }

  const providerReady = clean(env.MOBILE_PUSH_PROVIDER).toLowerCase() === "expo";
  const encryptionReady = encryptionKeyValid(env.MOBILE_PUSH_TOKEN_ENCRYPTION_KEY);
  let schemaReady = false;
  let schemaCheck = "not_checked";
  if (identitySafe) {
    try {
      await supabaseRequest(env, "/rest/v1/mobile_push_devices?select=id&limit=1", { service: true });
      await supabaseRequest(env, "/rest/v1/mobile_push_deliveries?select=id&limit=1", { service: true });
      schemaReady = true;
      schemaCheck = "available";
    } catch (error) {
      schemaCheck = Number(error?.status || 0) === 404 ? "missing" : "unavailable";
    }
  }

  const blockers = [];
  if (!identitySafe) blockers.push("STAGING_IDENTITY_NOT_VERIFIED");
  if (!originSafe) blockers.push(origin ? "STAGING_ORIGIN_UNSAFE" : "STAGING_ORIGIN_MISSING");
  if (!providerReady) blockers.push("MOBILE_PUSH_PROVIDER_NOT_EXPO");
  if (!encryptionReady) blockers.push("MOBILE_PUSH_ENCRYPTION_KEY_MISSING_OR_INVALID");
  if (!schemaReady) blockers.push(schemaCheck === "missing" ? "MOBILE_PUSH_SCHEMA_MISSING" : "MOBILE_PUSH_SCHEMA_NOT_VERIFIED");

  console.log(JSON.stringify({
    staging_identity_verified: identitySafe,
    staging_origin_configured_and_safe: originSafe,
    provider_configured: providerReady,
    encryption_key_configured: encryptionReady,
    schema_ready: schemaReady,
    schema_check: schemaCheck,
    ready_for_physical_device_qa: blockers.length === 0,
    blockers
  }, null, 2));
  if (blockers.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(JSON.stringify({
    ready_for_physical_device_qa: false,
    blockers: [clean(error?.message || "STAGING_NATIVE_PUSH_AUDIT_FAILED")]
  }, null, 2));
  process.exitCode = 1;
});
