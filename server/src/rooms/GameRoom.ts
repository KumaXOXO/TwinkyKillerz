import { Room, Client } from "@colyseus/core"
import { GameState, PlayerState, CheatEvent, ChessPiece, ChatMessage } from "../../../shared/schema"
import {
  CHEAT_WINDOW_MS,
  MAX_ROUNDS,
  SCORE_CHEAT_CAUGHT,
  SCORE_CHEAT_SUCCESS,
  SCORE_PLACEMENT,
  MINIGAMES,
  WHEEL_MIN_VELOCITY,
  WHEEL_MAX_VELOCITY,
  WHEEL_BASE_DECEL,
  WHEEL_PLACEMENT_MS,
  CHIPS_LAST_PLACE,
  CHIPS_SECOND_LAST,
  CHESS_CORNERS,
  CHESS_PAWN_DIRS,
  CHESS_TURN_MS,
} from "../../../shared/constants"
import { buildInitialBoard, getLegalMoves, hasLegalMoves, isInCheck, applyMove, ChessPieceData } from "../../../shared/chessLogic"
import { WheelField } from "../../../shared/schema"
import { computeSegmentWeights, pickWeightedIndex } from "../../../shared/wheelLogic"

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
  private chessEliminationOrder: string[] = []

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
    this.onMessage("place_chip", (client, msg: { fieldIndex: number }) =>
      this.handlePlaceChip(client, msg)
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
      this.startPlacementPhase()
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

  private startPlacementPhase() {
    this.state.olympiade.currentRound++
    if (this.state.olympiade.currentRound > MAX_ROUNDS) {
      this.state.phase = "gameover"
      return
    }
    // Reset field chips for this round
    for (const field of this.state.olympiade.wheel.fields.values()) {
      field.fixedChips = 0
    }
    // Ensure fields exist for each minigame
    for (const game of MINIGAMES) {
      if (!this.state.olympiade.wheel.fields.has(game)) {
        const f = new WheelField()
        f.minigame = game
        f.fixedChips = 0
        this.state.olympiade.wheel.fields.set(game, f)
      }
    }
    this.state.olympiade.wheel.placementPhase = true
    this.state.olympiade.wheel.placementDeadline = Date.now() + WHEEL_PLACEMENT_MS
    this.state.phase = "wheel"
    this.clock.setTimeout(() => this.startNewRound(), WHEEL_PLACEMENT_MS)
  }

  private startNewRound() {
    this.state.olympiade.wheel.placementPhase = false
    // Pick minigame using chip weights
    const games = [...MINIGAMES] as string[]
    const chips = games.map(g => this.state.olympiade.wheel.fields.get(g)?.fixedChips ?? 0)
    const weights = computeSegmentWeights(games.length, chips)
    const idx = pickWeightedIndex(weights)
    this.state.olympiade.currentMinigame = games[idx] ?? games[0]
    // Pick spinner (not same as last)
    const ids = [...this.state.players.keys()]
    const otherIds = ids.filter((id) => id !== this.state.olympiade.wheel.spinnerId)
    const pool = otherIds.length > 0 ? otherIds : ids
    this.state.olympiade.wheel.spinnerId = pool[Math.floor(Math.random() * pool.length)]
    this.state.olympiade.wheel.velocity =
      WHEEL_MIN_VELOCITY + Math.random() * (WHEEL_MAX_VELOCITY - WHEEL_MIN_VELOCITY)
    this.wheelSpinStartTime = Date.now()
    this.broadcast("round_started", {
      round: this.state.olympiade.currentRound,
      spinnerId: this.state.olympiade.wheel.spinnerId,
    })
  }

  private handlePlaceChip(client: Client, msg: { fieldIndex: number }) {
    if (!this.state.olympiade.wheel.placementPhase) return
    if (Date.now() > this.state.olympiade.wheel.placementDeadline) return
    const player = this.state.players.get(client.sessionId)
    if (!player || player.chips <= 0) return
    const games = [...MINIGAMES] as string[]
    const targetGame = games[msg.fieldIndex]
    if (!targetGame) return
    const field = this.state.olympiade.wheel.fields.get(targetGame)
    if (!field) return
    player.chips--
    field.fixedChips++
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
    this.chessEliminationOrder = []

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
    // Skip stalemate players (no legal moves, not in check)
    for (let i = 1; i <= active.length; i++) {
      const candidateId = active[(idx + i) % active.length]
      if (hasLegalMoves(this.chessPiecesData, candidateId, this.chessPawnDirs)) {
        this.advanceChessTurn(candidateId)
        return
      }
    }
    // All remaining players are stalemated — end the round with the winner being current player
    const winner = active.find(id => id !== currentPlayerId) ?? active[0] ?? null
    this.endChessRound(winner)
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

    const legalMoves = getLegalMoves(movingPiece.id, this.chessPiecesData, this.chessPawnDirs)
    if (!legalMoves.some(([r, c]) => r === msg.toRow && c === msg.toCol)) return

    const { pieces: updated, captured } = applyMove(
      this.chessPiecesData,
      msg.fromRow, msg.fromCol, msg.toRow, msg.toCol,
      this.chessPawnDirs
    )
    this.chessPiecesData = updated

    // King directly captured (fallback path)
    if (captured && captured.pieceType === "king") {
      this.eliminatePlayer(captured.ownerId)
    }

    // Check each active player for checkmate
    for (const pid of this.getActiveChessPlayers()) {
      if (
        isInCheck(this.chessPiecesData, pid, this.chessPawnDirs) &&
        !hasLegalMoves(this.chessPiecesData, pid, this.chessPawnDirs)
      ) {
        this.eliminatePlayer(pid)
      }
    }

    this.syncChessBoard()

    if (this.checkChessWin()) return

    this.advanceToNextPlayer(client.sessionId)
  }

  private eliminatePlayer(playerId: string) {
    if (this.isEliminated(playerId)) return
    this.chessPiecesData = this.chessPiecesData.map(p =>
      p.ownerId === playerId ? { ...p, isGhost: true } : p
    )
    this.state.chess.eliminatedIds.push(playerId)
    this.chessEliminationOrder.push(playerId)
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
    // Build finish order: winner first, then eliminated in reverse order (last elim = 2nd)
    const finishOrder: string[] = []
    if (winnerId) finishOrder.push(winnerId)
    for (let i = this.chessEliminationOrder.length - 1; i >= 0; i--) {
      const pid = this.chessEliminationOrder[i]
      if (pid !== winnerId) finishOrder.push(pid)
    }
    finishOrder.forEach((pid, idx) => {
      const player = this.state.players.get(pid)
      if (!player) return
      player.score += SCORE_PLACEMENT[idx] ?? 0
      // Lower placements earn chips to influence next wheel spin
      const totalPlayers = finishOrder.length
      if (idx === totalPlayers - 1) player.chips += CHIPS_LAST_PLACE
      else if (idx === totalPlayers - 2) player.chips += CHIPS_SECOND_LAST
    })
  }
}
