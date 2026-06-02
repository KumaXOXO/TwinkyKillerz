# Chess Minigame — Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 4-player chess minigame end-to-end: schema, pure game logic, server room integration, and client scene.

**Architecture:** Shared pure functions in `shared/chessLogic.ts` handle move validation (importable by both server and client). Server is authoritative — validates every move against the same logic before applying. Client uses shared logic only for immediate highlight feedback, not for applying state.

**Tech Stack:** Colyseus MapSchema for pieces (efficient delta sync), Phaser 3 Text objects for pixel-art board, TypeScript shared module alias `@twinky/shared`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `shared/schema.ts` | Modify | Add `ChessPiece` schema class + chess fields to `GameState` |
| `shared/constants.ts` | Modify | Add chess corner layout, starting positions, colors, symbols |
| `shared/chessLogic.ts` | Create | Pure functions: buildInitialBoard, getValidMoves, applyMove, isPlayerEliminated |
| `shared/tests/chessLogic.test.ts` | Create | 27 unit tests for chess logic |
| `server/src/rooms/GameRoom.ts` | Modify | Add chess message handler + 8 chess methods |
| `server/tests/GameRoom.test.ts` | Modify | Add chess integration tests |
| `client/src/network/ColyseusClient.ts` | Modify | Add `sendChessMove` |
| `client/src/scenes/ChessScene.ts` | Modify (replace stub) | Full board render, click handler, turn timer display |

---

### Task 1: Schema + Constants

**Files:**
- Modify: `shared/schema.ts`
- Modify: `shared/constants.ts`

- [ ] **Step 1: Write failing schema test**

Create `shared/tests/schema.test.ts`:

```typescript
import { ChessPiece, GameState } from "../schema"
import { MapSchema, ArraySchema } from "@colyseus/schema"

test("ChessPiece has required fields with defaults", () => {
  const piece = new ChessPiece()
  expect(piece.id).toBe("")
  expect(piece.pieceType).toBe("")
  expect(piece.ownerId).toBe("")
  expect(piece.row).toBe(0)
  expect(piece.col).toBe(0)
  expect(piece.isGhost).toBe(false)
})

test("GameState has chess fields", () => {
  const state = new GameState()
  expect(state.chessPieces).toBeInstanceOf(MapSchema)
  expect(state.chessTurnPlayerId).toBe("")
  expect(state.chessTurnDeadline).toBe(0)
  expect(state.chessPlayerOrder).toBeInstanceOf(ArraySchema)
  expect(state.chessEliminatedIds).toBeInstanceOf(ArraySchema)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:\Users\Administrator\.gstack\projects\TwinkyOlympiade
npx jest shared/tests/schema.test.ts --no-coverage
```

Expected: FAIL — `ChessPiece` not exported from `../schema`

- [ ] **Step 3: Add ChessPiece to shared/schema.ts**

Open `shared/schema.ts`. After the `CheatEvent` class and before `PlayerState`, add:

```typescript
export class ChessPiece extends Schema {
  @type("string") id: string = ""
  @type("string") pieceType: string = ""
  @type("string") ownerId: string = ""
  @type("number") row: number = 0
  @type("number") col: number = 0
  @type("boolean") isGhost: boolean = false
}
```

Then in `GameState`, after the `cheatLog` field, add:

```typescript
  @type({ map: ChessPiece }) chessPieces = new MapSchema<ChessPiece>()
  @type("string") chessTurnPlayerId: string = ""
  @type("number") chessTurnDeadline: number = 0
  @type(["string"]) chessPlayerOrder = new ArraySchema<string>()
  @type(["string"]) chessEliminatedIds = new ArraySchema<string>()
```

- [ ] **Step 4: Run schema test to verify it passes**

```bash
npx jest shared/tests/schema.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Add chess constants to shared/constants.ts**

At the end of `shared/constants.ts`, append:

```typescript
export const CHESS_CORNERS = ["bottom-left", "bottom-right", "top-right", "top-left"] as const
export type ChessCorner = (typeof CHESS_CORNERS)[number]

// [row, col, pieceType] for each player's corner
export const CHESS_STARTING_POSITIONS: Record<ChessCorner, Array<[number, number, string]>> = {
  "bottom-left":  [[7,0,"rook"],[7,1,"king"],[7,2,"knight"],[6,0,"pawn"],[6,1,"pawn"],[6,2,"pawn"]],
  "bottom-right": [[7,7,"rook"],[7,6,"king"],[7,5,"knight"],[6,7,"pawn"],[6,6,"pawn"],[6,5,"pawn"]],
  "top-right":    [[0,7,"rook"],[0,6,"king"],[0,5,"knight"],[1,7,"pawn"],[1,6,"pawn"],[1,5,"pawn"]],
  "top-left":     [[0,0,"rook"],[0,1,"king"],[0,2,"knight"],[1,0,"pawn"],[1,1,"pawn"],[1,2,"pawn"]],
}

// pawn advances toward center: bottom players go up (-1), top players go down (+1)
export const CHESS_PAWN_DIRS: Record<ChessCorner, number> = {
  "bottom-left": -1, "bottom-right": -1, "top-right": 1, "top-left": 1,
}

export const CHESS_PLAYER_COLORS = ["#aa77ff", "#44ddff", "#ffaa44", "#44ff88"] as const

export const CHESS_PIECE_SYMBOLS: Record<string, string> = {
  king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙",
}

