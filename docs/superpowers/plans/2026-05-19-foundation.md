# TwinkyOlympiade — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a working Phaser 3 + Colyseus multiplayer lobby where 2–4 players can connect, see each other, and transition into the wheel phase.

**Architecture:** Monorepo with three packages — `client` (Phaser 3 + Vite), `server` (Colyseus + Node.js), `shared` (TypeScript schemas + constants imported by both). All game state lives on the server. Clients render server state only.

**Tech Stack:** Phaser 3, Colyseus 0.15.x, Vite 5, TypeScript 5, Vitest (testing)

---

## File Map

```
TwinkyOlympiade/                     ← rename from TwinkyKillerz first
├── shared/
│   ├── package.json                 ← no deps, just exports TS files
│   ├── tsconfig.json
│   ├── constants.ts                 ← all magic numbers
│   └── schema.ts                    ← Colyseus state schemas
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                 ← Colyseus server init + listen
│   │   └── rooms/
│   │       └── GameRoom.ts          ← all server game logic
│   └── tests/
│       └── GameRoom.test.ts
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.ts                  ← Phaser.Game init, scene registry
│       ├── network/
│       │   └── ColyseusClient.ts    ← singleton client + joinGame()
│       └── scenes/
│           ├── LobbyScene.ts        ← connect, show players, ready up
│           ├── WheelScene.ts        ← stub: shows "wheel" text, transitions
│           ├── ChessScene.ts        ← stub: shows "chess" text, transitions
│           └── ResultScene.ts       ← stub: shows scores, sends ready
└── docs/
    └── superpowers/
        └── plans/                   ← this file lives here
```

---

## Task 1: Create project scaffold

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`

- [ ] **Step 1.1: Create shared package**

From project root (`TwinkyOlympiade/` or `TwinkyKillerz/`):

```bash
mkdir -p shared server/src/rooms server/tests client/src/scenes client/src/network
```

Create `shared/package.json`:
```json
{
  "name": "@twinky/shared",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    "./schema": "./schema.ts",
    "./constants": "./constants.ts"
  }
}
```

Create `shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 1.2: Create server package**

Create `server/package.json`:
```json
{
  "name": "@twinky/server",
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@colyseus/core": "^0.15.0",
    "@colyseus/ws-transport": "^0.15.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "vitest": "^1.6.0"
  }
}
```

Create `server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@twinky/shared/*": ["../shared/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*", "../shared/**/*"]
}
```

- [ ] **Step 1.3: Create client package**

Create `client/package.json`:
```json
{
  "name": "@twinky/client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "phaser": "^3.80.0",
    "colyseus.js": "^0.15.0"
  },
  "devDependencies": {
    "vite": "^5.2.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

Create `client/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true,
    "paths": {
      "@twinky/shared/*": ["../shared/*"]
    }
  },
  "include": ["src/**/*", "../shared/**/*"]
}
```

Create `client/vite.config.ts`:
```typescript
import { defineConfig } from "vite"
import { resolve } from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@twinky/shared": resolve(__dirname, "../shared"),
    },
  },
  server: {
    port: 5173,
  },
})
```

Create `client/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Twinky Olympiade</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #0d0d1a; display: flex; justify-content: center; align-items: center; height: 100vh; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 1.4: Install dependencies**

```bash
cd server && npm install
cd ../client && npm install
```

Expected: no errors, `node_modules` created in each.

- [ ] **Step 1.5: Commit**

```bash
git init
git add .
git commit -m "chore: scaffold project structure (shared/server/client)"
```

---

## Task 2: Shared constants and schema

**Files:**
- Create: `shared/constants.ts`
- Create: `shared/schema.ts`
- Create: `server/tests/schema.test.ts`

- [ ] **Step 2.1: Write failing schema test**

Create `server/tests/schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { GameState, PlayerState } from "../../shared/schema"
import { CHEAT_WINDOW_MS, MAX_ROUNDS } from "../../shared/constants"

describe("GameState", () => {
  it("initialises with lobby phase", () => {
    const state = new GameState()
    expect(state.phase).toBe("lobby")
    expect(state.currentRound).toBe(0)
  })

  it("initialises with empty player map", () => {
    const state = new GameState()
    expect(state.players.size).toBe(0)
  })
})

describe("PlayerState", () => {
  it("initialises with zero score and not cheating", () => {
    const player = new PlayerState()
    expect(player.score).toBe(0)
    expect(player.isCheating).toBe(false)
    expect(player.cheatStartTimestamp).toBe(0)
  })
})

describe("constants", () => {
  it("cheat window is 1500ms", () => {
    expect(CHEAT_WINDOW_MS).toBe(1500)
  })

  it("max rounds is 10", () => {
    expect(MAX_ROUNDS).toBe(10)
  })
})
```

