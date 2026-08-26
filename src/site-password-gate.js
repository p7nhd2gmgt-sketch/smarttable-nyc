const SESSION_COOKIE = "__Host-smarttable_site_session";
const ATTEMPT_COOKIE = "__Host-smarttable_site_attempts";
const UNLOCK_PATH = "/__smarttable_unlock";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPT_BLOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const MAX_BUCKETS = 2048;
const PRODUCTION_HOSTS = new Set(["smarttablenyc.com", "www.smarttablenyc.com"]);
const STAGING_HOSTS = new Set(["smarttable-stripe-staging.vercel.app"]);
const AUTH_CALLBACK_PATHS = new Set([
  "/auth/callback",
  "/reset-password",
  "/verify-email",
  "/signup/welcome"
]);
const STATIC_PREFIXES = [
  "/_vercel/",
  "/.well-known/",
  "/assets/",
  "/guest/",
  "/shared/",
  "/locales/"
];
const STATIC_FILE_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".json",
  ".map",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".webmanifest",
  ".txt",
  ".xml"
]);

const encoder = new TextEncoder();
const attemptBuckets = new Map();

function clean(value = "") {
  return String(value || "").trim();
}

function normalizedPathname(pathname = "/") {
  const value = clean(pathname).replace(/\/{2,}/g, "/");
  if (!value || value === "/") return "/";
  return value.replace(/\/+$/, "") || "/";
}

function requestHostname(url) {
  return clean(url.hostname).toLowerCase().replace(/\.$/, "");
}

function isEnabled(env = {}) {
  return clean(env.SMARTTABLE_SITE_PASSWORD_ENABLED).toLowerCase() === "true";
}

function isProductionRequest(url, env = {}) {
  const hostname = requestHostname(url);
  if (STAGING_HOSTS.has(hostname)) return false;
  if (PRODUCTION_HOSTS.has(hostname)) return true;
  const runtime = clean(env.VERCEL_ENV || env.SMARTTABLE_ENV || env.APP_ENV || env.NODE_ENV).toLowerCase();
  return runtime === "production" || runtime === "prod";
}

function extensionForPath(pathname = "") {
  const name = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function isSitePasswordGateExempt(pathname = "/") {
  const path = normalizedPathname(pathname);
  if (path === UNLOCK_PATH) return true;
  if (path === "/api" || path.startsWith("/api/")) return true;
  if (AUTH_CALLBACK_PATHS.has(path)) return true;
  if (path === "/robots.txt" || path === "/sitemap.xml") return true;
  if (STATIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  return STATIC_FILE_EXTENSIONS.has(extensionForPath(path));
}

export function shouldApplySitePasswordGate(request, env = process.env) {
  const url = new URL(request.url);
  return isEnabled(env)
    && isProductionRequest(url, env)
    && !isSitePasswordGateExempt(url.pathname);
}

function parseCookies(value = "") {
  const cookies = new Map();
  for (const segment of String(value || "").split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    const cookieValue = segment.slice(separator + 1).trim();
    if (name) cookies.set(name, cookieValue);
  }
  return cookies;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value = "") {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(password, purpose) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`smarttable-site-password-gate:${purpose}\0${password}`)
  );
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayload(payload, password, purpose) {
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await signingKey(password, purpose);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(encodedPayload));
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function verifySignedPayload(token, password, purpose) {
  try {
    const [encodedPayload, encodedSignature, extra] = String(token || "").split(".");
    if (!encodedPayload || !encodedSignature || extra !== undefined) return null;
    const key = await signingKey(password, purpose);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(encodedSignature),
      encoder.encode(encodedPayload)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload)));
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

