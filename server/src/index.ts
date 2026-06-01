import { Server } from "@colyseus/core"
import { WebSocketTransport } from "@colyseus/ws-transport"
import { GameRoom } from "./rooms/GameRoom"

const port = Number(process.env.PORT) || 2567

const gameServer = new Server({
  transport: new WebSocketTransport(),
})

gameServer.define("game_room", GameRoom).filterBy(["roomCode"])

gameServer.listen(port).then(() => {
  console.log(`Server running on ws://localhost:${port}`)
})