export const CHESS_TURN_MS = 30_000
```

- [ ] **Step 6: Run all server tests to verify nothing broken**

```bash
npx jest --no-coverage
```

Expected: all existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add shared/schema.ts shared/constants.ts shared/tests/schema.test.ts
git commit -m "feat: add ChessPiece schema and chess constants"
```

---

### Task 2: Shared Chess Logic

**Files:**
- Create: `shared/chessLogic.ts`
- Create: `shared/tests/chessLogic.test.ts`

- [ ] **Step 1: Write failing tests**

Create `shared/tests/chessLogic.test.ts`:

```typescript
import {
  buildInitialBoard,
  getValidMoves,
  applyMove,
  isPlayerEliminated,
  ChessPieceData,
} from "../chessLogic"
import { CHESS_PAWN_DIRS } from "../constants"

// ── buildInitialBoard ──────────────────────────────────────────────────────────

test("buildInitialBoard gives 6 pieces per player", () => {
  const ids = ["p1", "p2", "p3", "p4"]
  const board = buildInitialBoard(ids)
  expect(board).toHaveLength(24)
  for (const id of ids) {
    expect(board.filter(p => p.ownerId === id)).toHaveLength(6)
  }
})

test("buildInitialBoard gives each player exactly 1 king", () => {
  const board = buildInitialBoard(["p1","p2","p3","p4"])
  for (const id of ["p1","p2","p3","p4"]) {
    const kings = board.filter(p => p.ownerId === id && p.pieceType === "king")
    expect(kings).toHaveLength(1)
  }
})

test("buildInitialBoard assigns unique ids to all pieces", () => {
  const board = buildInitialBoard(["p1","p2","p3","p4"])
  const ids = board.map(p => p.id)
  expect(new Set(ids).size).toBe(24)
})

test("buildInitialBoard places no two pieces on same cell", () => {
  const board = buildInitialBoard(["p1","p2","p3","p4"])
  const cells = board.map(p => `${p.row},${p.col}`)
  expect(new Set(cells).size).toBe(24)
})

// ── getValidMoves ──────────────────────────────────────────────────────────────

function piece(overrides: Partial<ChessPieceData>): ChessPieceData {
  return { id:"x", pieceType:"pawn", ownerId:"p1", row:4, col:4, isGhost:false, ...overrides }
}

test("ghost piece has no valid moves", () => {
  const pieces = [piece({ id:"g1", isGhost:true })]
  expect(getValidMoves("g1", pieces, CHESS_PAWN_DIRS)).toEqual([])
})

test("rook can move horizontally on empty board", () => {
  const pieces = [piece({ id:"r1", pieceType:"rook", row:4, col:4 })]
  const moves = getValidMoves("r1", pieces, CHESS_PAWN_DIRS)
  expect(moves).toContainEqual([4, 0])
  expect(moves).toContainEqual([4, 7])
  expect(moves).toContainEqual([0, 4])
  expect(moves).toContainEqual([7, 4])
})

test("rook is blocked by own piece", () => {
  const pieces = [
    piece({ id:"r1", pieceType:"rook", row:4, col:4, ownerId:"p1" }),
    piece({ id:"r2", pieceType:"rook", row:4, col:6, ownerId:"p1" }),
  ]
  const moves = getValidMoves("r1", pieces, CHESS_PAWN_DIRS)
  expect(moves).toContainEqual([4, 5])
  expect(moves).not.toContainEqual([4, 6])
  expect(moves).not.toContainEqual([4, 7])
})

test("rook can capture enemy piece but not pass through it", () => {
  const pieces = [
    piece({ id:"r1", pieceType:"rook", row:4, col:4, ownerId:"p1" }),
    piece({ id:"e1", pieceType:"rook", row:4, col:6, ownerId:"p2" }),
  ]
  const moves = getValidMoves("r1", pieces, CHESS_PAWN_DIRS)
  expect(moves).toContainEqual([4, 6])
  expect(moves).not.toContainEqual([4, 7])
})

test("rook passes through ghost pieces", () => {
  const pieces = [
    piece({ id:"r1", pieceType:"rook", row:4, col:4, ownerId:"p1" }),
    piece({ id:"g1", pieceType:"rook", row:4, col:6, ownerId:"p2", isGhost:true }),
  ]
  const moves = getValidMoves("r1", pieces, CHESS_PAWN_DIRS)
  expect(moves).toContainEqual([4, 6])
  expect(moves).toContainEqual([4, 7])
})

test("knight can jump over pieces", () => {
  const pieces = [
    piece({ id:"n1", pieceType:"knight", row:4, col:4, ownerId:"p1" }),
    piece({ id:"b1", pieceType:"rook", row:3, col:4, ownerId:"p1" }),
    piece({ id:"b2", pieceType:"rook", row:4, col:5, ownerId:"p1" }),
  ]
  const moves = getValidMoves("n1", pieces, CHESS_PAWN_DIRS)
  expect(moves).toContainEqual([2, 5])
  expect(moves).toContainEqual([2, 3])
})

test("knight cannot land on own piece", () => {
  const pieces = [
    piece({ id:"n1", pieceType:"knight", row:4, col:4, ownerId:"p1" }),
    piece({ id:"b1", pieceType:"rook", row:2, col:5, ownerId:"p1" }),
  ]
  const moves = getValidMoves("n1", pieces, CHESS_PAWN_DIRS)
  expect(moves).not.toContainEqual([2, 5])
})

test("pawn moves forward one square (bottom-left player, dir=-1)", () => {
  const pieces = [piece({ id:"pw", pieceType:"pawn", row:6, col:1, ownerId:"p1" })]
  const pawnDirs = { "p1": -1 } as Record<string, number>
  const moves = getValidMoves("pw", pieces, pawnDirs)
  expect(moves).toContainEqual([5, 1])
})

test("pawn cannot capture forward, can capture diagonally", () => {
  const pieces = [
    piece({ id:"pw", pieceType:"pawn", row:6, col:1, ownerId:"p1" }),
    piece({ id:"e1", pieceType:"pawn", row:5, col:1, ownerId:"p2" }),
    piece({ id:"e2", pieceType:"pawn", row:5, col:2, ownerId:"p2" }),
  ]
  const pawnDirs = { "p1": -1, "p2": 1 } as Record<string, number>
  const moves = getValidMoves("pw", pieces, pawnDirs)
  expect(moves).not.toContainEqual([5, 1])
  expect(moves).toContainEqual([5, 2])
})

test("pawn cannot capture ghost diagonally", () => {
  const pieces = [
    piece({ id:"pw", pieceType:"pawn", row:6, col:1, ownerId:"p1" }),
    piece({ id:"g1", pieceType:"pawn", row:5, col:2, ownerId:"p2", isGhost:true }),
  ]
  const pawnDirs = { "p1": -1 } as Record<string, number>
  const moves = getValidMoves("pw", pieces, pawnDirs)
  expect(moves).not.toContainEqual([5, 2])
})

// ── applyMove ─────────────────────────────────────────────────────────────────

test("applyMove updates piece position", () => {
  const pieces = [piece({ id:"r1", pieceType:"rook", row:4, col:4, ownerId:"p1" })]
  const { pieces: after } = applyMove(pieces, 4, 4, 4, 7)
  const moved = after.find(p => p.id === "r1")!
  expect(moved.row).toBe(4)
  expect(moved.col).toBe(7)
})

test("applyMove removes captured non-ghost enemy piece", () => {
  const pieces = [
    piece({ id:"r1", pieceType:"rook", row:4, col:4, ownerId:"p1" }),
    piece({ id:"e1", pieceType:"rook", row:4, col:7, ownerId:"p2" }),
  ]
  const { pieces: after, captured } = applyMove(pieces, 4, 4, 4, 7)
  expect(after.find(p => p.id === "e1")).toBeUndefined()
  expect(captured?.id).toBe("e1")
})

test("applyMove does not capture ghost piece", () => {
  const pieces = [
    piece({ id:"r1", pieceType:"rook", row:4, col:4, ownerId:"p1" }),
    piece({ id:"g1", pieceType:"rook", row:4, col:7, ownerId:"p2", isGhost:true }),
  ]
  const { pieces: after, captured } = applyMove(pieces, 4, 4, 4, 7)
  expect(after.find(p => p.id === "g1")).toBeDefined()
  expect(captured).toBeNull()
})

test("applyMove is immutable — original array unchanged", () => {
  const pieces = [piece({ id:"r1", pieceType:"rook", row:4, col:4, ownerId:"p1" })]
  const original = pieces[0].row
  applyMove(pieces, 4, 4, 4, 7)
  expect(pieces[0].row).toBe(original)
})

// ── isPlayerEliminated ────────────────────────────────────────────────────────

test("player not eliminated when king alive", () => {
  const pieces = [piece({ id:"k1", pieceType:"king", ownerId:"p1", isGhost:false })]
  expect(isPlayerEliminated(pieces, "p1")).toBe(false)
})

test("player eliminated when only ghost king remains", () => {
  const pieces = [piece({ id:"k1", pieceType:"king", ownerId:"p1", isGhost:true })]
  expect(isPlayerEliminated(pieces, "p1")).toBe(true)
})

test("player eliminated when no pieces at all", () => {
  const pieces: ChessPieceData[] = []
  expect(isPlayerEliminated(pieces, "p1")).toBe(true)
})

test("player not eliminated with extra pawn beside king", () => {
  const pieces = [
    piece({ id:"k1", pieceType:"king", ownerId:"p1", isGhost:false }),
    piece({ id:"pw", pieceType:"pawn", ownerId:"p1", isGhost:false }),
  ]
  expect(isPlayerEliminated(pieces, "p1")).toBe(false)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest shared/tests/chessLogic.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../chessLogic'`

