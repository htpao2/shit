#!/usr/bin/env node

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const pluginDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(pluginDirectory, "resources", "editor");
const rootPrefix = `${root}${sep}`;
const port = Number(process.argv[2] || process.env.PPT_EDITOR_PORT || 55173);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  process.stderr.write("Invalid editor port.\n");
  process.exit(1);
}
if (!existsSync(resolve(root, "index.html"))) {
  process.stderr.write(`Editor resources are missing: ${root}\n`);
  process.exit(1);
}

function respond(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(message);
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    respond(response, 405, "Method Not Allowed");
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
  } catch {
    respond(response, 400, "Bad Request");
    return;
  }
  if (pathname.endsWith("/")) pathname += "index.html";
  const filePath = resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(rootPrefix)) {
    respond(response, 403, "Forbidden");
    return;
  }
  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    respond(response, 404, "Not Found");
    return;
  }
  if (!stats.isFile()) {
    respond(response, 404, "Not Found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": contentTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream",
    "Content-Length": stats.size,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  process.stderr.write(`Open Kimi PPT editor running at http://127.0.0.1:${port}/\n`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
