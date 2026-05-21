import { Room, Client } from "@colyseus/core"
import { GameState, PlayerState, CheatEvent, ChessPiece } from "../../../shared/schema"
import {
  CHEAT_WINDOW_MS,
  MAX_ROUNDS,
  SCORE_CHEAT_CAUGHT,
  SCORE_CHEAT_SUCCESS,
  MINIGAMES,
  WHEEL_MIN_VELOCITY,
  WHEEL_MAX_VELOCITY,
  WHEEL_BASE_DECEL,
  CHESS_CORNERS,
  CHESS_PAWN_DIRS,
  CHESS_TURN_MS,
} from "../../../shared/constants"
import { buildInitialBoard, getValidMoves, applyMove, ChessPieceData } from "../../../shared/chessLogic"

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
  private pendingCheatTypes = new Map<string, string>()
  private wheelSpinStartTime = 0
  private chessPiecesData: ChessPieceData[] = []
  private chessPawnDirs: Record<string, number> = {}
  private chessTurnToken = 0

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
    this.onMessage("chess_move", (client, msg: { fromRow: number; fromCol: number; toRow: number; toCol: number }) =>
      this.handleChessMove(client, msg)
    )
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

  private handlePlayerReady(client: Client, _msg: unknown) {
    this.readyPlayers.add(client.sessionId)
    const connectedIds = [...this.state.players.values()]
      .filter((p) => p.isConnected)
      .map((p) => p.id)
    const allReady =
      connectedIds.length >= 2 && connectedIds.every((id) => this.readyPlayers.has(id))
    if (allReady) {
      this.readyPlayers.clear()
      this.startNewRound()
    }
  }

  private handleCheatAttempt(client: Client, msg: CheatAttemptMsg) {
    const player = this.state.players.get(client.sessionId)
    if (!player || player.isCheating) return
    player.isCheating = true
    player.cheatStartTimestamp = Date.now()
    this.pendingCheatTypes.set(client.sessionId, msg.cheatType)

    this.clock.setTimeout(() => {
      if (player.isCheating) {
        const cheatType = this.pendingCheatTypes.get(client.sessionId) ?? ""
        this.resolveCheat(client.sessionId, false, cheatType)
      }
    }, CHEAT_WINDOW_MS)
  }

  private handleCatchCheat(client: Client, msg: CatchCheatMsg) {
    const target = this.state.players.get(msg.targetId)
    if (!target || !target.isCheating) return
    if (Date.now() - target.cheatStartTimestamp > CHEAT_WINDOW_MS) return
    const cheatType = this.pendingCheatTypes.get(msg.targetId) ?? ""
    this.resolveCheat(msg.targetId, true, cheatType)
    this.broadcast("cheat_caught", { catcherId: client.sessionId, targetId: msg.targetId })
  }

  private startNewRound() {
    this.state.currentRound++
    if (this.state.currentRound > MAX_ROUNDS) {
      this.state.phase = "gameover"
      return
    }
    this.state.phase = "wheel"
    this.state.wheelVelocity =
      WHEEL_MIN_VELOCITY + Math.random() * (WHEEL_MAX_VELOCITY - WHEEL_MIN_VELOCITY)
    this.wheelSpinStartTime = Date.now()
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
    const minSpinMs = (this.state.wheelVelocity / WHEEL_BASE_DECEL) * 1000
    if (Date.now() - this.wheelSpinStartTime < minSpinMs) return
    this.state.phase = "minigame"
    if (this.state.currentMinigame === "chess") {
      this.startChessRound()
    }
  }

  private resolveCheat(playerId: string, caught: boolean, cheatType: string) {
    const player = this.state.players.get(playerId)
    if (!player) return
    const startTimestamp = player.cheatStartTimestamp
    player.isCheating = false
    player.cheatStartTimestamp = 0

    const event = new CheatEvent()
    event.playerId = playerId
    event.caught = caught
    event.cheatType = cheatType
    event.startTimestamp = startTimestamp
    this.state.cheatLog.push(event)
    this.pendingCheatTypes.delete(playerId)

    if (caught) {
      player.score = Math.max(0, player.score + SCORE_CHEAT_CAUGHT)
    } else {
      player.score += SCORE_CHEAT_SUCCESS
      this.broadcast("cheat_succeeded", { playerId })
    }
  }

  private startChessRound() {
    const playerIds = [...this.state.players.keys()]
    this.chessPiecesData = buildInitialBoard(playerIds)

    this.chessPawnDirs = {}
    playerIds.forEach((id, idx) => {
      const corner = CHESS_CORNERS[idx % 4]
      this.chessPawnDirs[id] = CHESS_PAWN_DIRS[corner]
    })

    this.state.chessPlayerOrder.clear()
    playerIds.forEach(id => this.state.chessPlayerOrder.push(id))

    this.state.chessEliminatedIds.clear()

    this.syncChessBoard()

    this.advanceChessTurn(playerIds[0])
  }

  private syncChessBoard() {
    for (const id of [...this.state.chessPieces.keys()]) {
      if (!this.chessPiecesData.find(p => p.id === id)) {
        this.state.chessPieces.delete(id)
      }
    }
    for (const data of this.chessPiecesData) {
      let piece = this.state.chessPieces.get(data.id)
      if (!piece) {
        piece = new ChessPiece()
        this.state.chessPieces.set(data.id, piece)
      }
      piece.id = data.id
      piece.pieceType = data.pieceType
      piece.ownerId = data.ownerId
      piece.row = data.row
      piece.col = data.col
      piece.isGhost = data.isGhost
    }
  }

  private advanceChessTurn(playerId: string) {
    this.state.chessTurnPlayerId = playerId
    this.state.chessTurnDeadline = Date.now() + CHESS_TURN_MS
    this.scheduleTurnTimeout(++this.chessTurnToken, playerId)
  }

  private scheduleTurnTimeout(token: number, playerId: string) {
    this.clock.setTimeout(() => {
      if (token !== this.chessTurnToken) return
      if (this.state.phase !== "minigame") return
      this.advanceToNextPlayer(playerId)
    }, CHESS_TURN_MS)
  }

  private advanceToNextPlayer(currentPlayerId: string) {
    const active = this.getActiveChessPlayers()
    if (active.length === 0) return
    const idx = active.indexOf(currentPlayerId)
    const next = active[(idx + 1) % active.length]
    this.advanceChessTurn(next)
  }

  private handleChessMove(
    client: Client,
    msg: { fromRow: number; fromCol: number; toRow: number; toCol: number }
  ) {
    if (this.state.phase !== "minigame") return
    if (client.sessionId !== this.state.chessTurnPlayerId) return

    const movingPiece = this.chessPiecesData.find(
      p => p.row === msg.fromRow && p.col === msg.fromCol && p.ownerId === client.sessionId
    )
    if (!movingPiece) return

    const validMoves = getValidMoves(movingPiece.id, this.chessPiecesData, this.chessPawnDirs)
    const isValid = validMoves.some(([r, c]) => r === msg.toRow && c === msg.toCol)
    if (!isValid) return

    const { pieces: updated, captured } = applyMove(
      this.chessPiecesData,
      msg.fromRow, msg.fromCol, msg.toRow, msg.toCol
    )
    this.chessPiecesData = updated
    this.syncChessBoard()

    if (captured && captured.pieceType === "king") {
      this.eliminatePlayer(captured.ownerId)
    }

    if (this.checkChessWin()) return

    this.advanceToNextPlayer(client.sessionId)
  }

  private eliminatePlayer(playerId: string) {
    this.chessPiecesData = this.chessPiecesData.map(p =>
      p.ownerId === playerId ? { ...p, isGhost: true } : p
    )
    this.state.chessEliminatedIds.push(playerId)
    this.syncChessBoard()
  }

  private checkChessWin(): boolean {
    const active = this.getActiveChessPlayers()
    if (active.length > 1) return false
    this.endChessRound(active[0] ?? null)
    return true
  }

  private getActiveChessPlayers(): string[] {
    return [...this.state.chessPlayerOrder].filter(id => !this.isEliminated(id))
  }

  private isEliminated(playerId: string): boolean {
    return this.state.chessEliminatedIds.includes(playerId)
  }

  private endChessRound(winnerId: string | null) {
    this.state.phase = "result"
    if (winnerId) {
      const winner = this.state.players.get(winnerId)
      if (winner) winner.score += 3
    }
  }
}
