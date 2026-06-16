import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApiRequest } from "./src/app-core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4173);

async function parseJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(req, res, pathname) {
  const filePath = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.normalize(path.join(publicDir, filePath));

  if (!resolved.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".webp": "image/webp",
      ".txt": "text/plain; charset=utf-8",
      ".xml": "application/xml; charset=utf-8",
      ".webmanifest": "application/manifest+json; charset=utf-8"
    };
    const dynamicAsset = [".html", ".css", ".js"].includes(ext);
    res.writeHead(200, {
      "content-type": contentTypes[ext] || "application/octet-stream",
      "cache-control": dynamicAsset ? "no-store" : "public, max-age=3600"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
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
      res.writeHead(result.status, result.headers);
      res.end(typeof result.body === "string" ? result.body : JSON.stringify(result.body));
    } else {
      await serveStatic(req, res, url.pathname);
    }
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message || "Server error." }));
  }
});

server.listen(port, () => {
  console.log(`Smarttable.com running at http://localhost:${port}`);
  if (!process.env.RESEND_API_KEY) {
    console.log("Demo email mode: messages are stored in the in-app outbox.");
  }
});
