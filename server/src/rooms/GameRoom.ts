import { Room, Client } from "@colyseus/core"
import { GameState, PlayerState, CheatEvent } from "../../../shared/schema"
import {
  CHEAT_WINDOW_MS,
  MAX_ROUNDS,
  SCORE_CHEAT_CAUGHT,
  SCORE_CHEAT_SUCCESS,
  MINIGAMES,
  WHEEL_MIN_VELOCITY,
  WHEEL_MAX_VELOCITY,
  WHEEL_BASE_DECEL,
} from "../../../shared/constants"

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
    const minSpinMs = (WHEEL_MIN_VELOCITY / WHEEL_BASE_DECEL) * 1000
    if (Date.now() - this.wheelSpinStartTime < minSpinMs) return
    this.state.phase = "minigame"
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
}
