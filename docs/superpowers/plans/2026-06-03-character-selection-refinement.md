# Character Selection Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix character selection visuals: centered animations, readable names, white glow hover, and modular grid centering.

**Architecture:** Refactor CharacterSelectScene.ts to use precise sprite slicing and dynamic layout calculations. Centralize character metadata in constants.ts.

**Tech Stack:** Phaser 3, TypeScript.

---

### Task 1: Update Character Metadata

**Files:**
- Modify: `shared/constants.ts`

- [ ] **Step 1: Define precise frame dimensions and updated names**

```typescript
// Replace CHARACTERS array in shared/constants.ts
export const CHARACTERS = [
  { id: "lucas", name: "Blonde Podcaster", color: "#ff006e", asset: "blond_podcaster", fw: 342, fh: 574, symbol: "🧶" },
  { id: "fedor", name: "Geek Streamr", color: "#3a86ff", asset: "geek_streamer", fw: 418, fh: 470, symbol: "🧠" },
  { id: "christian", name: "Bearded Gamer", color: "#8338ec", asset: "bearded_gamer", fw: 350, fh: 561, symbol: "🧔" },
  { id: "dodo", name: "Lockiger zuschauer", color: "#ffffff", asset: "lockiger_zuschauer", fw: 384, fh: 512, symbol: "⚡" },
  { id: "grhost", name: "Grinsender CO-Host", color: "#00f5d4", asset: "grinsender_co_host", fw: 418, fh: 470, symbol: "🎧" },
  { id: "robin", name: "Robin Reinhardt", color: "#ffbe0b", asset: "robin", fw: 418, fh: 470, symbol: "🏹" },
  { id: "ingo_p", name: "Ingo P.", color: "#44ff88", asset: "ingo_p", fw: 350, fh: 561, symbol: "👮" },
  { id: "ingo_p_f", name: "Ingo P. Female", color: "#ff6688", asset: "ingo_p_w", fw: 418, fh: 470, symbol: "👗" },
] as const
```

- [ ] **Step 2: Commit**

```bash
git add shared/constants.ts
git commit -m "chore: update character names and frame metadata"
```

---

### Task 2: Refactor Character Selection Scene

**Files:**
- Modify: `client/src/scenes/CharacterSelectScene.ts`

- [ ] **Step 1: Implement centered slicing, white glow, and modular grid**

```typescript
// Slicing: this.load.spritesheet(ch.asset, ..., { frameWidth: ch.fw, frameHeight: ch.fh });
// Title: back to 38px bold "TWINKY GAMES"
// Grid: row-based centering logic
// Hover: bg.setFillStyle(0xffffff, 0.4) + sprite.play()
// Name: VT323 24px Bold
```

- [ ] **Step 2: Commit**

```bash
git add client/src/scenes/CharacterSelectScene.ts
git commit -m "feat: centered character animations and refined selection UI"
```

---

### Task 3: Verification

- [ ] **Step 1: Run dev server**
Run: `npm run dev` in client folder.

- [ ] **Step 2: Verify Visuals**
- Sprites stay centered during animation (no sliding).
- Title is "TWINKY GAMES".
- Label is "SELECT YOUR NAME".
- Character names are large and readable.
- Hover glow is white.
- Grid is centered.
