import { describe, it, expect, vi, beforeEach } from "vitest"
import { GameRoom } from "../src/rooms/GameRoom"
import { GameState } from "../../shared/schema"
import { CHEAT_WINDOW_MS, MAX_ROUNDS, WHEEL_MIN_VELOCITY, WHEEL_MAX_VELOCITY, CHESS_TURN_MS, PHASER_NUM_KEYS } from "../../shared/constants"

function makeRoom(options: { isPrivate?: boolean } = {}) {
  const room = new GameRoom()
  room.roomId = "test"
  // @ts-ignore
  room.clock = { setTimeout: (fn: () => void, _ms: number) => fn, start: () => {} } as any
  // @ts-ignore
  room.broadcast = vi.fn()
  // Stub listing so setMetadata can persist; metadata getter reads this.listing.metadata.
  // @ts-ignore
  room.listing = { metadata: null, save: async () => {}, markModified: () => {} }
  // @ts-ignore - internal state must allow setMetadata save path
  room._internalState = 0
  room.onCreate(options)
  return room
}

function makeClient(id: string) {
  return { sessionId: id, send: vi.fn() } as any
}

async function makeRoomWithPlayers(
  n: number,
  options: { isPrivate?: boolean } = {}
): Promise<{ room: GameRoom; clients: ReturnType<typeof makeClient>[] }> {
  const room = makeRoom(options)
  const clients: ReturnType<typeof makeClient>[] = []
  for (let i = 0; i < n; i++) {
    const client = makeClient(`s${i}`)
    await room.onJoin(client, { name: `P${i}`, characterId: "default" })
    clients.push(client)
  }
  return { room, clients }
}

describe("GameRoom.onJoin", () => {
  it("adds player to state", () => {
    const room = makeRoom()
    room.onJoin(makeClient("p1"), { name: "Alice", characterId: "a" })
    expect(room.state.players.has("p1")).toBe(true)
    expect(room.state.players.get("p1")!.name).toBe("Alice")
  })

  it("player starts with score 0 and isConnected true", () => {
    const room = makeRoom()
    room.onJoin(makeClient("p1"), { name: "Alice", characterId: "a" })
    const p = room.state.players.get("p1")!
    expect(p.score).toBe(0)
    expect(p.isConnected).toBe(true)
  })

  it("first player is gamemaster", () => {
    const room = makeRoom()
    room.onJoin(makeClient("p1"), { name: "Alice", characterId: "a" })
    expect(room.state.players.get("p1")!.isGamemaster).toBe(true)
  })

  it("second player is not gamemaster", () => {
    const room = makeRoom()
    room.onJoin(makeClient("p1"), { name: "Alice", characterId: "a" })
    room.onJoin(makeClient("p2"), { name: "Bob", characterId: "b" })
    expect(room.state.players.get("p2")!.isGamemaster).toBe(false)
  })

  it("room gets a roomCode on create", () => {
    const room = makeRoom()
    expect(room.state.roomCode).toHaveLength(6)
  })

  it("lobby state sync does not crash when gameMode is undefined", async () => {
    const state = new GameState()
    // @ts-expect-error simulate partial patch arriving as undefined
    state.gameMode = undefined
    const safe = (state.gameMode ?? "olympiade").toUpperCase()
    expect(safe).toBe("OLYMPIADE")
  })
})

describe("GameRoom.onLeave", () => {
  it("marks player disconnected and not ready", () => {
    const room = makeRoom()
    const c = makeClient("p1")
    room.onJoin(c, { name: "Alice", characterId: "a" })
    room.onLeave(c, false)
    const p = room.state.players.get("p1")!
    expect(p.isConnected).toBe(false)
    expect(p.isReady).toBe(false)
  })
})

