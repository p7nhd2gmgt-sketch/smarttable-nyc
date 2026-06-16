import { handleApiRequest } from "../src/app-core.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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
