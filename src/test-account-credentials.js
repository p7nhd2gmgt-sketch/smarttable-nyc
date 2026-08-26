import crypto from "node:crypto";

const TEST_ACCOUNT_DEFINITIONS = {
  guest: {
    emailEnv: "SMARTTABLE_TEST_GUEST_EMAIL",
    passwordEnv: "SMARTTABLE_TEST_GUEST_PASSWORD",
    defaultEmail: "guest@smarttable.com"
  },
  partner: {
    emailEnv: "SMARTTABLE_TEST_PARTNER_EMAIL",
    passwordEnv: "SMARTTABLE_TEST_PARTNER_PASSWORD",
    defaultEmail: "owner@hudsonhearth.com"
  },
  admin: {
    emailEnv: "SMARTTABLE_TEST_ADMIN_EMAIL",
    passwordEnv: "SMARTTABLE_TEST_ADMIN_PASSWORD",
    defaultEmail: "ops@smarttable.com"
  },
  superadmin: {
    emailEnv: "SMARTTABLE_TEST_SUPERADMIN_EMAIL",
    passwordEnv: "SMARTTABLE_TEST_SUPERADMIN_PASSWORD",
    defaultEmail: "admin@smarttable.com"
  }
};

const roleAliases = {
  super_admin: "superadmin",
  superuser: "superadmin",
  restaurant: "partner",
  restaurant_partner: "partner"
};

function accountRole(role = "") {
  const key = String(role || "").trim().toLowerCase();
  return roleAliases[key] || key;
}

function generatedPassword(role) {
  globalThis.__SMARTTABLE_GENERATED_TEST_PASSWORDS ||= {};
  if (!globalThis.__SMARTTABLE_GENERATED_TEST_PASSWORDS[role]) {
    globalThis.__SMARTTABLE_GENERATED_TEST_PASSWORDS[role] = `St-${role}-${crypto.randomUUID()}-Aa1!`;
  }
  return globalThis.__SMARTTABLE_GENERATED_TEST_PASSWORDS[role];
}

export function getRoleTestCredentials(role, env = process.env) {
  const key = accountRole(role);
  const definition = TEST_ACCOUNT_DEFINITIONS[key];
  if (!definition) throw new Error(`Unknown SmartTable test account role: ${role}`);
  return {
    role: key === "superadmin" ? "super_admin" : key,
    email: String(env[definition.emailEnv] || definition.defaultEmail).trim().toLowerCase(),
    password: String(env[definition.passwordEnv] || generatedPassword(key))
  };
}

export function ensureRoleTestCredentialEnv(env = process.env) {
  const credentials = {};
  for (const role of Object.keys(TEST_ACCOUNT_DEFINITIONS)) {
    const definition = TEST_ACCOUNT_DEFINITIONS[role];
    if (!env[definition.emailEnv]) env[definition.emailEnv] = definition.defaultEmail;
    if (!env[definition.passwordEnv]) env[definition.passwordEnv] = generatedPassword(role);
    credentials[role] = getRoleTestCredentials(role, env);
  }
  return credentials;
}

export const TEST_ACCOUNT_ROLES = Object.freeze(Object.keys(TEST_ACCOUNT_DEFINITIONS));
