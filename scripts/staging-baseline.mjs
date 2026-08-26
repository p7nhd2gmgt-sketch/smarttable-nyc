import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const baselineDir = path.join(repoRoot, "supabase", "baseline", "basic-1.0");
const schemaFile = path.join(baselineDir, "0001_basic_1_0_schema.sql");
const referenceFile = path.join(baselineDir, "0002_basic_1_0_required_reference_data.sql");
const manifestFile = path.join(baselineDir, "object-manifest.json");
const checksumsFile = path.join(baselineDir, "SHA256SUMS");
const stagingEnvFile = path.join(repoRoot, ".env.staging.local");
const linkedProjectFile = path.join(repoRoot, "supabase", ".temp", "project-ref");
const linkedProjectJsonFile = path.join(repoRoot, "supabase", ".temp", "linked-project.json");

const mode = process.argv[2];
const args = new Set(process.argv.slice(3));
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
const requiredTables = Object.keys(manifest.tables || {}).sort();
const requiredViews = manifest.views || [];
const requiredFunctions = manifest.functions || [];
const requiredIndexes = manifest.indexes || [];
const requiredTriggers = manifest.triggers || [];
const requiredConstraints = manifest.constraints || [];
const requiredReferenceData = manifest.required_reference_data || {};
const allowedExtraPublicFunctions = new Map([
  ["rls_auto_enable", "Supabase platform RLS helper with search_path=pg_catalog"]
]);
const allowedPostBaselineTables = new Set([
  // Audited forward migrations 0057-0067. Unknown tables still fail closed.
  "restaurant_notification_preferences",
  "restaurant_notification_sms_recipients",
  "partner_device_subscriptions",
  "reservation_alerts",
  "reservation_alert_deliveries",
  "reservation_alert_acknowledgements",
  "review_photos",
  "post_visit_action_tokens",
  "post_visit_notification_events",
  "video_service_orders",
  "food_feed_videos",
  "food_feed_favorites"
]);
let queryCounter = 0;

const forbiddenProjectNamePattern = /\b(prod|production|live)\b/i;
const knownProductionRefNames = [
  "PRODUCTION_SUPABASE_PROJECT_REF",
  "SMARTTABLE_PRODUCTION_SUPABASE_PROJECT_REF",
  "SUPABASE_PRODUCTION_PROJECT_REF",
  "SUPABASE_PROD_PROJECT_REF"
];

const productionLikeTables = [
  "restaurants",
  "offers",
  "reservations",
  "profiles",
  "guests",
  "restaurant_users",
  "partner_invitations"
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) fail(".env.staging.local is required for staging baseline commands.");
  const env = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [name, ...valueParts] = line.split("=");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    let value = valueParts.join("=");
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[name] = value;
  }
  return env;
}

function loadStagingEnv() {
  const env = parseEnvFile(stagingEnvFile);
  const required = [
    "STAGING_SUPABASE_PROJECT_REF",
    "STAGING_DB_PASSWORD",
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
  ];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) fail(`Missing required staging environment names: ${missing.join(", ")}`);
  for (const [name, value] of Object.entries(env)) process.env[name] = value;
  return env;
}

function readLinkedProject() {
  if (!existsSync(linkedProjectFile)) fail("Supabase project is not linked. Missing supabase/.temp/project-ref.");
  const ref = readFileSync(linkedProjectFile, "utf8").trim();
  let name = "";
  if (existsSync(linkedProjectJsonFile)) {
    try {
      name = JSON.parse(readFileSync(linkedProjectJsonFile, "utf8")).name || "";
    } catch {
      name = "";
    }
  }
  return { ref, name };
}

function assertStagingOnly(env) {
  const linked = readLinkedProject();
  assert.equal(linked.ref, env.STAGING_SUPABASE_PROJECT_REF, "Linked project ref must match STAGING_SUPABASE_PROJECT_REF.");
  if (forbiddenProjectNamePattern.test(linked.name || "")) {
    fail(`Linked Supabase project name is production-like: ${linked.name}`);
  }
  for (const name of knownProductionRefNames) {
    if (env[name] && env[name] === linked.ref) fail(`Linked project ref matches ${name}; refusing to continue.`);
  }
  if (/^production$/i.test(env.SMARTTABLE_ENV || "") || /^production$/i.test(env.VERCEL_ENV || "")) {
    fail("Staging baseline commands must not run with SMARTTABLE_ENV or VERCEL_ENV set to production.");
  }
  return linked;
}

