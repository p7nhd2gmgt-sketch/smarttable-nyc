import "../src/env-loader.js";
import { handleApiRequest } from "../src/app-core.js";
import { strictSecurityHeaders } from "../src/security-headers.js";

const MAX_JSON_BODY_BYTES = Math.max(16 * 1024, Number(process.env.MAX_JSON_BODY_BYTES || 256 * 1024));

function payloadTooLargeError() {
  const error = new Error("Request body is too large.");
  error.status = 413;
  return error;
}

async function readBody(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    if (Buffer.byteLength(req.body, "utf8") > MAX_JSON_BODY_BYTES) throw payloadTooLargeError();
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return { ...Object.fromEntries(new URLSearchParams(req.body)), __rawBody: req.body };
    }
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { ...parsed, __rawBody: req.body };
      return { value: parsed, __rawBody: req.body };
    } catch {
      return {};
    }
  }

  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > MAX_JSON_BODY_BYTES) throw payloadTooLargeError();
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) throw payloadTooLargeError();
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return { ...Object.fromEntries(new URLSearchParams(rawBody)), __rawBody: rawBody };
  }
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { ...parsed, __rawBody: rawBody };
    return { value: parsed, __rawBody: rawBody };
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  let result;
  try {
    const body = await readBody(req);
    result = await handleApiRequest({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body
    });
  } catch (error) {
    result = {
      status: error.status || 500,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      body: { error: error.status === 413 ? "Request body is too large." : "Server error." }
    };
  }

  for (const [key, value] of Object.entries(strictSecurityHeaders(result.headers || {}))) {
    res.setHeader(key, value);
  }
  const body = result.body;
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    res.status(result.status).send(Buffer.from(body));
    return;
  }
  res.status(result.status).send(typeof body === "string" ? body : JSON.stringify(body));
}
