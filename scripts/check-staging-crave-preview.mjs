#!/usr/bin/env node

import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ACCOUNT_SPECS,
  TEST_RESTAURANT_ID,
  accountEmail,
  accountPassword,
  loadAndValidateStagingEnv
} from "./staging-test-accounts-common.mjs";

const expectedStagingRef = "zwapighnwlwmdkqscrzn";
const baseUrl = String(process.argv[2] || "").trim().replace(/\/+$/, "");
const seedIfMissing = process.argv.includes("--seed-if-missing");
const fixtureDirectory = path.resolve(".tmp", "staging-crave-preview");
const fixturePath = path.join(fixtureDirectory, "vertical-food-feed-qa.webm");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeError(error) {
  return String(error?.message || error || "Unknown error")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/token=[^&\s]+/gi, "token=[REDACTED]")
    .slice(0, 500);
}

async function createVerticalVideo(browser) {
  await fs.mkdir(fixtureDirectory, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 720, height: 1280 } });
  const page = await context.newPage();
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 1280;
    const drawing = canvas.getContext("2d");
    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 900_000 });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    recorder.start(100);
    const startedAt = performance.now();
    while (performance.now() - startedAt < 3_050) {
      const elapsed = performance.now() - startedAt;
      const progress = Math.min(1, elapsed / 3_000);
      drawing.fillStyle = "#143e35";
      drawing.fillRect(0, 0, canvas.width, canvas.height);
      drawing.fillStyle = "#d9a441";
      drawing.fillRect(68, 184 + Math.round(progress * 520), 584, 192);
      drawing.fillStyle = "#ffffff";
      drawing.font = "bold 60px Arial";
      drawing.fillText("SmartTable", 68, 108);
      drawing.font = "bold 48px Arial";
      drawing.fillText("3-second staging QA", 68, 1180);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: "video/webm" });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  });
  await fs.writeFile(fixturePath, Buffer.from(base64, "base64"));
  await context.close();
}

async function loginSuperadmin(page, env) {
  const account = ACCOUNT_SPECS.find((candidate) => candidate.key === "superadmin");
  assert(account, "Superadmin staging account configuration was not found.");
  await page.goto(`${baseUrl}/superadmin`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("smarttable.session");
    sessionStorage.removeItem("smarttable.session");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]:visible').fill(accountEmail(env, account));
  await page.locator('input[name="password"]:visible').fill(accountPassword(env, account));
  const authResponse = page.waitForResponse((response) => (
    response.request().method() === "POST" && /\/api\/auth\/login(?:\?|$)/.test(response.url())
  ), { timeout: 30_000 });
  await page.locator('button[type="submit"]:visible').click();
  assert((await authResponse).status() === 200, "Superadmin staging login failed.");
}

async function seedStagingVideo(browser, env) {
  await createVerticalVideo(browser);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  try {
    const page = await context.newPage();
    await loginSuperadmin(page, env);
    await page.goto(`${baseUrl}/superadmin/food-feed`, { waitUntil: "networkidle" });
    const form = page.locator("#adminFoodFeedForm");
    await form.waitFor({ timeout: 30_000 });
    await form.locator('select[name="restaurant_id"]').selectOption(TEST_RESTAURANT_ID);
    const qaTitle = `Persistent staging Crave video QA ${Date.now()}`;
    await form.locator('input[name="title"]').fill(qaTitle);
    await form.locator('textarea[name="caption"]').fill("Staging-only playback and isolation proof.");
    await form.locator('input[name="media"]').setInputFiles(fixturePath);
    await form.locator('input[name="publish_immediately"]').check();
    const adminResponses = [];
    page.on("response", async (response) => {
      if (response.request().method() !== "POST" || !/\/api\/admin\/food-feed(?:\?|$)/.test(response.url())) return;
      const payload = await response.json().catch(() => ({}));
      adminResponses.push({ status: response.status(), payload });
    });
    await form.locator('button[type="submit"]').click();
    await page.locator(".food-feed-management-card", { hasText: qaTitle }).first().waitFor({ timeout: 45_000 }).catch(async () => {
      const messages = await page.locator('.toast, [role="alert"]').allTextContents().catch(() => []);
      const statuses = adminResponses.map((entry) => `${entry.status}:${safeError(entry.payload?.error || entry.payload?.message || "ok")}`).join(" | ") || "none";
      throw new Error(`Staging Crave upload did not render. API: ${statuses}. UI: ${messages.map(safeError).join(" | ") || "none"}.`);
    });
    const createResponse = adminResponses.find((entry) => entry.status === 201 && entry.payload?.video?.id);
    assert(createResponse, `Staging Crave record creation did not return HTTP 201. Statuses: ${adminResponses.map((entry) => entry.status).join(", ") || "none"}.`);
    const video = createResponse.payload.video;
    assert(video.restaurant_id === TEST_RESTAURANT_ID, "Staging Crave seed used an unexpected restaurant.");
    assert(video.is_test_data === true, "Staging Crave seed was not marked as test data.");
    assert(video.media_type === "video", "Staging Crave seed was not stored as video.");
    assert(video.status === "published", "Staging Crave seed was not published for preview.");
    return video.id;
  } finally {
    await context.close();
  }
}