async function passwordMatches(submittedPassword, configuredPassword) {
  const submitted = clean(submittedPassword).normalize("NFKC").replace(/\s+/g, "");
  const configured = clean(configuredPassword).normalize("NFKC").replace(/\s+/g, "");
  const submittedTooLong = submitted.length > 1024;
  const submittedComparable = submitted.slice(0, 1024).toLowerCase();
  const configuredComparable = configured.toLowerCase();
  const [submittedDigest, configuredDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(submittedComparable)),
    crypto.subtle.digest("SHA-256", encoder.encode(configuredComparable))
  ]);
  const left = new Uint8Array(submittedDigest);
  const right = new Uint8Array(configuredDigest);
  let difference = submittedTooLong ? 1 : 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeReturnPath(value = "/") {
  const path = clean(value);
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.length > 512) return "/";
  try {
    const parsed = new URL(path, "https://www.smarttablenyc.com");
    if (!PRODUCTION_HOSTS.has(parsed.hostname)) return "/";
    return normalizedPathname(parsed.pathname);
  } catch {
    return "/";
  }
}

function htmlHeaders(extra = {}) {
  return {
    "cache-control": "no-store, max-age=0",
    "content-security-policy": "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; style-src 'unsafe-inline'",
    "content-type": "text/html; charset=utf-8",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-robots-tag": "noindex, nofollow, noarchive",
    ...extra
  };
}

