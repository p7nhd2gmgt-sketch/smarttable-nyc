import { existsSync, readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRoot = path.join(__dirname, "..");
export const stagingEnvPath = path.join(projectRoot, ".env.staging.local");

export const TEST_RESTAURANT_ID = "10000000-0000-4000-8000-000000000123";
export const TEST_RESTAURANT_NAME = "SmartTable Test Bistro";
export const TEST_RESTAURANT_SLUG = "smarttable-test-bistro";

export const ACCOUNT_SPECS = Object.freeze([
  {
    key: "guest",
    label: "Guest tester",
    email: "guest@smarttable.com",
    emailEnv: "SMARTTABLE_TEST_GUEST_EMAIL",
    passwordEnv: "SMARTTABLE_TEST_GUEST_PASSWORD",
    role: "guest",
    fullName: "SmartTable Staging Guest"
  },
  {
    key: "partner",
    label: "Test Bistro partner",
    email: "owner@hudsonhearth.com",
    emailEnv: "SMARTTABLE_TEST_PARTNER_EMAIL",
    passwordEnv: "SMARTTABLE_TEST_PARTNER_PASSWORD",
    role: "partner",
    restaurantRole: "owner",
    fullName: "SmartTable Test Bistro Owner"
  },
  {
    key: "admin",
    label: "BASIC admin",
    email: "ops@smarttable.com",
    emailEnv: "SMARTTABLE_TEST_ADMIN_EMAIL",
    passwordEnv: "SMARTTABLE_TEST_ADMIN_PASSWORD",
    role: "admin",
    fullName: "SmartTable BASIC Ops Admin"
  },
  {
    key: "superadmin",
    label: "Superadmin",
    email: "admin@smarttable.com",
    emailEnv: "SMARTTABLE_TEST_SUPERADMIN_EMAIL",
    passwordEnv: "SMARTTABLE_TEST_SUPERADMIN_PASSWORD",
    role: "super_admin",
    fullName: "SmartTable Superadmin"
  }
]);

const passwordCharacters = {
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lower: "abcdefghijkmnopqrstuvwxyz",
  digit: "23456789",
  symbol: "!@%^*-_=+?"
};
const allPasswordCharacters = Object.values(passwordCharacters).join("");

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

export function readStagingEnvFile() {
  if (!existsSync(stagingEnvPath)) {
    throw new Error(".env.staging.local is required for staging test account setup.");
  }
  return {
    raw: readFileSync(stagingEnvPath, "utf8"),
    values: parseEnvFile(readFileSync(stagingEnvPath, "utf8"))
  };
}

function randomCharacter(characters) {
  return characters[crypto.randomInt(0, characters.length)];
}

function shuffleCharacters(value) {
  const chars = [...value];
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join("");
}

export function generateStrongPassword(length = 32) {
  const minimumLength = Math.max(24, length);
  let password = [
    randomCharacter(passwordCharacters.upper),
    randomCharacter(passwordCharacters.lower),
    randomCharacter(passwordCharacters.digit),
    randomCharacter(passwordCharacters.symbol)
  ].join("");
  while (password.length < minimumLength) {
    password += randomCharacter(allPasswordCharacters);
  }
  return shuffleCharacters(password);
}

export function passwordPolicyResult(value = "") {
  const password = String(value || "");
  return {
    length: password.length >= 24,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password)
  };
}

export function passwordMeetsPolicy(value = "") {
  return Object.values(passwordPolicyResult(value)).every(Boolean);
}

function serializeEnvValue(value = "") {
  const stringValue = String(value);
  if (/^[A-Za-z0-9_@.%^!*+\-=?]+$/.test(stringValue)) return stringValue;
  return JSON.stringify(stringValue);
}

