import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRoot = path.join(__dirname, "..");

export const PRODUCTION_ORIGINS = new Set([
  "https://www.smarttablenyc.com",
  "https://smarttablenyc.com"
]);
export const STAGING_PROJECT_REF = "zwapighnwlwmdkqscrzn";
export const TEST_RESTAURANT_NAME = "SmartTable Test Bistro";
export const TEST_RESTAURANT_SLUG = "smarttable-test-bistro";
export const TEST_RESTAURANT_ID = "10000000-0000-4000-8000-000000000123";

export const ACCOUNT_SPECS = Object.freeze([
  {
    key: "guest",
    label: "Guest tester",
    email: "guest@smarttable.com",
    passwordEnv: "SMARTTABLE_TEST_GUEST_PASSWORD",
    role: "guest",
    fullName: "SmartTable Production Test Guest"
  },
  {
    key: "partner",
    label: "Test Bistro partner",
    email: "owner@hudsonhearth.com",
    passwordEnv: "SMARTTABLE_TEST_PARTNER_PASSWORD",
    role: "partner",
    restaurantRole: "owner",
    fullName: "SmartTable Test Bistro Owner"
  },
  {
    key: "admin",
    label: "BASIC admin",
    email: "ops@smarttable.com",
    passwordEnv: "SMARTTABLE_TEST_ADMIN_PASSWORD",
    role: "admin",
    fullName: "SmartTable BASIC Production Admin"
  },
  {
    key: "superadmin",
    label: "Superadmin",
    email: "admin@smarttable.com",
    passwordEnv: "SMARTTABLE_TEST_SUPERADMIN_PASSWORD",
    role: "super_admin",
    fullName: "SmartTable Production Superadmin"
  }
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set();
  const values = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    if (rest.length) values[key] = rest.join("=");
    else flags.add(key);
  }
  return { flags, values };
}

export function parseEnvFile(source = "") {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function readEnvIfPresent(filename) {
  const target = path.join(projectRoot, filename);
  return existsSync(target) ? parseEnvFile(readFileSync(target, "utf8")) : {};
}

export function assertIgnored(relativePath) {
  const result = spawnSync("git", ["check-ignore", "-q", relativePath], {
    cwd: projectRoot,
    stdio: "ignore"
  });
  if (result.status !== 0) throw new Error(`${relativePath} is not ignored by Git. Refusing to continue.`);
}

export function loadProductionLocalEnv() {
  for (const file of [".env.local", ".env.vercel.production.local", ".env.production.test-accounts.local"]) {
    if (existsSync(path.join(projectRoot, file)) && file !== ".env.vercel.production.local") {
      assertIgnored(file);
    }
  }
  const env = {
    ...readEnvIfPresent(".env.vercel.production.local"),
    ...readEnvIfPresent(".env.local"),
    ...readEnvIfPresent(".env.production.test-accounts.local"),
    ...process.env
  };
  return env;
}

export function extractSupabaseHost(value = "") {
  const clean = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  try {
    const parsed = new URL(clean);
    if (parsed.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)) return parsed.hostname.toLowerCase();
  } catch {
    // Fall through to permissive extraction for host-only local env values.
  }
  return clean.match(/([a-z0-9-]+\.supabase\.co)/i)?.[1]?.toLowerCase() || "";
}

export function productionSupabaseConfig(env) {
  const rawUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const hostname = extractSupabaseHost(rawUrl);
  return {
    hostname,
    projectRef: hostname ? hostname.split(".")[0] : "",
    baseUrl: hostname ? `https://${hostname}` : "",
    anonKey: String(env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ""),
    serviceRoleKey: String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE || env.SERVICE_ROLE_KEY || "")
  };
}

export function accountEmail(spec) {
  return spec.email.trim().toLowerCase();
}

export function accountPassword(env, spec) {
  return String(env[spec.passwordEnv] || "");
}

