import { expect, test } from "@playwright/test";

test.describe("inline form validation", () => {
  test("required and format errors appear beside the affected field", async ({ page }) => {
    await page.goto("/signup");
    const form = page.locator("#guestSignupForm");
    const fullName = form.locator('[name="full_name"]');
    const email = form.locator('[name="email"]');

    await form.locator('button[type="submit"]').click();
    await expect(fullName).toHaveClass(/is-field-invalid/);
    await expect(email).toHaveClass(/is-field-invalid/);
    await expect(fullName.locator("xpath=ancestor::label[1]").locator(".inline-field-feedback")).toBeVisible();
    await expect(fullName).toHaveAttribute("aria-invalid", "true");

    await fullName.fill("Test Guest");
    await expect(fullName).not.toHaveClass(/is-field-invalid/);
    await email.fill("not-an-email");
    await expect(email).toHaveClass(/is-field-invalid/);
    await expect(email.locator("xpath=ancestor::label[1]").locator(".inline-field-feedback")).toContainText(/email|correo|e-mail/i);
    await email.fill("guest@example.com");
    await expect(email).not.toHaveClass(/is-field-invalid/);
  });

  test("cross-field and structured-data errors are highlighted inline", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const form = document.createElement("form");
      form.id = "inlineValidationProbe";
      form.noValidate = true;
      form.innerHTML = `
        <label>Password<input name="password" value="Weak1!"></label>
        <label>Confirm password<input name="confirm_password" value="Different1!"></label>
        <label>Start<input name="start_time" type="time" value="20:00"></label>
        <label>End<input name="end_time" type="time" value="19:00"></label>
        <label>Tables<textarea name="tables">not-json</textarea></label>
        <button type="submit">Validate</button>
      `;
      document.body.append(form);
    });

    const form = page.locator("#inlineValidationProbe");
    await form.locator('button[type="submit"]').click();
    await expect(form.locator('[name="password"]')).toHaveClass(/is-field-invalid/);
    await expect(form.locator('[name="confirm_password"]')).toHaveClass(/is-field-invalid/);
    await expect(form.locator('[name="end_time"]')).toHaveClass(/is-field-invalid/);
    await expect(form.locator('[name="tables"]')).toHaveClass(/is-field-invalid/);
    await expect(form.locator(".inline-field-feedback")).toHaveCount(4);
  });
});
