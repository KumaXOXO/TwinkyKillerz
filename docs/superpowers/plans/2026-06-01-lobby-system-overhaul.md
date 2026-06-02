# Lobby System Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken join-by-code flow and rebuild the lobby join UX with private/public rooms, a browser list of public lobbies, capacity display, full-lobby blocking, and a copy-on-click lobby code with hover animation.

**Architecture:**
- **Server:** Adds `isPrivate` and `playerCount` to room metadata. Private rooms are excluded from public listing. Capacity is enforced server-side via `maxClients` and re-checked in `onAuth`.
- **Client:** `joinByCode` is fixed to match rooms by metadata exactly. New `ColyseusClient.getPublicLobbies()` fetches the public list. `CharacterSelectScene` "JOIN WITH CODE" button opens a new dual-panel UI: public lobby list (left, with per-row JOIN button) and code input (right). The "Create Room" flow shows a Private toggle. `LobbyScene` makes the room code clickable to copy and adds a hover scale animation.

**Tech Stack:** Phaser 3.60, Colyseus 0.15 (`@colyseus/core`), TypeScript, Vitest, Clipboard API (`navigator.clipboard.writeText`).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `server/src/rooms/GameRoom.ts` | Modify | Add `isPrivate`, `playerCount`, `maxPlayers` to metadata; refuse joining full rooms; accept `isPrivate` in create options |
| `server/tests/GameRoom.test.ts` | Modify | Add tests for metadata exposure and full-lobby refusal |
| `shared/schema.ts` | Modify | Add `@type("boolean") isPrivate = false` to `GameState` |
| `client/src/network/ColyseusClient.ts` | Modify | Fix `joinByCode`; add `createRoom(name, characterId, isPrivate)`; add `getPublicLobbies()`; add `LobbyInfo` exported type |
| `client/src/scenes/CharacterSelectScene.ts` | Modify | Add Private toggle (Create flow); replace code-only modal with combined Browser + Code modal |
| `client/src/scenes/LobbyScene.ts` | Modify | Make `roomCodeText` interactive: hover-scale tween + click-to-copy via clipboard |

---

## Task 1: Fix Join-By-Code Bug + Add Room Metadata

**Files:**
- Modify: `server/src/rooms/GameRoom.ts`
- Modify: `server/tests/GameRoom.test.ts`

### Diagnosis

Current bug, `client/src/network/ColyseusClient.ts:30-40`:
```typescript
export async function joinByCode(name, characterId, roomCode) {
  const rooms = await getClient().getAvailableRooms<{ roomCode: string }>("game_room")
  const target = rooms.find(r => r.metadata?.roomCode === roomCode.toUpperCase().trim())
  if (!target) throw new Error("Room not found")
  _room = await getClient().joinById<GameState>(target.roomId, { name, characterId })
  return _room
}
```

Root causes:
1. `setMetadata` is called without `await` in `onCreate`, so a fast subsequent client `getAvailableRooms` race can miss the metadata.
2. Once a room reaches `maxClients`, Colyseus locks it. `getAvailableRooms` excludes locked rooms by default — so a 2-player room becomes unjoinable by code as soon as it's full.
3. Metadata is never updated when `maxClients` changes via `gamemaster_settings` (the GM can drop max from 4 → 2 and the metadata stays stale).

Fix strategy:
- `await this.setMetadata(...)` and update metadata on `onJoin`/`onLeave`/`maxPlayers` change.
- Include `playerCount`, `maxPlayers`, `isPrivate` in metadata.
- Add `onAuth` guard for full lobbies so a client trying to join past `maxClients` gets a clear rejection.

### Implementation steps

- [ ] **Step 1: Read current `GameRoom.ts` and locate `onCreate`, `onJoin`, `onLeave`, and `handleGamemasterSettings` so the metadata refresh helper plugs into all four call sites.**

- [ ] **Step 2: Write failing test in `server/tests/GameRoom.test.ts`**

Add inside the existing top-level `describe("GameRoom", ...)`:

