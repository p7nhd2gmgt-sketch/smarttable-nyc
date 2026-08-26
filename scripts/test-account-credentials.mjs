import { ensureRoleTestCredentialEnv } from "../src/test-account-credentials.js";

export { ensureRoleTestCredentialEnv };

export const TEST_ACCOUNTS = ensureRoleTestCredentialEnv(process.env);

export function credentialsFor(role) {
  const key = String(role || "").trim().toLowerCase().replace("super_admin", "superadmin");
  const credentials = TEST_ACCOUNTS[key];
  if (!credentials) throw new Error(`Unknown test account role: ${role}`);
  return credentials;
}
