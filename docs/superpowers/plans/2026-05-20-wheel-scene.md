# Wheel Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WheelScene stub with an animated spinning wheel that uses server-authoritative velocity, responds to arrow key input (+-5% deceleration influence), snaps to the server-chosen mini-game segment, and signals the server when done.

**Architecture:** Server sets `wheelVelocity` (600-1200 deg/s) in `startNewRound` and handles a new `wheel_done` message that transitions phase to "minigame". Client WheelScene runs local physics in `update()` -- the designated spinner presses SPACE to start, arrow keys adjust deceleration, the wheel snaps to `currentMinigame` on stop, then sends `wheel_done`. Non-spinners see a static wheel and wait for the phase change.

**Tech Stack:** Phaser 3 (Graphics, Container, Tween, CursorKeys), Colyseus schema (wheelVelocity, wheelSpinnerId, currentMinigame), TypeScript

---

## File Map

```
shared/
  constants.ts              <- add WHEEL_BASE_DECEL
server/src/
  rooms/GameRoom.ts         <- add wheelVelocity to startNewRound; add handleWheelDone + register in onCreate
server/tests/
  GameRoom.test.ts          <- add 3 wheel tests
client/src/
  network/
    ColyseusClient.ts       <- add sendWheelDone()
  scenes/
    WheelScene.ts           <- full implementation replacing stub
```

---

## Task 1: Server -- wheelVelocity + wheel_done handler

**Files:**
- Modify: `shared/constants.ts`
- Modify: `server/src/rooms/GameRoom.ts`
- Modify: `server/tests/GameRoom.test.ts`

- [ ] **Step 1.1: Write 3 failing tests**

Open `server/tests/GameRoom.test.ts`. Change the existing import on line 3 to:

```typescript
import { CHEAT_WINDOW_MS, MAX_ROUNDS, WHEEL_MIN_VELOCITY, WHEEL_MAX_VELOCITY } from "../../shared/constants"
```

Append this block at the bottom of the file (after line 146):

```typescript
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
    const spinnerClient = room.state.wheelSpinnerId === c1.sessionId ? c1 : c2
    room["handleWheelDone"](spinnerClient, {})
    expect(room.state.phase).toBe("minigame")
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
```

- [ ] **Step 1.2: Run tests -- expect 3 failures**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz\server && npm test
```

Expected: 3 new tests FAIL. First fails with `Expected: >= 600, Received: 0`. Others fail with `TypeError: room["handleWheelDone"] is not a function`. Existing 12 tests still PASS.

- [ ] **Step 1.3: Add WHEEL_BASE_DECEL to shared/constants.ts**

Full content of `shared/constants.ts` after change:

```typescript
export const MAX_ROUNDS = 10
export const CHEAT_WINDOW_MS = 1500
export const WHEEL_MIN_VELOCITY = 600
export const WHEEL_MAX_VELOCITY = 1200
export const WHEEL_ARROW_INFLUENCE = 0.05
export const WHEEL_BASE_DECEL = 200
export const CHESS_TURN_DURATION_MS = 30_000
export const SCORE_PLACEMENT = [3, 2, 1, 0] as const
export const SCORE_CHEAT_CAUGHT = -1
export const SCORE_CHEAT_SUCCESS = 1

export const MINIGAMES = ["chess"] as const
export type Minigame = (typeof MINIGAMES)[number]

