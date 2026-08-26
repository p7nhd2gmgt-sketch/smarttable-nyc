import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./src/env-loader.js";
import { handleApiRequest } from "./src/app-core.js";
import { strictSecurityHeaders } from "./src/security-headers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
function canonicalPublicSiteUrl(value = "") {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.hostname.toLowerCase() === "smarttablenyc.com") {
      parsed.hostname = "www.smarttablenyc.com";
      return parsed.toString().replace(/\/+$/, "");
    }
  } catch {
    return raw;
  }
  return raw;
}
const publicSiteUrl = canonicalPublicSiteUrl(process.env.PUBLIC_BASE_URL || process.env.PUBLIC_SITE_URL || "https://www.smarttablenyc.com");
const runtimeEnvironment = String(process.env.SMARTTABLE_ENV || process.env.APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || "development").toLowerCase();
const isProductionRuntime = ["production", "prod"].includes(runtimeEnvironment);
const MAX_JSON_BODY_BYTES = Math.max(16 * 1024, Number(process.env.MAX_JSON_BODY_BYTES || 256 * 1024));

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function securityHeaders(extra = {}) {
  return strictSecurityHeaders(extra);
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isNoIndexPath(pathname = "") {
  return [
    "/admin",
    "/superadmin",
    "/partner",
    "/restaurant",
    "/account",
    "/login",
    "/signup/check-email",
    "/signup/welcome",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/auth/callback",
    "/ai",
    "/ai-concierge",
    "/ai-preferences",
    "/partner-ai-demand",
    "/admin-ai-controls",
    "/guest/rewards/photo-upload"
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function routeMeta(pathname = "/") {
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  const canonicalPath = cleanPath === "/" ? "/" : `${cleanPath}/`.replace(/\/$/, "");
  const noindex = isNoIndexPath(cleanPath);
  if (cleanPath === "/restaurants") {
    return {
      title: "SmartTable Restaurants | Discounted New York restaurant reservations",
      description: "Browse New York restaurants on SmartTable, compare active discounted table offers, and request a reservation.",
      canonicalPath,
      noindex
    };
  }
  if (cleanPath === "/offers") {
    return {
      title: "SmartTable Offers | Active discounted restaurant tables in New York",
      description: "Find active discounted restaurant offers by neighborhood, cuisine, date, time, party size, and discount.",
      canonicalPath,
      noindex
    };
  }
  if (cleanPath.startsWith("/restaurants/")) {
    const name = cleanPath.slice("/restaurants/".length).split("/")[0].replace(/-/g, " ");
    const display = name ? name.replace(/\b\w/g, (char) => char.toUpperCase()) : "Restaurant";
    return {
      title: `${display} on SmartTable | Restaurant details and active offers`,
      description: `View ${display} details, current SmartTable offers, reservation times, location, cuisine, and guest rating information.`,
      canonicalPath,
      noindex
    };
  }
  if (cleanPath === "/signup") {
    return {
      title: "Create a SmartTable guest account",
      description: "Create your SmartTable guest profile and save restaurant, cuisine, budget, notification, and reservation preferences.",
      canonicalPath,
      noindex: false
    };
  }
  if (cleanPath === "/signup/welcome") {
    return {
      title: "Email confirmed | SmartTable",
      description: "Your SmartTable account is ready.",
      canonicalPath,
      noindex: true
    };
  }
  if (cleanPath === "/terms") {
    return {
      title: "SmartTable Terms and Conditions",
      description: "Read the SmartTable Terms and Conditions for guests, restaurants, and platform use.",
      canonicalPath,
      noindex: false
    };
  }
  if (cleanPath === "/privacy") {
    return {
      title: "SmartTable Privacy Policy",
      description: "Read how SmartTable protects guest, restaurant, reservation, consent, and notification data.",
      canonicalPath,
      noindex: false
    };
  }
  if (cleanPath === "/cookies") {
    return {
      title: "SmartTable Cookie Policy",
      description: "Read how SmartTable uses essential cookies and local storage for secure sessions, language preferences, and reservation workflows.",
      canonicalPath,
      noindex: false
    };
  }
  if (cleanPath === "/reservation-policy") {
    return {
      title: "SmartTable Reservation and Cancellation Policy",
      description: "Read how SmartTable handles reservation requests, confirmations, cancellations, lateness, no-shows, discounts, and standard bookings.",
      canonicalPath,
      noindex: false
    };
  }
  if (cleanPath === "/review-policy") {
    return {
      title: "SmartTable Verified Reviews and Photo Policy",
      description: "Read how SmartTable handles verified guest reviews, ratings, photo uploads, moderation, complaints, and removal requests.",
      canonicalPath,
      noindex: false
    };
  }
  if (cleanPath === "/partner-terms") {
    return {
      title: "SmartTable Restaurant Partner Terms",
      description: "Read the SmartTable restaurant partner terms for restaurant profiles, staff access, offers, reservations, guest data, reviews, billing, and compliance.",
      canonicalPath,
      noindex: false
    };
  }
  if (cleanPath === "/accessibility") {
    return {
      title: "SmartTable Accessibility Statement",
      description: "Read SmartTable's accessibility statement for guests, restaurant partners, and administrators.",
      canonicalPath,
      noindex: false
    };
  }
  if (cleanPath === "/contact" || cleanPath === "/help") {
    return {
      title: "Contact SmartTable",
      description: "Contact SmartTable for guest reservation support, restaurant partner questions, and platform help.",
      canonicalPath,
      noindex: false
    };
  }
  if (noindex) {
    return {
      title: "SmartTable Account",
      description: "Secure SmartTable account area.",
      canonicalPath,
      noindex
    };
  }
  return {
    title: "SmartTable | Discounted New York restaurant reservations",
    description: "Book discounted restaurant tables across New York and send reservation requests directly to restaurants.",
    canonicalPath: "/",
    noindex: false
  };
}

function injectSeo(html, pathname) {
  const meta = routeMeta(pathname);
  const canonical = `${publicSiteUrl}${meta.canonicalPath === "/" ? "/" : meta.canonicalPath}`;
  const robots = meta.noindex ? "noindex, nofollow" : "index, follow";
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(meta.description)}">`)
    .replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${robots}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(meta.title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeHtml(meta.description)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escapeHtml(canonical)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${escapeHtml(canonical)}">`);
}

async function publicRestaurantSlugs() {
  const result = await handleApiRequest({
    method: "GET",
    url: "/api/public/offers?lang=en",
    headers: {},
    body: {}
  }).catch(() => ({ status: 500, body: { offers: [] } }));
  if (result.status >= 400) return [];
  const offers = result.body?.offers || [];
  const names = new Set();
  for (const offer of offers) {
    const slug = offer.restaurant_slug || offer.slug || slugify(offer.restaurant_name || offer.name || offer.restaurant_id);
    if (slug) names.add(slug);
  }
  return [...names];
}

async function serveRobots(res) {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /partner",
    "Disallow: /restaurant",
    "Disallow: /account",
    "Disallow: /login",
    "Disallow: /signup/check-email",
    "Disallow: /signup/welcome",
    "Disallow: /forgot-password",
    "Disallow: /reset-password",
    "Disallow: /verify-email",
    "Disallow: /auth/callback",
    "Disallow: /ai",
    "Disallow: /ai-concierge",
    "Disallow: /ai-preferences",
    "Disallow: /partner-ai-demand",
    "Disallow: /admin-ai-controls",
    "Disallow: /guest/rewards/photo-upload",
    `Sitemap: ${publicSiteUrl}/sitemap.xml`,
    ""
  ].join("\n");
  res.writeHead(200, securityHeaders({
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "public, max-age=300"
  }));
  res.end(body);
}

async function serveSitemap(res) {
  const staticPaths = ["/", "/restaurants", "/offers", "/signup", "/terms", "/privacy", "/cookies", "/reservation-policy", "/review-policy", "/partner-terms", "/accessibility", "/contact", "/help"];
  const restaurantPaths = (await publicRestaurantSlugs()).map((slug) => `/restaurants/${slug}`);
  const urls = [...staticPaths, ...restaurantPaths].map((pathname) => `
  <url>
    <loc>${escapeHtml(`${publicSiteUrl}${pathname === "/" ? "/" : pathname}`)}</loc>
    <changefreq>${pathname.startsWith("/restaurants/") ? "weekly" : "daily"}</changefreq>
    <priority>${pathname === "/" ? "1.0" : pathname.startsWith("/restaurants/") ? "0.8" : "0.7"}</priority>
  </url>`).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>
`;
  res.writeHead(200, securityHeaders({
    "content-type": "application/xml; charset=utf-8",
    "cache-control": "public, max-age=300"
  }));
  res.end(body);
}

async function parseJson(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > MAX_JSON_BODY_BYTES) {
    const error = new Error("Request body is too large.");
    error.status = 413;
    throw error;
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return { ...Object.fromEntries(new URLSearchParams(rawBody)), __rawBody: rawBody };
  }
  const parsed = JSON.parse(rawBody);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return { ...parsed, __rawBody: rawBody };
  }
  return { value: parsed, __rawBody: rawBody };
}

async function serveStatic(req, res, pathname) {
  if (pathname === "/robots.txt") return serveRobots(res);
  if (pathname === "/sitemap.xml") return serveSitemap(res);

  const filePath = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.normalize(path.join(publicDir, filePath));

  if (!resolved.startsWith(publicDir)) {
    res.writeHead(403, securityHeaders({ "content-type": "text/plain; charset=utf-8" }));
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const dynamicAsset = [".html", ".css", ".js", ".json"].includes(ext);
    const body = ext === ".html" ? injectSeo(content.toString("utf8"), pathname) : content;
    res.writeHead(200, securityHeaders({
      "content-type": contentTypes[ext] || "application/octet-stream",
      "cache-control": dynamicAsset ? "no-store" : "public, max-age=3600"
    }));
    res.end(body);
  } catch {
    if (!path.extname(resolved)) {
      const content = await readFile(path.join(publicDir, "index.html"), "utf8");
      res.writeHead(200, securityHeaders({
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      }));
      res.end(injectSeo(content, pathname));
      return;
    }
    res.writeHead(404, securityHeaders({ "content-type": "text/plain; charset=utf-8" }));
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      const result = await handleApiRequest({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: await parseJson(req)
      });
      res.writeHead(result.status, securityHeaders(result.headers));
      const body = result.body;
      res.end(Buffer.isBuffer(body) || body instanceof Uint8Array ? Buffer.from(body) : (typeof body === "string" ? body : JSON.stringify(body)));
    } else {
      await serveStatic(req, res, url.pathname);
    }
  } catch (error) {
    const status = error.status || 500;
    console.error(JSON.stringify({
      event: "http_request_failed",
      timestamp: new Date().toISOString(),
      environment: runtimeEnvironment,
      status
    }));
    res.writeHead(status, securityHeaders({ "content-type": "application/json; charset=utf-8" }));
    res.end(JSON.stringify({ error: isProductionRuntime && status >= 500 ? "Server error." : error.message || "Server error." }));
  }
});

server.listen(port, () => {
  console.log(`SmartTable running at http://localhost:${port}`);
  if (!isProductionRuntime && !process.env.RESEND_API_KEY) {
    console.log("Email provider not configured: outbound emails will be logged as failed until RESEND_API_KEY is set.");
  }
});
