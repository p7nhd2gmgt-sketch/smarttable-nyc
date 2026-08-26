import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function read(path) {
  return await readFile(new URL(path, root), "utf8");
}

function includesAll(source, tokens, label) {
  for (const token of tokens) {
    assert.ok(source.includes(token), `${label} is missing ${token}.`);
  }
}

function parseLocale(source, label) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

function assertLocaleKeys(locales, keys, label) {
  for (const [locale, messages] of Object.entries(locales)) {
    for (const key of keys) {
      const value = String(messages[key] || "").trim();
      assert.ok(value, `${label}: ${locale}.json is missing ${key}.`);
      assert.notEqual(value, key, `${label}: ${locale}.json renders raw key ${key}.`);
    }
  }
}

const [
  indexHtml,
  app,
  styles,
  guestDesign,
  enSource,
  esSource,
  huSource
] = await Promise.all([
  read("public/index.html"),
  read("public/app.js"),
  read("public/styles.css"),
  read("public/guest/design-system.css"),
  read("public/locales/en.json"),
  read("public/locales/es.json"),
  read("public/locales/hu.json")
]);

const locales = {
  en: parseLocale(enSource, "English locale"),
  es: parseLocale(esSource, "Spanish locale"),
  hu: parseLocale(huSource, "Hungarian locale")
};

includesAll(indexHtml, [
  "class=\"skip-link\"",
  "href=\"#app\"",
  "<main id=\"app\"",
  "aria-live=\"polite\"",
  "tabindex=\"-1\"",
  "aria-label=\"Primary navigation\"",
  "data-language-selector",
  "aria-haspopup=\"listbox\"",
  "aria-expanded=\"false\"",
  "role=\"listbox\"",
  "role=\"status\""
], "Accessible public shell");

includesAll(app, [
  "function safeInternalNavigationUrl",
  "function syncGuestModalState(",
  "function handleGuestModalKeydown(",
  "function modalReturnSelector(",
  "function restoreGuestModalFocus(",
  "document.addEventListener(\"keydown\"",
  "event.key === \"Escape\"",
  "event.key === \"ArrowDown\"",
  "event.key === \"ArrowUp\"",
  "event.key === \"Enter\"",
  "aria-current=\"step\"",
  "role=\"alert\"",
  "aria-live=\"polite\"",
  "setButtonPending(button, true",
  "aria-busy",
  "class=\"field-error\"",
  "signup-validation-summary",
  "window.matchMedia?.(\"(prefers-reduced-motion: reduce)\")"
], "Client keyboard, modal, error, and reduced-motion behavior");

includesAll(styles, [
  "a:focus-visible",
  "button:focus-visible",
  "input:focus-visible",
  "select:focus-visible",
  "textarea:focus-visible",
  "outline: 3px solid",
  "min-height: 44px",
  "overflow-x: hidden",
  "overflow-x: clip",
  ".field-error",
  ".form-error",
  ".empty-state",
  ".app-error-state",
  ".modal-backdrop",
  ".modal-card",
  "@media (prefers-reduced-motion: reduce)",
  "@media (max-width: 760px)",
  "@media (max-width: 430px)",
  ".table-wrap",
  "overflow-x: auto",
  ".language-selector__option:focus-visible"
], "Global accessibility and responsive CSS");

includesAll(guestDesign, [
  "min-height: 44px",
  "min-width: 0",
  "@media"
], "Guest design-system accessibility primitives");

assert.ok((app.match(/<h1\b/g) || []).length >= 1, "The app must render visible H1 headings for primary pages.");
assert.ok(!app.includes("autofocus"), "Autofocus attributes should not steal focus unexpectedly.");
assert.ok(!app.includes("tabindex=\"1\"") && !app.includes("tabindex=\"2\""), "Positive tabindex values must not be used.");
assert.ok(!app.includes("onclick=\""), "Inline onclick handlers must not be used.");

assertLocaleKeys(locales, [
  "app_error_title",
  "app_error_body",
  "loading_label",
  "primary_navigation_label",
  "footer_navigation_label",
  "language_selector_label",
  "language_selector_menu_label",
  "session_expired_message",
  "signup_validation_summary_title",
  "signup_error_required",
  "signup_error_email",
  "signup_error_password",
  "invalid_notification_link",
  "route_forbidden_title",
  "route_go_home"
], "Accessibility-visible copy");

console.log("Accessibility readiness checks passed.");