export type GamePhase = "lobby" | "wheel" | "minigame" | "result" | "gameover"
```

- [ ] **Step 1.4: Update GameRoom.ts**

Open `server/src/rooms/GameRoom.ts`. Apply three changes:

**Change 1 -- Replace the constants import (lines 3-9):**

```typescript
import {
  CHEAT_WINDOW_MS,
  MAX_ROUNDS,
  SCORE_CHEAT_CAUGHT,
  SCORE_CHEAT_SUCCESS,
  MINIGAMES,
  WHEEL_MIN_VELOCITY,
  WHEEL_MAX_VELOCITY,
} from "../../../shared/constants"
```

**Change 2 -- Add `wheel_done` registration in `onCreate` (after the `catch_cheat` line):**

```typescript
onCreate(_options: unknown) {
  this.setState(new GameState())
  this.onMessage("player_ready", (client, msg) => this.handlePlayerReady(client, msg))
  this.onMessage("cheat_attempt", (client, msg: CheatAttemptMsg) =>
    this.handleCheatAttempt(client, msg)
  )
  this.onMessage("catch_cheat", (client, msg: CatchCheatMsg) =>
    this.handleCatchCheat(client, msg)
  )
  this.onMessage("wheel_done", (client, msg) => this.handleWheelDone(client, msg))
}
```

**Change 3 -- Replace `startNewRound` and add `handleWheelDone` after it:**

```typescript
private startNewRound() {
  this.state.currentRound++
  if (this.state.currentRound > MAX_ROUNDS) {
    this.state.phase = "gameover"
    return
  }
  this.state.phase = "wheel"
  this.state.wheelVelocity =
    WHEEL_MIN_VELOCITY + Math.random() * (WHEEL_MAX_VELOCITY - WHEEL_MIN_VELOCITY)
  const ids = [...this.state.players.keys()]
  const otherIds = ids.filter((id) => id !== this.state.wheelSpinnerId)
  const pool = otherIds.length > 0 ? otherIds : ids
  this.state.wheelSpinnerId = pool[Math.floor(Math.random() * pool.length)]
  this.state.currentMinigame = MINIGAMES[Math.floor(Math.random() * MINIGAMES.length)]
  this.broadcast("round_started", {
    round: this.state.currentRound,
    spinnerId: this.state.wheelSpinnerId,
  })
}

private handleWheelDone(client: Client, _msg: unknown) {
  if (client.sessionId !== this.state.wheelSpinnerId) return
  if (this.state.phase !== "wheel") return
  this.state.phase = "minigame"
}
```

- [ ] **Step 1.5: Run tests -- expect all 15 pass**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz\server && npm test
```

Expected: `15 passed`

