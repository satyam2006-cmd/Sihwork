/**
 * Combined HTTP + WebSocket production server.
 *
 * Runs a minimal HTTP server on PORT (default 8080) that:
 *  - Upgrades WebSocket connections on any path (the WS clients connect with
 *    query params, not a specific path, so we accept upgrades everywhere).
 *  - Returns 200 OK on GET /health for Fly.io health checks.
 *  - Returns 404 for all other HTTP requests (Next.js apps are deployed
 *    separately; this server only handles WebSocket traffic).
 */

import http from "node:http";
import { WebSocketServer } from "ws";
import { attachWSHandlers } from "./ws-handler";

// Load env — in production Fly.io injects secrets as env vars,
// but this also supports .env.local for local testing.
import { config } from "dotenv";
config({ path: ".env.local" });

const PORT = parseInt(process.env.PORT || "8080");

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });
attachWSHandlers(wss);

server.listen(PORT, () => {
  console.log(`Production WS server running on port ${PORT}`);
});