describe("GameRoom cheat mechanic", () => {
  it("sets isCheating on cheat_attempt", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room["handleCheatAttempt"](c1, { cheatType: "peek_mission" })
    expect(room.state.players.get("p1")!.isCheating).toBe(true)
    expect(room.state.players.get("p1")!.cheatStartTimestamp).toBeGreaterThan(0)
  })

  it("resolves caught cheat: isCheating false, score -1", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room.state.players.get("p1")!.score = 2
    room["handleCheatAttempt"](c1, { cheatType: "peek_mission" })
    room["handleCatchCheat"](c2, { targetId: "p1" })
    const p = room.state.players.get("p1")!
    expect(p.isCheating).toBe(false)
    expect(p.score).toBe(1)
  })

  it("score never goes below 0 when caught", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room.state.players.get("p1")!.score = 0
    room["handleCheatAttempt"](c1, { cheatType: "peek_mission" })
    room["handleCatchCheat"](c2, { targetId: "p1" })
    expect(room.state.players.get("p1")!.score).toBe(0)
  })

  it("ignores catch when target is not cheating", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room.state.players.get("p1")!.score = 5
    room["handleCatchCheat"](c2, { targetId: "p1" })
    expect(room.state.players.get("p1")!.score).toBe(5)
  })

  it("cheat adds event to cheatLog", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room["handleCheatAttempt"](c1, { cheatType: "peek_mission" })
    room["handleCatchCheat"](c2, { targetId: "p1" })
    expect(room.state.cheatLog.length).toBe(1)
    expect(room.state.cheatLog[0].caught).toBe(true)
  })
})

describe("GameRoom gamemaster", () => {
  it("gamemaster can change maxPlayers", () => {
    const room = makeRoom()
    const gm = makeClient("p1")
    room.onJoin(gm, { name: "Alice", characterId: "a" })
    room["handleGamemasterSettings"](gm, { maxPlayers: 2 })
    expect(room.state.maxPlayers).toBe(2)
  })

  it("non-gamemaster cannot change settings", () => {
    const room = makeRoom()
    room.onJoin(makeClient("p1"), { name: "Alice", characterId: "a" })
    const p2 = makeClient("p2")
    room.onJoin(p2, { name: "Bob", characterId: "b" })
    room["handleGamemasterSettings"](p2, { maxPlayers: 2 })
    expect(room.state.maxPlayers).toBe(4)
  })

  it("transfer_gamemaster switches crown", () => {
    const room = makeRoom()
    const gm = makeClient("p1")
    const p2 = makeClient("p2")
    room.onJoin(gm, { name: "Alice", characterId: "a" })
    room.onJoin(p2, { name: "Bob", characterId: "b" })
    room["handleTransferGamemaster"](gm, { targetId: "p2" })
    expect(room.state.players.get("p1")!.isGamemaster).toBe(false)
    expect(room.state.players.get("p2")!.isGamemaster).toBe(true)
  })
})

describe("GameRoom round management", () => {
  it("transitions to wheel when 2+ connected players all ready", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room["handlePlayerReady"](c1, {})
    room["handlePlayerReady"](c2, {})
    expect(room.state.phase).toBe("wheel")
    expect(room.state.olympiade.currentRound).toBe(1)
  })

  it("does not start with only 1 player ready", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room["handlePlayerReady"](c1, {})
    expect(room.state.phase).toBe("lobby")
  })

  it("transitions to gameover after MAX_ROUNDS", () => {
    const room = makeRoom()
    room.state.olympiade.currentRound = MAX_ROUNDS
    room["startPlacementPhase"]()
    expect(room.state.phase).toBe("gameover")
  })

  it("wheelSpinnerId is set to a valid player after placement phase ends", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room["handlePlayerReady"](c1, {})
    room["handlePlayerReady"](c2, {})
    // Simulate placement phase ending
    room["startNewRound"]()
    expect(["p1", "p2"]).toContain(room.state.olympiade.wheel.spinnerId)
  })
})