- [ ] **Step 2.2: Run test — expect FAIL**

```bash
cd server && npm test
```

Expected output: `Error: Cannot find module '../../shared/schema'`

- [ ] **Step 2.3: Create constants**

Create `shared/constants.ts`:
```typescript
export const MAX_ROUNDS = 10
export const CHEAT_WINDOW_MS = 1500
export const WHEEL_MIN_VELOCITY = 600
export const WHEEL_MAX_VELOCITY = 1200
export const WHEEL_ARROW_INFLUENCE = 0.05
export const CHESS_TURN_DURATION_MS = 30_000
export const SCORE_PLACEMENT = [3, 2, 1, 0] as const
export const SCORE_CHEAT_CAUGHT = -1
export const SCORE_CHEAT_SUCCESS = 1

export const MINIGAMES = ["chess"] as const
export type Minigame = (typeof MINIGAMES)[number]

export type GamePhase = "lobby" | "wheel" | "minigame" | "result" | "gameover"
```

- [ ] **Step 2.4: Create schema**

Create `shared/schema.ts`:
```typescript
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema"

export class CheatEvent extends Schema {
  @type("string") playerId: string = ""
  @type("string") cheatType: string = ""
  @type("number") startTimestamp: number = 0
  @type("boolean") caught: boolean = false
}

export class PlayerState extends Schema {
  @type("string") id: string = ""
  @type("string") name: string = ""
  @type("string") characterId: string = ""
  @type("number") score: number = 0
  @type("boolean") isConnected: boolean = true
  @type("boolean") isCheating: boolean = false
  @type("number") cheatStartTimestamp: number = 0
}

export class GameState extends Schema {
  @type("string") phase: string = "lobby"
  @type("number") currentRound: number = 0
  @type("string") currentMinigame: string = ""
  @type("string") wheelSpinnerId: string = ""
  @type("number") wheelVelocity: number = 0
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>()
  @type([CheatEvent]) cheatLog = new ArraySchema<CheatEvent>()
}
```

- [ ] **Step 2.5: Run test — expect PASS**

```bash
cd server && npm test
```

Expected: `5 passed`

- [ ] **Step 2.6: Commit**

```bash
git add shared/ server/tests/
git commit -m "feat: add shared schema and constants with tests"
```

---

## Task 3: Server — GameRoom

**Files:**
- Create: `server/src/index.ts`
- Create: `server/src/rooms/GameRoom.ts`
- Create: `server/tests/GameRoom.test.ts`

- [ ] **Step 3.1: Write failing GameRoom tests**

Create `server/tests/GameRoom.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { GameRoom } from "../src/rooms/GameRoom"
import { CHEAT_WINDOW_MS, MAX_ROUNDS } from "../../shared/constants"

function makeRoom() {
  const room = new GameRoom()
  room.roomId = "test"
  // @ts-ignore
  room.clock = { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) }
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

  it("resolves caught cheat with -1 score", () => {
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room.state.players.get("p1")!.score = 2
    room["handleCheatAttempt"](c1, { cheatType: "peek_mission" })
    room["handleCatchCheat"](c2, { targetId: "p1" })
    expect(room.state.players.get("p1")!.isCheating).toBe(false)
    expect(room.state.players.get("p1")!.score).toBe(1)
  })

  it("ignores catch after window expires", async () => {
    vi.useFakeTimers()
    const room = makeRoom()
    const c1 = makeClient("p1")
    const c2 = makeClient("p2")
    room.onJoin(c1, { name: "Alice", characterId: "a" })
    room.onJoin(c2, { name: "Bob", characterId: "b" })
    room["handleCheatAttempt"](c1, { cheatType: "peek_mission" })
    vi.setSystemTime(Date.now() + CHEAT_WINDOW_MS + 100)
    room["handleCatchCheat"](c2, { targetId: "p1" })
    // cheat already auto-resolved by timeout — score is 1 (success bonus)
    expect(room.state.players.get("p1")!.isCheating).toBe(false)
    vi.useRealTimers()
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

  it("transitions to gameover after MAX_ROUNDS", () => {
    const room = makeRoom()
    room.state.currentRound = MAX_ROUNDS
    room["startNewRound"]()
    expect(room.state.phase).toBe("gameover")
  })
})
```