- [ ] **Step 1.6: Commit**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz && git add shared/constants.ts server/src/rooms/GameRoom.ts server/tests/GameRoom.test.ts
git commit -m "feat: server sets wheelVelocity each round, handle wheel_done phase transition"
```

---

## Task 2: Client -- WheelScene full implementation

**Files:**
- Modify: `client/src/network/ColyseusClient.ts`
- Modify: `client/src/scenes/WheelScene.ts`

### Physics reference

`velocity` starts at `room.state.wheelVelocity` (deg/s). Each frame: `velocity -= WHEEL_BASE_DECEL * decelMult * (delta / 1000)`. `angle` accumulates: `angle += velocity * (delta / 1000)`, applied via `wheelContainer.setAngle(angle)`.

`decelMult` starts at 1.0. Left arrow: decreases toward `0.95` at rate `WHEEL_ARROW_INFLUENCE` per second held. Right arrow: increases toward `1.05` at same rate. At 600 deg/s + decelMult 1.0 + WHEEL_BASE_DECEL 200: stops in 3 s. At 1200 deg/s: stops in 6 s.

### Snap calculation (on velocity reaching 0)

```
segSize     = 360 / segments.length
targetAngle = -((desiredIdx + 0.5) * segSize)
n           = Math.round((currentAngle - targetAngle) / 360)
snapAngle   = targetAngle + n * 360
```

Where `desiredIdx = MINIGAMES.indexOf(room.state.currentMinigame)`. The snap tween (300 ms, Cubic easeOut) rotates the container to `snapAngle`.

### Segment drawing

Container sits at `(width/2, height/2)`. Segment `i` of `N`:

```
segAngle  = (Math.PI * 2) / N
start     = i * segAngle - Math.PI / 2
end       = (i + 1) * segAngle - Math.PI / 2
labelMid  = (i + 0.5) * segAngle - Math.PI / 2
tx        = cos(labelMid) * RADIUS * 0.6
ty        = sin(labelMid) * RADIUS * 0.6
```

- [ ] **Step 2.1: Add sendWheelDone to ColyseusClient.ts**

Full content of `client/src/network/ColyseusClient.ts` after change:

```typescript
import { Client, Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"

const WS_URL = (import.meta.env as Record<string, string>)["VITE_SERVER_URL"] ?? "ws://localhost:2567"

let _client: Client | null = null
let _room: Room<GameState> | null = null

function getClient(): Client {
  if (!_client) _client = new Client(WS_URL)
  return _client
}

export async function joinGame(
  name: string,
  characterId: string
): Promise<Room<GameState>> {
  _room = await getClient().joinOrCreate<GameState>("game_room", { name, characterId })
  return _room
}

export function getRoom(): Room<GameState> | null {
  return _room
}

export function sendCheatAttempt(cheatType: string): void {
  _room?.send("cheat_attempt", { cheatType })
}

export function sendCatchCheat(targetId: string): void {
  _room?.send("catch_cheat", { targetId })
}

export function sendPlayerReady(): void {
  _room?.send("player_ready", {})
}

export function sendWheelDone(): void {
  _room?.send("wheel_done", {})
}
```

- [ ] **Step 2.2: Write full WheelScene.ts**

Full content of `client/src/scenes/WheelScene.ts`:

```typescript
import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { MINIGAMES, WHEEL_ARROW_INFLUENCE, WHEEL_BASE_DECEL } from "@twinky/shared/constants"
import { sendWheelDone } from "../network/ColyseusClient"

const RADIUS = 200

export class WheelScene extends Phaser.Scene {
  private room!: Room<GameState>
  private wheelContainer!: Phaser.GameObjects.Container
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private angle = 0
  private velocity = 0
  private decelMult = 1.0
  private isSpinning = false
  private isDone = false

  constructor() {
    super({ key: "WheelScene" })
  }

  init(data: { room: Room<GameState> }) {
    this.room = data.room
    this.angle = 0
    this.velocity = 0
    this.decelMult = 1.0
    this.isSpinning = false
    this.isDone = false
  }

  create() {
    const { width, height } = this.scale
    const segments = [...MINIGAMES]

    this.wheelContainer = this.add.container(width / 2, height / 2)
    this.buildWheel(segments)

    const arrow = this.add.graphics()
    arrow.fillStyle(0xff4444)
    arrow.fillTriangle(
      width / 2, height / 2 - RADIUS - 10,
      width / 2 - 12, height / 2 - RADIUS - 34,
      width / 2 + 12, height / 2 - RADIUS - 34,
    )

    this.add
      .text(width / 2, 36, "SPIN THE WHEEL", { fontSize: "24px", color: "#aa77ff", fontStyle: "bold" })
      .setOrigin(0.5)

    const spinnerName = this.room.state.players.get(this.room.state.wheelSpinnerId)?.name ?? "?"
    const isSpinner = this.room.state.wheelSpinnerId === this.room.sessionId

    const statusText = this.add
      .text(
        width / 2,
        height / 2 + RADIUS + 50,
        isSpinner ? "Press SPACE to spin!" : `Waiting for ${spinnerName} to spin...`,
        { fontSize: "18px", color: "#e8d5ff" },
      )
      .setOrigin(0.5)

    const resultText = this.add
      .text(width / 2, height / 2 + RADIUS + 90, "", {
        fontSize: "22px",
        color: "#ffcc44",
        fontStyle: "bold",
      })
      .setOrigin(0.5)

    this.cursors = this.input.keyboard!.createCursorKeys()

    if (isSpinner) {
      this.input.keyboard!.once("keydown-SPACE", () => {
        this.velocity = this.room.state.wheelVelocity
        this.isSpinning = true
        statusText.setText("Left/right arrows to influence")
      })
    }

    const unsubscribe = this.room.onStateChange((state) => {
      if (state.phase === "minigame") {
        unsubscribe()
        resultText.setText(`Next: ${state.currentMinigame.toUpperCase()}!`)
        this.time.delayedCall(500, () => {
          this.scene.start("ChessScene", { room: this.room })
        })
      }
    })
  }

  update(_time: number, delta: number) {
    if (!this.isSpinning || this.isDone) return

    if (this.cursors.left.isDown) {
      this.decelMult = Math.max(
        1 - WHEEL_ARROW_INFLUENCE,
        this.decelMult - WHEEL_ARROW_INFLUENCE * (delta / 1000),
      )
    }
    if (this.cursors.right.isDown) {
      this.decelMult = Math.min(
        1 + WHEEL_ARROW_INFLUENCE,
        this.decelMult + WHEEL_ARROW_INFLUENCE * (delta / 1000),
      )
    }

    this.velocity = Math.max(0, this.velocity - WHEEL_BASE_DECEL * this.decelMult * (delta / 1000))
    this.angle += this.velocity * (delta / 1000)
    this.wheelContainer.setAngle(this.angle)

    if (this.velocity <= 0) {
      this.isDone = true
      this.onWheelStopped()
    }
  }

  private buildWheel(segments: readonly string[]) {
    const g = this.add.graphics()
    const n = segments.length
    const segAngle = (Math.PI * 2) / n
    const palette = [0x2d1b4e, 0x1e3a5f, 0x4e1b2d]

    for (let i = 0; i < n; i++) {
      const start = i * segAngle - Math.PI / 2
      const end = (i + 1) * segAngle - Math.PI / 2
      g.fillStyle(palette[i % palette.length])
      g.slice(0, 0, RADIUS, start, end, false)
      g.fillPath()

      g.lineStyle(2, 0x7744cc)
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(Math.cos(start) * RADIUS, Math.sin(start) * RADIUS)
      g.strokePath()
    }

    g.lineStyle(3, 0xaa66ff)
    g.strokeCircle(0, 0, RADIUS)
    g.fillStyle(0x0d0d1a)
    g.fillCircle(0, 0, 18)

    this.wheelContainer.add(g)

    for (let i = 0; i < n; i++) {
      const mid = (i + 0.5) * segAngle - Math.PI / 2
      const label = this.add
        .text(
          Math.cos(mid) * (RADIUS * 0.6),
          Math.sin(mid) * (RADIUS * 0.6),
          segments[i].toUpperCase(),
          { fontSize: "18px", color: "#e8d5ff", fontStyle: "bold" },
        )
        .setOrigin(0.5)
      this.wheelContainer.add(label)
    }
  }

  private onWheelStopped() {
    const segments = [...MINIGAMES]
    const desiredIdx = segments.indexOf(
      this.room.state.currentMinigame as (typeof MINIGAMES)[number],
    )
    const segSize = 360 / segments.length
    const targetAngle = -((desiredIdx + 0.5) * segSize)
    const n = Math.round((this.angle - targetAngle) / 360)
    const snapAngle = targetAngle + n * 360

    this.tweens.add({
      targets: this.wheelContainer,
      angle: snapAngle,
      duration: 300,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this.time.delayedCall(2000, () => sendWheelDone())
      },
    })
  }
}
```

- [ ] **Step 2.3: Smoke test**

Terminal 1: `cd C:\Users\Administrator\Desktop\TwinkyKillerz\server && npm run dev`
Terminal 2: `cd C:\Users\Administrator\Desktop\TwinkyKillerz\client && npm run dev`

Open `http://localhost:5173` in two browser tabs.