function unlockPage({ error = "", returnTo = "/", status = 401 } = {}) {
  const errorMarkup = error
    ? `<p class="error" role="alert">${escapeHtml(error)}</p>`
    : `<p class="hint">Enter the temporary site password to continue.</p>`;
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow, noarchive">
    <meta name="theme-color" content="#0f735d">
    <title>Enter SmartTable</title>
    <style>
      :root { color-scheme: light; --ink: #17211d; --muted: #68746f; --green: #0f735d; --green-dark: #0a5142; --line: #ded8cb; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, rgba(15,115,93,.12), transparent 34%), linear-gradient(180deg,#fbfaf6,#f4f1ea 52%,#fbfaf6); }
      main { width: min(100%, 440px); }
      .brand { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 24px; }
      .mark { width: 46px; aspect-ratio: 1; display: grid; place-items: center; border-radius: 9px; color: #fff; background: var(--green); font-weight: 850; letter-spacing: -.03em; }
      .brand strong, .brand small { display: block; }
      .brand strong { font-size: 1.08rem; }
      .brand small { margin-top: 2px; color: var(--muted); font-size: .78rem; }
      .card { padding: clamp(28px, 7vw, 42px); border: 1px solid rgba(222,216,203,.92); border-radius: 18px; background: rgba(255,255,255,.96); box-shadow: 0 22px 60px rgba(23,33,29,.14); }
      h1 { margin: 0; font-size: clamp(1.8rem, 7vw, 2.35rem); line-height: 1.08; letter-spacing: -.04em; }
      .lead { margin: 12px 0 24px; color: var(--muted); line-height: 1.55; }
      label { display: block; margin-bottom: 8px; font-size: .9rem; font-weight: 800; }
      input { width: 100%; min-height: 48px; padding: 11px 13px; border: 1px solid var(--line); border-radius: 9px; color: var(--ink); background: #fff; font: inherit; }
      input:focus { outline: 3px solid rgba(15,115,93,.18); border-color: var(--green); }
      button { width: 100%; min-height: 49px; margin-top: 16px; border: 0; border-radius: 9px; color: #fff; background: var(--green); cursor: pointer; font: inherit; font-weight: 850; }
      button:hover { background: var(--green-dark); }
      button:focus-visible { outline: 3px solid rgba(15,115,93,.32); outline-offset: 3px; }
      .hint, .error { margin: 14px 0 0; font-size: .9rem; line-height: 1.45; }
      .hint { color: var(--muted); }
      .error { color: #9d3528; }
      .temporary { margin: 22px 0 0; color: var(--muted); text-align: center; font-size: .78rem; }
    </style>
  </head>
  <body>
    <main>
      <div class="brand" aria-label="SmartTable">
        <span class="mark" aria-hidden="true">ST</span>
        <span><strong>SmartTable</strong><small>Discounted restaurant reservations</small></span>
      </div>
      <section class="card" aria-labelledby="unlock-title">
        <h1 id="unlock-title">SmartTable is getting ready.</h1>
        <p class="lead">Development and mobile release preparation are still in progress.</p>
        <form action="${UNLOCK_PATH}" method="post">
          <input type="hidden" name="return_to" value="${escapeHtml(safeReturnPath(returnTo))}">
          <label for="site-password">Password</label>
          <input id="site-password" name="password" type="password" autocomplete="current-password" required autofocus maxlength="1024">
          <button type="submit">Enter SmartTable</button>
        </form>
        ${errorMarkup}
      </section>
      <p class="temporary">Temporary private access</p>
    </main>
  </body>
</html>`;
  return new Response(body, { status, headers: htmlHeaders() });
}

function cookieAttributes(maxAgeSeconds) {
  return `Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; HttpOnly; Secure; SameSite=Lax`;
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; ${cookieAttributes(SESSION_MAX_AGE_SECONDS)}`;
}

function attemptCookie(token, maxAgeSeconds = Math.ceil((ATTEMPT_WINDOW_MS + ATTEMPT_BLOCK_MS) / 1000)) {
  return `${ATTEMPT_COOKIE}=${token}; ${cookieAttributes(maxAgeSeconds)}`;
}

function clearAttemptCookie() {
  return `${ATTEMPT_COOKIE}=; ${cookieAttributes(0)}`;
}

async function hasValidSession(request, password, now = Date.now()) {
  const token = parseCookies(request.headers.get("cookie")).get(SESSION_COOKIE);
  if (!token) return false;
  const payload = await verifySignedPayload(token, password, "session");
  return payload?.version === 1 && Number(payload.expiresAt) > now;
}

function clientAddress(request) {
  return clean(
    request.headers.get("x-forwarded-for")?.split(",")[0]
    || request.headers.get("x-real-ip")
    || request.headers.get("cf-connecting-ip")
    || "unknown"
  ).slice(0, 96);
}

async function attemptKey(request, password) {
  const key = await signingKey(password, "attempt-key");
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(clientAddress(request)));
  return bytesToBase64Url(new Uint8Array(signature)).slice(0, 32);
}

function cleanupAttemptBuckets(now) {
  if (attemptBuckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of attemptBuckets.entries()) {
    if (Number(bucket.blockedUntil || bucket.windowStart + ATTEMPT_WINDOW_MS) <= now) attemptBuckets.delete(key);
  }
  while (attemptBuckets.size > MAX_BUCKETS) {
    const oldest = attemptBuckets.keys().next().value;
    if (!oldest) break;
    attemptBuckets.delete(oldest);
  }
}

function normalizedAttemptState(state, now) {
  const windowStart = Number(state?.windowStart || 0);
  const blockedUntil = Number(state?.blockedUntil || 0);
  if (!windowStart || now - windowStart >= ATTEMPT_WINDOW_MS) {
    return { count: 0, windowStart: now, blockedUntil: blockedUntil > now ? blockedUntil : 0 };
  }
  return {
    count: Math.max(0, Number(state?.count || 0)),
    windowStart,
    blockedUntil: blockedUntil > now ? blockedUntil : 0
  };
}

async function currentAttemptState(request, password, now) {
  const key = await attemptKey(request, password);
  const cookieToken = parseCookies(request.headers.get("cookie")).get(ATTEMPT_COOKIE);
  const cookieState = cookieToken ? await verifySignedPayload(cookieToken, password, "attempts") : null;
  const memoryState = attemptBuckets.get(key);
  const fromCookie = normalizedAttemptState(cookieState, now);
  const fromMemory = normalizedAttemptState(memoryState, now);
  const state = {
    count: Math.max(fromCookie.count, fromMemory.count),
    windowStart: Math.min(fromCookie.windowStart, fromMemory.windowStart),
    blockedUntil: Math.max(fromCookie.blockedUntil, fromMemory.blockedUntil)
  };
  attemptBuckets.set(key, state);
  cleanupAttemptBuckets(now);
  return { key, state };
}

async function recordFailedAttempt(key, state, password, now) {
  const next = normalizedAttemptState(state, now);
  next.count += 1;
  if (next.count >= MAX_ATTEMPTS) next.blockedUntil = now + ATTEMPT_BLOCK_MS;
  attemptBuckets.set(key, next);
  return { state: next, token: await signPayload({ version: 1, ...next }, password, "attempts") };
}

async function handleUnlock(request, password) {
  if (request.method.toUpperCase() !== "POST") return unlockPage({ returnTo: "/" });
  if (!password) {
    return unlockPage({
      error: "SmartTable is temporarily unavailable. Please try again later.",
      returnTo: "/",
      status: 503
    });
  }
  let form;
  try {
    const contentType = clean(request.headers.get("content-type")).toLowerCase();
    form = contentType.startsWith("application/x-www-form-urlencoded")
      ? new URLSearchParams(await request.text())
      : await request.formData();
  } catch {
    return unlockPage({ error: "Unable to unlock SmartTable. Please try again.", returnTo: "/", status: 400 });
  }
  const returnTo = safeReturnPath(form.get("return_to"));
  const now = Date.now();
  const { key, state } = await currentAttemptState(request, password, now);

  const valid = await passwordMatches(form.get("password"), password);
  if (!valid && state.blockedUntil > now) {
    const retryAfter = Math.max(1, Math.ceil((state.blockedUntil - now) / 1000));
    const response = unlockPage({
      error: "Unable to unlock SmartTable right now. Please wait and try again.",
      returnTo,
      status: 429
    });
    response.headers.set("retry-after", String(retryAfter));
    return response;
  }

  if (!valid) {
    const failed = await recordFailedAttempt(key, state, password, now);
    const response = unlockPage({
      error: failed.state.blockedUntil > now
        ? "Unable to unlock SmartTable right now. Please wait and try again."
        : "Unable to unlock SmartTable. Check the password and try again.",
      returnTo,
      status: failed.state.blockedUntil > now ? 429 : 401
    });
    response.headers.append("set-cookie", attemptCookie(failed.token));
    if (failed.state.blockedUntil > now) {
      response.headers.set("retry-after", String(Math.ceil(ATTEMPT_BLOCK_MS / 1000)));
    }
    return response;
  }

  attemptBuckets.delete(key);
  const sessionToken = await signPayload({
    version: 1,
    issuedAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
    nonce: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(18)))
  }, password, "session");
  const response = new Response(null, {
    status: 303,
    headers: {
      "cache-control": "no-store, max-age=0",
      location: returnTo,
      "referrer-policy": "no-referrer"
    }
  });
  response.headers.append("set-cookie", sessionCookie(sessionToken));
  response.headers.append("set-cookie", clearAttemptCookie());
  return response;
}

export async function sitePasswordGateResponse(request, env = process.env) {
  const url = new URL(request.url);
  const hostname = requestHostname(url);
  if (!isEnabled(env) || STAGING_HOSTS.has(hostname) || !isProductionRequest(url, env)) return null;
  if (url.pathname === UNLOCK_PATH) {
    return handleUnlock(request, clean(env.SMARTTABLE_SITE_PASSWORD));
  }
  if (isSitePasswordGateExempt(url.pathname)) return null;

  const password = clean(env.SMARTTABLE_SITE_PASSWORD);
  if (!password) {
    return unlockPage({
      error: "SmartTable is temporarily unavailable. Please try again later.",
      returnTo: url.pathname,
      status: 503
    });
  }
  if (await hasValidSession(request, password)) return null;
  return unlockPage({ returnTo: url.pathname });
}

export const sitePasswordGateConstants = Object.freeze({
  attemptCookie: ATTEMPT_COOKIE,
  authCallbackPaths: [...AUTH_CALLBACK_PATHS],
  maxAttempts: MAX_ATTEMPTS,
  productionHosts: [...PRODUCTION_HOSTS],
  sessionCookie: SESSION_COOKIE,
  sessionMaxAgeSeconds: SESSION_MAX_AGE_SECONDS,
  stagingHosts: [...STAGING_HOSTS],
  unlockPath: UNLOCK_PATH
});