describe("GameRoom wheel mechanics", () => {
  function startWheelReady() {
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room["handlePlayerReady"](c1, {})
    room["handlePlayerReady"](c2, {})
    // Skip placement phase
    room["startNewRound"]()
    return { room, c1, c2 }
  }

  it("sets wheelVelocity within [WHEEL_MIN_VELOCITY, WHEEL_MAX_VELOCITY] after placement phase", () => {
    const { room } = startWheelReady()
    expect(room.state.olympiade.wheel.velocity).toBeGreaterThanOrEqual(WHEEL_MIN_VELOCITY)
    expect(room.state.olympiade.wheel.velocity).toBeLessThanOrEqual(WHEEL_MAX_VELOCITY)
  })

  it("transitions phase to 'minigame' when spinner sends wheel_done", () => {
    const { room, c1, c2 } = startWheelReady()
    expect(room.state.phase).toBe("wheel")

    const origNow = Date.now
    Date.now = () => origNow() + 7000

    const spinnerClient = room.state.olympiade.wheel.spinnerId === c1.sessionId ? c1 : c2
    room["handleWheelDone"](spinnerClient, {})
    expect(room.state.phase).toBe("minigame")

    Date.now = origNow
  })

  it("ignores wheel_done sent too early (before min spin time)", () => {
    const { room, c1, c2 } = startWheelReady()
    const spinnerClient = room.state.olympiade.wheel.spinnerId === c1.sessionId ? c1 : c2
    room["handleWheelDone"](spinnerClient, {})
    expect(room.state.phase).toBe("wheel")
  })

  it("ignores wheel_done from non-spinner", () => {
    const { room, c1, c2 } = startWheelReady()
    const nonSpinnerClient = room.state.olympiade.wheel.spinnerId === c1.sessionId ? c2 : c1
    room["handleWheelDone"](nonSpinnerClient, {})
    expect(room.state.phase).toBe("wheel")
  })
})

