# Juice Module + Connect4 Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken `client/src/juice/` module (missing `replay.ts` compile error) and wire punch/climax game-feel into Connect4Scene.

**Architecture:** The juice module is a set of Phaser helper functions gated behind a `JuiceConfig` (read from localStorage). `replay.ts` provides a `RingBuffer<T>` type + stub `playback()` so `climax.ts` compiles. Connect4Scene calls `punch()` when a chip lands and `climax()` on win (hitstop → shake → particle burst). `SoundManager.ts` already has new sounds (`connect4Thunk`, `pieceLand`, `wheelTick`) staged but not committed — committed in Task 3.

**Tech Stack:** Phaser 3.80, TypeScript, Vitest 1.6, jsdom

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `client/src/juice/replay.ts` | Create | `RingBuffer<T>`, `createRingBuffer`, `record`, `playback` stub — fixes `climax.ts` compile error |
| `client/src/juice/index.ts` | Exists | `JuiceConfig`, `replayLock`, `initJuice()` — no changes |
| `client/src/juice/helpers.ts` | Exists | `punch`, `shake`, `pop`, `hitstop`, `slowmo` — no changes |
| `client/src/juice/climax.ts` | Exists | `climax()` sequence — no changes needed once `replay.ts` exists |
| `client/src/utils/SoundManager.ts` | Commit | Already modified (uncommitted): `connect4Thunk`, `pieceLand`, `wheelTick` |
| `client/tests/juice/replay.test.ts` | Create | Unit tests for `RingBuffer` operations |
| `client/tests/juice/initJuice.test.ts` | Create | Unit tests for `initJuice()` localStorage parsing |
| `client/vite.config.ts` | Modify | Add `test: { environment: 'jsdom' }` block |
| `client/src/scenes/Connect4Scene.ts` | Modify | Import juice, `punch` on chip land, `climax` on win |

---

## Task 1: Set up vitest + jsdom environment

**Files:**
- Modify: `client/vite.config.ts`

The `initJuice` function reads `localStorage` and `window.matchMedia`. Vitest's default node environment has neither. Add jsdom so browser globals are available in tests.

- [ ] **Step 1: Install jsdom**

```bash
cd client && npm install -D jsdom
```

Expected: jsdom appears in `client/package.json` devDependencies.

- [ ] **Step 2: Add test config to `client/vite.config.ts`**

Replace the entire file with:

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
  test: {
    environment: "jsdom",
    globals: false,
  },
})
```

- [ ] **Step 3: Verify vitest runs without crashing**

```bash
cd client && npx vitest run
```

Expected: 0 test files found, no errors.

---

## Task 2: Create `replay.ts` + unit tests

**Files:**
- Create: `client/src/juice/replay.ts`
- Create: `client/tests/juice/replay.test.ts`

- [ ] **Step 1: Create test file first**

Create `client/tests/juice/replay.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { createRingBuffer, record } from "../../src/juice/replay"