function upsertEnvFileValues(raw, updates) {
  const lines = raw.split(/\r?\n/);
  const seen = new Set();
  const next = lines.map((line) => {
    const match = line.match(/^(\s*)(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)(\s*)=/);
    if (!match) return line;
    const key = match[2];
    if (!Object.hasOwn(updates, key)) return line;
    seen.add(key);
    return `${key}=${serializeEnvValue(updates[key])}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) next.push(`${key}=${serializeEnvValue(value)}`);
  }
  return next.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "\n");
}

export function assertEnvFileIgnored() {
  const result = spawnSync("git", ["check-ignore", "-q", ".env.staging.local"], {
    cwd: projectRoot,
    stdio: "ignore"
  });
  if (result.status !== 0) {
    throw new Error(".env.staging.local is not ignored by Git. Refusing to continue.");
  }
  return true;
}

export function ensureStagingPasswords() {
  assertEnvFileIgnored();
  const snapshot = readStagingEnvFile();
  const updates = {};
  for (const spec of ACCOUNT_SPECS) {
    updates[spec.emailEnv] = snapshot.values[spec.emailEnv] || spec.email;
    if (!snapshot.values[spec.passwordEnv] || !passwordMeetsPolicy(snapshot.values[spec.passwordEnv])) {
      updates[spec.passwordEnv] = generateStrongPassword();
    }
  }
  if (Object.keys(updates).length) {
    const merged = upsertEnvFileValues(snapshot.raw, updates);
    writeFileSync(stagingEnvPath, merged, "utf8");
  }
  const next = readStagingEnvFile();
  const generatedPasswordVariables = ACCOUNT_SPECS
    .filter((spec) => Object.hasOwn(updates, spec.passwordEnv))
    .map((spec) => spec.passwordEnv);
  return {
    values: next.values,
    generatedPasswordVariables
  };
}

function readOptionalText(relativePath) {
  const target = path.join(projectRoot, relativePath);
  return existsSync(target) ? readFileSync(target, "utf8").trim() : "";
}

function projectRefFromSupabaseUrl(value = "") {
  const parsed = new URL(String(value || "").trim().replace(/\/+$/, ""));
  if (parsed.protocol !== "https:") throw new Error("SUPABASE_URL must use https.");
  if (!/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)) {
    throw new Error("SUPABASE_URL must point to a Supabase project host.");
  }
  if (parsed.username || parsed.password || (parsed.pathname && parsed.pathname !== "/")) {
    throw new Error("SUPABASE_URL must not include credentials or a path.");
  }
  return parsed.hostname.split(".")[0];
}

export function loadAndValidateStagingEnv({ generatePasswords = false, requireAnonKey = false } = {}) {
  assertEnvFileIgnored();
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv === "production") throw new Error("NODE_ENV=production is not allowed for staging test account tooling.");

  const snapshot = generatePasswords ? ensureStagingPasswords() : readStagingEnvFile();
  const env = snapshot.values || snapshot;
  if (String(env.NODE_ENV || "").trim().toLowerCase() === "production") {
    throw new Error(".env.staging.local must not set NODE_ENV=production.");
  }

  const required = [
    "STAGING_SUPABASE_PROJECT_REF",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY"
  ];
  if (requireAnonKey) required.push("SUPABASE_ANON_KEY");
  for (const spec of ACCOUNT_SPECS) required.push(spec.passwordEnv);

  const missing = required.filter((key) => !String(env[key] || "").trim());
  if (missing.length) throw new Error(`Missing required staging variables: ${missing.join(", ")}`);

  for (const spec of ACCOUNT_SPECS) {
    const password = env[spec.passwordEnv];
    if (!passwordMeetsPolicy(password)) {
      throw new Error(`${spec.passwordEnv} is present but does not meet the staging password policy.`);
    }
  }

  const urlProjectRef = projectRefFromSupabaseUrl(env.SUPABASE_URL);
  if (urlProjectRef !== env.STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("Configured SUPABASE_URL project ref does not match STAGING_SUPABASE_PROJECT_REF.");
  }

  const linkedProjectRef = readOptionalText("supabase/.temp/project-ref");
  if (linkedProjectRef && linkedProjectRef !== env.STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("Supabase CLI linked project ref does not match STAGING_SUPABASE_PROJECT_REF.");
  }

  const linkedProjectJson = readOptionalText("supabase/.temp/linked-project.json");
  let linkedProject = null;
  if (linkedProjectJson) {
    linkedProject = JSON.parse(linkedProjectJson);
    if (linkedProject.ref && linkedProject.ref !== env.STAGING_SUPABASE_PROJECT_REF) {
      throw new Error("Supabase CLI linked project metadata does not match STAGING_SUPABASE_PROJECT_REF.");
    }
    if (linkedProject.name && !/staging/i.test(linkedProject.name)) {
      throw new Error("Supabase CLI linked project name is not marked as staging.");
    }
  }

  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    env,
    projectRef: env.STAGING_SUPABASE_PROJECT_REF,
    linkedProjectName: linkedProject?.name || null,
    generatedPasswordVariables: snapshot.generatedPasswordVariables || []
  };
}

export function supabaseBaseUrl(env) {
  return String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
}

export async function supabaseRequest(env, pathname, options = {}) {
  const service = options.service !== false;
  const apiKey = service ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY;
  if (!apiKey) throw new Error(service ? "SUPABASE_SERVICE_ROLE_KEY is required." : "SUPABASE_ANON_KEY is required.");
  const authorizationToken = options.token || apiKey;
  const response = await fetch(`${supabaseBaseUrl(env)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${authorizationToken}`,
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

export async function loadPostgrestSchema(env) {
  const spec = await supabaseRequest(env, "/rest/v1/", {
    headers: { Accept: "application/openapi+json" }
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

export function filterPayload(schema, tableName, payload) {
  const columns = tableColumns(schema, tableName);
  if (!columns.size) throw new Error(`Staging schema does not expose required table: ${tableName}`);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => columns.has(key)));
}

export async function restSelect(env, table, query) {
  return supabaseRequest(env, `/rest/v1/${table}?${query}`);
}

export async function restUpsert(env, table, conflict, payload) {
  return supabaseRequest(env, `/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: payload
  });
}

export async function restInsert(env, table, payload) {
  return supabaseRequest(env, `/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: payload
  });
}

export async function restPatch(env, table, filter, payload) {
  return supabaseRequest(env, `/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: payload
  });
}

export async function listAuthUsers(env) {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const data = await supabaseRequest(env, `/auth/v1/admin/users?page=${page}&per_page=200`);
    const batch = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
}

export async function findAuthUserByEmail(env, email) {
  const expected = String(email || "").trim().toLowerCase();
  return (await listAuthUsers(env)).find((user) => String(user.email || "").toLowerCase() === expected) || null;
}

export async function passwordLogin(env, email, password) {
  return supabaseRequest(env, "/auth/v1/token?grant_type=password", {
    method: "POST",
    service: false,
    body: { email, password }
  });
}

export function accountPassword(env, spec) {
  return String(env[spec.passwordEnv] || "");
}

export function accountEmail(env, spec) {
  return String(env[spec.emailEnv] || spec.email).trim().toLowerCase();
}

export function displayRole(role) {
  return role === "super_admin" ? "superadmin" : role;
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}
