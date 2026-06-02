# TwinkyKillerz Feature Roadmap — Implementation Plan
**Date:** 2026-05-27 | **Branch:** master

---

## Overview

Implement the full TwinkyKillerz Olympiade party game platform. Current state: Colyseus server on Railway, Phaser 3 client on Netlify, basic chess game working. This plan covers 9 feature areas in priority order.

---

## Phase 1: Auto-Deploy Pipeline

**Goal:** Every push to `master` auto-deploys server (Railway) and client (Netlify).

### Tasks

1. **Railway GitHub Integration**
   - In Railway dashboard: connect service to GitHub repo
   - Enable auto-deploy on push to `master` branch

2. **GitHub Actions CI**
   - Create `.github/workflows/ci.yml`
   - Jobs: lint + typecheck `server/` and `client/`
   - Run `npm run build` in both directories

3. **Netlify config**
   - Verify/create `netlify.toml` with correct build command and publish dir

**Files to create/modify:**
- `.github/workflows/ci.yml`
- `netlify.toml`

---

## Phase 2: Chess Overhaul

**Goal:** Full spec chess with scoring, revival, timers, cross board.

### Tasks

1. **Move validation + highlighting** — refactor `shared/chessLogic.ts`
2. **Check / checkmate detection** — add `isInCheck()`, `isCheckmate()`, broadcast events
3. **Per-player timer** — 3min per player, tick on server, timeout = elimination
4. **Scoring system** — capture = add piece value (pawn=1, knight/bishop=3, rook=5, queen=9)
5. **Revival mechanic** — thresholds: 5pts=minor piece, 10pts=queen, 15pts=extra king
6. **Win condition** — last king(s) standing; tiebreak by score
7. **Cross-shaped board** — 12x12 grid with dead/active cell map; gamemaster toggle
8. **Better piece sprites** — pixel-art PNGs replacing placeholders

**Files:**
- `shared/chessLogic.ts` (rewrite)
- `server/src/rooms/GameRoom.ts` (timer, scoring, elimination)
- `client/src/scenes/GameScene.ts` (highlights, timer UI, revival UI)
- `client/src/assets/chess/` (new sprites)

---

## Phase 3: Lobby System

**Goal:** Room codes, ready system, gamemaster, lobby chat.

### Tasks

1. **Room code system** — 6-char alphanumeric; create/join flow
2. **Waiting room UI** — player list, ready status, crown for gamemaster
3. **Gamemaster role** — transfer crown, settings panel (player count, game mode)
4. **Lobby chat + TTS** — broadcast messages; `SpeechSynthesis` per character voice

**Files:**
- `shared/schema.ts` (lobby state fields)
- `server/src/rooms/LobbyRoom.ts` (new)
- `server/src/index.ts` (register LobbyRoom)
- `client/src/scenes/LobbyScene.ts` (new)
- `client/src/scenes/RoomCodeScene.ts` (new)

---

## Phase 4: Game Pool

**Goal:** 6 additional games (Battleship, 4 Gewinnt, Memory, Pong, Snake, Tetris).

Each game: `server/src/rooms/[Game]Room.ts` + `shared/[game]Logic.ts` + `client/src/scenes/[Game]Scene.ts`

| Game | Key mechanic |
|------|-------------|
| Battleship | 10x10 hidden grid, hit/miss/sink |
| 4 Gewinnt | 7x6 drop pieces, 4-in-a-row |
| Memory (memes) | Flip pairs, most pairs wins |
| Pong 4-dir | 4 paddles, all sides, powerups |
| Snake Duel | Shared grid, last alive wins |
| Tetris Duel | Side-by-side, garbage rows |

---

## Phase 5: Olympiade Wheel System

**Goal:** Spin wheel with chip probability system and arrow-key nudge.

### Tasks

1. **Wheel state** — `wheelFields: { gameId, basePct, fixedPct }[]` in schema
2. **Chip distribution logic** — fixed 1% per chip, variable = (100 - totalFixed) / numFields
3. **Wheel UI** — Phaser pie chart, spin animation with easing, chip placement UI
4. **Nudge mechanic** — arrow keys send `nudgeWheel`; server applies angular delta; animation
5. **Tiebreaker** — RPS determines who gets chips when tied for last

**Files:**
- `server/src/rooms/OlympiadeRoom.ts` (new)
- `client/src/scenes/WheelScene.ts` (new)
- `shared/wheelLogic.ts` (new)

---

## Phase 6: Cheat Mechanic System

**Goal:** Per-game cheat actions with 3s catch window, server-authoritative.

### Tasks

1. **Core cheat framework** — cheat button + C key toggle; server validates; 3s catch window
2. **Catch window** — server timer, broadcast countdown; false accusation = own penalty
3. **Per-game implementations** (see design doc for per-game details)
4. **Spectator visibility** — eliminated players see cheats more prominently

