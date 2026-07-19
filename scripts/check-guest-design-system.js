import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [styles, guestDesignSystem] = await Promise.all([
  read("public/styles.css"),
  read("public/guest/design-system.css")
]);

assert(styles.includes("/guest/design-system.css"), "Main stylesheet must import the guest design system.");

for (const token of [
  "--guest-bg",
  "--guest-space-4",
  "--guest-radius-md",
  ".guest-container",
  ".guest-grid",
  ".guest-card",
  ".guest-form-card",
  ".guest-primary-action",
  ".guest-secondary-action",
  ".guest-field-grid",
  ".guest-choice-grid",
  ".guest-filter-chip",
  ".guest-badge",
  ".guest-modal-shell",
  ".guest-skeleton",
  ".guest-empty-state",
  ".guest-error-state",
  ".guest-success-state",
  ".guest-gallery",
  ".guest-mobile-nav"
]) {
  assert(guestDesignSystem.includes(token), `Guest design system is missing ${token}.`);
}

console.log("Guest design system checks passed.");