- [ ] **Step 3: Create shared/chessLogic.ts**

Create `shared/chessLogic.ts`:

```typescript
export interface ChessPieceData {
  id: string
  pieceType: string
  ownerId: string
  row: number
  col: number
  isGhost: boolean
}

export function buildInitialBoard(playerIds: string[]): ChessPieceData[] {
  const corners = ["bottom-left", "bottom-right", "top-right", "top-left"] as const
  const startingPositions: Record<string, Array<[number, number, string]>> = {
    "bottom-left":  [[7,0,"rook"],[7,1,"king"],[7,2,"knight"],[6,0,"pawn"],[6,1,"pawn"],[6,2,"pawn"]],
    "bottom-right": [[7,7,"rook"],[7,6,"king"],[7,5,"knight"],[6,7,"pawn"],[6,6,"pawn"],[6,5,"pawn"]],
    "top-right":    [[0,7,"rook"],[0,6,"king"],[0,5,"knight"],[1,7,"pawn"],[1,6,"pawn"],[1,5,"pawn"]],
    "top-left":     [[0,0,"rook"],[0,1,"king"],[0,2,"knight"],[1,0,"pawn"],[1,1,"pawn"],[1,2,"pawn"]],
  }
  const pieces: ChessPieceData[] = []
  playerIds.forEach((playerId, playerIdx) => {
    const corner = corners[playerIdx % 4]
    startingPositions[corner].forEach(([row, col, pieceType], pieceIdx) => {
      pieces.push({
        id: `${playerId}-${pieceIdx}`,
        pieceType,
        ownerId: playerId,
        row,
        col,
        isGhost: false,
      })
    })
  })
  return pieces
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8
}

function pieceAt(pieces: ChessPieceData[], row: number, col: number): ChessPieceData | undefined {
  return pieces.find(p => p.row === row && p.col === col)
}

function slidingMoves(
  piece: ChessPieceData,
  pieces: ChessPieceData[],
  dirs: Array<[number, number]>
): Array<[number, number]> {
  const moves: Array<[number, number]> = []
  for (const [dr, dc] of dirs) {
    let r = piece.row + dr
    let c = piece.col + dc
    while (inBounds(r, c)) {
      const blocker = pieceAt(pieces, r, c)
      if (blocker) {
        if (!blocker.isGhost) {
          if (blocker.ownerId !== piece.ownerId) moves.push([r, c])
          break
        }
        // ghost: pass through without adding capture
      } else {
        moves.push([r, c])
      }
      r += dr
      c += dc
    }
  }
  return moves
}

export function getValidMoves(
  pieceId: string,
  pieces: ChessPieceData[],
  pawnDirs: Record<string, number>
): Array<[number, number]> {
  const piece = pieces.find(p => p.id === pieceId)
  if (!piece || piece.isGhost) return []

  const { pieceType, row, col, ownerId } = piece

  if (pieceType === "rook") {
    return slidingMoves(piece, pieces, [[0,1],[0,-1],[1,0],[-1,0]])
  }

  if (pieceType === "knight") {
    const candidates: Array<[number, number]> = [
      [row-2,col+1],[row-2,col-1],[row+2,col+1],[row+2,col-1],
      [row-1,col+2],[row-1,col-2],[row+1,col+2],[row+1,col-2],
    ]
    return candidates.filter(([r,c]) => {
      if (!inBounds(r, c)) return false
      const blocker = pieceAt(pieces, r, c)
      return !blocker || (blocker.ownerId !== ownerId && !blocker.isGhost)
    })
  }

  if (pieceType === "king") {
    const candidates: Array<[number, number]> = [
      [row-1,col-1],[row-1,col],[row-1,col+1],
      [row,col-1],              [row,col+1],
      [row+1,col-1],[row+1,col],[row+1,col+1],
    ]
    return candidates.filter(([r,c]) => {
      if (!inBounds(r, c)) return false
      const blocker = pieceAt(pieces, r, c)
      return !blocker || (blocker.ownerId !== ownerId && !blocker.isGhost)
    })
  }

  if (pieceType === "pawn") {
    const dir = pawnDirs[ownerId] ?? -1
    const moves: Array<[number, number]> = []
    const fwd = row + dir
    if (inBounds(fwd, col) && !pieceAt(pieces, fwd, col)) {
      moves.push([fwd, col])
    }
    for (const dc of [-1, 1]) {
      const tc = col + dc
      if (!inBounds(fwd, tc)) continue
      const target = pieceAt(pieces, fwd, tc)
      if (target && target.ownerId !== ownerId && !target.isGhost) {
        moves.push([fwd, tc])
      }
    }
    return moves
  }

  return []
}

export function applyMove(
  pieces: ChessPieceData[],
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number
): { pieces: ChessPieceData[]; captured: ChessPieceData | null } {
  const target = pieces.find(p => p.row === toRow && p.col === toCol && !p.isGhost)
  const captured = target && target.ownerId !== pieces.find(p => p.row === fromRow && p.col === fromCol)?.ownerId
    ? target
    : null

  const updated = pieces
    .filter(p => !(p.row === toRow && p.col === toCol && !p.isGhost && p.ownerId !== pieces.find(q => q.row === fromRow && q.col === fromCol)?.ownerId))
    .map(p => {
      if (p.row === fromRow && p.col === fromCol) {
        return { ...p, row: toRow, col: toCol }
      }
      return p
    })

  return { pieces: updated, captured }
}

export function isPlayerEliminated(pieces: ChessPieceData[], playerId: string): boolean {
  return !pieces.some(p => p.ownerId === playerId && p.pieceType === "king" && !p.isGhost)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest shared/tests/chessLogic.test.ts --no-coverage
```

