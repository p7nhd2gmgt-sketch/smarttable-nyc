import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

for (const required of [
  "installInlineFormValidation()",
  "markInlineFieldFeedback",
  "markFormFieldFeedback",
  "customFormValidationErrors",
  'document.addEventListener("invalid"',
  'document.addEventListener("submit"',
  'document.addEventListener("input"',
  'document.addEventListener("change"',
  'event.stopImmediatePropagation()',
  'candidate.setAttribute("aria-invalid", "true")',
  "highlightRestaurantReadinessFields",
  "restaurantReadinessFieldMap"
]) {
  assert.ok(app.includes(required), `Inline form validation is missing: ${required}`);
}

for (const required of [
  ".inline-field-feedback",
  "input.is-field-invalid",
  "select.is-field-invalid",
  "textarea.is-field-invalid",
  "input.is-field-warning",
  ".has-readiness-warning",
  "@media (forced-colors: active)"
]) {
  assert.ok(styles.includes(required), `Inline validation styling is missing: ${required}`);
}

for (const language of ["en", "es", "hu"]) {
  const locale = JSON.parse(await readFile(new URL(`../public/locales/${language}.json`, import.meta.url), "utf8"));
  for (const key of [
    "form_validation_required",
    "form_validation_email",
    "form_validation_review_highlighted",
    "restaurant_readiness_field_warning"
  ]) {
    assert.ok(locale[key], `${language} locale is missing ${key}`);
  }
}

console.log("Inline form validation checks passed: field-level errors, accessible state, warning styling, custom rules, readiness highlighting, and translations.");