```typescript
describe("Room metadata", () => {
  it("publishes roomCode, playerCount, maxPlayers, isPrivate after creation and join", async () => {
    const { room } = makeRoom()
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
    await room.handleLeave(clients[0], true)
    expect(room.metadata?.playerCount).toBe(1)
  })

  it("updates maxPlayers in metadata when GM changes setting", async () => {
    const { room, clients } = await makeRoomWithPlayers(1)
    const gm = clients[0]
    await room.handleMessage(gm, "gamemaster_settings", { maxPlayers: 2 })
    expect(room.metadata?.maxPlayers).toBe(2)
  })
})

describe("Full-lobby guard", () => {
  it("onAuth refuses join when room is full", async () => {
    const { room } = await makeRoomWithPlayers(4)
    let rejected = false
    try {
      await (room as unknown as { onAuth: (c: unknown, o: unknown) => boolean })
        .onAuth({}, { name: "X", characterId: "y" })
    } catch {
      rejected = true
    }
    expect(rejected).toBe(true)
  })
})
```

If `makeRoomWithPlayers(n)` does not exist, add it next to the existing `makeRoom` helper at the top of the test file:

```typescript
async function makeRoomWithPlayers(n: number): Promise<{ room: GameRoom; clients: Client[] }> {
  const { room } = makeRoom()
  const clients: Client[] = []
  for (let i = 0; i < n; i++) {
    const client = { sessionId: `s${i}`, send: () => {}, leave: () => {} } as unknown as Client
    await room.onJoin(client, { name: `P${i}`, characterId: "default" })
    clients.push(client)
  }
  return { room, clients }
}
```

(Add `import { Client } from "@colyseus/core"` at top if absent.)

- [ ] **Step 3: Run failing tests**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz\server
npx vitest run --reporter=verbose 2>&1 | Select-Object -Last 30
```

Expected: 4 new tests fail (metadata mismatch / no rejection).

- [ ] **Step 4: Add `updateRoomMetadata()` helper and `onAuth` guard in `server/src/rooms/GameRoom.ts`**

Inside the `GameRoom` class, add new private method (place near `onCreate`):

```typescript
private async updateRoomMetadata(): Promise<void> {
  const connectedCount = [...this.state.players.values()].filter(p => p.isConnected).length
  await this.setMetadata({
    roomCode: this.state.roomCode,
    playerCount: connectedCount,
    maxPlayers: this.state.maxPlayers,
    isPrivate: this.state.isPrivate,
  })
}
```

Replace the existing `this.setMetadata({ roomCode: this.state.roomCode })` line in `onCreate` with:

```typescript
await this.updateRoomMetadata()
```

(`onCreate` must be `async onCreate(...)` — change the signature.)

Add `onAuth` override below `onCreate`:

```typescript
onAuth(_client: Client, _options: unknown): boolean {
  const connectedCount = [...this.state.players.values()].filter(p => p.isConnected).length
  if (connectedCount >= this.state.maxPlayers) {
    throw new Error("Room is full")
  }
  return true
}
```

At the end of `onJoin`, append:
```typescript
this.updateRoomMetadata()
```

At the end of `onLeave`, append:
```typescript
this.updateRoomMetadata()
```

In `handleGamemasterSettings`, after the existing `this.state.maxPlayers = v; this.maxClients = v` lines, append:
```typescript
this.updateRoomMetadata()
```

- [ ] **Step 5: Accept `isPrivate` in `onCreate` options**

Change `onCreate(_options: unknown)` signature to:
```typescript
async onCreate(options: { isPrivate?: boolean } = {}) {
  this.setState(new GameState())
  this.state.roomCode = generateRoomCode()
  this.state.isPrivate = options.isPrivate === true
  // ... existing message registrations unchanged ...
  await this.updateRoomMetadata()
}
```

(`shared/schema.ts` will add the `isPrivate` field in Task 2 — for now the test will fail-compile on `this.state.isPrivate`; that's expected, fix it in Task 2.)

- [ ] **Step 6: Re-run tests**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz\server
npx vitest run --reporter=verbose 2>&1 | Select-Object -Last 30
```