async function main() {
  assert(baseUrl, "Usage: node scripts/check-staging-crave-preview.mjs <preview-url>");
  const parsedBaseUrl = new URL(baseUrl);
  assert(parsedBaseUrl.protocol === "https:", "The staging Preview must use HTTPS.");
  assert(!/(^|\.)smarttablenyc\.com$/i.test(parsedBaseUrl.hostname), "Refusing to use the production hostname.");

  const { env, projectRef } = loadAndValidateStagingEnv({ requireAnonKey: true });
  assert(projectRef === expectedStagingRef, "Configured project is not the approved staging project.");

  const serviceHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
  };
  const inventoryUrl = new URL("/rest/v1/food_feed_videos", env.SUPABASE_URL);
  inventoryUrl.searchParams.set("select", "id,restaurant_id,status,is_test_data,media_type,duration_ms,width,height");
  inventoryUrl.searchParams.set("restaurant_id", `eq.${TEST_RESTAURANT_ID}`);
  inventoryUrl.searchParams.set("status", "eq.published");
  inventoryUrl.searchParams.set("is_test_data", "eq.true");
  async function readInventory() {
    const response = await fetch(inventoryUrl, { headers: serviceHeaders });
    assert(response.ok, `Staging Crave inventory returned HTTP ${response.status}.`);
    return response.json();
  }
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  let inventory = await readInventory();
  const hadVideo = inventory.some((item) => item.media_type === "video");
  if (!hadVideo) {
    assert(seedIfMissing, "No staging-only Crave video exists. Re-run with --seed-if-missing to create one safe test item.");
    await seedStagingVideo(browser, env);
    inventory = await readInventory();
  }
  assert(inventory.length > 0, "No published staging-only Crave media exists for the test restaurant.");

  const previewUrl = new URL("/food-feed", baseUrl);
  previewUrl.searchParams.set("include_test_data", "true");
  previewUrl.searchParams.set("preview_restaurant_id", TEST_RESTAURANT_ID);
  const apiUrl = new URL("/api/public/food-feed", baseUrl);
  apiUrl.searchParams.set("include_test_data", "true");
  apiUrl.searchParams.set("preview_restaurant_id", TEST_RESTAURANT_ID);
  apiUrl.searchParams.set("limit", "10");
  const apiResponse = await fetch(apiUrl, { headers: { accept: "application/json" } });
  const apiPayload = await apiResponse.json().catch(() => ({}));
  assert(apiResponse.ok, `Staging Crave preview API returned HTTP ${apiResponse.status}.`);
  assert(apiPayload.preview_mode === true, "Staging Crave preview mode was not enabled.");
  assert(Array.isArray(apiPayload.videos) && apiPayload.videos.length > 0, "Staging Crave preview API returned no media.");
  assert(apiPayload.videos.every((item) => item.preview_mode === true && item.is_test_data === true), "Preview API leaked a non-test Crave item.");
  assert(apiPayload.videos.every((item) => item.restaurant?.id === TEST_RESTAURANT_ID), "Preview API returned media from another restaurant.");
  const previewVideos = apiPayload.videos.filter((item) => item.media_type === "video");
  assert(previewVideos.length > 0, "Staging Crave preview contains no video item.");
  const publicApiUrl = new URL("/api/public/food-feed?limit=50", baseUrl);
  const publicApiResponse = await fetch(publicApiUrl, { headers: { accept: "application/json" } });
  const publicApiPayload = await publicApiResponse.json().catch(() => ({}));
  assert(publicApiResponse.ok, `Public staging Crave API returned HTTP ${publicApiResponse.status}.`);
  assert(Array.isArray(publicApiPayload.videos), "Public staging Crave API returned an invalid payload.");
  assert(publicApiPayload.videos.every((item) => item.is_test_data !== true && item.preview_mode !== true), "Public staging Crave API leaked test-only media.");
  assert(publicApiPayload.videos.every((item) => item.restaurant?.id !== TEST_RESTAURANT_ID), "Public staging Crave API leaked the test restaurant.");

  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US" });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto(previewUrl.href, { waitUntil: "networkidle", timeout: 45_000 });
    await page.locator("[data-food-feed-card]").first().waitFor({ timeout: 30_000 });
    const rendered = await page.locator("[data-food-feed-card]").count();
    const media = await page.locator(".food-feed-video").count();
    const videoElements = page.locator("[data-food-feed-video]");
    const videoCount = await videoElements.count();
    const emptyState = await page.getByText(/No food videos yet/i).count();
    assert(rendered > 0, "The staging Crave UI rendered no cards.");
    assert(media > 0, "The staging Crave UI rendered no media element.");
    assert(videoCount > 0, "The staging Crave UI rendered no video element.");
    assert(emptyState === 0, "The staging Crave UI displayed an empty state despite test media.");
    const firstVideo = videoElements.first();
    await firstVideo.scrollIntoViewIfNeeded();
    await firstVideo.evaluate(async (video) => {
      video.muted = true;
      await video.play();
    });
    await page.waitForFunction(() => {
      const video = document.querySelector("[data-food-feed-video]");
      return Boolean(video && video.readyState >= 2 && video.currentTime > 0.05 && !video.paused);
    }, null, { timeout: 15_000 });
    assert(consoleErrors.length === 0, `The staging Crave UI logged an error: ${consoleErrors.map(safeError).join(" | ")}`);
    await context.close();
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({
    staging_project_verified: true,
    preview_mode: true,
    staging_test_media: inventory.length,
    api_media: apiPayload.videos.length,
    api_videos: previewVideos.length,
    mobile_ui_rendered: true,
    video_playback_verified: true,
    staging_video_seeded: !hadVideo,
    public_test_data_leak: false,
    production_touched: false
  }, null, 2));
}

main().catch((error) => {
  console.error(`Staging Crave preview check failed: ${safeError(error)}`);
  process.exitCode = 1;
});
