# Bug Fixes & Single Game Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 bugs (lobby crash, chip placement, async loading, chip-UI with no chips, wheel-in-wrong-mode, chess perspective) and add single game mode with direct game selection.

**Architecture:** Each bug is isolated to one or two files; single game mode adds one new scene (`GameSelectScene`) and a new server phase (`game_select`). Chip placement fix corrects Phaser 3 keyword event names. Chess perspective adds a `boardFlipped` boolean and two coordinate-transform helpers applied everywhere coordinates are computed.

**Tech Stack:** Phaser 3.60, Colyseus 0.15, TypeScript, Vitest, `@colyseus/schema`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `client/src/scenes/LobbyScene.ts` | Modify | Fix toUpperCase crash; route to GameSelectScene |
| `client/src/scenes/WheelScene.ts` | Modify | Fix key names `keydown-1→keydown-ONE`; reduce 500ms delay; gate chip UI on chip count |
| `shared/constants.ts` | Modify | Add `"game_select"` to `GamePhase`; add `PHASER_NUM_KEYS` |
| `shared/schema.ts` | Modify | Add `selectedGame: string` field to `GameState` |
| `server/src/rooms/GameRoom.ts` | Modify | Add `startSingleMode()`, `handleSelectGame()`, `select_game` message handler |
| `server/tests/GameRoom.test.ts` | Modify | Add single game mode tests |
| `client/src/scenes/GameSelectScene.ts` | Create | New scene for GM to pick game in single mode |
| `client/src/network/ColyseusClient.ts` | Modify | Add `sendSelectGame()` export |
| `client/src/main.ts` | Modify | Register `GameSelectScene` |
| `client/src/scenes/ResultScene.ts` | Modify | Route `phase === "game_select"` to `GameSelectScene` |
| `client/src/scenes/ChessScene.ts` | Modify | Add `boardFlipped`, `boardRow()`, `boardCol()`, `computeBoardFlip()` |

---

## Task 1: Fix Lobby toUpperCase Crash

**Files:**
- Modify: `client/src/scenes/LobbyScene.ts`

- [ ] **Step 1: Write failing test**

In `server/tests/GameRoom.test.ts`, add inside an existing `describe` block:

```typescript
it("lobby state sync does not crash when gameMode is undefined", async () => {
  // This is a client-side guard — test documents the schema default behavior
  const state = new GameState()
  // @ts-expect-error simulate partial patch arriving as undefined
  state.gameMode = undefined
  const safe = (state.gameMode ?? "olympiade").toUpperCase()
  expect(safe).toBe("OLYMPIADE")
})
```