describe("RingBuffer", () => {
  it("starts empty", () => {
    const buf = createRingBuffer<number>(3)
    expect(buf.items).toHaveLength(0)
    expect(buf.head).toBe(0)
  })

  it("records up to capacity without overwrite", () => {
    const buf = createRingBuffer<number>(3)
    record(buf, 1)
    record(buf, 2)
    expect(buf.items).toEqual([1, 2])
    expect(buf.head).toBe(2)
  })

  it("overwrites oldest item when full", () => {
    const buf = createRingBuffer<number>(3)
    record(buf, 1)
    record(buf, 2)
    record(buf, 3)
    record(buf, 4) // overwrites slot 0
    expect(buf.items).toHaveLength(3)
    expect(buf.items).toContain(4)
    expect(buf.items).not.toContain(1)
  })

  it("head wraps around modulo capacity", () => {
    const buf = createRingBuffer<number>(2)
    record(buf, 10)
    record(buf, 20)
    record(buf, 30)
    expect(buf.head).toBe(1) // slot 0 written, slot 1 written, slot 0 overwritten → head=1
  })

  it("works with object snapshots", () => {
    const buf = createRingBuffer<{ board: string[] }>(2)
    record(buf, { board: ["a"] })
    record(buf, { board: ["b"] })
    record(buf, { board: ["c"] }) // overwrites { board: ["a"] }
    expect(buf.items.some(s => s.board[0] === "c")).toBe(true)
    expect(buf.items.some(s => s.board[0] === "a")).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd client && npx vitest run tests/juice/replay.test.ts
```

Expected: fail — `createRingBuffer` not found.

- [ ] **Step 3: Create `client/src/juice/replay.ts`**

```typescript
import type Phaser from "phaser"

export interface RingBuffer<T> {
  capacity: number
  items: T[]
  head: number
}

export function createRingBuffer<T>(capacity: number): RingBuffer<T> {
  return { capacity, items: [], head: 0 }
}

export function record<T>(buf: RingBuffer<T>, item: T): void {
  if (buf.items.length < buf.capacity) {
    buf.items.push(item)
  } else {
    buf.items[buf.head] = item
  }
  buf.head = (buf.head + 1) % buf.capacity
}

// Replay is game-specific. Caller provides buffer + container when wiring
// slow-motion replay per scene. No-op until then.
export async function playback(
  _scene: Phaser.Scene,
  _container: Phaser.GameObjects.Container,
  _buffer: RingBuffer<unknown>,
  _factor: number,
): Promise<void> {}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd client && npx vitest run tests/juice/replay.test.ts
```

Expected: 5 tests pass.

---

## Task 3: Unit test `initJuice()` + commit juice module

**Files:**
- Create: `client/tests/juice/initJuice.test.ts`

- [ ] **Step 1: Create test file**

Create `client/tests/juice/initJuice.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { initJuice } from "../../src/juice/index"

describe("initJuice", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal("matchMedia", () => ({ matches: false }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("defaults: enabled=true, reduced=false, debug=false", () => {
    const cfg = initJuice()
    expect(cfg.enabled).toBe(true)
    expect(cfg.reduced).toBe(false)
    expect(cfg.debug).toBe(false)
  })

  it("juice=off → enabled=false", () => {
    localStorage.setItem("juice", "off")
    expect(initJuice().enabled).toBe(false)
  })

  it("juice=reduced → reduced=true, still enabled", () => {
    localStorage.setItem("juice", "reduced")
    const cfg = initJuice()
    expect(cfg.enabled).toBe(true)
    expect(cfg.reduced).toBe(true)
  })

  it("juiceDebug=on → debug=true", () => {
    localStorage.setItem("juiceDebug", "on")
    expect(initJuice().debug).toBe(true)
  })

  it("prefers-reduced-motion → reduced=true", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }))
    expect(initJuice().reduced).toBe(true)
  })

  it("config is frozen (immutable)", () => {
    const cfg = initJuice()
    expect(() => {
      ;(cfg as { enabled: boolean }).enabled = false
    }).toThrow()
  })
})
```

- [ ] **Step 2: Run tests — confirm pass**

```bash
cd client && npx vitest run tests/juice/initJuice.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 3: Run all client tests**

```bash
cd client && npx vitest run
```

Expected: 11 tests pass (5 replay + 6 initJuice).

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors. (`climax.ts` now resolves `./replay`.)

- [ ] **Step 5: Commit juice module + SoundManager**

```bash
git add client/src/juice/ client/src/utils/SoundManager.ts client/tests/ client/vite.config.ts client/package.json client/package-lock.json
git commit -m "feat: juice module — replay.ts, jsdom test env, new sounds (connect4Thunk, pieceLand, wheelTick)"
```

---

## Task 4: Wire juice into Connect4Scene

**Files:**
- Modify: `client/src/scenes/Connect4Scene.ts`

Two integration points:
1. **Chip land** — `animateDrop` `onComplete`: `punch()` the landing cell graphic + play `connect4Thunk`
2. **Win** — state `phase === "result"`: `climax()` with hitstop + shake + pop at board center, then delay ResultScene

- [ ] **Step 1: Add imports + juice field**

At the top of `client/src/scenes/Connect4Scene.ts`, add after the existing imports:

```typescript
import { initJuice, type JuiceConfig } from "../juice/index"
import { punch } from "../juice/helpers"
import { climax } from "../juice/climax"
```

Add field inside the class body, after `private cheatHUD!: CheatHUD`:

```typescript
private juice!: JuiceConfig
```

In `create()`, add as the very first line:

```typescript
this.juice = initJuice()
```

- [ ] **Step 2: Wire punch on chip land**

Replace the existing `animateDrop` method with:

```typescript
private animateDrop(col: number, targetRow: number, color: number) {
  const startY = GRID_Y + CELL / 2
  const endY = GRID_Y + targetRow * CELL + CELL / 2
  const cx = GRID_X + col * CELL + CELL / 2
  const r = CELL / 2 - 4
  const idx = targetRow * CONNECT4_COLS + col

  sounds.connect4Drop()
  const g = this.add.graphics()
  g.fillStyle(color)
  g.fillCircle(cx, 0, r)
  g.setPosition(0, startY)
  g.setDepth(10)

  this.tweens.add({
    targets: g,
    y: endY,
    duration: 80 + targetRow * 35,
    ease: "Bounce.easeOut",
    onComplete: () => {
      g.destroy()
      sounds.connect4Thunk(targetRow * 8)
      const cell = this.cellGraphics[idx]
      if (cell) punch(this.juice, cell, 1.15, 110)
    },
  })
}
```

- [ ] **Step 3: Wire climax on win**

In the `stateChangeCallback` inside `create()`, replace the `phase === "result"` block.

Current code to replace:

```typescript
if (state.phase === "result") {
  if (this.stateChangeCallback) {
    this.room.onStateChange.remove(this.stateChangeCallback)
    this.stateChangeCallback = null
  }
  sounds.roundWin()
  this.time.delayedCall(2500, () => {
    this.scene.start("ResultScene", { room: this.room })
  })
}
```

Replace with:

```typescript
if (state.phase === "result") {
  if (this.stateChangeCallback) {
    this.room.onStateChange.remove(this.stateChangeCallback)
    this.stateChangeCallback = null
  }
  const winnerId = state.connect4.winnerId
  const winColor = winnerId ? (this.playerColors[winnerId] ?? 0xffffff) : 0xffffff
  const boardCenterX = GRID_X + (CONNECT4_COLS * CELL) / 2
  const boardCenterY = GRID_Y + (CONNECT4_ROWS * CELL) / 2
  void climax(this.juice, this, {
    hitstopMs: 80,
    shake: { intensity: 0.008, ms: 220 },
    pop: { x: boardCenterX, y: boardCenterY, color: winColor, count: 14 },
  }).then(() => {
    this.time.delayedCall(1800, () => {
      this.scene.start("ResultScene", { room: this.room })
    })
  })
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

```bash
cd client && npm run dev
```

Open two browser tabs at `http://localhost:5173`. Join the same room, start Connect4. Verify:

- Drop a chip → hear two sounds (`connect4Drop` then `connect4Thunk` on land), cell squash-stretches on landing
- If `connect4Drop` already felt like the thunk, both sounds stack — that's intentional (drop whoosh + impact thud)
- Win → screen freezes ~80ms, camera shakes, particle burst at board center in winner's color, then 1.8s pause before ResultScene
- Draw → particles fire in white (0xffffff), transition after 1.8s

- [ ] **Step 6: Commit**

```bash
git add client/src/scenes/Connect4Scene.ts
git commit -m "feat: wire juice into Connect4Scene (punch on land, climax on win)"
```

---

## Self-Review

**Spec coverage:**
- `replay.ts` missing → Task 2 creates it ✓
- `climax.ts` compile error → resolved by Task 2 (replay.ts exports `playback` + `RingBuffer`) ✓
- `SoundManager.ts` uncommitted → committed in Task 3 ✓
- `punch` on chip land → Task 4 Step 2 ✓
- `climax` on win → Task 4 Step 3 ✓
- RingBuffer unit tests → Task 2 ✓
- `initJuice` unit tests → Task 3 ✓
- jsdom env for localStorage tests → Task 1 ✓

**Placeholder scan:** No TBDs or "implement later" present. All code blocks complete.

**Type consistency:**
- `RingBuffer<T>` defined in `replay.ts` Task 2, imported in `climax.ts` as `type { RingBuffer }` from `./replay` ✓
- `playback(scene, container, buffer, factor)` signature in `replay.ts` matches `climax.ts:34` call ✓
- `JuiceConfig` from `index.ts`, used as `Connect4Scene.juice` field type and as first param to `punch`/`climax` ✓
- `punch(cfg, obj, scale, ms)` — `cellGraphics[idx]` is `Phaser.GameObjects.Graphics` which extends `GameObject` and has `scaleX/scaleY` — satisfies `Scalable` type in `helpers.ts` ✓