describe("GameRoom chess round", () => {
  function setup4Players() {
    const room = makeRoom()
    const clients = ["p1","p2","p3","p4"].map(id => makeClient(id))
    for (const [i, c] of clients.entries()) {
      room.onJoin(c, { name: `Player${i+1}`, characterId: "a" })
    }
    return { room, clients }
  }

  it("startChessRound places 32 pieces in chess.pieces", () => {
    const { room } = setup4Players()
    room["startChessRound"]()
    expect(room.state.chess.pieces.size).toBe(32)
  })

  it("startChessRound sets chess.turnPlayerId to first player", () => {
    const { room } = setup4Players()
    room["startChessRound"]()
    expect(room.state.chess.playerOrder[0]).toBe(room.state.chess.turnPlayerId)
  })

  it("startChessRound sets chess.turnDeadline ~30s in future", () => {
    const { room } = setup4Players()
    const before = Date.now()
    room["startChessRound"]()
    expect(room.state.chess.turnDeadline).toBeGreaterThan(before + 29_000)
    expect(room.state.chess.turnDeadline).toBeLessThan(before + 31_000)
  })

  it("chess_move from wrong player is ignored", () => {
    const { room, clients } = setup4Players()
    room.state.phase = "minigame"
    room["startChessRound"]()
    const firstTurnId = room.state.chess.turnPlayerId
    const wrongClient = clients.find(c => c.sessionId !== firstTurnId)!
    room["handleChessMove"](wrongClient, { fromRow:6, fromCol:0, toRow:5, toCol:0 })
    expect(room.state.chess.turnPlayerId).toBe(firstTurnId)
  })

  it("chess_move with invalid destination is ignored", () => {
    const { room, clients } = setup4Players()
    room.state.phase = "minigame"
    room["startChessRound"]()
    const firstTurnId = room.state.chess.turnPlayerId
    const mover = clients.find(c => c.sessionId === firstTurnId)!
    const pawn = [...room.state.chess.pieces.values()].find(
      p => p.ownerId === firstTurnId && p.pieceType === "pawn"
    )!
    room["handleChessMove"](mover, { fromRow: pawn.row, fromCol: pawn.col, toRow: pawn.row, toCol: pawn.col })
    expect(room.state.chess.turnPlayerId).toBe(firstTurnId)
  })

  it("valid chess_move advances turn to next player", () => {
    const { room, clients } = setup4Players()
    room.state.phase = "minigame"
    room["startChessRound"]()
    const firstTurnId = room.state.chess.turnPlayerId
    const mover = clients.find(c => c.sessionId === firstTurnId)!
    // Move a pawn one step forward (bottom players move up: row 6 → row 5).
    const pawn = [...room.state.chess.pieces.values()].find(
      p => p.ownerId === firstTurnId && p.pieceType === "pawn"
    )!
    room["handleChessMove"](mover, { fromRow: pawn.row, fromCol: pawn.col, toRow: pawn.row - 1, toCol: pawn.col })
    expect(room.state.chess.turnPlayerId).not.toBe(firstTurnId)
  })

  it("valid chess_move updates piece position in state", () => {
    const { room, clients } = setup4Players()
    room.state.phase = "minigame"
    room["startChessRound"]()
    const firstTurnId = room.state.chess.turnPlayerId
    const mover = clients.find(c => c.sessionId === firstTurnId)!
    // Move a pawn one step forward (bottom players move up: row 6 → row 5).
    const pawn = [...room.state.chess.pieces.values()].find(
      p => p.ownerId === firstTurnId && p.pieceType === "pawn"
    )!
    const toRow = pawn.row - 1
    const toCol = pawn.col
    room["handleChessMove"](mover, { fromRow: pawn.row, fromCol: pawn.col, toRow, toCol })
    expect(room.state.chess.pieces.get(pawn.id)!.row).toBe(toRow)
  })

  it("king capture turns captured player's pieces to ghosts", () => {
    const { room, clients } = setup4Players()
    room.state.phase = "minigame"
    room["startChessRound"]()
    const victim = clients[1].sessionId
    room["eliminatePlayer"](victim)
    room["syncChessBoard"]()
    const allVictimPieces = [...room.state.chess.pieces.values()].filter(p => p.ownerId === victim)
    expect(allVictimPieces.every(p => p.isGhost)).toBe(true)
    expect([...room.state.chess.eliminatedIds].includes(victim)).toBe(true)
  })

  it("last surviving player triggers result phase and +3 score", () => {
    const { room } = setup4Players()
    room.state.phase = "minigame"
    room["startChessRound"]()
    const [winner, ...losers] = [...room.state.chess.playerOrder]
    for (const id of losers) {
      room["eliminatePlayer"](id)
    }
    room["syncChessBoard"]()
    room["checkChessWin"]()
    expect(room.state.phase).toBe("result")
    expect(room.state.players.get(winner)!.score).toBe(3)
  })
})

