import Phaser from "phaser"
import { Room } from "colyseus.js"
import type { GameState, ChessPiece } from "@twinky/shared/schema"
import { CHESS_PIECE_SYMBOLS, CHESS_PLAYER_COLORS, CHESS_CORNERS, CHESS_PAWN_DIRS, CHARACTERS } from "@twinky/shared/constants"
import { getLegalMoves, isInCheck, ChessPieceData } from "@twinky/shared/chessLogic"
import { sendChessMove } from "../network/ColyseusClient"
import { sounds } from "../utils/SoundManager"
import { CheatHUD } from "../utils/CheatHUD"
import { initJuice, type JuiceConfig } from "../juice/index"
import { shake } from "../juice/helpers"
import { climax } from "../juice/climax"

const CELL_SIZE = 56
const BOARD_OFFSET_X = (800 - CELL_SIZE * 8) / 2
const BOARD_OFFSET_Y = (600 - CELL_SIZE * 8) / 2 + 14

export class ChessScene extends Phaser.Scene {
  private room!: Room<GameState>
  private pieceTexts: Map<string, Phaser.GameObjects.Text> = new Map()
  private highlightGraphics!: Phaser.GameObjects.Graphics
  private checkGraphics!: Phaser.GameObjects.Graphics
  private turnText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private checkText!: Phaser.GameObjects.Text
  private scoreTexts: Phaser.GameObjects.Text[] = []
  private selectedPieceId: string | null = null
  private validMovesCache: Array<[number, number]> = []
  private captureMovesCache: Set<string> = new Set()
  private pawnDirs: Record<string, number> = {}
  private playerColors: Record<string, string> = {}
  private stateChangeCallback: ((state: GameState) => void) | null = null
  private prevPositions: Map<string, { x: number; y: number }> = new Map()
  private prevScores: Map<string, number> = new Map()
  private wasInCheck = false
  private juice!: JuiceConfig
  private cheatHUD!: CheatHUD
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

  constructor() {
    super({ key: "ChessScene" })
  }

  init(data: { room: Room<GameState> }) {
    this.room = data.room
    this.prevPositions = new Map()
    this.prevScores = new Map()
    this.wasInCheck = false
    this.pieceTexts = new Map()
    this.scoreTexts = []
  }

  preload() {
    const g = this.make.graphics({ x: 0, y: 0 })
    g.fillStyle(0xffffff)
    g.fillCircle(4, 4, 4)
    g.generateTexture("chess_particle", 8, 8)
    g.destroy()
  }