function parseFirstJson(text) {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("No JSON object found in Supabase CLI output.");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') inString = true;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, index + 1));
    }
  }
  throw new Error("Supabase CLI JSON output was incomplete.");
}

function run(command, argsList, options = {}) {
  const isWindowsCmd = process.platform === "win32" && /\.cmd$/i.test(command);
  const actualCommand = isWindowsCmd ? "cmd.exe" : command;
  const actualArgs = isWindowsCmd ? ["/d", "/s", "/c", command, ...argsList] : argsList;
  const result = spawnSync(actualCommand, actualArgs, {
    cwd: repoRoot,
    env: { ...process.env },
    encoding: "utf8",
    windowsHide: true,
    ...options
  });
  if (result.error) {
    throw new Error(`${command} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(detail || `${command} exited with status ${result.status}`);
  }
  return { stdout: result.stdout || "", stderr: result.stderr || "" };
}

function runSupabase(argsList) {
  return run("npx.cmd", ["supabase", ...argsList]);
}

async function query(sql) {
  const queryDir = path.join(repoRoot, "tmp", "basic-baseline-queries");
  mkdirSync(queryDir, { recursive: true });
  queryCounter += 1;
  const queryFile = path.join(queryDir, `query-${Date.now()}-${queryCounter}.sql`);
  writeFileSync(queryFile, sql, "utf8");
  const result = runSupabase(["db", "query", "--linked", "--output", "json", "--file", queryFile]);
  return parseFirstJson(result.stdout);
}

async function queryRows(sql) {
  return (await query(sql)).rows || [];
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function baselineChecksum() {
  const hash = createHash("sha256");
  for (const file of [schemaFile, referenceFile, manifestFile, checksumsFile]) {
    hash.update(readFileSync(file));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function currentCommit() {
  try {
    return run("git", ["rev-parse", "HEAD"]).stdout.trim();
  } catch {
    return null;
  }
}

async function getTargetState() {
  const publicTables = (await queryRows(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name;
  `)).map((row) => row.table_name);

  const migrationHistoryExists = Boolean((await queryRows(`
    select to_regclass('supabase_migrations.schema_migrations') is not null as exists;
  `))[0]?.exists);

  let migrationRows = [];
  if (migrationHistoryExists) {
    migrationRows = await queryRows(`
      select version, name
      from supabase_migrations.schema_migrations
      order by version;
    `);
  }

  const rowCounts = {};
  for (const table of productionLikeTables.filter((tableName) => publicTables.includes(tableName))) {
    const rows = await queryRows(`select count(*)::int as row_count from public.${table};`);
    rowCounts[table] = Number(rows[0]?.row_count || 0);
  }

  const hasAllBaselineTables = requiredTables.every((table) => publicTables.includes(table));
  const unexpectedTables = publicTables.filter((table) => !requiredTables.includes(table));
  const productionLikeRows = Object.entries(rowCounts)
    .filter(([, count]) => count > 0)
    .map(([table, count]) => `${table}:${count}`);

  return {
    publicTables,
    migrationRows,
    rowCounts,
    isEmpty: publicTables.length === 0 && migrationRows.length === 0,
    hasAllBaselineTables,
    unexpectedTables,
    productionLikeRows
  };
}

function assertNoUnexpectedTargetState(state, {
  requireEmpty = false,
  allowPostBaselineExtensions = false,
  allowExistingData = false
} = {}) {
  if (state.migrationRows.length) {
    fail(`Unexpected Supabase migration history rows exist: ${state.migrationRows.map((row) => row.version).join(", ")}`);
  }
  const unexpectedTables = allowPostBaselineExtensions
    ? state.unexpectedTables.filter((table) => !allowedPostBaselineTables.has(table))
    : state.unexpectedTables;
  if (unexpectedTables.length) {
    fail(`Unexpected public tables exist: ${unexpectedTables.join(", ")}`);
  }
  if (!allowExistingData && state.productionLikeRows.length) {
    fail(`Production-like dataset detected: ${state.productionLikeRows.join(", ")}`);
  }
  if (requireEmpty && !state.isEmpty) {
    fail("Target database is not empty. Refusing to apply the fresh baseline.");
  }
}

