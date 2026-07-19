import "../src/env-loader.js";
import { handleApiRequest } from "../src/app-core.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { ...parsed, __rawBody: req.body };
      return { value: parsed, __rawBody: req.body };
    } catch {
      return {};
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const rawBody = Buffer.concat(chunks).toString("utf8");
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { ...parsed, __rawBody: rawBody };
    return { value: parsed, __rawBody: rawBody };
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  const body = await readBody(req);
  const result = await handleApiRequest({
    method: req.method,
    url: req.url,
    headers: req.headers,
    body
  });

  for (const [key, value] of Object.entries(result.headers || {})) {
    res.setHeader(key, value);
  }
  res.status(result.status).send(typeof result.body === "string" ? result.body : JSON.stringify(result.body));
}