Expected: 27 tests PASS

- [ ] **Step 5: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add shared/chessLogic.ts shared/tests/chessLogic.test.ts
git commit -m "feat: add chess logic (buildInitialBoard, getValidMoves, applyMove, isPlayerEliminated)"
```

---

### Task 3: GameRoom Chess Integration

**Files:**
- Modify: `server/src/rooms/GameRoom.ts`
- Modify: `server/tests/GameRoom.test.ts`

- [ ] **Step 1: Write failing tests**

Open `server/tests/GameRoom.test.ts`. After the existing "wheel_done" tests, add:

```typescript
// ── chess integration ─────────────────────────────────────────────────────────

describe("chess round", () => {
  let room: GameRoom
  let client1: MockClient
  let client2: MockClient
  let client3: MockClient
  let client4: MockClient

  beforeEach(async () => {
    room = new GameRoom()
    await room.onCreate({})
    client1 = new MockClient("p1")
    client2 = new MockClient("p2")
    client3 = new MockClient("p3")
    client4 = new MockClient("p4")
    for (const [c, name] of [[client1,"Alice"],[client2,"Bob"],[client3,"Carol"],[client4,"Dave"]] as const) {
      await room.onJoin(c as Client, {})
      room.onMessage("player_ready", c as Client, { name, characterId: "char1" })
    }
    // Advance to wheel phase
    room.state.phase = "wheel"
    room.state.currentMinigame = "chess"
    room.state.wheelSpinnerId = client1.sessionId
    room.state.wheelVelocity = 0
  })

  afterEach(() => room.onDispose())

  test("startChessRound places 24 pieces in chessPieces", () => {
    const origNow = Date.now
    Date.now = () => origNow() + 7000
    room.onMessage("wheel_done", client1 as Client, {})
    Date.now = origNow
    expect(room.state.chessPieces.size).toBe(24)
  })

  test("startChessRound sets chessTurnPlayerId to first player", () => {
    const origNow = Date.now
    Date.now = () => origNow() + 7000
    room.onMessage("wheel_done", client1 as Client, {})
    Date.now = origNow
    expect(room.state.chessPlayerOrder[0]).toBe(room.state.chessTurnPlayerId)
  })

  test("startChessRound sets chessTurnDeadline ~30s in future", () => {
    const origNow = Date.now
    const now = origNow()
    Date.now = () => now + 7000
    room.onMessage("wheel_done", client1 as Client, {})
    Date.now = origNow
    expect(room.state.chessTurnDeadline).toBeGreaterThan(now + 29000)
    expect(room.state.chessTurnDeadline).toBeLessThan(now + 31000)
  })

  function spinToChess(r: GameRoom, spinner: MockClient) {
    const origNow = Date.now
    Date.now = () => origNow() + 7000
    r.onMessage("wheel_done", spinner as Client, {})
    Date.now = origNow
  }

  test("chess_move from wrong player is ignored", () => {
    spinToChess(room, client1)
    const firstTurn = room.state.chessTurnPlayerId
    const wrongClient = firstTurn === client1.sessionId ? client2 : client1
    room.onMessage("chess_move", wrongClient as Client, { fromRow:6, fromCol:0, toRow:5, toCol:0 })
    expect(room.state.chessTurnPlayerId).toBe(firstTurn)
  })

  test("chess_move with invalid move is ignored", () => {
    spinToChess(room, client1)
    const firstTurnId = room.state.chessTurnPlayerId
    const mover = [client1,client2,client3,client4].find(c => c.sessionId === firstTurnId)!
    const piece = [...room.state.chessPieces.values()].find(
      p => p.ownerId === firstTurnId && p.pieceType === "rook"
    )!
    // Try to move rook sideways into own piece — invalid
    room.onMessage("chess_move", mover as Client, { fromRow:piece.row, fromCol:piece.col, toRow:piece.row, toCol:piece.col })
    expect(room.state.chessTurnPlayerId).toBe(firstTurnId)
  })

  test("valid chess_move advances turn to next player", () => {
    spinToChess(room, client1)
    const firstTurnId = room.state.chessTurnPlayerId
    const mover = [client1,client2,client3,client4].find(c => c.sessionId === firstTurnId)!
    const pawn = [...room.state.chessPieces.values()].find(
      p => p.ownerId === firstTurnId && p.pieceType === "pawn"
    )!
    const pawnDir = room.state.chessPlayerOrder.indexOf(firstTurnId) < 2 ? -1 : 1
    room.onMessage("chess_move", mover as Client, {
      fromRow: pawn.row, fromCol: pawn.col, toRow: pawn.row + pawnDir, toCol: pawn.col
    })
    expect(room.state.chessTurnPlayerId).not.toBe(firstTurnId)
  })

  test("valid chess_move updates piece position in state", () => {
    spinToChess(room, client1)
    const firstTurnId = room.state.chessTurnPlayerId
    const mover = [client1,client2,client3,client4].find(c => c.sessionId === firstTurnId)!
    const pawn = [...room.state.chessPieces.values()].find(
      p => p.ownerId === firstTurnId && p.pieceType === "pawn"
    )!
    const pawnDir = room.state.chessPlayerOrder.indexOf(firstTurnId) < 2 ? -1 : 1
    const toRow = pawn.row + pawnDir
    room.onMessage("chess_move", mover as Client, {
      fromRow: pawn.row, fromCol: pawn.col, toRow, toCol: pawn.col
    })
    const movedPiece = room.state.chessPieces.get(pawn.id)!
    expect(movedPiece.row).toBe(toRow)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest server/tests/GameRoom.test.ts --no-coverage
```

Expected: FAIL — chess tests fail (chess methods not yet implemented)

- [ ] **Step 3: Add chess imports to GameRoom.ts**

Open `server/src/rooms/GameRoom.ts`. Add to the import section:

```typescript
import { buildInitialBoard, getValidMoves, applyMove, ChessPieceData } from "../../../shared/chessLogic"
import { ChessPiece } from "../../../shared/schema"
import { CHESS_CORNERS, CHESS_PAWN_DIRS, CHESS_TURN_MS } from "../../../shared/constants"
```

- [ ] **Step 4: Add chess fields to GameRoom class**

Inside the `GameRoom` class body (after existing private fields), add:

```typescript
  private chessPiecesData: ChessPieceData[] = []
  private chessPawnDirs: Record<string, number> = {}
  private chessTurnToken = 0
```

- [ ] **Step 5: Register chess_move message in onCreate**

Inside `onCreate`, after the existing `this.onMessage("wheel_done", ...)` call, add:

```typescript
    this.onMessage("chess_move", (client, msg: { fromRow: number; fromCol: number; toRow: number; toCol: number }) =>
      this.handleChessMove(client, msg)
    )
```

- [ ] **Step 6: Add chess methods to GameRoom**

At the end of the `GameRoom` class, add all chess methods:

```typescript
  private startChessRound() {
    const playerIds = [...this.state.players.keys()]
    this.chessPiecesData = buildInitialBoard(playerIds)

    this.chessPawnDirs = {}
    playerIds.forEach((id, idx) => {
      const corner = CHESS_CORNERS[idx % 4]
      this.chessPawnDirs[id] = CHESS_PAWN_DIRS[corner]
    })

    this.state.chessPlayerOrder.clear()
    playerIds.forEach(id => this.state.chessPlayerOrder.push(id))

    this.state.chessEliminatedIds.clear()

    this.syncChessBoard()

    this.advanceChessTurn(playerIds[0])
  }

  private syncChessBoard() {
    // Remove pieces no longer in local data
    for (const id of [...this.state.chessPieces.keys()]) {
      if (!this.chessPiecesData.find(p => p.id === id)) {
        this.state.chessPieces.delete(id)
      }
    }
    // Upsert all current pieces
    for (const data of this.chessPiecesData) {
      let piece = this.state.chessPieces.get(data.id)
      if (!piece) {
        piece = new ChessPiece()
        this.state.chessPieces.set(data.id, piece)
      }
      piece.id = data.id
      piece.pieceType = data.pieceType
      piece.ownerId = data.ownerId
      piece.row = data.row
      piece.col = data.col
      piece.isGhost = data.isGhost
    }
  }

  private advanceChessTurn(playerId: string) {
    this.state.chessTurnPlayerId = playerId
    this.state.chessTurnDeadline = Date.now() + CHESS_TURN_MS
    this.scheduleTurnTimeout(++this.chessTurnToken, playerId)
  }

  private scheduleTurnTimeout(token: number, playerId: string) {
    this.clock.setTimeout(() => {
      if (token !== this.chessTurnToken) return
      if (this.state.phase !== "minigame") return
      this.advanceToNextPlayer(playerId)
    }, CHESS_TURN_MS)
  }

  private advanceToNextPlayer(currentPlayerId: string) {
    const active = this.getActiveChessPlayers()
    if (active.length === 0) return
    const idx = active.indexOf(currentPlayerId)
    const next = active[(idx + 1) % active.length]
    this.advanceChessTurn(next)
  }

  private handleChessMove(
    client: Client,
    msg: { fromRow: number; fromCol: number; toRow: number; toCol: number }
  ) {
    if (this.state.phase !== "minigame") return
    if (client.sessionId !== this.state.chessTurnPlayerId) return

    const validMoves = getValidMoves(
      this.chessPiecesData.find(p => p.row === msg.fromRow && p.col === msg.fromCol && p.ownerId === client.sessionId)?.id ?? "",
      this.chessPiecesData,
      this.chessPawnDirs
    )
    const isValid = validMoves.some(([r, c]) => r === msg.toRow && c === msg.toCol)
    if (!isValid) return

    const { pieces: updated, captured } = applyMove(
      this.chessPiecesData,
      msg.fromRow, msg.fromCol, msg.toRow, msg.toCol
    )
    this.chessPiecesData = updated
    this.syncChessBoard()

    if (captured && captured.pieceType === "king") {
      this.eliminatePlayer(captured.ownerId)
    }

    if (this.checkChessWin()) return

    this.advanceToNextPlayer(client.sessionId)
  }

  private eliminatePlayer(playerId: string) {
    this.chessPiecesData = this.chessPiecesData.map(p =>
      p.ownerId === playerId ? { ...p, isGhost: true } : p
    )
    this.state.chessEliminatedIds.push(playerId)
    this.syncChessBoard()
  }

  private checkChessWin(): boolean {
    const active = this.getActiveChessPlayers()
    if (active.length > 1) return false
    this.endChessRound(active[0] ?? null)
    return true
  }

  private getActiveChessPlayers(): string[] {
    return [...this.state.chessPlayerOrder].filter(
      id => !this.isEliminated(id)
    )
  }

  private isEliminated(playerId: string): boolean {
    return this.state.chessEliminatedIds.includes(playerId)
  }

  private endChessRound(winnerId: string | null) {
    this.state.phase = "result"
    if (winnerId) {
      const winner = this.state.players.get(winnerId)
      if (winner) winner.score += 3
    }
  }
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npx jest server/tests/GameRoom.test.ts --no-coverage
```

Expected: all tests pass (original 21 + new chess tests)

- [ ] **Step 8: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add server/src/rooms/GameRoom.ts server/tests/GameRoom.test.ts
git commit -m "feat: GameRoom chess integration (startChessRound, handleChessMove, turn timer, elimination)"
```

---

### Task 4: Client — ChessScene + sendChessMove

**Files:**
- Modify: `client/src/network/ColyseusClient.ts`
- Modify: `client/src/scenes/ChessScene.ts` (replace stub)

- [ ] **Step 1: Add sendChessMove to ColyseusClient.ts**

Open `client/src/network/ColyseusClient.ts`. After the `sendWheelDone` function, add:

```typescript
export function sendChessMove(fromRow: number, fromCol: number, toRow: number, toCol: number): void {
  _room?.send("chess_move", { fromRow, fromCol, toRow, toCol })
}
```

Also add `sendChessMove` to the import in any file that will use it (ChessScene below handles its own import).

- [ ] **Step 2: Replace ChessScene stub**

Open `client/src/scenes/ChessScene.ts`. Replace the entire file with:

```typescript
import Phaser from "phaser"
import { Room } from "colyseus.js"
import { GameState, ChessPiece } from "../../../shared/schema"
import { CHESS_PIECE_SYMBOLS, CHESS_PLAYER_COLORS } from "../../../shared/constants"
import { getValidMoves, ChessPieceData } from "../../../shared/chessLogic"
import { sendChessMove } from "../network/ColyseusClient"

const CELL_SIZE = 56
const BOARD_OFFSET_X = (800 - CELL_SIZE * 8) / 2
const BOARD_OFFSET_Y = (600 - CELL_SIZE * 8) / 2

export class ChessScene extends Phaser.Scene {
  private room!: Room<GameState>
  private pieceTexts: Map<string, Phaser.GameObjects.Text> = new Map()
  private highlightGraphics!: Phaser.GameObjects.Graphics
  private turnText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private selectedPieceId: string | null = null
  private validMovesCache: Array<[number, number]> = []
  private pawnDirs: Record<string, number> = {}
  private playerColors: Record<string, string> = {}
  private stateUnsubscribe: (() => void) | null = null

  constructor() {
    super({ key: "ChessScene" })
  }

  init(data: { room: Room<GameState> }) {
    this.room = data.room
  }

  create() {
    this.drawBoard()
    this.highlightGraphics = this.add.graphics()
    this.turnText = this.add.text(400, 12, "", { fontSize: "18px", color: "#ffffff" }).setOrigin(0.5, 0)
    this.timerText = this.add.text(400, 36, "", { fontSize: "14px", color: "#aaaaaa" }).setOrigin(0.5, 0)

    this.buildPawnDirs()
    this.buildPlayerColors()
    this.renderPieces()
    this.updateTurnText()

    const cb = (state: GameState) => {
      if (state.phase === "result") {
        this.scene.start("ResultScene", { room: this.room })
        return
      }
      this.renderPieces()
      this.updateTurnText()
      this.selectedPieceId = null
      this.validMovesCache = []
      this.highlightGraphics.clear()
    }
    this.stateUnsubscribe = this.room.onStateChange(cb)

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.handleBoardClick(pointer.x, pointer.y)
    })
  }

  private drawBoard() {
    const g = this.add.graphics()
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const x = BOARD_OFFSET_X + c * CELL_SIZE
        const y = BOARD_OFFSET_Y + r * CELL_SIZE
        const light = (r + c) % 2 === 0
        g.fillStyle(light ? 0xd4b06a : 0x8a5a2a, 1)
        g.fillRect(x, y, CELL_SIZE, CELL_SIZE)
      }
    }
  }

  private buildPawnDirs() {
    const order = [...this.room.state.chessPlayerOrder]
    const cornerDirs = [-1, -1, 1, 1]
    order.forEach((id, idx) => {
      this.pawnDirs[id] = cornerDirs[idx % 4]
    })
  }

  private buildPlayerColors() {
    const order = [...this.room.state.chessPlayerOrder]
    order.forEach((id, idx) => {
      this.playerColors[id] = CHESS_PLAYER_COLORS[idx % 4]
    })
  }

  private renderPieces() {
    const currentIds = new Set<string>()
    this.room.state.chessPieces.forEach((piece: ChessPiece, id: string) => {
      currentIds.add(id)
      const x = BOARD_OFFSET_X + piece.col * CELL_SIZE + CELL_SIZE / 2
      const y = BOARD_OFFSET_Y + piece.row * CELL_SIZE + CELL_SIZE / 2
      const symbol = CHESS_PIECE_SYMBOLS[piece.pieceType] ?? "?"
      const color = this.playerColors[piece.ownerId] ?? "#ffffff"

      let text = this.pieceTexts.get(id)
      if (!text) {
        text = this.add.text(x, y, symbol, { fontSize: "28px", color }).setOrigin(0.5)
        this.pieceTexts.set(id, text)
      } else {
        text.setPosition(x, y)
        text.setStyle({ color })
      }
      text.setAlpha(piece.isGhost ? 0.3 : 1)
    })

    // Remove destroyed pieces
    for (const [id, text] of this.pieceTexts.entries()) {
      if (!currentIds.has(id)) {
        text.destroy()
        this.pieceTexts.delete(id)
      }
    }
  }

  private handleBoardClick(sx: number, sy: number) {
    const col = Math.floor((sx - BOARD_OFFSET_X) / CELL_SIZE)
    const row = Math.floor((sy - BOARD_OFFSET_Y) / CELL_SIZE)
    if (row < 0 || row > 7 || col < 0 || col > 7) return

    const myId = this.room.sessionId
    if (this.room.state.chessTurnPlayerId !== myId) return

    // Check if clicking a valid move destination
    const isValidDest = this.validMovesCache.some(([r, c]) => r === row && c === col)
    if (isValidDest && this.selectedPieceId) {
      const src = this.getPieceDataById(this.selectedPieceId)
      if (src) {
        sendChessMove(src.row, src.col, row, col)
        this.selectedPieceId = null
        this.validMovesCache = []
        this.highlightGraphics.clear()
      }
      return
    }

    // Try selecting own piece
    const clicked = this.getPieceAtCell(row, col)
    if (clicked && clicked.ownerId === myId && !clicked.isGhost) {
      this.selectedPieceId = clicked.id
      const piecesArray = this.buildPiecesArray()
      this.validMovesCache = getValidMoves(clicked.id, piecesArray, this.pawnDirs)
      this.drawHighlights()
    } else {
      this.selectedPieceId = null
      this.validMovesCache = []
      this.highlightGraphics.clear()
    }
  }

  private getPieceAtCell(row: number, col: number): ChessPiece | null {
    let found: ChessPiece | null = null
    this.room.state.chessPieces.forEach((p: ChessPiece) => {
      if (p.row === row && p.col === col) found = p
    })
    return found
  }

  private getPieceDataById(id: string): ChessPiece | null {
    return this.room.state.chessPieces.get(id) ?? null
  }

  private buildPiecesArray(): ChessPieceData[] {
    const arr: ChessPieceData[] = []
    this.room.state.chessPieces.forEach((p: ChessPiece, id: string) => {
      arr.push({ id, pieceType: p.pieceType, ownerId: p.ownerId, row: p.row, col: p.col, isGhost: p.isGhost })
    })
    return arr
  }

  private drawHighlights() {
    this.highlightGraphics.clear()
    this.highlightGraphics.fillStyle(0xffff00, 0.35)
    for (const [r, c] of this.validMovesCache) {
      const x = BOARD_OFFSET_X + c * CELL_SIZE
      const y = BOARD_OFFSET_Y + r * CELL_SIZE
      this.highlightGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
    }
  }

  private updateTurnText() {
    const turnId = this.room.state.chessTurnPlayerId
    const myId = this.room.sessionId
    if (turnId === myId) {
      this.turnText.setText("YOUR TURN").setStyle({ color: "#ffff44" })
    } else {
      const player = this.room.state.players.get(turnId)
      const name = player?.name ?? "..."
      this.turnText.setText(`${name}'s turn`).setStyle({ color: "#aaaaaa" })
    }
  }

  update() {
    const remaining = Math.max(0, this.room.state.chessTurnDeadline - Date.now())
    this.timerText.setText(`${Math.ceil(remaining / 1000)}s`)
  }

  shutdown() {
    if (this.stateUnsubscribe) {
      this.stateUnsubscribe()
      this.stateUnsubscribe = null
    }
  }
}
```

- [ ] **Step 3: Check TypeScript compilation**

```bash
cd C:\Users\Administrator\.gstack\projects\TwinkyOlympiade
npx tsc --noEmit
```

Expected: 0 errors. If type errors appear, fix them before continuing.

- [ ] **Step 4: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add client/src/scenes/ChessScene.ts client/src/network/ColyseusClient.ts
git commit -m "feat: ChessScene client implementation with board render, click handler, turn timer"
```

---

## Self-Review

### Spec Coverage

| Design doc requirement | Task covering it |
|------------------------|-----------------|
| 8×8 board, 4 players in corners | Task 1 (constants) + Task 2 (buildInitialBoard) |
| 6 pieces per corner (R+K+N+3P) | Task 2 (CHESS_STARTING_POSITIONS) |
| Secret missions (tier 1/2/3) | **NOT COVERED** — separate plan `chess-missions` |
| 2 kings / extra life from mission | **NOT COVERED** — separate plan `chess-missions` |
| Ghost pieces for eliminated players | Task 2 (isGhost pass-through) + Task 3 (eliminatePlayer) |
| Clockwise turn order, skip eliminated | Task 3 (advanceToNextPlayer + getActiveChessPlayers) |
| 30s per turn with server timer | Task 3 (scheduleTurnTimeout + CHESS_TURN_MS) |
| Win condition: last king standing | Task 3 (checkChessWin) |
| Chess cheats (peek mission, undo move) | **NOT COVERED** — separate plan `chess-cheats` |
| WheelScene → ChessScene transition | Task 3 (handleWheelDone calls startChessRound) |
| ResultScene transition | Task 4 (phase === "result" in onStateChange) |
| Valid move highlighting | Task 4 (drawHighlights + getValidMoves) |
| Turn countdown display | Task 4 (update() + timerText) |

Secret missions and chess cheats are intentionally deferred to separate plans per scope agreement.

### Type Consistency Check

- `ChessPieceData` defined in `shared/chessLogic.ts` — used in Task 2, Task 3, Task 4 ✓
- `ChessPiece` (Colyseus schema) defined in `shared/schema.ts` — used in Task 3 (syncChessBoard) and Task 4 (renderPieces) ✓
- `CHESS_TURN_MS` defined in constants Task 1 — used in GameRoom Task 3 ✓
- `CHESS_PAWN_DIRS` keyed by `ChessCorner` string — GameRoom indexes by corner string ✓ Client uses numeric index ✓
- `sendChessMove` defined Task 4 step 1, used in ChessScene step 2 ✓
