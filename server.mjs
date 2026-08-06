import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { applyMove, createInitialState } from "./src/game/index.js";

const root = fileURLToPath(new URL("./dist", import.meta.url));
const port = Number(process.env.PORT || 4173);
const rooms = new Map();
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function send(socket, message) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function broadcast(room, message, except = null) {
  for (const player of room.players) {
    if (player !== except) send(player, message);
  }
}

function leaveRoom(socket) {
  const code = socket.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.roomCode = null;
  if (!room) return;

  room.players = room.players.filter((player) => player !== socket);
  if (room.players.length === 0) {
    rooms.delete(code);
    return;
  }

  broadcast(room, { type: "presence", players: room.players.length });
}

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const safePath = normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(root, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, "index.html");
  }

  if (!existsSync(filePath)) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Build not found. Run npm run build first.");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
  });
  response.end(readFileSync(filePath));
});

const sockets = new WebSocketServer({ server, path: "/ws" });

sockets.on("connection", (socket) => {
  send(socket, { type: "ready" });

  socket.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      send(socket, { type: "error", message: "Invalid message." });
      return;
    }

    if (message.type === "create") {
      leaveRoom(socket);
      const code = roomCode();
      const room = {
        code,
        players: [socket],
        state: createInitialState(),
        revision: 0,
      };
      rooms.set(code, room);
      socket.roomCode = code;
      socket.player = "white";
      send(socket, {
        type: "joined",
        code,
        player: "white",
        players: 1,
        state: room.state,
        revision: room.revision,
      });
      return;
    }

    if (message.type === "join") {
      leaveRoom(socket);
      const code = String(message.code || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        send(socket, { type: "error", message: "That room does not exist." });
        return;
      }
      const occupiedColors = new Set(room.players.map((player) => player.player));
      const player = occupiedColors.has("white") ? "black" : "white";
      if (occupiedColors.has(player)) {
        send(socket, { type: "error", message: "That room is full." });
        return;
      }
      room.players.push(socket);
      socket.roomCode = code;
      socket.player = player;
      send(socket, {
        type: "joined",
        code,
        player,
        players: 2,
        state: room.state,
        revision: room.revision,
      });
      broadcast(room, { type: "presence", players: 2 });
      return;
    }

    const room = rooms.get(socket.roomCode);
    if (!room) {
      send(socket, { type: "error", message: "Join a room first." });
      return;
    }

    if (message.type === "action") {
      if (socket.player !== room.state.currentPlayer) {
        send(socket, { type: "error", message: "It is not your turn." });
        return;
      }
      if (!Number.isInteger(message.revision) || message.revision !== room.revision + 1) {
        send(socket, { type: "state", state: room.state, revision: room.revision });
        return;
      }
      try {
        room.state = applyMove(room.state, message.action);
      } catch {
        send(socket, { type: "error", message: "That move is not legal." });
        return;
      }
      room.revision = message.revision;
      broadcast(room, {
        type: "state",
        state: room.state,
        revision: room.revision,
      });
    }
  });

  socket.on("close", () => leaveRoom(socket));
  socket.on("error", () => leaveRoom(socket));
});

server.listen(port, () => {
  console.log(`Hive is running at http://localhost:${port}`);
});
