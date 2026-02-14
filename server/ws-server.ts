import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "@supabase/supabase-js";
import { SessionManager } from "./session-manager";

// Load env from .env.local
import { config } from "dotenv";
config({ path: ".env.local" });

const PORT = parseInt(process.env.WS_PORT || "3001");

const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server running on port ${PORT}`);

// Heartbeat
function heartbeat(this: WebSocket & { isAlive?: boolean }) {
  this.isAlive = true;
}

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    const extWs = ws as WebSocket & { isAlive?: boolean };
    if (extWs.isAlive === false) {
      return ws.terminate();
    }
    extWs.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => clearInterval(interval));

wss.on("connection", async (ws, req) => {
  const extWs = ws as WebSocket & { isAlive?: boolean };
  extWs.isAlive = true;
  ws.on("pong", heartbeat.bind(extWs));

  // Parse URL params for auth
  const url = new URL(req.url || "", `http://localhost:${PORT}`);
  const token = url.searchParams.get("token");
  const sessionId = url.searchParams.get("sessionId");

  if (!token || !sessionId) {
    ws.send(JSON.stringify({ type: "error", text: "Missing token or sessionId" }));
    ws.close(1008, "Missing credentials");
    return;
  }

  // Verify auth token
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    ws.send(JSON.stringify({ type: "error", text: "Authentication failed" }));
    ws.close(1008, "Auth failed");
    return;
  }

  // Get session and verify ownership
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: session } = await serviceClient
    .from("sessions")
    .select("*, patients!inner(id, user_id)")
    .eq("id", sessionId)
    .single();

  if (!session || session.patients.user_id !== user.id) {
    ws.send(JSON.stringify({ type: "error", text: "Session not found" }));
    ws.close(1008, "Session not found");
    return;
  }

  console.log(`Client connected: user=${user.id}, session=${sessionId}`);

  // Create session manager
  const manager = new SessionManager(ws, sessionId, session.patients.id);

  // Initialize (loads EHR, sends greeting)
  manager.initialize();

  ws.on("message", async (data, isBinary) => {
    try {
      if (isBinary) {
        // Binary message = audio data
        const audioBuffer = Buffer.from(data as Buffer);
        await manager.handleAudio(audioBuffer);
      } else {
        // Text message = control message
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "text":
            await manager.handleTextMessage(message.text);
            break;
          case "language":
            manager.setLanguage(message.language);
            break;
          case "end":
            await manager.endSession();
            ws.close(1000, "Session ended");
            break;
          default:
            console.warn("Unknown message type:", message.type);
        }
      }
    } catch (error) {
      console.error("Message handling error:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          text: "Failed to process message",
        })
      );
    }
  });

  ws.on("close", async () => {
    console.log(`Client disconnected: session=${sessionId}`);
    await manager.endSession();
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error: session=${sessionId}`, error);
  });
});