Expected: TypeScript fails on `this.state.isPrivate`. Hold the commit — Task 2 adds the schema field. Move on.

- [ ] **Step 7: (No commit yet — Task 2 finishes this fix)**

---

## Task 2: Add `isPrivate` to Shared Schema

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: Add `isPrivate` field to `GameState`**

In `shared/schema.ts`, in class `GameState`, add after `@type("string") selectedGame`:

```typescript
@type("boolean") isPrivate: boolean = false
```

The full block now reads:
```typescript
export class GameState extends Schema {
  @type("string") phase: string = "lobby"
  @type("string") roomCode: string = ""
  @type("number") maxPlayers: number = 4
  @type("string") gameMode: string = "olympiade"
  @type("string") selectedGame: string = ""
  @type("boolean") isPrivate: boolean = false
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>()
  @type([CheatEvent]) cheatLog = new ArraySchema<CheatEvent>()
  @type([ChatMessage]) chatMessages = new ArraySchema<ChatMessage>()
  @type(OlympiadeState) olympiade = new OlympiadeState()
  @type(ChessState) chess = new ChessState()
  @type(Connect4State) connect4 = new Connect4State()
}
```

- [ ] **Step 2: Run server tests — confirm all pass**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz\server
npx vitest run --reporter=verbose 2>&1 | Select-Object -Last 20
```

Expected: all tests pass, including the 4 new metadata/full-lobby tests from Task 1.

- [ ] **Step 3: TypeScript check (server + client)**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz\server; npx tsc --noEmit 2>&1 | Select-Object -First 30
cd C:\Users\Administrator\Desktop\TwinkyKillerz\client; npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Expected: no errors in either.

- [ ] **Step 4: Commit (Tasks 1 + 2 ship together)**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz
git add server/src/rooms/GameRoom.ts server/tests/GameRoom.test.ts shared/schema.ts
git commit -m "feat: room metadata (playerCount, maxPlayers, isPrivate), full-lobby guard, isPrivate schema field"
```

---

## Task 3: ColyseusClient — Fix joinByCode, add createRoom isPrivate, add getPublicLobbies

**Files:**
- Modify: `client/src/network/ColyseusClient.ts`

- [ ] **Step 1: Add `LobbyInfo` exported type and rewrite the network module**

Open `client/src/network/ColyseusClient.ts`. Replace the existing `joinByCode` and `createRoom` and append `getPublicLobbies`:

Add at top, after the `import` lines:

```typescript
export interface LobbyInfo {
  roomId: string
  roomCode: string
  playerCount: number
  maxPlayers: number
  isPrivate: boolean
}
```

Replace existing `createRoom`:
```typescript
export async function createRoom(
  name: string,
  characterId: string,
  isPrivate: boolean = false,
): Promise<Room<GameState>> {
  _room = await getClient().create<GameState>("game_room", { name, characterId, isPrivate })
  return _room
}
```

Replace existing `joinByCode`:
```typescript
export async function joinByCode(
  name: string,
  characterId: string,
  roomCode: string,
): Promise<Room<GameState>> {
  const code = roomCode.toUpperCase().trim()
  const rooms = await getClient().getAvailableRooms<{
    roomCode: string
    playerCount: number
    maxPlayers: number
    isPrivate: boolean
  }>("game_room")
  const target = rooms.find(r => r.metadata?.roomCode === code)
  if (!target) throw new Error("Room not found")
  if (target.metadata && target.metadata.playerCount >= target.metadata.maxPlayers) {
    throw new Error("Room is full")
  }
  _room = await getClient().joinById<GameState>(target.roomId, { name, characterId })
  return _room
}
```

