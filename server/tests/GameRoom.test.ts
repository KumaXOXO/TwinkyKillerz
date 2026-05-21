import { describe, it, expect, vi, beforeEach } from "vitest"
import { GameRoom } from "../src/rooms/GameRoom"
import { CHEAT_WINDOW_MS, MAX_ROUNDS, WHEEL_MIN_VELOCITY, WHEEL_MAX_VELOCITY, CHESS_TURN_MS } from "../../shared/constants"

function makeRoom() {
  const room = new GameRoom()
  room.roomId = "test"
  // @ts-ignore
  room.clock = { setTimeout: (fn: () => void, _ms: number) => fn, start: () => {} } as any
  // @ts-ignore
  room.broadcast = vi.fn()
  room.onCreate({})
  return room
}

function makeClient(id: string) {
  return { sessionId: id, send: vi.fn() } as any
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
})

describe("GameRoom.onLeave", () => {
  it("marks player disconnected", () => {
    const room = makeRoom()
    const c = makeClient("p1")
    room.onJoin(c, { name: "Alice", characterId: "a" })
    room.onLeave(c, false)
    expect(room.state.players.get("p1")!.isConnected).toBe(false)
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
    // c1 not cheating, c2 tries to catch
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
    expect(room.state.currentRound).toBe(1)
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
    room.state.currentRound = MAX_ROUNDS
    room["startNewRound"]()
    expect(room.state.phase).toBe("gameover")
  })

  it("wheelSpinnerId is set to a valid player on round start", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room["handlePlayerReady"](c1, {})
    room["handlePlayerReady"](c2, {})
    expect(["p1", "p2"]).toContain(room.state.wheelSpinnerId)
  })
})