- [ ] **Step 3.2: Run tests — expect FAIL**

```bash
cd server && npm test
```

Expected: `Cannot find module '../src/rooms/GameRoom'`

- [ ] **Step 3.3: Implement GameRoom**

Create `server/src/rooms/GameRoom.ts`:
```typescript
import { Room, Client } from "@colyseus/core"
import { GameState, PlayerState, CheatEvent } from "../../../shared/schema"
import {
  CHEAT_WINDOW_MS,
  MAX_ROUNDS,
  SCORE_CHEAT_CAUGHT,
  SCORE_CHEAT_SUCCESS,
  MINIGAMES,
} from "../../../shared/constants"

interface JoinOptions {
  name: string
  characterId: string
}

interface CheatAttemptMsg {
  cheatType: string
}

interface CatchCheatMsg {
  targetId: string
}

export class GameRoom extends Room<GameState> {
  maxClients = 4
  private readyPlayers = new Set<string>()

  onCreate(_options: unknown) {
    this.setState(new GameState())
    this.onMessage("player_ready", (client, msg) => this.handlePlayerReady(client, msg))
    this.onMessage("cheat_attempt", (client, msg: CheatAttemptMsg) => this.handleCheatAttempt(client, msg))
    this.onMessage("catch_cheat", (client, msg: CatchCheatMsg) => this.handleCatchCheat(client, msg))
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new PlayerState()
    player.id = client.sessionId
    player.name = options.name ?? "Player"
    player.characterId = options.characterId ?? "default"
    this.state.players.set(client.sessionId, player)
  }

  onLeave(client: Client, _consented: boolean) {
    const player = this.state.players.get(client.sessionId)
    if (player) player.isConnected = false
    this.readyPlayers.delete(client.sessionId)
  }

  onDispose() {}

  handlePlayerReady(client: Client, _msg: unknown) {
    this.readyPlayers.add(client.sessionId)
    const connectedIds = [...this.state.players.values()]
      .filter((p) => p.isConnected)
      .map((p) => p.id)
    const allReady = connectedIds.length >= 2 &&
      connectedIds.every((id) => this.readyPlayers.has(id))
    if (allReady) {
      this.readyPlayers.clear()
      this.startNewRound()
    }
  }

  handleCheatAttempt(client: Client, msg: CheatAttemptMsg) {
    const player = this.state.players.get(client.sessionId)
    if (!player || player.isCheating) return
    player.isCheating = true
    player.cheatStartTimestamp = Date.now()

    this.clock.setTimeout(() => {
      if (player.isCheating) this.resolveCheat(client.sessionId, false)
    }, CHEAT_WINDOW_MS)
  }

  handleCatchCheat(client: Client, msg: CatchCheatMsg) {
    const target = this.state.players.get(msg.targetId)
    if (!target || !target.isCheating) return
    if (Date.now() - target.cheatStartTimestamp > CHEAT_WINDOW_MS) return
    this.resolveCheat(msg.targetId, true)
    this.broadcast("cheat_caught", { catcherId: client.sessionId, targetId: msg.targetId })
  }

  startNewRound() {
    this.state.currentRound++
    if (this.state.currentRound > MAX_ROUNDS) {
      this.state.phase = "gameover"
      return
    }
    this.state.phase = "wheel"
    const ids = [...this.state.players.keys()]
    if (!this.state.wheelSpinnerId || !ids.includes(this.state.wheelSpinnerId)) {
      this.state.wheelSpinnerId = ids[Math.floor(Math.random() * ids.length)]
    }
    this.state.currentMinigame = MINIGAMES[Math.floor(Math.random() * MINIGAMES.length)]
    this.broadcast("round_started", {
      round: this.state.currentRound,
      spinnerId: this.state.wheelSpinnerId,
    })
  }

  private resolveCheat(playerId: string, caught: boolean) {
    const player = this.state.players.get(playerId)
    if (!player) return
    player.isCheating = false
    player.cheatStartTimestamp = 0

    const event = new CheatEvent()
    event.playerId = playerId
    event.caught = caught
    event.startTimestamp = Date.now()
    this.state.cheatLog.push(event)

    if (caught) {
      player.score = Math.max(0, player.score + SCORE_CHEAT_CAUGHT)
    } else {
      player.score += SCORE_CHEAT_SUCCESS
      this.broadcast("cheat_succeeded", { playerId })
    }
  }
}
```