Append at end of file:
```typescript
export async function getPublicLobbies(): Promise<LobbyInfo[]> {
  const rooms = await getClient().getAvailableRooms<{
    roomCode: string
    playerCount: number
    maxPlayers: number
    isPrivate: boolean
  }>("game_room")
  return rooms
    .filter(r => r.metadata && !r.metadata.isPrivate)
    .map(r => ({
      roomId: r.roomId,
      roomCode: r.metadata!.roomCode,
      playerCount: r.metadata!.playerCount,
      maxPlayers: r.metadata!.maxPlayers,
      isPrivate: r.metadata!.isPrivate,
    }))
}

export async function joinLobbyById(
  name: string,
  characterId: string,
  roomId: string,
): Promise<Room<GameState>> {
  _room = await getClient().joinById<GameState>(roomId, { name, characterId })
  return _room
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz\client
npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz
git add client/src/network/ColyseusClient.ts
git commit -m "feat: client lobby browser API — getPublicLobbies, joinLobbyById, isPrivate create option"
```

---

## Task 4: CharacterSelectScene — Private Toggle + Lobby Browser Modal

**Files:**
- Modify: `client/src/scenes/CharacterSelectScene.ts`

- [ ] **Step 1: Read the current scene end-to-end** so the new private toggle replaces the existing button layout cleanly.

- [ ] **Step 2: Add private flag + browser state**

In the class, add new private fields (place near the existing `typedCode`):

```typescript
private isPrivate = false
private privateBtn?: Phaser.GameObjects.Rectangle
private privateBtnLabel?: Phaser.GameObjects.Text
private lobbyRows: Phaser.GameObjects.GameObject[] = []
private refreshTimer?: Phaser.Time.TimerEvent
```

Update the import line at the top:
```typescript
import { joinByCode, getPublicLobbies, joinLobbyById, type LobbyInfo } from "../network/ColyseusClient"
```

- [ ] **Step 3: Add Private toggle button under the Create/Join buttons**

In `create()`, after `this.joinBtnLabel = this.add.text(...)` block (around line 116), append:

```typescript
this.privateBtn = this.add
  .rectangle(width / 2, btnY + 50, 220, 32, C.panel)
  .setStrokeStyle(2, C.border)
  .setInteractive({ useHandCursor: true })
this.privateBtnLabel = this.add
  .text(width / 2, btnY + 50, "PRIVATE LOBBY: OFF", { fontSize: "12px", color: C.muted })
  .setOrigin(0.5)
this.privateBtn.on("pointerdown", () => {
  this.isPrivate = !this.isPrivate
  this.privateBtnLabel?.setText(`PRIVATE LOBBY: ${this.isPrivate ? "ON" : "OFF"}`)
  this.privateBtnLabel?.setColor(this.isPrivate ? C.text : C.muted)
  sounds.menuNav()
})
```

- [ ] **Step 4: Pass `isPrivate` to LobbyScene on create**

Replace `startCreate` body with:
```typescript
private startCreate() {
  const ch = CHARACTERS[this.selectedIdx]
  this.scene.start("LobbyScene", {
    name: this.typedName.trim(),
    characterId: ch?.id ?? "knight",
    joinMode: "create",
    isPrivate: this.isPrivate,
  })
}
```

- [ ] **Step 5: Replace `showCodeInput` with combined Browser + Code modal**

Delete the existing `showCodeInput` method body. Replace with:

```typescript
private showCodeInput() {
  this.joinPhase = "codeInput"
  this.typedCode = ""
  this.clearChoiceGroup()
  const { width, height } = this.scale

  const overlay = this.add
    .rectangle(width / 2, height / 2, 720, 460, 0x0d0d1a)
    .setStrokeStyle(2, C.border)
    .setDepth(10)
  const title = this.add
    .text(width / 2, height / 2 - 210, "JOIN A LOBBY", { fontSize: "18px", color: C.text, fontStyle: "bold" })
    .setOrigin(0.5)
    .setDepth(11)

  const listTitle = this.add
    .text(width / 2 - 170, height / 2 - 170, "PUBLIC LOBBIES", { fontSize: "13px", color: C.muted })
    .setOrigin(0.5)
    .setDepth(11)
  const listBg = this.add
    .rectangle(width / 2 - 170, height / 2 + 10, 320, 340, C.panel)
    .setStrokeStyle(1, C.border)
    .setDepth(11)

  const codeTitle = this.add
    .text(width / 2 + 170, height / 2 - 170, "OR ENTER CODE", { fontSize: "13px", color: C.muted })
    .setOrigin(0.5)
    .setDepth(11)
  const codeBg = this.add
    .rectangle(width / 2 + 170, height / 2 + 10, 320, 340, C.panel)
    .setStrokeStyle(1, C.border)
    .setDepth(11)
  const codeInputBox = this.add
    .rectangle(width / 2 + 170, height / 2 - 60, 240, 44, 0x0a0a16)
    .setStrokeStyle(2, C.border)
    .setDepth(12)
  const codeDisplay = this.add
    .text(width / 2 + 170, height / 2 - 60, "", { fontSize: "22px", color: C.text, fontStyle: "bold" })
    .setOrigin(0.5)
    .setDepth(13)
  const codeHint = this.add
    .text(width / 2 + 170, height / 2 + 10, "ENTER to join code", { fontSize: "12px", color: C.muted })
    .setOrigin(0.5)
    .setDepth(12)
  const errText = this.add
    .text(width / 2 + 170, height / 2 + 110, "", { fontSize: "13px", color: "#ff5555", wordWrap: { width: 280 }, align: "center" })
    .setOrigin(0.5)
    .setDepth(12)

  const closeHint = this.add
    .text(width / 2, height / 2 + 210, "ESC to close", { fontSize: "11px", color: C.muted })
    .setOrigin(0.5)
    .setDepth(11)

  this.codeDisplayText = codeDisplay
  this.codeErrorText = errText
  this.choiceGroup.push(overlay, title, listTitle, listBg, codeTitle, codeBg, codeInputBox, codeDisplay, codeHint, errText, closeHint)

  this.refreshLobbyList()
  this.refreshTimer = this.time.addEvent({
    delay: 3000,
    loop: true,
    callback: () => this.refreshLobbyList(),
  })
}
```

- [ ] **Step 6: Add `refreshLobbyList` method**

Add as a new private method:

```typescript
private async refreshLobbyList(): Promise<void> {
  if (this.joinPhase !== "codeInput") return
  const { width, height } = this.scale
  let lobbies: LobbyInfo[] = []
  try {
    lobbies = await getPublicLobbies()
  } catch {
    lobbies = []
  }
  this.lobbyRows.forEach(o => (o as { destroy(): void }).destroy())
  this.lobbyRows = []
  const listX = width / 2 - 170
  const startY = height / 2 - 140
  if (lobbies.length === 0) {
    const empty = this.add
      .text(listX, height / 2 + 10, "No public lobbies yet.\nCreate one!", { fontSize: "13px", color: C.muted, align: "center" })
      .setOrigin(0.5)
      .setDepth(12)
    this.lobbyRows.push(empty)
    return
  }
  lobbies.slice(0, 8).forEach((lobby, idx) => {
    const y = startY + idx * 38
    const isFull = lobby.playerCount >= lobby.maxPlayers
    const rowBg = this.add
      .rectangle(listX, y, 300, 32, 0x0a0a16)
      .setStrokeStyle(1, C.border)
      .setDepth(12)
    const label = this.add
      .text(listX - 140, y, `${lobby.roomCode}  ${lobby.playerCount}/${lobby.maxPlayers}`, {
        fontSize: "13px",
        color: isFull ? "#ff5555" : C.text,
      })
      .setOrigin(0, 0.5)
      .setDepth(13)
    const joinBtn = this.add
      .rectangle(listX + 120, y, 60, 24, isFull ? 0x2a1a2a : C.border)
      .setStrokeStyle(1, isFull ? 0x553333 : C.selected)
      .setDepth(13)
    const joinLabel = this.add
      .text(listX + 120, y, isFull ? "FULL" : "JOIN", {
        fontSize: "11px",
        color: isFull ? "#aa5555" : C.text,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(14)
    if (!isFull) {
      joinBtn.setInteractive({ useHandCursor: true })
      joinBtn.on("pointerover", () => joinBtn.setFillStyle(C.selected))
      joinBtn.on("pointerout", () => joinBtn.setFillStyle(C.border))
      joinBtn.on("pointerdown", () => this.startWithLobbyId(lobby.roomId))
    }
    this.lobbyRows.push(rowBg, label, joinBtn, joinLabel)
  })
}
```

