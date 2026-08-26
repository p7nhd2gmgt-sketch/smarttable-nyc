import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const server = fs.readFileSync(path.join(root, "src", "app-core.js"), "utf8");
const client = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "0067_dining_consumption_upload_security.sql"), "utf8");
const consumptionSubmitStart = client.indexOf("async function submitConsumptionUpload");
const consumptionSubmitEnd = client.indexOf("\nasync function ", consumptionSubmitStart + 1);
const consumptionSubmit = consumptionSubmitStart >= 0
  ? client.slice(
      consumptionSubmitStart,
      consumptionSubmitEnd > consumptionSubmitStart ? consumptionSubmitEnd : client.length
    )
  : "";

const checks = [
  ["upload signing requires the authenticated reservation owner", server.includes("authenticatedGuestReservationRow(headers, reservationId)")],
  ["upload paths are bound to authenticated profile and reservation", server.includes("expectedStoragePrefix") && server.includes("storagePath.startsWith(expectedStoragePrefix)")],
  ["signed uploads cannot overwrite existing files", server.includes("upsert: false")],
  ["client sends reservation-bound signing data", client.includes("reservation_id: data.reservation_id") && client.includes("file_size: file.size")],
  [
    "client does not send caller-controlled identity fields in the consumption payload",
    Boolean(consumptionSubmit) && !/(?:guest_(?:id|name|email)|restaurant_id|profile_key)\s*:/u.test(consumptionSubmit)
  ],
  ["client does not accept an external image URL", !client.includes('name="image_url"')],
  ["anonymous upload policy is removed", migration.includes("drop policy if exists consumption_insert_public")],
  ["legacy broad owner policy is removed", migration.includes("drop policy if exists dining_consumption_uploads_owner_scoped")],
  ["consumption uploads use an authenticated scoped read policy", migration.includes("create policy consumption_select_scoped") && migration.includes("for select to authenticated")],
  ["all public and browser table privileges are revoked before scoped read access", migration.includes("revoke all privileges on table public.dining_consumption_uploads from public, anon, authenticated")],
  ["loyalty RPC is not executable by public roles", migration.includes("revoke execute on function public.award_loyalty_points(text, integer, uuid) from public, anon, authenticated")],
  ["loyalty RPC hardening is baseline-compatible", migration.includes("to_regprocedure('public.award_loyalty_points(text,integer,uuid)')")],
  ["one reward upload is enforced per reservation", migration.includes("dining_consumption_uploads_reservation_unique")]
];

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"}: ${label}`);
if (failed.length) process.exit(1);
console.log("Dining consumption upload security checks passed.");
