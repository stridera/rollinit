import "dotenv/config";
import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./src/lib/socketHandlers";
import { prisma } from "./src/lib/db";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./src/types/socket";

async function cleanupStaleSessions() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const deleted = await prisma.session.deleteMany({
    where: { lastActiveAt: { lt: thirtyDaysAgo } },
  });
  if (deleted.count > 0) {
    console.log(`[Cleanup] Deleted ${deleted.count} stale sessions`);
  }
}

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3200", 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: dev
          ? [
              "http://rollinit.dev.local",
              "http://rollinit-api.dev.local",
              "http://localhost:3200",
            ]
          : "https://rollinit.app",
        methods: ["GET", "POST"],
      },
      // Increase ping timeout for mobile clients
      pingTimeout: 60000,
    }
  );

  io.on("connection", (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);
    registerSocketHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);

    // Cleanup stale sessions on startup and every 24 hours
    cleanupStaleSessions();
    setInterval(cleanupStaleSessions, 24 * 60 * 60 * 1000);
  });
});