- [ ] **Step 7: Add `startWithLobbyId` method**

Add as a new private method:

```typescript
private async startWithLobbyId(roomId: string): Promise<void> {
  if (this.isConnecting) return
  this.isConnecting = true
  const ch = CHARACTERS[this.selectedIdx]
  this.setCodeError("Connecting...")
  try {
    const room = await joinLobbyById(this.typedName.trim(), ch?.id ?? "knight", roomId)
    this.scene.start("LobbyScene", {
      name: this.typedName.trim(),
      characterId: ch?.id ?? "knight",
      joinMode: "existing",
      room,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Join failed"
    this.setCodeError(msg)
    this.isConnecting = false
  }
}
```

- [ ] **Step 8: Stop the refresh timer when modal closes**

Update `clearChoiceGroup` to also stop the timer and destroy lobby rows:

```typescript
private clearChoiceGroup() {
  this.refreshTimer?.remove(false)
  this.refreshTimer = undefined
  this.lobbyRows.forEach(o => (o as { destroy(): void }).destroy())
  this.lobbyRows = []
  this.choiceGroup.forEach(o => (o as { destroy(): void }).destroy())
  this.choiceGroup = []
  this.codeDisplayText = undefined
  this.codeErrorText = undefined
}
```

- [ ] **Step 9: Update `startWithCode` to surface server errors clearly**

Replace existing `startWithCode` body:
```typescript
private async startWithCode() {
  if (this.isConnecting) return
  this.isConnecting = true
  const ch = CHARACTERS[this.selectedIdx]
  this.setCodeError("Connecting...")
  try {
    const room = await joinByCode(
      this.typedName.trim(),
      ch?.id ?? "knight",
      this.typedCode.trim().toUpperCase(),
    )
    this.scene.start("LobbyScene", {
      name: this.typedName.trim(),
      characterId: ch?.id ?? "knight",
      joinMode: "existing",
      room,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Join failed"
    this.setCodeError(msg)
    this.typedCode = ""
    this.updateCodeDisplay()
    this.isConnecting = false
  }
}
```

- [ ] **Step 10: TypeScript check**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz\client
npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz
git add client/src/scenes/CharacterSelectScene.ts
git commit -m "feat: lobby browser modal with public list + code input, private lobby toggle"
```

---

## Task 5: LobbyScene — Pass isPrivate on Create, Click-to-Copy Code, Hover Animation

**Files:**
- Modify: `client/src/scenes/LobbyScene.ts`

- [ ] **Step 1: Accept `isPrivate` in `init`**

In `LobbyScene.init`, extend the data type:
```typescript
init(data?: {
  name?: string
  characterId?: string
  joinMode?: "create" | "join" | "existing" | "joinOrCreate"
  roomCode?: string
  room?: Room<GameState>
  isPrivate?: boolean
}) {
  this.typedName = data?.name ?? ""
  this.characterId = data?.characterId ?? "default"
  this.joinMode = data?.joinMode ?? "joinOrCreate"
  this.roomCode = data?.roomCode ?? ""
  this.preJoinedRoom = data?.room ?? null
  this.createIsPrivate = data?.isPrivate ?? false
}
```

Add `private createIsPrivate = false` to the field list at the top of the class.

- [ ] **Step 2: Pass `createIsPrivate` to `createRoom`**

In `doJoin`, change the create branch:
```typescript
} else if (this.joinMode === "create") {
  this.room = await createRoom(name, this.characterId, this.createIsPrivate)
}
```

- [ ] **Step 3: Make `roomCodeText` clickable with hover scale + click-to-copy**

In `buildLobbyScreen`, replace the current `this.roomCodeText = this.add.text(...)` line with:

```typescript
this.roomCodeText = this.add
  .text(width - 20, 16, "", { fontSize: "20px", color: C.crown })
  .setOrigin(1, 0)
  .setInteractive({ useHandCursor: true })