function createDryRunWorkdir() {
  const dryRunRoot = path.join(repoRoot, "tmp", `basic-baseline-dry-run-${Date.now()}`);
  const dryRunSupabase = path.join(dryRunRoot, "supabase");
  const dryRunMigrations = path.join(dryRunSupabase, "migrations");
  mkdirSync(dryRunMigrations, { recursive: true });
  mkdirSync(path.join(dryRunSupabase, ".temp"), { recursive: true });
  copyFileSync(path.join(repoRoot, "supabase", "config.toml"), path.join(dryRunSupabase, "config.toml"));
  copyFileSync(linkedProjectFile, path.join(dryRunSupabase, ".temp", "project-ref"));
  copyFileSync(schemaFile, path.join(dryRunMigrations, "0001_basic_1_0_schema.sql"));
  copyFileSync(referenceFile, path.join(dryRunMigrations, "0002_basic_1_0_required_reference_data.sql"));
  return dryRunRoot;
}

function createCompatibilityWorkdir() {
  const compatibilityRoot = path.join(repoRoot, "tmp", `basic-baseline-compatibility-${Date.now()}`);
  const compatibilitySupabase = path.join(compatibilityRoot, "supabase");
  const compatibilityMigrations = path.join(compatibilitySupabase, "migrations");
  mkdirSync(compatibilityMigrations, { recursive: true });
  mkdirSync(path.join(compatibilitySupabase, ".temp"), { recursive: true });
  copyFileSync(path.join(repoRoot, "supabase", "config.toml"), path.join(compatibilitySupabase, "config.toml"));
  copyFileSync(linkedProjectFile, path.join(compatibilitySupabase, ".temp", "project-ref"));
  writeFileSync(
    path.join(compatibilityMigrations, "0057_post_baseline_compatibility_probe.sql"),
    [
      "-- Dry-run only. This migration file is generated in tmp/ to prove post-baseline migration recognition.",
      "begin;",
      "select 'smarttable_basic_1_0_post_baseline_compatibility_probe'::text as probe;",
      "commit;",
      ""
    ].join("\n"),
    "utf8"
  );
  return compatibilityRoot;
}

function printObjectPlan(linked, state) {
  console.log(JSON.stringify({
    environment: "staging",
    linked_project_ref: linked.ref,
    linked_project_name: linked.name || null,
    target_state: state.isEmpty ? "empty" : state.hasAllBaselineTables ? "baseline_present" : "non_empty",
    public_table_count: state.publicTables.length,
    migration_history_count: state.migrationRows.length,
    baseline_plan: {
      schema_file: path.basename(schemaFile),
      reference_data_file: path.basename(referenceFile),
      tables: requiredTables.length,
      views: requiredViews.length,
      functions: requiredFunctions.length,
      indexes: requiredIndexes.length,
      triggers: requiredTriggers.length,
      enums: Object.keys(manifest.enums || {}).length,
      constraints: requiredConstraints.length,
      required_reference_groups: Object.keys(requiredReferenceData).length
    }
  }, null, 2));
}

async function dryRun() {
  const env = loadStagingEnv();
  const linked = assertStagingOnly(env);
  const state = await getTargetState();
  assertNoUnexpectedTargetState(state, {
    allowPostBaselineExtensions: true,
    allowExistingData: state.hasAllBaselineTables
  });
  printObjectPlan(linked, state);

  if (state.hasAllBaselineTables) {
    const postBaselineTables = state.unexpectedTables.filter((table) => allowedPostBaselineTables.has(table));
    const extensionSummary = postBaselineTables.length
      ? ` Known audited post-baseline tables present: ${postBaselineTables.length}.`
      : "";
    console.log(`Baseline tables already exist.${extensionSummary} Dry-run performed no writes.`);
    return;
  }
  if (!state.isEmpty) fail("Target database is not empty and is not baseline-eligible.");

  const dryRunRoot = createDryRunWorkdir();
  const result = runSupabase(["db", "push", "--linked", "--dry-run", "--workdir", dryRunRoot]);
  console.log(result.stdout.trim());
}

