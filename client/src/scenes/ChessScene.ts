import Phaser from "phaser"
import { Room } from "colyseus.js"
import type { GameState, ChessPiece } from "@twinky/shared/schema"
import { CHESS_PIECE_SYMBOLS, CHESS_PLAYER_COLORS } from "@twinky/shared/constants"
import { getValidMoves, ChessPieceData } from "@twinky/shared/chessLogic"
import { sendChessMove } from "../network/ColyseusClient"

const CELL_SIZE = 56
const BOARD_OFFSET_X = (800 - CELL_SIZE * 8) / 2
const BOARD_OFFSET_Y = (600 - CELL_SIZE * 8) / 2

export class ChessScene extends Phaser.Scene {
  private room!: Room<GameState>
  private pieceTexts: Map<string, Phaser.GameObjects.Text> = new Map()
  private highlightGraphics!: Phaser.GameObjects.Graphics
  private turnText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private selectedPieceId: string | null = null
  private validMovesCache: Array<[number, number]> = []
  private pawnDirs: Record<string, number> = {}
  private playerColors: Record<string, string> = {}
  private stateChangeCallback: ((state: GameState) => void) | null = null

  constructor() {
    super({ key: "ChessScene" })
  }

  init(data: { room: Room<GameState> }) {
    this.room = data.room
  }

  create() {
    this.drawBoard()
    this.highlightGraphics = this.add.graphics()
    this.turnText = this.add.text(400, 12, "", { fontSize: "18px", color: "#ffffff" }).setOrigin(0.5, 0)
    this.timerText = this.add.text(400, 36, "", { fontSize: "14px", color: "#aaaaaa" }).setOrigin(0.5, 0)

    this.buildPawnDirs()
    this.buildPlayerColors()
    this.renderPieces()
    this.updateTurnText()

    this.stateChangeCallback = (state: GameState) => {
      if (state.phase === "result") {
        this.scene.start("ResultScene", { room: this.room })
        return
      }
      this.renderPieces()
      this.updateTurnText()
      this.selectedPieceId = null
      this.validMovesCache = []
      this.highlightGraphics.clear()
    }
    this.room.onStateChange(this.stateChangeCallback)

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.handleBoardClick(pointer.x, pointer.y)
    })
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
    const order = [...this.room.state.chessPlayerOrder] as string[]
    const cornerDirs: number[] = [-1, -1, 1, 1]
    order.forEach((id, idx) => {
      this.pawnDirs[id] = cornerDirs[idx % 4] ?? -1
    })
  }

  private buildPlayerColors() {
    const order = [...this.room.state.chessPlayerOrder] as string[]
    order.forEach((id, idx) => {
      this.playerColors[id] = (CHESS_PLAYER_COLORS[idx % 4] as string) ?? "#ffffff"
    })
  }

  private renderPieces() {
    const currentIds = new Set<string>()
    this.room.state.chessPieces.forEach((piece: ChessPiece, id: string) => {
      currentIds.add(id)
      const x = BOARD_OFFSET_X + piece.col * CELL_SIZE + CELL_SIZE / 2
      const y = BOARD_OFFSET_Y + piece.row * CELL_SIZE + CELL_SIZE / 2
      const symbol = CHESS_PIECE_SYMBOLS[piece.pieceType] ?? "?"
      const color = this.playerColors[piece.ownerId] ?? "#ffffff"

      let text = this.pieceTexts.get(id)
      if (!text) {
        text = this.add.text(x, y, symbol, { fontSize: "28px", color }).setOrigin(0.5)
        this.pieceTexts.set(id, text)
      } else {
        text.setPosition(x, y)
        text.setStyle({ color })
      }
      text.setAlpha(piece.isGhost ? 0.3 : 1)
    })

    for (const [id, text] of this.pieceTexts.entries()) {
      if (!currentIds.has(id)) {
        text.destroy()
        this.pieceTexts.delete(id)
      }
    }
  }

  private handleBoardClick(sx: number, sy: number) {
    const col = Math.floor((sx - BOARD_OFFSET_X) / CELL_SIZE)
    const row = Math.floor((sy - BOARD_OFFSET_Y) / CELL_SIZE)
    if (row < 0 || row > 7 || col < 0 || col > 7) return

    const myId = this.room.sessionId
    if (this.room.state.chessTurnPlayerId !== myId) return

    const isValidDest = this.validMovesCache.some(([r, c]) => r === row && c === col)
    if (isValidDest && this.selectedPieceId) {
      const src = this.getPieceDataById(this.selectedPieceId)
      if (src) {
        sendChessMove(src.row, src.col, row, col)
        this.selectedPieceId = null
        this.validMovesCache = []
        this.highlightGraphics.clear()
      }
      return
    }

    const clicked = this.getPieceAtCell(row, col)
    if (clicked && clicked.ownerId === myId && !clicked.isGhost) {
      this.selectedPieceId = clicked.id
      const piecesArray = this.buildPiecesArray()
      this.validMovesCache = getValidMoves(clicked.id, piecesArray, this.pawnDirs)
      this.drawHighlights()
    } else {
      this.selectedPieceId = null
      this.validMovesCache = []
      this.highlightGraphics.clear()
    }
  }

  private getPieceAtCell(row: number, col: number): ChessPiece | null {
    let found: ChessPiece | null = null
    this.room.state.chessPieces.forEach((p: ChessPiece) => {
      if (p.row === row && p.col === col) found = p
    })
    return found
  }

  private getPieceDataById(id: string): ChessPiece | null {
    return this.room.state.chessPieces.get(id) ?? null
  }

  private buildPiecesArray(): ChessPieceData[] {
    const arr: ChessPieceData[] = []
    this.room.state.chessPieces.forEach((p: ChessPiece, id: string) => {
      arr.push({ id, pieceType: p.pieceType, ownerId: p.ownerId, row: p.row, col: p.col, isGhost: p.isGhost })
    })
    return arr
  }

  private drawHighlights() {
    this.highlightGraphics.clear()
    this.highlightGraphics.fillStyle(0xffff00, 0.35)
    for (const [r, c] of this.validMovesCache) {
      const x = BOARD_OFFSET_X + c * CELL_SIZE
      const y = BOARD_OFFSET_Y + r * CELL_SIZE
      this.highlightGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
    }
  }

  private updateTurnText() {
    const turnId = this.room.state.chessTurnPlayerId
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
    const remaining = Math.max(0, this.room.state.chessTurnDeadline - Date.now())
    this.timerText.setText(`${Math.ceil(remaining / 1000)}s`)
  }

  shutdown() {
    if (this.stateChangeCallback) {
      this.room.onStateChange.remove(this.stateChangeCallback)
      this.stateChangeCallback = null
    }
  }
}