this.roomCodeText.on("pointerover", () => {
  this.tweens.add({
    targets: this.roomCodeText,
    scale: 1.15,
    duration: 120,
    ease: "Sine.easeOut",
  })
})
this.roomCodeText.on("pointerout", () => {
  this.tweens.add({
    targets: this.roomCodeText,
    scale: 1.0,
    duration: 120,
    ease: "Sine.easeOut",
  })
})
this.roomCodeText.on("pointerdown", () => this.copyRoomCode())
```

- [ ] **Step 4: Add `copyRoomCode` method**

Add as a new private method in `LobbyScene`:

```typescript
private async copyRoomCode(): Promise<void> {
  const code = this.room?.state.roomCode
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
  } catch {
    return
  }
  sounds.menuConfirm()
  const original = this.roomCodeText.text
  this.roomCodeText.setText("COPIED!")
  this.time.delayedCall(900, () => {
    if (this.roomCodeText && !this.roomCodeText.destroyed) {
      this.roomCodeText.setText(original)
    }
  })
}
```

- [ ] **Step 5: Add visibility indicator for private lobby**

In `refreshLobbyUI`, update the `settingsText` block to include privacy:

```typescript
const visibility = state.isPrivate ? "PRIVATE" : "PUBLIC"
if (me?.isGamemaster) {
  this.settingsText?.setText(
    `[←/→] players: ${state.maxPlayers}   [M] mode: ${(state.gameMode ?? "olympiade").toUpperCase()}   ${visibility}`
  )
} else {
  this.settingsText?.setText(
    `Mode: ${(state.gameMode ?? "olympiade").toUpperCase()}   Players: ${state.maxPlayers}   ${visibility}`
  )
}
```

- [ ] **Step 6: TypeScript check**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz\client
npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd C:\Users\Administrator\Desktop\TwinkyKillerz
git add client/src/scenes/LobbyScene.ts
git commit -m "feat: click-to-copy room code, hover-scale animation, isPrivate pass-through and visibility display"
```

---

## Self-Review

### Spec Coverage
| Requirement | Task |
|---|---|
| Bug: join-by-code broken — fix | Task 1 (metadata + await), Task 3 (rewrite joinByCode) |
| Private vs public lobby toggle | Task 1 (server option), Task 2 (schema), Task 4 (Create toggle), Task 5 (display) |
| Join-with-code button shows public list OR code input | Task 4 (combined modal) |
| Show max-player count per lobby | Task 1 (metadata `maxPlayers`), Task 4 (row label `playerCount/maxPlayers`) |
| Block joining full lobbies | Task 1 (`onAuth` throw), Task 3 (`joinByCode` checks metadata), Task 4 (row FULL state, click disabled) |
| Per-lobby JOIN button on the right | Task 4 (`refreshLobbyList` row layout) |
| Copyable code on click | Task 5 (`copyRoomCode` via `navigator.clipboard`) |
| Hover animation pops the code | Task 5 (scale tween) |

### Placeholder Scan
None — every step contains exact code or exact commands.

### Type Consistency
- `LobbyInfo` (defined Task 3) is the same shape consumed by Task 4 (`getPublicLobbies` return → `refreshLobbyList`).
- `isPrivate` added to schema Task 2; read in metadata Task 1, passed in create options Task 4, displayed Task 5.
- `playerCount` / `maxPlayers` keys identical across server metadata (Task 1) and client metadata typing (Task 3).
- `updateRoomMetadata` called from 4 sites (onCreate, onJoin, onLeave, handleGamemasterSettings) — all defined in Task 1.