1. Both click to connect, both press SPACE to ready up
2. Both enter WheelScene -- one sees "Press SPACE to spin!", other sees "Waiting for..."
3. Spinner presses SPACE -- wheel animates
4. Left/right arrows noticeably slow or speed the deceleration
5. Wheel stops (3-6 s), snaps to "CHESS", shows "Next: CHESS!" text
6. Both tabs transition to ChessScene after ~500 ms
7. SPACE -> ResultScene -> SPACE -> WheelScene round 2 (different spinner selected)
8. After round 10 -> "GAME OVER"

- [ ] **Step 2.4: Commit**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz && git add client/src/network/ColyseusClient.ts client/src/scenes/WheelScene.ts
git commit -m "feat: implement WheelScene with physics, arrow key influence, and segment snap"
```

---

## What This Produces

Fully playable wheel scene: designated spinner presses SPACE, watches a dark segmented wheel spin, uses arrow keys to influence deceleration (+-5%), wheel snaps to server-chosen mini-game. All players transition to ChessScene together. Server enforces only the spinner can advance the phase.

**Next plans:**
- `2026-05-20-chess-minigame.md` -- 8x8 board, 4 players in corners, pieces, secret missions, ghost pieces, 30s turn timer
- `2026-05-20-cheat-system.md` -- cheat UI for chess (peek mission, undo move), visual indicator when cheating
