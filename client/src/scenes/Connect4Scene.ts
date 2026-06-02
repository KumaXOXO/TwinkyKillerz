import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { CONNECT4_COLS, CONNECT4_ROWS, CHESS_PLAYER_COLORS } from "@twinky/shared/constants"
import { sendConnect4Drop } from "../network/ColyseusClient"
import { sounds } from "../utils/SoundManager"
import { CheatHUD } from "../utils/CheatHUD"
import { initJuice, type JuiceConfig } from "../juice/index"
import { punch } from "../juice/helpers"
import { climax } from "../juice/climax"
import { THEME, toHex } from "../utils/Theme"
import { UIFactory } from "../utils/UIFactory"

const CELL = 60
const GRID_X = (800 - CONNECT4_COLS * CELL) / 2
const GRID_Y = (600 - CONNECT4_ROWS * CELL) / 2 - 20

export class Connect4Scene extends Phaser.Scene {
  private room!: Room<GameState>
  private stateChangeCallback: ((state: GameState) => void) | null = null
  private cellGraphics: Phaser.GameObjects.Graphics[] = []
  private statusText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private colHints: Phaser.GameObjects.Text[] = []
  private playerColors: Record<string, number> = {}
  private prevBoard: string[] = []
  private cheatHUD!: CheatHUD
  private juice!: JuiceConfig

  constructor() {
    super({ key: "Connect4Scene" })
  }

  init(data: { room: Room<GameState> }) {
    this.room = data.room
    this.playerColors = {}
    this.cellGraphics = []
    this.colHints = []
    this.prevBoard = []
  }