async function compatibilityProbe() {
  const env = loadStagingEnv();
  const linked = assertStagingOnly(env);
  const state = await getTargetState();
  assertNoUnexpectedTargetState(state, {
    allowPostBaselineExtensions: true,
    allowExistingData: state.hasAllBaselineTables
  });
  if (!state.hasAllBaselineTables) {
    const missing = requiredTables.filter((table) => !state.publicTables.includes(table));
    fail(`Cannot run post-baseline compatibility probe because baseline schema is incomplete. Missing: ${missing.join(", ")}`);
  }

  const compatibilityRoot = createCompatibilityWorkdir();
  const result = runSupabase(["db", "push", "--linked", "--dry-run", "--workdir", compatibilityRoot]);
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  if (!combinedOutput.includes("0057_post_baseline_compatibility_probe")) {
    fail("Post-baseline dry-run did not recognize the synthetic 0057 compatibility probe.");
  }
  if (/0001_basic_1_0_schema|0002_basic_1_0_required_reference_data|000[1-9]_|00[1-4][0-9]_|005[0-6]_/i.test(combinedOutput)) {
    fail("Post-baseline dry-run attempted to include pre-0057 historical or baseline migrations.");
  }
  console.log(JSON.stringify({
    environment: "staging",
    linked_project_ref: linked.ref,
    migration_history_strategy: "post-baseline migrations use a separate audited workdir beginning at 0057; historical 0001-0056 are not replayed and Supabase migration history is not forged",
    dry_run: "PASS",
    recognized_probe: "0057_post_baseline_compatibility_probe.sql",
    writes_performed: false
  }, null, 2));
}

async function applyBaseline() {
  const env = loadStagingEnv();
  const linked = assertStagingOnly(env);
  const expectedRefArg = [...args].find((arg) => arg.startsWith("--project-ref="));
  if (!args.has("--confirm-staging-baseline")) {
    fail("Apply requires --confirm-staging-baseline.");
  }
  if (!expectedRefArg || expectedRefArg.slice("--project-ref=".length) !== linked.ref) {
    fail("Apply requires --project-ref=<STAGING_SUPABASE_PROJECT_REF> matching the linked staging project.");
  }

  const state = await getTargetState();
  assertNoUnexpectedTargetState(state, { requireEmpty: true });
  printObjectPlan(linked, state);

  run("npm.cmd", ["run", "check:basic-baseline"]);
  runSupabase(["db", "query", "--linked", "--file", schemaFile]);
  runSupabase(["db", "query", "--linked", "--file", referenceFile]);

  const metadataSql = `
    insert into public.smarttable_schema_baselines (
      baseline_name,
      baseline_version,
      checksum,
      applied_environment,
      source_commit,
      applied_by,
      verification_status,
      metadata
    )
    values (
      'SmartTable BASIC 1.0',
      '1.0',
      ${sqlLiteral(baselineChecksum())},
      'staging',
      ${sqlLiteral(currentCommit())},
      ${sqlLiteral(process.env.USERNAME || process.env.USER || "local-operator")},
      'pending',
      '{"historical_migrations_represented":"0001-0056","normal_migration_history_modified":false,"demo_data_seeded":false}'::jsonb
    );
  `;
  await query(metadataSql);

  try {
    await verifyBaseline({ updateMetadata: true });
  } catch (error) {
    try {
      await query(`
        update public.smarttable_schema_baselines
        set verification_status = 'failed'
        where id = (
          select id
          from public.smarttable_schema_baselines
          where baseline_name = 'SmartTable BASIC 1.0'
            and baseline_version = '1.0'
          order by applied_at desc
          limit 1
        );
      `);
    } catch {
      // Keep the original verification error.
    }
    throw error;
  }
}