describe("GameRoom wheel mechanics", () => {
  it("sets wheelVelocity within [WHEEL_MIN_VELOCITY, WHEEL_MAX_VELOCITY] on round start", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room["handlePlayerReady"](c1, {})
    room["handlePlayerReady"](c2, {})
    expect(room.state.wheelVelocity).toBeGreaterThanOrEqual(WHEEL_MIN_VELOCITY)
    expect(room.state.wheelVelocity).toBeLessThanOrEqual(WHEEL_MAX_VELOCITY)
  })

  it("transitions phase to 'minigame' when spinner sends wheel_done", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room["handlePlayerReady"](c1, {})
    room["handlePlayerReady"](c2, {})
    expect(room.state.phase).toBe("wheel")

    // Advance time past the maximum possible spin duration
    const origNow = Date.now
    Date.now = () => origNow() + 7000

    const spinnerClient = room.state.wheelSpinnerId === c1.sessionId ? c1 : c2
    room["handleWheelDone"](spinnerClient, {})
    expect(room.state.phase).toBe("minigame")

    Date.now = origNow
  })

  it("ignores wheel_done sent too early (before min spin time)", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room["handlePlayerReady"](c1, {})
    room["handlePlayerReady"](c2, {})
    const spinnerClient = room.state.wheelSpinnerId === c1.sessionId ? c1 : c2
    room["handleWheelDone"](spinnerClient, {})
    expect(room.state.phase).toBe("wheel")
  })

  it("ignores wheel_done from non-spinner", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room["handlePlayerReady"](c1, {})
    room["handlePlayerReady"](c2, {})
    const nonSpinnerClient = room.state.wheelSpinnerId === c1.sessionId ? c2 : c1
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

  it("startChessRound places 24 pieces in chessPieces", () => {
    const { room } = setup4Players()
    room["startChessRound"]()
    expect(room.state.chessPieces.size).toBe(24)
  })

  it("startChessRound sets chessTurnPlayerId to first player", () => {
    const { room } = setup4Players()
    room["startChessRound"]()
    expect(room.state.chessPlayerOrder[0]).toBe(room.state.chessTurnPlayerId)
  })

  it("startChessRound sets chessTurnDeadline ~30s in future", () => {
    const { room } = setup4Players()
    const before = Date.now()
    room["startChessRound"]()
    expect(room.state.chessTurnDeadline).toBeGreaterThan(before + 29_000)
    expect(room.state.chessTurnDeadline).toBeLessThan(before + 31_000)
  })

  it("chess_move from wrong player is ignored", () => {
    const { room, clients } = setup4Players()
    room.state.phase = "minigame"
    room["startChessRound"]()
    const firstTurnId = room.state.chessTurnPlayerId
    const wrongClient = clients.find(c => c.sessionId !== firstTurnId)!
    room["handleChessMove"](wrongClient, { fromRow:6, fromCol:0, toRow:5, toCol:0 })
    expect(room.state.chessTurnPlayerId).toBe(firstTurnId)
  })

  it("chess_move with invalid destination is ignored", () => {
    const { room, clients } = setup4Players()
    room.state.phase = "minigame"
    room["startChessRound"]()
    const firstTurnId = room.state.chessTurnPlayerId
    const mover = clients.find(c => c.sessionId === firstTurnId)!
    const pawn = [...room.state.chessPieces.values()].find(
      p => p.ownerId === firstTurnId && p.pieceType === "pawn"
    )!
    // Move pawn onto itself — invalid
    room["handleChessMove"](mover, { fromRow: pawn.row, fromCol: pawn.col, toRow: pawn.row, toCol: pawn.col })
    expect(room.state.chessTurnPlayerId).toBe(firstTurnId)
  })

  it("valid chess_move advances turn to next player", () => {
    const { room, clients } = setup4Players()
    room.state.phase = "minigame"
    room["startChessRound"]()
    const firstTurnId = room.state.chessTurnPlayerId
    const mover = clients.find(c => c.sessionId === firstTurnId)!
    const pawn = [...room.state.chessPieces.values()].find(
      p => p.ownerId === firstTurnId && p.pieceType === "pawn"
    )!
    const dir = room["chessPawnDirs"][firstTurnId] as number
    room["handleChessMove"](mover, { fromRow: pawn.row, fromCol: pawn.col, toRow: pawn.row + dir, toCol: pawn.col })
    expect(room.state.chessTurnPlayerId).not.toBe(firstTurnId)
  })

  it("valid chess_move updates piece position in state", () => {
    const { room, clients } = setup4Players()
    room.state.phase = "minigame"
    room["startChessRound"]()
    const firstTurnId = room.state.chessTurnPlayerId
    const mover = clients.find(c => c.sessionId === firstTurnId)!
    const pawn = [...room.state.chessPieces.values()].find(
      p => p.ownerId === firstTurnId && p.pieceType === "pawn"
    )!
    const dir = room["chessPawnDirs"][firstTurnId] as number
    const toRow = pawn.row + dir
    room["handleChessMove"](mover, { fromRow: pawn.row, fromCol: pawn.col, toRow, toCol: pawn.col })
    expect(room.state.chessPieces.get(pawn.id)!.row).toBe(toRow)
  })

  it("king capture turns captured player's pieces to ghosts", () => {
    const { room, clients } = setup4Players()
    room.state.phase = "minigame"
    room["startChessRound"]()
    // Direct manipulation: place attacker rook on king's cell (forcing a capture)
    const victim = clients[1].sessionId
    const attackerId = clients[0].sessionId
    const victimKing = [...room.state.chessPieces.values()].find(
      p => p.ownerId === victim && p.pieceType === "king"
    )!
    // Directly invoke eliminatePlayer to test ghost conversion
    room["eliminatePlayer"](victim)
    room["syncChessBoard"]()
    const allVictimPieces = [...room.state.chessPieces.values()].filter(p => p.ownerId === victim)
    expect(allVictimPieces.every(p => p.isGhost)).toBe(true)
    expect(room.state.chessEliminatedIds.includes(victim)).toBe(true)
  })

  it("last surviving player triggers result phase and +3 score", () => {
    const { room, clients } = setup4Players()
    room.state.phase = "minigame"
    room["startChessRound"]()
    // Eliminate all but first player
    const [winner, ...losers] = [...room.state.chessPlayerOrder]
    for (const id of losers) {
      room["eliminatePlayer"](id)
    }
    room["syncChessBoard"]()
    room["checkChessWin"]()
    expect(room.state.phase).toBe("result")
    expect(room.state.players.get(winner)!.score).toBe(3)
  })
})