  create() {
    this.juice = initJuice()
    const { width, height } = this.scale

    this.cameras.main.setPostPipeline('CRTPipeline')

    UIFactory.createHeader(this, width / 2, 40, "CONNECT 4")

    const playerIds = [...this.room.state.connect4.playerOrder].filter((id): id is string => !!id)
    playerIds.forEach((id, i) => {
      const raw = i === 0 ? THEME.colors.primary : THEME.colors.secondary
      this.playerColors[id] = toHex(raw)
    })

    // Color legend
    let legendX = GRID_X
    playerIds.forEach((id, i) => {
      const name = this.room.state.players.get(id)?.name ?? "?"
      const color = i === 0 ? THEME.colors.primary : THEME.colors.secondary
      this.add.text(legendX, height - 16, `● ${name.toUpperCase()}`, {
        fontFamily: THEME.fonts.body,
        fontSize: "14px",
        color
      }).setOrigin(0, 1)
      legendX += 140
    })

    this.drawBoard()

    this.statusText = this.add
      .text(width / 2, height - 56, "", {
        fontFamily: THEME.fonts.body,
        fontSize: "18px",
        color: THEME.colors.white
      })
      .setOrigin(0.5)

    this.timerText = this.add
      .text(width / 2, height - 36, "", {
        fontFamily: THEME.fonts.body,
        fontSize: "14px",
        color: THEME.colors.muted
      })
      .setOrigin(0.5)

    // Column numbers above grid
    for (let c = 0; c < CONNECT4_COLS; c++) {
      const x = GRID_X + c * CELL + CELL / 2
      const t = this.add
        .text(x, GRID_Y - 20, `${c + 1}`, {
          fontFamily: THEME.fonts.header,
          fontSize: "12px",
          color: THEME.colors.muted
        })
        .setOrigin(0.5)
      this.colHints.push(t)
    }

    // Keys 1-7 drop into columns 0-6
    for (let c = 0; c < CONNECT4_COLS; c++) {
      const col = c
      this.input.keyboard!.on(`keydown-${c + 1}`, () => {
        if (this.room.state.connect4.turnPlayerId === this.room.sessionId) {
          sendConnect4Drop(col)
        }
      })
    }

    this.drawPieces()
    this.updateStatus()
    this.cheatHUD = new CheatHUD(this, this.room, "connect4_peek")

    this.stateChangeCallback = (state) => {
      this.drawPieces()
      this.updateStatus()
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
          hitstopMs: 100,
          shake: { intensity: 0.01, ms: 250 },
          pop: { x: boardCenterX, y: boardCenterY, color: winColor, count: 20 },
        }).then(() => {
          this.time.delayedCall(1800, () => {
            this.scene.start("ResultScene", { room: this.room })
          })
        })
      }
    }
    this.room.onStateChange(this.stateChangeCallback)
  }

  update() {
    if (this.room.state.phase !== "minigame") return
    const remaining = Math.max(
      0,
      Math.ceil((this.room.state.connect4.turnDeadline - Date.now()) / 1000),
    )
    this.timerText?.setText(`TERMINAL LOCK: ${remaining}S`)
    this.cheatHUD?.update()
  }

  shutdown() {
    if (this.stateChangeCallback) {
      this.room.onStateChange.remove(this.stateChangeCallback)
      this.stateChangeCallback = null
    }
    for (let c = 0; c < CONNECT4_COLS; c++) {
      this.input.keyboard?.removeAllListeners(`keydown-${c + 1}`)
    }
    this.cheatHUD?.destroy()
  }

  private drawBoard() {
    const bg = this.add.graphics()
    bg.fillStyle(toHex(THEME.colors.border))
    bg.fillRoundedRect(GRID_X - 10, GRID_Y - 10, CONNECT4_COLS * CELL + 20, CONNECT4_ROWS * CELL + 20, 8)
    bg.lineStyle(4, toHex(THEME.colors.secondary))
    bg.strokeRoundedRect(GRID_X - 10, GRID_Y - 10, CONNECT4_COLS * CELL + 20, CONNECT4_ROWS * CELL + 20, 8)

    for (let r = 0; r < CONNECT4_ROWS; r++) {
      for (let c = 0; c < CONNECT4_COLS; c++) {
        const g = this.add.graphics()
        g.fillStyle(toHex(THEME.colors.bg))
        const x = GRID_X + c * CELL + CELL / 2
        const y = GRID_Y + r * CELL + CELL / 2
        g.fillCircle(x, y, CELL / 2 - 6)
        // Inner detail ring
        g.lineStyle(1, toHex(THEME.colors.border), 0.3)
        g.strokeCircle(x, y, CELL / 2 - 10)
        this.cellGraphics.push(g)
      }
    }

    // Interactive column zones
    for (let c = 0; c < CONNECT4_COLS; c++) {
      const zoneX = GRID_X + c * CELL + CELL / 2
      const zoneY = GRID_Y + (CONNECT4_ROWS * CELL) / 2
      const zone = this.add
        .rectangle(zoneX, zoneY, CELL, CONNECT4_ROWS * CELL, 0x000000, 0)
        .setInteractive({ useHandCursor: true })
      zone.on("pointerover", () => {
        if (this.room.state.connect4.turnPlayerId === this.room.sessionId) {
          this.colHints[c]?.setColor(THEME.colors.primary)
        }
      })
      zone.on("pointerout", () => this.colHints[c]?.setColor(THEME.colors.muted))
      zone.on("pointerdown", () => {
        if (this.room.state.connect4.turnPlayerId === this.room.sessionId) {
          sendConnect4Drop(c)
        }
      })
    }
  }

  private drawPieces() {
    const board = this.room.state.connect4.board
    for (let r = 0; r < CONNECT4_ROWS; r++) {
      for (let c = 0; c < CONNECT4_COLS; c++) {
        const idx = r * CONNECT4_COLS + c
        const cell = board[idx] ?? ""
        const prev = this.prevBoard[idx] ?? ""
        const g = this.cellGraphics[idx]
        if (!g) continue

        if (cell && !prev) {
          const color = this.playerColors[cell] ?? 0x888888
          this.animateDrop(c, r, color)
        } else if (cell) {
          const color = this.playerColors[cell] ?? 0x888888
          g.clear()
          g.fillStyle(color)
          g.fillCircle(GRID_X + c * CELL + CELL / 2, GRID_Y + r * CELL + CELL / 2, CELL / 2 - 6)
          // Glossy top shine
          g.fillStyle(0xffffff, 0.2)
          g.fillCircle(GRID_X + c * CELL + CELL / 2 - 6, GRID_Y + r * CELL + CELL / 2 - 6, 8)
        }
      }
    }
    this.prevBoard = [...board].map(c => c ?? "")
  }

  private animateDrop(col: number, targetRow: number, color: number) {
    const startY = GRID_Y - CELL
    const endY = GRID_Y + targetRow * CELL + CELL / 2
    const cx = GRID_X + col * CELL + CELL / 2
    const radius = CELL / 2 - 6
    const idx = targetRow * CONNECT4_COLS + col

    sounds.connect4Drop()
    const g = this.add.graphics()
    g.fillStyle(color)
    g.fillCircle(cx, 0, radius)
    // Shine detail
    g.fillStyle(0xffffff, 0.2)
    g.fillCircle(cx - 6, -6, 8)

    g.setPosition(0, startY)
    g.setDepth(10)

    this.tweens.add({
      targets: g,
      y: endY,
      duration: 150 + targetRow * 40,
      ease: "Bounce.easeOut",
      onComplete: () => {
        g.destroy()
        sounds.connect4Thunk(targetRow * 8)
        const cell = this.cellGraphics[idx]
        if (cell?.active) {
          punch(this.juice, cell, 1.2, 120)
          // Impact particles
          this.emitImpactParticles(cx, endY, color)
        }
      },
    })
  }

  private emitImpactParticles(x: number, y: number, color: number) {
    const emitter = this.add.particles(x, y, "chess_particle", {
      speed: { min: 40, max: 100 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 300,
      quantity: 8,
      tint: color,
      stopAfter: 8,
    })
    this.time.delayedCall(400, () => emitter.destroy())
  }

  private updateStatus() {
    const state = this.room.state
    if (state.phase === "result") {
      const winnerId = state.connect4.winnerId
      const name = winnerId ? (state.players.get(winnerId)?.name ?? "?") : null
      this.statusText?.setText(name ? `${name.toUpperCase()} DOMINATES` : "DRAW DETECTED")
      this.colHints.forEach(t => t.setColor(THEME.colors.muted))
      return
    }
    const turnId = state.connect4.turnPlayerId
    const isMyTurn = turnId === this.room.sessionId
    const name = state.players.get(turnId)?.name ?? "?"
    this.statusText?.setText(isMyTurn ? "INPUT REQUIRED [1-7]" : `WAITING FOR ${name.toUpperCase()}`)
    this.colHints.forEach(t => t.setColor(isMyTurn ? THEME.colors.primary : THEME.colors.muted))
  }
}
