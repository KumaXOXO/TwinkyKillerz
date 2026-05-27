import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { CONNECT4_COLS, CONNECT4_ROWS, CHESS_PLAYER_COLORS } from "@twinky/shared/constants"
import { sendConnect4Drop } from "../network/ColyseusClient"
import { sounds } from "../utils/SoundManager"
import { CheatHUD } from "../utils/CheatHUD"

const CELL = 60
const GRID_X = (800 - CONNECT4_COLS * CELL) / 2
const GRID_Y = (600 - CONNECT4_ROWS * CELL) / 2 - 20

const C = {
  text: "#e8d5ff",
  muted: "#7070a0",
  empty: 0x1a1a2e,
  border: 0x4422aa,
}

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
    const { width, height } = this.scale

    this.add
      .text(width / 2, 24, "CONNECT 4", { fontSize: "22px", color: C.text, fontStyle: "bold" })
      .setOrigin(0.5)

    const playerIds = [...this.room.state.connect4.playerOrder].filter((id): id is string => !!id)
    playerIds.forEach((id, i) => {
      const raw = CHESS_PLAYER_COLORS[i % CHESS_PLAYER_COLORS.length] ?? "#ffffff"
      this.playerColors[id] = parseInt(raw.replace("#", ""), 16)
    })

    // Color legend
    let legendX = GRID_X
    playerIds.forEach((id, i) => {
      const name = this.room.state.players.get(id)?.name ?? "?"
      const color = CHESS_PLAYER_COLORS[i % CHESS_PLAYER_COLORS.length] ?? "#ffffff"
      this.add.text(legendX, height - 16, `● ${name}`, { fontSize: "12px", color }).setOrigin(0, 1)
      legendX += 110
    })

    this.drawBoard()

    this.statusText = this.add
      .text(width / 2, height - 56, "", { fontSize: "16px", color: C.text })
      .setOrigin(0.5)

    this.timerText = this.add
      .text(width / 2, height - 36, "", { fontSize: "13px", color: C.muted })
      .setOrigin(0.5)

    // Column numbers above grid
    for (let c = 0; c < CONNECT4_COLS; c++) {
      const x = GRID_X + c * CELL + CELL / 2
      const t = this.add
        .text(x, GRID_Y - 20, `${c + 1}`, { fontSize: "13px", color: C.muted })
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
        sounds.roundWin()
        this.time.delayedCall(2500, () => {
          this.scene.start("ResultScene", { room: this.room })
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
    this.timerText?.setText(`${remaining}s`)
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
    bg.fillStyle(C.border)
    bg.fillRect(GRID_X - 6, GRID_Y - 6, CONNECT4_COLS * CELL + 12, CONNECT4_ROWS * CELL + 12)

    for (let r = 0; r < CONNECT4_ROWS; r++) {
      for (let c = 0; c < CONNECT4_COLS; c++) {
        const g = this.add.graphics()
        g.fillStyle(C.empty)
        g.fillCircle(GRID_X + c * CELL + CELL / 2, GRID_Y + r * CELL + CELL / 2, CELL / 2 - 4)
        this.cellGraphics.push(g)
      }
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
        g.clear()
        const color = cell ? (this.playerColors[cell] ?? 0x888888) : C.empty
        g.fillStyle(color)
        g.fillCircle(GRID_X + c * CELL + CELL / 2, GRID_Y + r * CELL + CELL / 2, CELL / 2 - 4)
        if (cell && !prev) this.animateDrop(c, r, color)
      }
    }
    this.prevBoard = [...board].map(c => c ?? "")
  }

  private animateDrop(col: number, targetRow: number, color: number) {
    const startY = GRID_Y + CELL / 2
    const endY = GRID_Y + targetRow * CELL + CELL / 2
    const cx = GRID_X + col * CELL + CELL / 2
    const r = CELL / 2 - 4

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
      onComplete: () => g.destroy(),
    })
  }

  private updateStatus() {
    const state = this.room.state
    if (state.phase === "result") {
      const winnerId = state.connect4.winnerId
      const name = winnerId ? (state.players.get(winnerId)?.name ?? "?") : null
      this.statusText?.setText(name ? `${name} wins!` : "Draw!")
      this.colHints.forEach(t => t.setColor(C.muted))
      return
    }
    const turnId = state.connect4.turnPlayerId
    const isMyTurn = turnId === this.room.sessionId
    const name = state.players.get(turnId)?.name ?? "?"
    this.statusText?.setText(isMyTurn ? "Your turn! Press 1-7 to drop" : `${name}'s turn`)
    this.colHints.forEach(t => t.setColor(isMyTurn ? C.text : C.muted))
  }
}