- [ ] **Step 3.4: Run tests — expect PASS**

```bash
cd server && npm test
```

Expected: `9 passed`

- [ ] **Step 3.5: Create server entry point**

Create `server/src/index.ts`:
```typescript
import { Server } from "@colyseus/core"
import { WebSocketTransport } from "@colyseus/ws-transport"
import { GameRoom } from "./rooms/GameRoom"

const port = Number(process.env.PORT) || 2567

const gameServer = new Server({
  transport: new WebSocketTransport(),
})

gameServer.define("game_room", GameRoom)

gameServer.listen(port).then(() => {
  console.log(`Server running on ws://localhost:${port}`)
})
```

- [ ] **Step 3.6: Smoke-test server starts**

```bash
cd server && npm run dev
```

Expected: `Server running on ws://localhost:2567`  
Press Ctrl+C to stop.

- [ ] **Step 3.7: Commit**

```bash
git add server/
git commit -m "feat: implement GameRoom with cheat mechanic and round management"
```

---

## Task 4: Client — Colyseus connection wrapper

**Files:**
- Create: `client/src/network/ColyseusClient.ts`

- [ ] **Step 4.1: Create ColyseusClient singleton**

Create `client/src/network/ColyseusClient.ts`:
```typescript
import { Client, Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"

const WS_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567"

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
```

- [ ] **Step 4.2: Commit**

```bash
git add client/src/network/
git commit -m "feat: add ColyseusClient singleton with typed room connection"
```

---

## Task 5: Client — Phaser scenes

**Files:**
- Create: `client/src/main.ts`
- Create: `client/src/scenes/LobbyScene.ts`
- Create: `client/src/scenes/WheelScene.ts`
- Create: `client/src/scenes/ChessScene.ts`
- Create: `client/src/scenes/ResultScene.ts`

- [ ] **Step 5.1: Create main.ts**

Create `client/src/main.ts`:
```typescript
import Phaser from "phaser"
import { LobbyScene } from "./scenes/LobbyScene"
import { WheelScene } from "./scenes/WheelScene"
import { ChessScene } from "./scenes/ChessScene"
import { ResultScene } from "./scenes/ResultScene"

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#0d0d1a",
  scene: [LobbyScene, WheelScene, ChessScene, ResultScene],
  parent: document.body,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
})
```

- [ ] **Step 5.2: Create LobbyScene**

Create `client/src/scenes/LobbyScene.ts`:
```typescript
import Phaser from "phaser"
import { joinGame, sendPlayerReady } from "../network/ColyseusClient"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"

export class LobbyScene extends Phaser.Scene {
  private room: Room<GameState> | null = null

  constructor() {
    super({ key: "LobbyScene" })
  }

  create() {
    const { width, height } = this.scale

    this.add
      .text(width / 2, height / 2 - 80, "Twinky Olympiade", {
        fontSize: "36px",
        color: "#e8d5ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)

    const statusText = this.add
      .text(width / 2, height / 2, "Click anywhere to join", {
        fontSize: "18px",
        color: "#a0a0c0",
      })
      .setOrigin(0.5)

    const playerList = this.add
      .text(width / 2, height / 2 + 60, "", {
        fontSize: "14px",
        color: "#808090",
        align: "center",
      })
      .setOrigin(0.5)

    this.input.once("pointerdown", async () => {
      statusText.setText("Connecting...")
      try {
        this.room = await joinGame("Player", "default")

        this.room.onStateChange((state) => {
          const names = [...state.players.values()].map((p) => p.name).join("\n")
          playerList.setText(names)
          if (state.phase === "wheel") {
            this.scene.start("WheelScene", { room: this.room })
          }
        })

        statusText.setText("Connected! Press SPACE when ready")
        this.input.keyboard?.once("keydown-SPACE", () => {
          statusText.setText("Waiting for others...")
          sendPlayerReady()
        })
      } catch {
        statusText.setText("Connection failed — is the server running?")
      }
    })
  }
}
```

- [ ] **Step 5.3: Create WheelScene stub**

Create `client/src/scenes/WheelScene.ts`:
```typescript
import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"

export class WheelScene extends Phaser.Scene {
  private room!: Room<GameState>

  constructor() {
    super({ key: "WheelScene" })
  }

  init(data: { room: Room<GameState> }) {
    this.room = data.room
  }

  create() {
    const { width, height } = this.scale
    this.add
      .text(width / 2, height / 2, "Wheel Scene (stub)\nPress SPACE to skip to Chess", {
        fontSize: "20px",
        color: "#e8d5ff",
        align: "center",
      })
      .setOrigin(0.5)

    this.input.keyboard?.once("keydown-SPACE", () => {
      this.scene.start("ChessScene", { room: this.room })
    })
  }
}
```

