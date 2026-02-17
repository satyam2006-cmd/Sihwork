import { WebSocketServer } from "ws";
import { attachWSHandlers } from "./ws-handler";

// Load env from .env.local
import { config } from "dotenv";
config({ path: ".env.local" });

const PORT = parseInt(process.env.WS_PORT || "3001");

const wss = new WebSocketServer({ port: PORT });
attachWSHandlers(wss);

console.log(`WebSocket server running on port ${PORT}`);
