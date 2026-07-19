import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [packageJson, publicApp, serverCore, indexHtml] = await Promise.all([
  read("package.json").then(JSON.parse),
  read("public/app.js"),
  read("src/app-core.js"),
  read("public/index.html")
]);

assert(packageJson.scripts?.build, "package.json must define a build script.");
assert(packageJson.scripts?.test, "package.json must define a test script.");
assert(packageJson.scripts?.lint, "package.json must define a lint script.");
assert(packageJson.scripts?.typecheck, "package.json must define a typecheck script.");

assert(!publicApp.includes("SUPABASE_SERVICE_ROLE_KEY"), "Frontend must not reference the Supabase service-role key.");
assert(!publicApp.includes("RESEND_API_KEY"), "Frontend must not reference the Resend API key.");
assert(!publicApp.includes("/rest/v1/"), "Frontend must not call Supabase REST directly; use /api endpoints.");
assert(!publicApp.includes("localStorage.setItem(\"password\""), "Passwords must not be stored in localStorage.");
assert(!publicApp.includes("localStorage.setItem('password'"), "Passwords must not be stored in localStorage.");
assert(serverCore.includes("function genericLoginError"), "Authentication should use safe generic login errors.");
assert(serverCore.includes("allowedSignupAnalyticsProperties"), "Analytics must be restricted to approved non-sensitive properties.");
assert(indexHtml.includes("<meta"), "The public shell must include SEO/meta markup.");

for (const locale of ["en", "es", "hu"]) {
  const messages = JSON.parse(await read(`public/locales/${locale}.json`));
  for (const key of ["feature_flag_label", "feature_flag_disabled_label"]) {
    assert(typeof messages[key] === "string" && messages[key].trim(), `${locale}.json must define ${key}.`);
  }
}

console.log("Static quality checks passed.");