  create() {
    this.juice = initJuice()
    this.drawBoard()
    this.checkGraphics = this.add.graphics()
    this.highlightGraphics = this.add.graphics()
    this.turnText = this.add.text(400, 8, "", { fontSize: "16px", color: "#ffffff" }).setOrigin(0.5, 0)
    this.timerText = this.add.text(400, 28, "", { fontSize: "13px", color: "#aaaaaa" }).setOrigin(0.5, 0)
    this.checkText = this.add.text(400, 582, "", { fontSize: "16px", color: "#ff4444", fontStyle: "bold" }).setOrigin(0.5, 1)

    this.buildPawnDirs()
    this.computeBoardFlip()
    this.buildPlayerColors()
    this.buildScorePanel()
    this.renderPieces()
    this.updateTurnText()
    this.updateCheckState()

    this.stateChangeCallback = (state: GameState) => {
      if (state.phase === "result") {
        if (this.stateChangeCallback) {
          this.room.onStateChange.remove(this.stateChangeCallback)
          this.stateChangeCallback = null
        }
        const { width, height } = this.scale
        const pieces = this.buildPiecesArray()
        const oppKing = pieces.find(p => p.ownerId !== this.room.sessionId && p.pieceType === "king" && !p.isGhost)
        const kingX = oppKing ? BOARD_OFFSET_X + this.boardCol(oppKing.col) * CELL_SIZE + CELL_SIZE / 2 : width / 2
        const kingY = oppKing ? BOARD_OFFSET_Y + this.boardRow(oppKing.row) * CELL_SIZE + CELL_SIZE / 2 : height / 2
        void climax(this.juice, this, {
          hitstopMs: 80,
          shake: { intensity: 0.009, ms: 240 },
          pop: { x: kingX, y: kingY, color: 0xffdd44, count: 16 },
        }).then(() => {
          this.time.delayedCall(1800, () => {
            this.scene.start("ResultScene", { room: this.room })
          })
        })
        return
      }
      this.renderPieces()
      this.updateTurnText()
      this.updateCheckState()
      this.updateScorePanel()
      this.selectedPieceId = null
      this.validMovesCache = []
      this.captureMovesCache.clear()
      this.highlightGraphics.clear()
    }
    this.room.onStateChange(this.stateChangeCallback)

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.handleBoardClick(pointer.x, pointer.y)
    })

    this.cheatHUD = new CheatHUD(this, this.room, "chess_peek")
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
    const order = [...this.room.state.chess.playerOrder] as string[]
    if (order.length <= 2) {
      // 2P: white (idx 0) advances up (-1), black (idx 1) advances down (+1)
      order.forEach((id, idx) => {
        this.pawnDirs[id] = idx === 0 ? -1 : 1
      })
    } else {
      // 3-4P: use corner order from shared constants
      order.forEach((id, idx) => {
        const corner = CHESS_CORNERS[idx % CHESS_CORNERS.length]!
        this.pawnDirs[id] = CHESS_PAWN_DIRS[corner]
      })
    }
  }

  private buildPlayerColors() {
    const order = [...this.room.state.chess.playerOrder] as string[]
    order.forEach((id, idx) => {
      this.playerColors[id] = (CHESS_PLAYER_COLORS[idx % 4] as string) ?? "#ffffff"
    })
  }

  private buildScorePanel() {
    const order = [...this.room.state.chess.playerOrder] as string[]
    this.scoreTexts = []
    order.forEach((id, idx) => {
      const color = this.playerColors[id] ?? "#ffffff"
      const t = this.add.text(6, 60 + idx * 22, "", { fontSize: "13px", color })
      this.scoreTexts.push(t)
    })
    this.updateScorePanel()
  }

  private updateScorePanel() {
    const order = [...this.room.state.chess.playerOrder] as string[]
    const eliminated = new Set([...this.room.state.chess.eliminatedIds] as string[])
    order.forEach((id, idx) => {
      const t = this.scoreTexts[idx]
      if (!t) return
      const player = this.room.state.players.get(id)
      const name = player?.name ?? "?"
      const score = player?.score ?? 0
      const prev = this.prevScores.get(id)
      if (prev !== undefined && score > prev) {
        this.spawnFloatingScore(t.x + 80, t.y, score - prev)
      }
      this.prevScores.set(id, score)
      const elim = eliminated.has(id) ? " ✗" : ""
      t.setText(`${name}: ${score}${elim}`)
    })
  }

  private getPieceSymbol(piece: ChessPiece): string {
    if (piece.pieceType === "king") {
      const player = this.room.state.players.get(piece.ownerId)
      if (player?.characterId) {
        const ch = CHARACTERS.find(c => c.id === player.characterId)
        if (ch) return ch.symbol
      }
    }
    return CHESS_PIECE_SYMBOLS[piece.pieceType] ?? "?"
  }

  private renderPieces() {
    const currentIds = new Set<string>()
    this.room.state.chess.pieces.forEach((piece: ChessPiece, id: string) => {
      currentIds.add(id)
      const x = BOARD_OFFSET_X + this.boardCol(piece.col) * CELL_SIZE + CELL_SIZE / 2
      const y = BOARD_OFFSET_Y + this.boardRow(piece.row) * CELL_SIZE + CELL_SIZE / 2
      const symbol = this.getPieceSymbol(piece)
      const color = this.playerColors[piece.ownerId] ?? "#ffffff"

      let text = this.pieceTexts.get(id)
      if (!text) {
        text = this.add.text(x, y, symbol, { fontSize: "28px", color }).setOrigin(0.5)
        this.pieceTexts.set(id, text)
      } else {
        const prev = this.prevPositions.get(id)
        if (prev && (prev.x !== x || prev.y !== y)) {
          sounds.pieceMove()
          this.tweens.add({ targets: text, x, y, duration: 180, ease: "Cubic.easeOut" })
        } else {
          text.setPosition(x, y)
        }
        text.setText(symbol)
        text.setStyle({ color })
      }
      text.setAlpha(piece.isGhost ? 0.3 : 1)
      this.prevPositions.set(id, { x, y })
    })

    for (const [id, text] of this.pieceTexts.entries()) {
      if (!currentIds.has(id)) {
        sounds.pieceCapture()
        this.emitCaptureParticles(text.x, text.y)
        text.destroy()
        this.pieceTexts.delete(id)
        this.prevPositions.delete(id)
      }
    }
  }

  private emitCaptureParticles(x: number, y: number) {
    const emitter = this.add.particles(x, y, "chess_particle", {
      speed: { min: 50, max: 130 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 420,
      quantity: 12,
      tint: 0xffdd88,
      stopAfter: 12,
    })
    this.time.delayedCall(500, () => emitter.destroy())
  }

  private updateCheckState() {
    this.checkGraphics.clear()
    const myId = this.room.sessionId
    const pieces = this.buildPiecesArray()
    const inCheck = isInCheck(pieces, myId, this.pawnDirs)

    if (inCheck) {
      if (!this.wasInCheck) {
        sounds.check()
        this.flashScreen(0xff0000, 0.35)
        shake(this.juice, this, 0.005, 160)
      }
      this.checkText.setText("CHECK!")
      const king = pieces.find(p => p.ownerId === myId && p.pieceType === "king" && !p.isGhost)
      if (king) {
        const x = BOARD_OFFSET_X + this.boardCol(king.col) * CELL_SIZE
        const y = BOARD_OFFSET_Y + this.boardRow(king.row) * CELL_SIZE
        this.checkGraphics.fillStyle(0xff2222, 0.45)
        this.checkGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
      }
    } else {
      this.checkText.setText("")
    }
    this.wasInCheck = inCheck
  }

  private flashScreen(color: number, maxAlpha: number) {
    const { width, height } = this.scale
    const flash = this.add.graphics()
    flash.fillStyle(color, maxAlpha)
    flash.fillRect(0, 0, width, height)
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 400,
      ease: "Cubic.easeOut",
      onComplete: () => flash.destroy(),
    })
  }

  private spawnFloatingScore(x: number, y: number, delta: number) {
    const text = this.add
      .text(x, y, `+${delta}`, { fontSize: "14px", color: "#ffff44", fontStyle: "bold" })
      .setOrigin(0, 0.5)
    this.tweens.add({
      targets: text,
      y: y - 32,
      alpha: 0,
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    })
  }

  private handleBoardClick(sx: number, sy: number) {
    const displayCol = Math.floor((sx - BOARD_OFFSET_X) / CELL_SIZE)
    const displayRow = Math.floor((sy - BOARD_OFFSET_Y) / CELL_SIZE)
    if (displayRow < 0 || displayRow > 7 || displayCol < 0 || displayCol > 7) return
    const col = this.boardFlipped ? 7 - displayCol : displayCol
    const row = this.boardFlipped ? 7 - displayRow : displayRow

    const myId = this.room.sessionId
    if (this.room.state.chess.turnPlayerId !== myId) return

    const isValidDest = this.validMovesCache.some(([r, c]) => r === row && c === col)
    if (isValidDest && this.selectedPieceId) {
      const src = this.getPieceDataById(this.selectedPieceId)
      if (src) {
        sendChessMove(src.row, src.col, row, col)
        this.selectedPieceId = null
        this.validMovesCache = []
        this.captureMovesCache.clear()
        this.highlightGraphics.clear()
      }
      return
    }

    const clicked = this.getPieceAtCell(row, col)
    if (clicked && clicked.ownerId === myId && !clicked.isGhost) {
      this.selectedPieceId = clicked.id
      const piecesArray = this.buildPiecesArray()
      this.validMovesCache = getLegalMoves(clicked.id, piecesArray, this.pawnDirs)
      this.captureMovesCache.clear()
      for (const [r, c] of this.validMovesCache) {
        const dest = this.getPieceAtCell(r, c)
        if (dest && dest.ownerId !== myId) this.captureMovesCache.add(`${r},${c}`)
      }
      this.drawHighlights()
    } else {
      this.selectedPieceId = null
      this.validMovesCache = []
      this.captureMovesCache.clear()
      this.highlightGraphics.clear()
    }
  }

  private getPieceAtCell(row: number, col: number): ChessPiece | null {
    let found: ChessPiece | null = null
    this.room.state.chess.pieces.forEach((p: ChessPiece) => {
      if (p.row === row && p.col === col && !p.isGhost) found = p
    })
    return found
  }

  private getPieceDataById(id: string): ChessPiece | null {
    return this.room.state.chess.pieces.get(id) ?? null
  }

  private buildPiecesArray(): ChessPieceData[] {
    const arr: ChessPieceData[] = []
    this.room.state.chess.pieces.forEach((p: ChessPiece, id: string) => {
      arr.push({ id, pieceType: p.pieceType, ownerId: p.ownerId, row: p.row, col: p.col, isGhost: p.isGhost })
    })
    return arr
  }

  private drawHighlights() {
    this.highlightGraphics.clear()
    for (const [r, c] of this.validMovesCache) {
      const x = BOARD_OFFSET_X + this.boardCol(c) * CELL_SIZE
      const y = BOARD_OFFSET_Y + this.boardRow(r) * CELL_SIZE
      if (this.captureMovesCache.has(`${r},${c}`)) {
        this.highlightGraphics.fillStyle(0xff6644, 0.5)
      } else {
        this.highlightGraphics.fillStyle(0xffff00, 0.35)
      }
      this.highlightGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
    }
    if (this.selectedPieceId) {
      const src = this.getPieceDataById(this.selectedPieceId)
      if (src) {
        const x = BOARD_OFFSET_X + this.boardCol(src.col) * CELL_SIZE
        const y = BOARD_OFFSET_Y + this.boardRow(src.row) * CELL_SIZE
        this.highlightGraphics.fillStyle(0xffff00, 0.55)
        this.highlightGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
      }
    }
  }

  private updateTurnText() {
    const turnId = this.room.state.chess.turnPlayerId
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
    const remaining = Math.max(0, this.room.state.chess.turnDeadline - Date.now())
    const secs = Math.ceil(remaining / 1000)
    const urgent = secs <= 10 && this.room.state.chess.turnPlayerId === this.room.sessionId
    this.timerText.setText(`${secs}s`).setStyle({ color: urgent ? "#ff4444" : "#888888" })
    this.cheatHUD?.update()
  }

  shutdown() {
    if (this.stateChangeCallback) {
      this.room.onStateChange.remove(this.stateChangeCallback)
      this.stateChangeCallback = null
    }
    this.cheatHUD?.destroy()
  }
}
