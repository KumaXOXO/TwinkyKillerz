import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { MINIGAMES } from "@twinky/shared/constants"
import { sendSelectGame } from "../network/ColyseusClient"
import { THEME } from "../utils/Theme"
import { UIFactory } from "../utils/UIFactory"

export class GameSelectScene extends Phaser.Scene {
  private room!: Room<GameState>
  private stateChangeCallback: ((state: GameState) => void) | null = null

  constructor() {
    super({ key: "GameSelectScene" })
  }

  init(data: { room: Room<GameState> }): void {
    this.room = data.room
  }

  create(): void {
    const { width, height } = this.scale
    const me = this.room.state.players.get(this.room.sessionId)
    const isGM = me?.isGamemaster ?? false

    this.cameras.main.setPostPipeline('CRTPipeline')

    UIFactory.createHeader(this, width / 2, 80, "SELECT PROTOCOL")

    if (isGM) {
      this.add
        .text(width / 2, 130, "You are the Gamemaster - pick a game:", {
          fontFamily: THEME.fonts.body,
          fontSize: "16px",
          color: THEME.colors.muted
        })
        .setOrigin(0.5)

      const games = [...MINIGAMES] as string[]
      games.forEach((game, idx) => {
        const y = 240 + idx * 80
        UIFactory.createButton(this, width / 2, y, 280, 56, `[${idx + 1}] ${game.toUpperCase()}`, () => sendSelectGame(game))
        this.input.keyboard?.once(`keydown-${idx + 1}`, () => sendSelectGame(game))
      })
    } else {
      const gmEntry = [...this.room.state.players.values()].find(p => p.isGamemaster)
      const gmName = gmEntry?.name ?? "Gamemaster"
      this.add
        .text(width / 2, height / 2, `Waiting for ${gmName} to choose...`, {
          fontFamily: THEME.fonts.body,
          fontSize: "20px",
          color: THEME.colors.muted,
        })
        .setOrigin(0.5)
    }

    this.stateChangeCallback = (state: GameState) => {
      if (state.phase === "minigame") {
        if (this.stateChangeCallback) {
          this.room.onStateChange.remove(this.stateChangeCallback)
          this.stateChangeCallback = null
        }
        const sceneKey =
          state.olympiade.currentMinigame === "connect4" ? "Connect4Scene" : "ChessScene"
        this.scene.start(sceneKey, { room: this.room })
      }
    }
    this.room.onStateChange(this.stateChangeCallback)
  }

  shutdown(): void {
    if (this.stateChangeCallback) {
      this.room.onStateChange.remove(this.stateChangeCallback)
      this.stateChangeCallback = null
    }
    this.input.keyboard?.removeAllListeners()
  }
}