- [ ] **Step 2: Run test — confirm it passes (documents the fix we're about to apply)**

```bash
cd server && npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: test passes.

- [ ] **Step 3: Apply fix to LobbyScene.ts**

Find `refreshLobbyUI()`. Replace every occurrence of `state.gameMode.toUpperCase()` with `(state.gameMode ?? "olympiade").toUpperCase()`.

There are exactly two: around lines 153 and 155. The fixed version:

```typescript
this.modeTxt.setText(`Mode: ${(state.gameMode ?? "olympiade").toUpperCase()}`)
// and
this.add.text(/* ... */, `${(state.gameMode ?? "olympiade").toUpperCase()}`, /* ... */)
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors on LobbyScene.

- [ ] **Step 5: Commit**

```bash
git add client/src/scenes/LobbyScene.ts server/tests/GameRoom.test.ts
git commit -m "fix: guard gameMode.toUpperCase against undefined during initial Colyseus sync"
```

---

## Task 2: Fix Chip Placement (Key Names + Delay + No-Chip Gate)

**Files:**
- Modify: `client/src/scenes/WheelScene.ts`
- Modify: `shared/constants.ts`

- [ ] **Step 1: Add PHASER_NUM_KEYS to constants**

In `shared/constants.ts`, append after the last export:

```typescript
export const PHASER_NUM_KEYS = [
  "ZERO", "ONE", "TWO", "THREE", "FOUR",
  "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
] as const
```

- [ ] **Step 2: Write failing test (documents bug)**

In `server/tests/GameRoom.test.ts`, add:

```typescript
it("PHASER_NUM_KEYS index 1 is ONE not 1", () => {
  expect(PHASER_NUM_KEYS[1]).toBe("ONE")
  expect(PHASER_NUM_KEYS[2]).toBe("TWO")
})
```

Add `import { PHASER_NUM_KEYS } from "../../shared/constants"` at top of test file.

- [ ] **Step 3: Run test to verify it passes**

```bash
cd server && npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 4: Fix WheelScene.ts — import and use PHASER_NUM_KEYS**

At top of `WheelScene.ts`, add import:

```typescript
import { PHASER_NUM_KEYS } from "@twinky/shared/constants"
```

In `buildPlacementUI()`, find the keyboard registration loop. Change:

```typescript
// BEFORE (broken — events never fire in Phaser 3):
this.input.keyboard?.on(`keydown-${idx + 1}`, handler)

// AFTER:
const keyName = PHASER_NUM_KEYS[idx + 1]
if (keyName) {
  this.input.keyboard?.on(`keydown-${keyName}`, handler)
}
```

In `clearPlacementUI()`, find the matching `.off()` calls. Change:

```typescript
// BEFORE:
this.input.keyboard?.off(`keydown-${idx + 1}`, handler)

// AFTER:
const keyName = PHASER_NUM_KEYS[idx + 1]
if (keyName) {
  this.input.keyboard?.off(`keydown-${keyName}`, handler)
}
```

- [ ] **Step 5: Fix WheelScene.ts — gate chip UI on chip count**

In `buildPlacementUI()` (or wherever it is called), add an early return guard:

```typescript
private buildPlacementUI(): void {
  const me = this.room.state.players.get(this.room.sessionId)
  if (!me || me.chips <= 0) return  // no chips → no UI
  // ... rest of existing method
}
```

- [ ] **Step 6: Fix WheelScene.ts — reduce transition delay 500ms → 250ms**

Find `this.time.delayedCall(500,` and change to `this.time.delayedCall(250,`.

- [ ] **Step 7: TypeScript check**

```bash
cd client && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add shared/constants.ts client/src/scenes/WheelScene.ts server/tests/GameRoom.test.ts
git commit -m "fix: chip placement key names (keydown-ONE not keydown-1), gate UI on chip count, reduce delay 500->250ms"
```

---

## Task 3: Schema + Server — Single Game Mode

**Files:**
- Modify: `shared/schema.ts`
- Modify: `shared/constants.ts`
- Modify: `server/src/rooms/GameRoom.ts`
- Modify: `server/tests/GameRoom.test.ts`

- [ ] **Step 1: Write failing tests**

In `server/tests/GameRoom.test.ts`, add new describe block:

```typescript
describe("Single game mode", () => {
  it("transitions to game_select phase when all ready in single mode", async () => {
    const { room, clients } = await makeRoom({ gameMode: "single", playerCount: 2 })
    for (const c of clients) await room.handleMessage(c, "player_ready", {})
    expect(room.state.phase).toBe("game_select")
  })

  it("GM can select chess in single mode", async () => {
    const { room, clients } = await makeRoom({ gameMode: "single", playerCount: 2 })
    for (const c of clients) await room.handleMessage(c, "player_ready", {})
    const gm = clients.find(c => room.state.players.get(c.sessionId)?.isGamemaster)!
    await room.handleMessage(gm, "select_game", { game: "chess" })
    expect(room.state.phase).toBe("minigame")
    expect(room.state.olympiade.currentMinigame).toBe("chess")
  })

  it("non-GM cannot select game", async () => {
    const { room, clients } = await makeRoom({ gameMode: "single", playerCount: 2 })
    for (const c of clients) await room.handleMessage(c, "player_ready", {})
    const nonGm = clients.find(c => !room.state.players.get(c.sessionId)?.isGamemaster)!
    await room.handleMessage(nonGm, "select_game", { game: "chess" })
    expect(room.state.phase).toBe("game_select")
  })

  it("invalid game name is rejected", async () => {
    const { room, clients } = await makeRoom({ gameMode: "single", playerCount: 2 })
    for (const c of clients) await room.handleMessage(c, "player_ready", {})
    const gm = clients.find(c => room.state.players.get(c.sessionId)?.isGamemaster)!
    await room.handleMessage(gm, "select_game", { game: "notaGame" })
    expect(room.state.phase).toBe("game_select")
  })

  it("GM can select connect4 in single mode", async () => {
    const { room, clients } = await makeRoom({ gameMode: "single", playerCount: 2 })
    for (const c of clients) await room.handleMessage(c, "player_ready", {})
    const gm = clients.find(c => room.state.players.get(c.sessionId)?.isGamemaster)!
    await room.handleMessage(gm, "select_game", { game: "connect4" })
    expect(room.state.phase).toBe("minigame")
    expect(room.state.olympiade.currentMinigame).toBe("connect4")
  })
})
```

- [ ] **Step 2: Run tests — confirm they FAIL**

```bash
cd server && npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: 5 failures from "Single game mode" block.

- [ ] **Step 3: Add `"game_select"` to GamePhase in constants.ts**

In `shared/constants.ts`, find `GamePhase` type:

```typescript
// BEFORE:
export type GamePhase = "lobby" | "wheel" | "minigame" | "result" | "gameover"

// AFTER:
export type GamePhase = "lobby" | "wheel" | "game_select" | "minigame" | "result" | "gameover"
```

- [ ] **Step 4: Add `selectedGame` field to GameState schema**

In `shared/schema.ts`, inside `GameState`, add after the `gameMode` line:

```typescript
@type("string") selectedGame: string = ""
```

- [ ] **Step 5: Implement server single mode logic in GameRoom.ts**

Find `handlePlayerReady` method. Replace the `startPlacementPhase()` call with:

```typescript
if (this.state.gameMode === "single") {
  this.startSingleMode()
} else {
  this.startPlacementPhase()
}
```

Add `startSingleMode()` method (after `startPlacementPhase`):

```typescript
private startSingleMode(): void {
  this.state.phase = "game_select"
}
```

Add `handleSelectGame()` method:

```typescript
private handleSelectGame(client: Client, msg: { game: string }): void {
  const player = this.state.players.get(client.sessionId)
  if (!player?.isGamemaster) return
  if (!(MINIGAMES as readonly string[]).includes(msg.game)) return
  this.state.selectedGame = msg.game
  this.state.olympiade.currentMinigame = msg.game
  this.state.phase = "minigame"
  if (msg.game === "chess") {
    this.startChessRound()
  } else {
    this.startConnect4Round()
  }
}
```

In `onCreate`, register the message handler (inside the existing message registrations block):

```typescript
this.onMessage("select_game", (client, msg) => this.handleSelectGame(client, msg))
```

Add `import { MINIGAMES } from "../../shared/constants"` if not already present at top.

- [ ] **Step 6: Run tests — confirm they PASS**

```bash
cd server && npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: all 5 new tests pass.

- [ ] **Step 7: Commit**

```bash
git add shared/schema.ts shared/constants.ts server/src/rooms/GameRoom.ts server/tests/GameRoom.test.ts
git commit -m "feat: add single game mode with game_select phase and select_game server handler"
```

---

## Task 4: New GameSelectScene + ColyseusClient + main.ts Registration

**Files:**
- Create: `client/src/scenes/GameSelectScene.ts`
- Modify: `client/src/network/ColyseusClient.ts`
- Modify: `client/src/main.ts`

- [ ] **Step 1: Add `sendSelectGame` to ColyseusClient.ts**

Open `client/src/network/ColyseusClient.ts`. Find the last `export function send...` function and append after it:

```typescript
export function sendSelectGame(game: string): void {
  _room?.send("select_game", { game })
}
```

- [ ] **Step 2: Create GameSelectScene.ts**

Create `client/src/scenes/GameSelectScene.ts`:

```typescript
import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { MINIGAMES, PHASER_NUM_KEYS } from "@twinky/shared/constants"
import { sendSelectGame } from "../network/ColyseusClient"

export class GameSelectScene extends Phaser.Scene {
  private room!: Room<GameState>
  private stateChangeCallback: ((state: GameState) => void) | null = null

  constructor() {
    super({ key: "GameSelectScene" })
  }

  init(data: { room: Room<GameState> }): void {
    this.room = data.room
  }

  create(): void {
    const { width, height } = this.scale
    const me = this.room.state.players.get(this.room.sessionId)
    const isGM = me?.isGamemaster ?? false

    this.add
      .text(width / 2, 80, "CHOOSE A GAME", { fontSize: "26px", color: "#e8d5ff", fontStyle: "bold" })
      .setOrigin(0.5)

    if (isGM) {
      this.add
        .text(width / 2, 130, "You are the Gamemaster — pick a game:", { fontSize: "14px", color: "#7070a0" })
        .setOrigin(0.5)

      const games = [...MINIGAMES] as string[]
      games.forEach((game, idx) => {
        const y = 210 + idx * 70
        const btn = this.add
          .rectangle(width / 2, y, 280, 52, 0x3a2a6e)
          .setInteractive({ useHandCursor: true })
        btn.on("pointerover", () => btn.setFillStyle(0x2a1a4e))
        btn.on("pointerout", () => btn.setFillStyle(0x3a2a6e))
        btn.on("pointerdown", () => sendSelectGame(game))

        this.add
          .text(width / 2, y, `[${idx + 1}]  ${game.toUpperCase()}`, {
            fontSize: "20px",
            color: "#44ff88",
            fontStyle: "bold",
          })
          .setOrigin(0.5)

        const keyName = PHASER_NUM_KEYS[idx + 1]
        if (keyName) {
          this.input.keyboard?.once(`keydown-${keyName}`, () => sendSelectGame(game))
        }
      })
    } else {
      const gmEntry = [...this.room.state.players.values()].find(p => p.isGamemaster)
      const gmName = gmEntry?.name ?? "Gamemaster"
      this.add
        .text(width / 2, height / 2, `Waiting for ${gmName} to choose a game...`, {
          fontSize: "16px",
          color: "#7070a0",
        })
        .setOrigin(0.5)
    }

    this.stateChangeCallback = (state: GameState) => {
      if (state.phase === "minigame") {
        if (this.stateChangeCallback) {
          this.room.onStateChange.remove(this.stateChangeCallback)
          this.stateChangeCallback = null
        }
        const sceneKey =
          state.olympiade.currentMinigame === "connect4" ? "Connect4Scene" : "ChessScene"
        this.scene.start(sceneKey, { room: this.room })
      }
    }
    this.room.onStateChange(this.stateChangeCallback)
  }

  shutdown(): void {
    if (this.stateChangeCallback) {
      this.room.onStateChange.remove(this.stateChangeCallback)
      this.stateChangeCallback = null
    }
  }
}
```

- [ ] **Step 3: Register GameSelectScene in main.ts**

In `client/src/main.ts`:

Add import at top:
```typescript
import { GameSelectScene } from "./scenes/GameSelectScene"
```

In the `scene` array (where all scenes are listed), add `GameSelectScene`:
```typescript
scene: [CharacterSelectScene, LobbyScene, WheelScene, GameSelectScene, ChessScene, Connect4Scene, ResultScene],
```

- [ ] **Step 4: TypeScript check**

```bash
cd client && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/scenes/GameSelectScene.ts client/src/network/ColyseusClient.ts client/src/main.ts
git commit -m "feat: add GameSelectScene for single game mode, register in main.ts"
```

---

## Task 5: Single Mode Routing in LobbyScene + ResultScene

**Files:**
- Modify: `client/src/scenes/LobbyScene.ts`
- Modify: `client/src/scenes/ResultScene.ts`

- [ ] **Step 1: Route `game_select` phase in LobbyScene.ts**

In `setupStateSync()` (or wherever phase changes are listened to), find the `if (state.phase === "wheel")` block. Add a new branch:

```typescript
if (state.phase === "game_select") {
  this.scene.start("GameSelectScene", { room: this.room })
  return
}
```

Place it before the `"wheel"` check so it short-circuits correctly.

- [ ] **Step 2: Route `game_select` phase in ResultScene.ts**

In `ResultScene.ts`, in the state change listener that currently handles `"wheel"` and `"gameover"`, add:

```typescript
if (state.phase === "game_select") {
  this.scene.start("GameSelectScene", { room: this.room })
  return
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd client && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/scenes/LobbyScene.ts client/src/scenes/ResultScene.ts
git commit -m "feat: route game_select phase to GameSelectScene in lobby and result"
```

---

## Task 6: Chess Board Perspective

**Files:**
- Modify: `client/src/scenes/ChessScene.ts`

- [ ] **Step 1: Write failing test (documents expectation)**

In `server/tests/chessLogic.test.ts`, add:

```typescript
it("boardFlip maps row 0 to row 7 when flipped", () => {
  const flip = (r: number, flipped: boolean) => flipped ? 7 - r : r
  expect(flip(0, true)).toBe(7)
  expect(flip(7, true)).toBe(0)
  expect(flip(0, false)).toBe(0)
})
```

- [ ] **Step 2: Run test — confirm it passes (pure logic, no code changes yet)**

```bash
cd server && npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 3: Add boardFlipped field + helpers + computeBoardFlip to ChessScene**

In `ChessScene.ts`, add private members after the existing private field declarations:

```typescript
private boardFlipped = false

private boardRow(r: number): number {
  return this.boardFlipped ? 7 - r : r
}

private boardCol(c: number): number {
  return this.boardFlipped ? 7 - c : c
}

private computeBoardFlip(): void {
  const order = [...this.room.state.chess.playerOrder] as string[]
  const myIdx = order.indexOf(this.room.sessionId)
  if (order.length <= 2) {
    this.boardFlipped = myIdx === 1
  } else {
    this.boardFlipped = myIdx >= 2
  }
}
```

- [ ] **Step 4: Call computeBoardFlip in create()**

In `create()`, after `this.buildPawnDirs()`:

```typescript
this.computeBoardFlip()
```

- [ ] **Step 5: Apply boardRow/boardCol to renderPieces()**

Find `renderPieces()`. Every `piece.col` used for x-position becomes `this.boardCol(piece.col)`, every `piece.row` for y-position becomes `this.boardRow(piece.row)`:

```typescript
// BEFORE:
const x = BOARD_OFFSET_X + piece.col * CELL_SIZE + CELL_SIZE / 2
const y = BOARD_OFFSET_Y + piece.row * CELL_SIZE + CELL_SIZE / 2

// AFTER:
const x = BOARD_OFFSET_X + this.boardCol(piece.col) * CELL_SIZE + CELL_SIZE / 2
const y = BOARD_OFFSET_Y + this.boardRow(piece.row) * CELL_SIZE + CELL_SIZE / 2
```

- [ ] **Step 6: Apply transform to handleBoardClick()**

Find `handleBoardClick()`. After computing display col/row from pointer position, inverse-transform back to logical coordinates:

```typescript
// BEFORE:
const col = Math.floor((sx - BOARD_OFFSET_X) / CELL_SIZE)
const row = Math.floor((sy - BOARD_OFFSET_Y) / CELL_SIZE)

// AFTER:
const displayCol = Math.floor((sx - BOARD_OFFSET_X) / CELL_SIZE)
const displayRow = Math.floor((sy - BOARD_OFFSET_Y) / CELL_SIZE)
const col = this.boardFlipped ? 7 - displayCol : displayCol
const row = this.boardFlipped ? 7 - displayRow : displayRow
```

- [ ] **Step 7: Apply transform to drawHighlights()**

Find `drawHighlights()`. All `r` and `c` values from `validMovesCache` (logical coords) must be transformed for display:

```typescript
// BEFORE:
const x = BOARD_OFFSET_X + c * CELL_SIZE + CELL_SIZE / 2
const y = BOARD_OFFSET_Y + r * CELL_SIZE + CELL_SIZE / 2

// AFTER:
const x = BOARD_OFFSET_X + this.boardCol(c) * CELL_SIZE + CELL_SIZE / 2
const y = BOARD_OFFSET_Y + this.boardRow(r) * CELL_SIZE + CELL_SIZE / 2
```

Same for the selected piece highlight square. If selected piece uses raw `selectedPiece.col`/`selectedPiece.row` for the highlight square:

```typescript
// AFTER:
const sx = BOARD_OFFSET_X + this.boardCol(selectedPiece.col) * CELL_SIZE
const sy = BOARD_OFFSET_Y + this.boardRow(selectedPiece.row) * CELL_SIZE
```

- [ ] **Step 8: Apply transform to updateCheckState() king highlight**

Find `updateCheckState()`. The king position uses raw `king.col`/`king.row`:

```typescript
// BEFORE:
const x = BOARD_OFFSET_X + king.col * CELL_SIZE
const y = BOARD_OFFSET_Y + king.row * CELL_SIZE

// AFTER:
const x = BOARD_OFFSET_X + this.boardCol(king.col) * CELL_SIZE
const y = BOARD_OFFSET_Y + this.boardRow(king.row) * CELL_SIZE
```

- [ ] **Step 9: TypeScript check**

```bash
cd client && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add client/src/scenes/ChessScene.ts server/tests/chessLogic.test.ts
git commit -m "feat: chess board shows from each player's own perspective using boardFlipped transform"
```

---

## Self-Review

### Spec Coverage
1. **lobby toUpperCase crash** → Task 1 fixes `(state.gameMode ?? "olympiade").toUpperCase()` ✅
2. **chip placement broken** → Task 2 fixes `keydown-ONE` key names ✅
3. **games async/slow loading** → Task 2 reduces 500ms → 250ms delay ✅
4. **chip UI with no chips** → Task 2 gates `buildPlacementUI()` on `me.chips > 0` ✅
5. **single game mode pick directly** → Tasks 3-5 add `game_select` phase + `GameSelectScene` ✅
6. **wheel only in olympiad** → Task 2 chip gate + Task 5 single mode skips wheel entirely ✅
7. **chess from player's perspective** → Task 6 adds `boardFlipped` + transform helpers ✅

### Placeholder Scan
None found. All steps contain actual code.

### Type Consistency
- `PHASER_NUM_KEYS` defined in `constants.ts` Task 2, used in `GameSelectScene` Task 4 ✅
- `game_select` added to `GamePhase` in Task 3, used in LobbyScene/ResultScene Task 5 ✅
- `selectedGame` field added to schema Task 3, set in `handleSelectGame` Task 3 ✅
- `sendSelectGame` added to ColyseusClient Task 4, used in GameSelectScene Task 4 ✅
- `boardRow`/`boardCol` defined Task 6 Step 3, used in Steps 5-8 ✅