export function displayRole(role) {
  return role === "super_admin" ? "superadmin" : role;
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function publicJson(pathname, origin = "https://www.smarttablenyc.com") {
  const response = await fetch(`${origin}${pathname}`, {
    headers: { accept: "application/json" }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

export async function deployedProductionSnapshot(origin = "https://www.smarttablenyc.com") {
  assert(PRODUCTION_ORIGINS.has(origin), "Production test account tooling may only target smarttablenyc.com.");
  const [health, config] = await Promise.all([
    publicJson("/api/health", origin),
    publicJson("/api/public/config", origin).catch((error) => ({ ok: false, status: 0, body: { error: error.message } }))
  ]);
  const healthRef = health.body?.supabase_project_ref || null;
  const configRef = config.body?.supabase_project_ref || null;
  return {
    origin,
    health_status: health.status,
    health_runtime_mode: health.body?.runtime_mode || health.body?.environment || null,
    health_environment: health.body?.environment || null,
    health_supabase_project_ref: healthRef,
    health_supabase_url_hostname: health.body?.supabase_url_hostname || null,
    health_build_id: health.body?.build_id || null,
    health_commit: health.body?.commit || null,
    config_status: config.status,
    config_runtime_mode: config.body?.runtime_mode || config.body?.environment || null,
    config_environment: config.body?.environment || null,
    config_supabase_project_ref: configRef,
    config_supabase_url_hostname: config.body?.supabase_url_hostname || null,
    config_build_id: config.body?.build_id || null,
    exposed_project_refs: [...new Set([healthRef, configRef].filter(Boolean))]
  };
}

export function requiredProjectRef(args) {
  return String(args.values["project-ref"] || process.env.SMARTTABLE_PRODUCTION_SUPABASE_PROJECT_REF || "").trim();
}

export async function assertProductionTarget({ env, args, requireWrite = false, requireDeployedRef = true } = {}) {
  const suppliedProjectRef = requiredProjectRef(args);
  assert(suppliedProjectRef, "--project-ref=<verified-production-ref> is required.");
  assert(suppliedProjectRef !== STAGING_PROJECT_REF, "Refusing to target the staging Supabase project.");

  if (requireWrite) {
    assert(args.flags.has("confirm-production-test-accounts"), "--confirm-production-test-accounts is required for production writes.");
    assert(String(env.SMARTTABLE_PRODUCTION_TEST_ACCOUNTS_ENABLED || "").toLowerCase() === "true", "SMARTTABLE_PRODUCTION_TEST_ACCOUNTS_ENABLED=true is required for production writes.");
  }

  const targetOrigin = String(env.SMARTTABLE_PRODUCTION_TEST_ACCOUNTS_URL || env.PUBLIC_BASE_URL || "https://www.smarttablenyc.com").replace(/\/+$/, "");
  assert(PRODUCTION_ORIGINS.has(targetOrigin), "Target domain must be www.smarttablenyc.com or smarttablenyc.com.");

  const supabase = productionSupabaseConfig(env);
  assert(supabase.baseUrl, "A production Supabase URL/host is required.");
  assert(supabase.projectRef === suppliedProjectRef, "Local production Supabase project ref does not match --project-ref.");
  assert(supabase.projectRef !== STAGING_PROJECT_REF, "Local production Supabase project ref points to staging.");
  assert(supabase.anonKey, "Production SUPABASE_ANON_KEY is required.");
  assert(supabase.serviceRoleKey, "Production SUPABASE_SERVICE_ROLE_KEY is required.");

  const deployed = await deployedProductionSnapshot(targetOrigin);
  assert(deployed.health_runtime_mode === "production", "Production health endpoint must report runtime=production.");
  assert(deployed.health_environment === "production", "Production health endpoint must report environment=production.");
  if (requireDeployedRef) {
    assert(deployed.exposed_project_refs.length > 0, "The deployed production app does not expose a Supabase project ref; cannot verify the production target conclusively.");
    assert(deployed.exposed_project_refs.every((ref) => ref === suppliedProjectRef), "Deployed production Supabase project ref differs from --project-ref.");
  }

  return {
    targetOrigin,
    suppliedProjectRef,
    supabase,
    deployed
  };
}

export async function supabaseRequest(config, pathname, options = {}) {
  const service = options.service !== false;
  const apiKey = service ? config.serviceRoleKey : config.anonKey;
  if (!apiKey) throw new Error(service ? "SUPABASE_SERVICE_ROLE_KEY is required." : "SUPABASE_ANON_KEY is required.");
  const response = await fetch(`${config.baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${options.token || apiKey}`,
      "content-type": "application/json",
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const safeBody = typeof body === "object" && body
      ? {
        code: body.code || body.error_code || body.error || null,
        message: body.message || body.msg || body.error_description || body.error || response.statusText
      }
      : { message: String(body || response.statusText).slice(0, 250) };
    const error = new Error(`${options.method || "GET"} ${pathname} failed with HTTP ${response.status}: ${JSON.stringify(safeBody)}`);
    error.status = response.status;
    error.safeBody = safeBody;
    throw error;
  }
  return body;
}

export async function loadPostgrestSchema(config) {
  const spec = await supabaseRequest(config, "/rest/v1/", {
    headers: { accept: "application/openapi+json" }
  });
  const definitions = spec.definitions || spec.components?.schemas || {};
  const tables = {};
  for (const [key, definition] of Object.entries(definitions)) {
    const tableName = key.includes(".") ? key.split(".").at(-1) : key;
    tables[tableName] = new Set(Object.keys(definition?.properties || {}));
  }
  return { tables };
}

export function tableColumns(schema, tableName) {
  return schema.tables[tableName] || new Set();
}

export function tableExists(schema, tableName) {
  return tableColumns(schema, tableName).size > 0;
}

export function hasColumn(schema, tableName, columnName) {
  return tableColumns(schema, tableName).has(columnName);
}

export function filterPayload(schema, tableName, payload) {
  const columns = tableColumns(schema, tableName);
  if (!columns.size) throw new Error(`Production schema does not expose required table: ${tableName}`);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => columns.has(key)));
}

export async function restSelect(config, table, query) {
  return supabaseRequest(config, `/rest/v1/${table}?${query}`);
}

export async function restInsert(config, table, payload) {
  return supabaseRequest(config, `/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: payload
  });
}

export async function restPatch(config, table, filter, payload) {
  return supabaseRequest(config, `/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: payload
  });
}

export async function restDelete(config, table, filter) {
  return supabaseRequest(config, `/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

export async function restUpsert(config, table, conflict, payload) {
  return supabaseRequest(config, `/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: payload
  });
}

export async function listAuthUsers(config) {
  const users = [];
  for (let page = 1; page <= 50; page += 1) {
    const data = await supabaseRequest(config, `/auth/v1/admin/users?page=${page}&per_page=200`);
    const batch = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
}

export async function findAuthUserByEmail(config, email) {
  const expected = String(email || "").trim().toLowerCase();
  return (await listAuthUsers(config)).find((user) => String(user.email || "").toLowerCase() === expected) || null;
}

export async function passwordLogin(config, email, password) {
  return supabaseRequest(config, "/auth/v1/token?grant_type=password", {
    method: "POST",
    service: false,
    body: { email, password }
  });
}
