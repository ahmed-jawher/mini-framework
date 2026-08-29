/**
 * A dependency-free static server, so the demo can be opened without
 * installing anything: `npm start` (or `node serve.js [port]`).
 *
 * ES modules are blocked by the browser over file://, so the app needs to be
 * served over http. Any other static server works just as well — the framework
 * uses hash routing by default, which needs no server configuration.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 3000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    let path = join(ROOT, normalize(decodeURIComponent(url.pathname)));

    // Never serve anything outside the project directory.
    if (!path.startsWith(ROOT)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    let info = await stat(path).catch(() => null);
    if (info && info.isDirectory()) {
      path = join(path, "index.html");
      info = await stat(path).catch(() => null);
    }

    // History-mode fallback: unknown paths without an extension get index.html.
    if (!info && !extname(path)) {
      path = join(ROOT, "index.html");
      info = await stat(path).catch(() => null);
    }

    if (!info) {
      response.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }

    const body = await readFile(path);
    response.writeHead(200, {
      "content-type": TYPES[extname(path)] || "application/octet-stream",
      "cache-control": "no-cache",
    }).end(body);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain" }).end(String(error));
  }
});

server.listen(PORT, () => {
  console.log(`mini-framework demo running at http://localhost:${PORT}/`);
});