**Files:**
- `server/src/rooms/CheatMixin.ts` (new)
- `client/src/ui/CheatButton.ts` (new)
- `shared/schema.ts` (cheat state fields)
- All game room files (cheat handlers)

---

## Phase 7: Animations (Medium Priority)

- Phaser tweens for piece movement
- Particle emitters for capture/elimination
- Wheel tween with custom easing
- Point gain floating numbers
- Screen flash for check/checkmate

---

## Phase 8: Character Selection + Sounds (Low Priority / Future)

- Character selection scene
- ElevenLabs pre-generated voice lines (when user provides specs)
- Sound manager with per-scene audio pools

---

## Technical Architecture

```
client/src/scenes/
  RoomCodeScene.ts, LobbyScene.ts, GameScene.ts (extend),
  BattleshipScene.ts, Connect4Scene.ts, MemoryScene.ts,
  PongScene.ts, SnakeScene.ts, TetrisScene.ts, WheelScene.ts

server/src/rooms/
  LobbyRoom.ts, GameRoom.ts (extend), BattleshipRoom.ts,
  Connect4Room.ts, MemoryRoom.ts, PongRoom.ts, SnakeRoom.ts,
  TetrisRoom.ts, OlympiadeRoom.ts, CheatMixin.ts

shared/
  chessLogic.ts (rewrite), battleshipLogic.ts, connect4Logic.ts,
  memoryLogic.ts, pongLogic.ts, snakeLogic.ts, tetrisLogic.ts,
  wheelLogic.ts, schema.ts (extend), constants.ts (extend)
```

---

## Test Plan

- Unit tests for all `shared/` game logic files
- Integration tests for Colyseus room state transitions
- E2E: lobby create/join, game start, turn cycle

---

## Deployment

- Server: Railway (auto-deploy via GitHub)
- Client: Netlify (auto-deploy via GitHub)

---

## GSTACK REVIEW REPORT

### CEO Review — Key Findings

| Finding | Severity | Decision |
|---------|----------|----------|
| Lobby must come before game pool (can't test games without room infra) | CRITICAL | Reorder: Auto-deploy → Schema → Lobby → Chess → Games |
| Chess overhaul is too large as single phase; cross-board is risky scope | HIGH | Split: 2a core chess, 2b cross-board variant (defer 2b) |
| Cheat system underscoped — "see design doc" is not a plan | HIGH | Per-game cheat logic added to each game's phase, not separate |
| No persistence/account system decision documented | MEDIUM | Confirmed stateless for now; note for future |
| TTS/voice approach unclear | MEDIUM | Browser SpeechSynthesis fallback in Phase 3; pre-recorded future |

### Eng Review — Key Findings

| Finding | Severity | Decision |
|---------|----------|----------|
| Monolithic GameState won't support lobby + 7 games | CRITICAL | Split into LobbyState, per-game state classes |
| LobbyRoom missing from codebase entirely | CRITICAL | Implement in Phase 2 (before chess) |
| OlympiadeRoom orchestration not architectured | CRITICAL | OlympiadeRoom manages round lifecycle; GameRoom stays chess-only |
| CheatMixin.ts won't work in Colyseus 0.15 (no mixin support) | HIGH | Use CheatValidator utility class (composition) |
| Client re-running game logic causes sync bugs | HIGH | Client reads from Colyseus schema only; server is authoritative |
| Timer cascade race condition (multiple timeouts queuing) | MEDIUM | Token-based cancellation + player validation on advance |
| 12x12 cross board — no data structure defined | MEDIUM | `ACTIVE_CELLS` bitmask in `shared/constants.ts` |
| Wheel physics incomplete (no velocity decay, no nudge handler) | MEDIUM | Add velocity state + decay tick to OlympiadeRoom |
| Test plan is empty | HIGH | Add specific edge cases (timeout, reconnect, concurrent catch) |

### Revised Phase Order

1. **Auto-deploy** (unblocks everything)
2. **Schema redesign** (LobbyState, per-game states — foundation for all phases)
3. **LobbyRoom** (room codes, ready system, gamemaster, chat)
4. **Chess overhaul 2a** (core: move validation, check, timer, scoring, revival, win)
5. **OlympiadeRoom + Wheel** (orchestrator + chip system)
6. **Game pool** (Battleship, 4 Gewinnt, Memory, Pong, Snake, Tetris — each with per-game cheat)
7. **Chess overhaul 2b** (cross-board variant — lower priority)
8. **Animations**
9. **Character selection + sounds**

### Architecture Decisions (auto-decided)

- Schema: Split into `LobbyState` + per-game state classes (P5 — explicit over clever)
- CheatValidator: Utility class, not mixin (P5 — explicit)
- Game logic authority: Server-only; client reads Colyseus schema (P5 — explicit)
- Cross-board: `ACTIVE_CELLS` bitmask in constants (P3 — pragmatic)
- Cheat per-game: Embedded in each game phase, not a separate phase (P4 — DRY)