async function verifyBaseline({ updateMetadata = false } = {}) {
  const env = loadStagingEnv();
  const linked = assertStagingOnly(env);
  const state = await getTargetState();
  assertNoUnexpectedTargetState(state);
  if (!state.hasAllBaselineTables) {
    const missing = requiredTables.filter((table) => !state.publicTables.includes(table));
    fail(`Baseline schema is incomplete. Missing tables: ${missing.join(", ")}`);
  }

  const columnRows = await queryRows(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position;
  `);
  const tableColumns = new Map();
  for (const row of columnRows) {
    if (!tableColumns.has(row.table_name)) tableColumns.set(row.table_name, new Set());
    tableColumns.get(row.table_name).add(row.column_name);
  }
  for (const [table, definition] of Object.entries(manifest.tables || {})) {
    const columns = tableColumns.get(table) || new Set();
    for (const column of definition.key_columns || []) {
      if (!columns.has(column)) fail(`Missing required column: public.${table}.${column}`);
    }
  }

  const viewRows = await queryRows(`
    select table_name
    from information_schema.views
    where table_schema = 'public'
    order by table_name;
  `);
  const viewNames = new Set(viewRows.map((row) => row.table_name));
  for (const viewName of requiredViews) {
    if (!viewNames.has(viewName)) fail(`Missing view: public.${viewName}`);
  }
  const unexpectedViews = [...viewNames].filter((viewName) => !requiredViews.includes(viewName));
  if (unexpectedViews.length) fail(`Unexpected public views exist: ${unexpectedViews.join(", ")}`);

  const enumRows = await queryRows(`
    select t.typname as enum_name, e.enumlabel as enum_value, e.enumsortorder
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    order by t.typname, e.enumsortorder;
  `);
  const enumMap = new Map();
  for (const row of enumRows) {
    if (!enumMap.has(row.enum_name)) enumMap.set(row.enum_name, []);
    enumMap.get(row.enum_name).push(row.enum_value);
  }
  for (const [enumName, expectedValues] of Object.entries(manifest.enums || {})) {
    const actualValues = enumMap.get(enumName) || [];
    if (JSON.stringify(actualValues) !== JSON.stringify(expectedValues)) {
      fail(`Enum mismatch for public.${enumName}: expected ${expectedValues.join(", ")}; found ${actualValues.join(", ")}`);
    }
  }
  const unexpectedEnums = [...enumMap.keys()].filter((enumName) => !Object.hasOwn(manifest.enums || {}, enumName));
  if (unexpectedEnums.length) fail(`Unexpected public enums exist: ${unexpectedEnums.join(", ")}`);

  const rlsRows = await queryRows(`
    select tablename
    from pg_tables
    where schemaname = 'public'
      and rowsecurity = true;
  `);
  const rlsTables = new Set(rlsRows.map((row) => row.tablename));
  const missingRls = requiredTables.filter((table) => !rlsTables.has(table));
  if (missingRls.length) fail(`RLS is not enabled on: ${missingRls.join(", ")}`);

  const policyRows = await queryRows(`
    select tablename, policyname, cmd, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname;
  `);
  if (!policyRows.length) fail("No RLS policies were found.");
  for (const policy of policyRows) {
    const writeCommand = ["INSERT", "UPDATE", "DELETE", "ALL"].includes(String(policy.cmd || "").toUpperCase());
    const body = `${policy.qual || ""} ${policy.with_check || ""}`.toLowerCase();
    if (writeCommand && /(^|\s)true(\s|$)/i.test(body.trim())) {
      fail(`Overly broad write policy detected: ${policy.tablename}.${policy.policyname}`);
    }
    if (/insert_public/i.test(policy.policyname || "")) {
      fail(`Unexpected direct public insert policy detected: ${policy.tablename}.${policy.policyname}`);
    }
  }

  const functionRows = await queryRows(`
    select proname, prosecdef, coalesce(array_to_string(proconfig, ','), '') as config
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public';
  `);
  const functionNames = new Set(functionRows.map((row) => row.proname));
  for (const fn of requiredFunctions) {
    if (!functionNames.has(fn)) fail(`Missing function: ${fn}`);
  }
  const unexpectedFunctions = [...functionNames]
    .filter((fn) => !requiredFunctions.includes(fn) && !allowedExtraPublicFunctions.has(fn));
  if (unexpectedFunctions.length) {
    fail(`Unexpected public functions exist: ${unexpectedFunctions.join(", ")}`);
  }
  for (const fn of functionRows.filter((row) => row.prosecdef)) {
    const config = String(fn.config || "").toLowerCase();
    const isSupabaseRlsHelper = fn.proname === "rls_auto_enable" && config.includes("search_path=pg_catalog");
    if (!isSupabaseRlsHelper && !config.includes("search_path=public")) {
      fail(`SECURITY DEFINER function missing safe search_path: ${fn.proname}`);
    }
  }

  const indexRows = await queryRows(`
    select
      ic.relname as indexname,
      tc.relname as table_name,
      con.conname as constraint_name
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_class tc on tc.oid = i.indrelid
    join pg_namespace tn on tn.oid = tc.relnamespace
    left join pg_constraint con on con.conindid = ic.oid
    where tn.nspname = 'public'
    order by ic.relname;
  `);
  const indexNames = new Set(indexRows.map((row) => row.indexname));
  for (const indexName of requiredIndexes) {
    if (!indexNames.has(indexName)) fail(`Missing index: ${indexName}`);
  }
  const unexpectedNonConstraintIndexes = indexRows
    .filter((row) => !row.constraint_name && !requiredIndexes.includes(row.indexname))
    .map((row) => `${row.table_name}.${row.indexname}`);
  if (unexpectedNonConstraintIndexes.length) {
    fail(`Unexpected non-constraint indexes exist: ${unexpectedNonConstraintIndexes.join(", ")}`);
  }

  const triggerRows = await queryRows(`
    select
      ns.nspname as table_schema,
      cls.relname as table_name,
      trg.tgname as trigger_name
    from pg_trigger trg
    join pg_class cls on cls.oid = trg.tgrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    where not trg.tgisinternal
      and (
        ns.nspname = 'public'
        or (ns.nspname = 'auth' and cls.relname = 'users')
      )
    order by ns.nspname, cls.relname, trg.tgname;
  `);
  const triggerNames = new Set(triggerRows.map((row) => row.trigger_name));
  for (const triggerName of requiredTriggers) {
    if (!triggerNames.has(triggerName)) fail(`Missing trigger: ${triggerName}`);
  }
  const unexpectedTriggers = triggerRows
    .filter((row) => !requiredTriggers.includes(row.trigger_name))
    .map((row) => `${row.table_schema}.${row.table_name}.${row.trigger_name}`);
  if (unexpectedTriggers.length) {
    fail(`Unexpected triggers exist: ${unexpectedTriggers.join(", ")}`);
  }

  const constraintRows = await queryRows(`
    select table_name, constraint_name, constraint_type
    from information_schema.table_constraints
    where table_schema = 'public';
  `);
  const constraintNames = new Set(constraintRows.map((row) => row.constraint_name));
  for (const constraintName of requiredConstraints) {
    if (!constraintNames.has(constraintName)) fail(`Missing constraint: ${constraintName}`);
  }
  for (const table of requiredTables) {
    if (!constraintRows.some((row) => row.table_name === table && row.constraint_type === "PRIMARY KEY")) {
      fail(`Missing primary key constraint on public.${table}`);
    }
  }
  if (!constraintRows.some((row) => row.table_name === "partner_invitations" && row.constraint_name === "partner_invitations_token_hash_key")) {
    fail("Missing unique invitation token constraint.");
  }

  const marketRows = await queryRows(`
    select code, status
    from public.markets
    where code in ('nyc', 'budapest')
    order by code;
  `);
  const marketMap = new Map(marketRows.map((row) => [row.code, row.status]));
  if (marketMap.get("nyc") !== "active") fail("NYC market is not active.");
  if (marketMap.get("budapest") !== "draft") fail("Budapest market is not draft.");
  if (marketRows.length !== (requiredReferenceData.markets || []).length) fail("Required market reference rows are incomplete.");

  const settingRows = await queryRows(`
    select setting_key
    from public.app_settings
    where setting_key in (${(requiredReferenceData.app_settings || []).map(sqlLiteral).join(", ") || "null"});
  `);
  if (settingRows.length !== (requiredReferenceData.app_settings || []).length) fail("Required app_settings reference rows are incomplete.");

  const featureFlagRows = await queryRows(`
    select key
    from public.feature_flags
    where key in (${(requiredReferenceData.feature_flags || []).map(sqlLiteral).join(", ") || "null"});
  `);
  if (featureFlagRows.length !== (requiredReferenceData.feature_flags || []).length) fail("Required feature_flags reference rows are incomplete.");

  const planRows = await queryRows(`
    select internal_name
    from public.subscription_plans
    where internal_name in (${(requiredReferenceData.subscription_plans || []).map(sqlLiteral).join(", ") || "null"});
  `);
  if (planRows.length !== (requiredReferenceData.subscription_plans || []).length) fail("Required subscription plan reference rows are incomplete.");

  const legalRows = await queryRows(`
    select document_type, count(*)::int as row_count
    from public.legal_documents
    where document_type in (${(requiredReferenceData.legal_document_types || []).map(sqlLiteral).join(", ") || "null"})
      and status = 'published'
      and is_current = true
    group by document_type;
  `);
  const legalMap = new Map(legalRows.map((row) => [row.document_type, Number(row.row_count || 0)]));
  for (const documentType of requiredReferenceData.legal_document_types || []) {
    if (legalMap.get(documentType) !== 3) fail(`Required legal document translations are incomplete for ${documentType}.`);
  }

  const siteContentRows = await queryRows(`
    select key
    from public.site_content
    where key in (${(requiredReferenceData.site_content_keys || []).map(sqlLiteral).join(", ") || "null"});
  `);
  if (siteContentRows.length !== (requiredReferenceData.site_content_keys || []).length) fail("Required site_content reference rows are incomplete.");

  const authUserRows = await queryRows(`
    select count(*)::int as row_count
    from auth.users;
  `);
  if (Number(authUserRows[0]?.row_count || 0) > 0) fail("Auth users exist before approved staging test-account setup.");

  const demoRows = await queryRows(`
    select count(*)::int as row_count
    from public.restaurants
    where lower(name) in ('hudson hearth', 'casa luna trattoria', 'smarttable test bistro');
  `);
  if (Number(demoRows[0]?.row_count || 0) > 0) fail("Legacy/demo restaurant rows exist.");

  const objectRows = await queryRows(`
    select n.nspname as schema_name, c.relname as object_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public';
  `);
  const forbiddenNames = [
    "mobility_provider_integrations",
    "integration_connections",
    "integration_error_logs",
    "manual_performance_uploads",
    "imported_reservations",
    "imported_guests",
    "reservation_sources",
    "toast",
    "square",
    "clover",
    "lightspeed",
    "micros"
  ];
  for (const row of objectRows) {
    const objectName = String(row.object_name || "").toLowerCase();
    if (forbiddenNames.some((name) => objectName.includes(name))) {
      fail(`Forbidden legacy/integration object exists: ${row.object_name}`);
    }
  }

  const metadataRows = await queryRows(`
    select baseline_name, baseline_version, verification_status, checksum
    from public.smarttable_schema_baselines
    where baseline_name = 'SmartTable BASIC 1.0'
      and baseline_version = '1.0'
    order by applied_at desc;
  `);
  if (!metadataRows.length) fail("Baseline metadata row for SmartTable BASIC 1.0 is missing.");
  if (metadataRows.length !== 1) fail(`Expected exactly one baseline metadata row; found ${metadataRows.length}.`);
  if (!updateMetadata && metadataRows[0].verification_status !== "verified") {
    fail(`Latest baseline metadata is not verified; found ${metadataRows[0].verification_status}.`);
  }
  if (!metadataRows[0].checksum) fail("Baseline metadata checksum is missing.");
  const currentBaselineChecksum = baselineChecksum();
  if (!updateMetadata && metadataRows[0].checksum !== currentBaselineChecksum) {
    fail("Latest baseline metadata checksum does not match the current reconciled baseline artifacts.");
  }

  if (updateMetadata) {
    await query(`
      update public.smarttable_schema_baselines
      set verification_status = 'verified',
          checksum = ${sqlLiteral(currentBaselineChecksum)},
          metadata = metadata || '{"manifest_reconciled":true,"manifest_reconciled_at":"2026-07-29","normal_migration_history_modified":false}'::jsonb
      where id = (
        select id
        from public.smarttable_schema_baselines
        where baseline_name = 'SmartTable BASIC 1.0'
          and baseline_version = '1.0'
        order by applied_at desc
        limit 1
      );
    `);
  }

  console.log(JSON.stringify({
    environment: "staging",
    linked_project_ref: linked.ref,
    verification: "PASS",
    tables_verified: requiredTables.length,
    policies_verified: policyRows.length,
    functions_verified: requiredFunctions.length,
    indexes_verified: requiredIndexes.length,
    triggers_verified: requiredTriggers.length,
    constraints_verified: requiredConstraints.length,
    required_reference_groups_verified: Object.keys(requiredReferenceData).length,
    auth_users_present: 0,
    demo_data_present: false,
    forbidden_legacy_objects_present: false
  }, null, 2));
}

try {
  if (mode === "dry-run") await dryRun();
  else if (mode === "compatibility") await compatibilityProbe();
  else if (mode === "apply") await applyBaseline();
  else if (mode === "verify") await verifyBaseline({ updateMetadata: args.has("--record-verification") });
  else fail("Usage: node scripts/staging-baseline.mjs <dry-run|apply|verify|compatibility>");
} catch (error) {
  fail(error.message || String(error));
}
