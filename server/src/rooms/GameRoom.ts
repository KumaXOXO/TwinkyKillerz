import { Room, Client } from "@colyseus/core"
import { GameState, PlayerState, CheatEvent, ChessPiece, ChatMessage } from "../../../shared/schema"
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

interface ChatMsg {
  text: string
}

interface GamemasterSettingsMsg {
  maxPlayers?: number
  gameMode?: string
}

interface TransferGamemasterMsg {
  targetId: string
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
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
    this.state.roomCode = generateRoomCode()
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
    this.onMessage("chat", (client, msg: ChatMsg) => this.handleChat(client, msg))
    this.onMessage("gamemaster_settings", (client, msg: GamemasterSettingsMsg) =>
      this.handleGamemasterSettings(client, msg)
    )
    this.onMessage("transfer_gamemaster", (client, msg: TransferGamemasterMsg) =>
      this.handleTransferGamemaster(client, msg)
    )
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new PlayerState()
    player.id = client.sessionId
    player.name = options.name ?? "Player"
    player.characterId = options.characterId ?? "default"
    player.isGamemaster = this.state.players.size === 0
    this.state.players.set(client.sessionId, player)
  }

  onLeave(client: Client, _consented: boolean) {
    const player = this.state.players.get(client.sessionId)
    if (player) {
      player.isConnected = false
      player.isReady = false
    }
    this.readyPlayers.delete(client.sessionId)
  }

  onDispose() {}

  private handlePlayerReady(client: Client, _msg: unknown) {
    const player = this.state.players.get(client.sessionId)
    if (player) player.isReady = true
    this.readyPlayers.add(client.sessionId)
    const connectedIds = [...this.state.players.values()]
      .filter((p) => p.isConnected)
      .map((p) => p.id)
    const allReady =
      connectedIds.length >= 2 && connectedIds.every((id) => this.readyPlayers.has(id))
    if (allReady) {
      this.readyPlayers.clear()
      for (const p of this.state.players.values()) p.isReady = false
      this.startNewRound()
    }
  }

  private handleChat(client: Client, msg: ChatMsg) {
    const text = String(msg.text ?? "").trim().slice(0, 200)
    if (!text) return
    const message = new ChatMessage()
    message.playerId = client.sessionId
    message.text = text
    message.timestamp = Date.now()
    this.state.chatMessages.push(message)
    if (this.state.chatMessages.length > 50) {
      this.state.chatMessages.splice(0, 1)
    }
  }

  private handleGamemasterSettings(client: Client, msg: GamemasterSettingsMsg) {
    const player = this.state.players.get(client.sessionId)
    if (!player?.isGamemaster) return
    if (this.state.phase !== "lobby") return
    if (msg.maxPlayers !== undefined) {
      const v = Math.max(2, Math.min(4, Math.floor(msg.maxPlayers)))
      this.state.maxPlayers = v
      this.maxClients = v
    }
    if (msg.gameMode !== undefined && ["olympiade", "single"].includes(msg.gameMode)) {
      this.state.gameMode = msg.gameMode
    }
  }

  private handleTransferGamemaster(client: Client, msg: TransferGamemasterMsg) {
    const from = this.state.players.get(client.sessionId)
    if (!from?.isGamemaster) return
    const to = this.state.players.get(msg.targetId)
    if (!to) return
    from.isGamemaster = false
    to.isGamemaster = true
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
    this.state.olympiade.currentRound++
    if (this.state.olympiade.currentRound > MAX_ROUNDS) {
      this.state.phase = "gameover"
      return
    }
    this.state.phase = "wheel"
    this.state.olympiade.wheel.velocity =
      WHEEL_MIN_VELOCITY + Math.random() * (WHEEL_MAX_VELOCITY - WHEEL_MIN_VELOCITY)
    this.wheelSpinStartTime = Date.now()
    const ids = [...this.state.players.keys()]
    const otherIds = ids.filter((id) => id !== this.state.olympiade.wheel.spinnerId)
    const pool = otherIds.length > 0 ? otherIds : ids
    this.state.olympiade.wheel.spinnerId = pool[Math.floor(Math.random() * pool.length)]
    this.state.olympiade.currentMinigame = MINIGAMES[Math.floor(Math.random() * MINIGAMES.length)]
    this.broadcast("round_started", {
      round: this.state.olympiade.currentRound,
      spinnerId: this.state.olympiade.wheel.spinnerId,
    })
  }

  private handleWheelDone(client: Client, _msg: unknown) {
    if (client.sessionId !== this.state.olympiade.wheel.spinnerId) return
    if (this.state.phase !== "wheel") return
    const minSpinMs = (this.state.olympiade.wheel.velocity / WHEEL_BASE_DECEL) * 1000
    if (Date.now() - this.wheelSpinStartTime < minSpinMs) return
    this.state.phase = "minigame"
    if (this.state.olympiade.currentMinigame === "chess") {
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

    this.state.chess.playerOrder.clear()
    playerIds.forEach(id => this.state.chess.playerOrder.push(id))

    this.state.chess.eliminatedIds.clear()

    this.syncChessBoard()
    this.advanceChessTurn(playerIds[0])
  }

  private syncChessBoard() {
    for (const id of [...this.state.chess.pieces.keys()]) {
      if (!this.chessPiecesData.find(p => p.id === id)) {
        this.state.chess.pieces.delete(id)
      }
    }
    for (const data of this.chessPiecesData) {
      let piece = this.state.chess.pieces.get(data.id)
      if (!piece) {
        piece = new ChessPiece()
        this.state.chess.pieces.set(data.id, piece)
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
    this.state.chess.turnPlayerId = playerId
    this.state.chess.turnDeadline = Date.now() + CHESS_TURN_MS
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
    if (client.sessionId !== this.state.chess.turnPlayerId) return

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

    if (captured && captured.pieceType === "king") {
      this.eliminatePlayer(captured.ownerId)
    }

    this.syncChessBoard()

    if (this.checkChessWin()) return

    this.advanceToNextPlayer(client.sessionId)
  }

  private eliminatePlayer(playerId: string) {
    this.chessPiecesData = this.chessPiecesData.map(p =>
      p.ownerId === playerId ? { ...p, isGhost: true } : p
    )
    this.state.chess.eliminatedIds.push(playerId)
  }

  private checkChessWin(): boolean {
    const active = this.getActiveChessPlayers()
    if (active.length > 1) return false
    this.endChessRound(active[0] ?? null)
    return true
  }

  private getActiveChessPlayers(): string[] {
    return [...this.state.chess.playerOrder].filter(id => !this.isEliminated(id))
  }

  private isEliminated(playerId: string): boolean {
    return [...this.state.chess.eliminatedIds].includes(playerId)
  }

  private endChessRound(winnerId: string | null) {
    this.state.phase = "result"
    if (winnerId) {
      const winner = this.state.players.get(winnerId)
      if (winner) winner.score += 3
    }
  }
}