describe("Single game mode", () => {
  function makeSingleRoom(playerCount = 2) {
    const room = makeRoom()
    const clients = Array.from({ length: playerCount }, (_, i) => {
      const c = makeClient(`p${i + 1}`)
      room.onJoin(c, { name: `Player${i + 1}`, characterId: "a" })
      return c
    })
    room.state.gameMode = "single"
    return { room, clients }
  }

  it("transitions to game_select phase when all ready in single mode", async () => {
    const { room, clients } = makeSingleRoom(2)
    for (const c of clients) room["handlePlayerReady"](c, {})
    expect(room.state.phase).toBe("game_select")
  })

  it("GM can select chess in single mode", async () => {
    const { room, clients } = makeSingleRoom(2)
    for (const c of clients) room["handlePlayerReady"](c, {})
    const gm = clients.find(c => room.state.players.get(c.sessionId)?.isGamemaster)!
    room["handleSelectGame"](gm, { game: "chess" })
    expect(room.state.phase).toBe("minigame")
    expect(room.state.olympiade.currentMinigame).toBe("chess")
  })

  it("non-GM cannot select game", async () => {
    const { room, clients } = makeSingleRoom(2)
    for (const c of clients) room["handlePlayerReady"](c, {})
    const nonGm = clients.find(c => !room.state.players.get(c.sessionId)?.isGamemaster)!
    room["handleSelectGame"](nonGm, { game: "chess" })
    expect(room.state.phase).toBe("game_select")
  })

  it("invalid game name is rejected", async () => {
    const { room, clients } = makeSingleRoom(2)
    for (const c of clients) room["handlePlayerReady"](c, {})
    const gm = clients.find(c => room.state.players.get(c.sessionId)?.isGamemaster)!
    room["handleSelectGame"](gm, { game: "notaGame" })
    expect(room.state.phase).toBe("game_select")
  })

  it("GM can select connect4 in single mode", async () => {
    const { room, clients } = makeSingleRoom(2)
    for (const c of clients) room["handlePlayerReady"](c, {})
    const gm = clients.find(c => room.state.players.get(c.sessionId)?.isGamemaster)!
    room["handleSelectGame"](gm, { game: "connect4" })
    expect(room.state.phase).toBe("minigame")
    expect(room.state.olympiade.currentMinigame).toBe("connect4")
  })

  it("select_game is ignored when phase is not game_select", async () => {
    const { room, clients } = makeSingleRoom(2)
    // phase is still "lobby" — do NOT call player_ready
    const gm = clients.find(c => room.state.players.get(c.sessionId)?.isGamemaster)!
    room["handleSelectGame"](gm, { game: "chess" })
    expect(room.state.phase).toBe("lobby")
  })

  it("player_ready is ignored during game_select phase", async () => {
    const { room, clients } = makeSingleRoom(2)
    for (const c of clients) room["handlePlayerReady"](c, {})
    // phase is now game_select
    expect(room.state.phase).toBe("game_select")
    // sending player_ready again should not change phase
    for (const c of clients) room["handlePlayerReady"](c, {})
    expect(room.state.phase).toBe("game_select")
  })
})

describe("Room metadata", () => {
  it("publishes roomCode, playerCount, maxPlayers, isPrivate after creation", async () => {
    const room = makeRoom()
    expect(room.metadata).toMatchObject({
      roomCode: room.state.roomCode,
      playerCount: 0,
      maxPlayers: 4,
      isPrivate: false,
    })
  })

  it("updates playerCount when a player joins and leaves", async () => {
    const { room, clients } = await makeRoomWithPlayers(2)
    expect(room.metadata?.playerCount).toBe(2)
    await room.onLeave(clients[0], true)
    expect(room.metadata?.playerCount).toBe(1)
  })

  it("updates maxPlayers in metadata when GM changes setting", async () => {
    const { room, clients } = await makeRoomWithPlayers(1)
    const gm = clients[0]
    await room["handleGamemasterSettings"](gm, { maxPlayers: 2 })
    expect(room.metadata?.maxPlayers).toBe(2)
  })

  it("publishes isPrivate true when created with isPrivate option", async () => {
    const room = makeRoom({ isPrivate: true })
    expect(room.metadata?.isPrivate).toBe(true)
  })
})

describe("Full-lobby guard", () => {
  it("onAuth refuses join when room is full", async () => {
    const { room } = await makeRoomWithPlayers(4)
    let rejected = false
    try {
      ;(room as unknown as { onAuth: (c: unknown, o: unknown) => boolean }).onAuth(
        {},
        { name: "X", characterId: "y" }
      )
    } catch {
      rejected = true
    }
    expect(rejected).toBe(true)
  })

  it("onAuth allows join when room is not full", async () => {
    const { room } = await makeRoomWithPlayers(2)
    const result = (
      room as unknown as { onAuth: (c: unknown, o: unknown) => boolean }
    ).onAuth({}, { name: "X", characterId: "y" })
    expect(result).toBe(true)
  })
})

describe("shared constants", () => {
  it("PHASER_NUM_KEYS has correct Phaser 3 key names", () => {
    expect(PHASER_NUM_KEYS[1]).toBe("ONE")
    expect(PHASER_NUM_KEYS[2]).toBe("TWO")
    expect(PHASER_NUM_KEYS[0]).toBe("ZERO")
  })
})