- [ ] **Step 5.4: Create ChessScene stub**

Create `client/src/scenes/ChessScene.ts`:
```typescript
import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"

export class ChessScene extends Phaser.Scene {
  private room!: Room<GameState>

  constructor() {
    super({ key: "ChessScene" })
  }

  init(data: { room: Room<GameState> }) {
    this.room = data.room
  }

  create() {
    const { width, height } = this.scale
    this.add
      .text(width / 2, height / 2, "Chess Scene (stub)\nPress SPACE to go to Results", {
        fontSize: "20px",
        color: "#e8d5ff",
        align: "center",
      })
      .setOrigin(0.5)

    this.input.keyboard?.once("keydown-SPACE", () => {
      this.scene.start("ResultScene", { room: this.room })
    })
  }
}
```

- [ ] **Step 5.5: Create ResultScene stub**

Create `client/src/scenes/ResultScene.ts`:
```typescript
import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { sendPlayerReady } from "../network/ColyseusClient"

export class ResultScene extends Phaser.Scene {
  private room!: Room<GameState>

  constructor() {
    super({ key: "ResultScene" })
  }

  init(data: { room: Room<GameState> }) {
    this.room = data.room
  }

  create() {
    const { width, height } = this.scale

    this.add
      .text(width / 2, height / 2 - 100, "Round Results", {
        fontSize: "28px",
        color: "#e8d5ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)

    let y = height / 2 - 50
    const sorted = [...this.room.state.players.values()].sort((a, b) => b.score - a.score)
    for (const player of sorted) {
      this.add
        .text(width / 2, y, `${player.name}  —  ${player.score} pts`, {
          fontSize: "18px",
          color: "#c0c0e0",
        })
        .setOrigin(0.5)
      y += 30
    }

    this.add
      .text(width / 2, height / 2 + 100, "Press SPACE to continue", {
        fontSize: "14px",
        color: "#606080",
      })
      .setOrigin(0.5)

    this.input.keyboard?.once("keydown-SPACE", () => sendPlayerReady())

    this.room.onStateChange((state) => {
      if (state.phase === "wheel") this.scene.start("WheelScene", { room: this.room })
      if (state.phase === "gameover") this.add.text(width / 2, height / 2 + 150, "GAME OVER", { fontSize: "24px", color: "#ff6060" }).setOrigin(0.5)
    })
  }
}
```

- [ ] **Step 5.6: Smoke-test full flow**

Terminal 1:
```bash
cd server && npm run dev
```

Terminal 2:
```bash
cd client && npm run dev
```

Open `http://localhost:5173` in two browser tabs. In each tab:
1. Click → see "Connecting..." then "Connected! Press SPACE when ready"
2. Both tabs press SPACE
3. Both transition to WheelScene stub
4. Press SPACE → ChessScene → SPACE → ResultScene → SPACE → back to WheelScene (round 2)
5. After 10 rounds: "GAME OVER" text appears

- [ ] **Step 5.7: Commit**

```bash
git add client/
git commit -m "feat: add Phaser scenes (lobby functional, wheel/chess/result stubs)"
```

---

## Task 6: Project config files

**Files:**
- Create: `.gitignore`
- Create: `client/.env.example`

- [ ] **Step 6.1: Create .gitignore**

Create `.gitignore` at project root:
```
node_modules/
dist/
.env
.env.local
```

- [ ] **Step 6.2: Create env example**

Create `client/.env.example`:
```
VITE_SERVER_URL=ws://localhost:2567
```

- [ ] **Step 6.3: Final commit**

```bash
git add .gitignore client/.env.example
git commit -m "chore: add gitignore and env config example"
```

---

## What This Produces

Working multiplayer lobby: 2–4 players connect, see each other, ready up together, cycle through stub scenes across 10 rounds until game over. Cheat mechanic fully tested on server. Foundation ready for Plans B–D.

**Next plans (independent, build on this foundation):**
- `2026-05-19-wheel-scene.md` — physics wheel with velocity/deceleration/segment selection
- `2026-05-19-chess-minigame.md` — full chess board, pieces, secret missions, ghost pieces
- `2026-05-19-cheat-system.md` — cheat UI wired into chess with visual indicator
