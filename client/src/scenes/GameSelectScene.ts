import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { MINIGAMES } from "@twinky/shared/constants"
import { sendSelectGame } from "../network/ColyseusClient"

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

    this.add
      .text(width / 2, 80, "CHOOSE A GAME", { fontSize: "26px", color: "#e8d5ff", fontStyle: "bold" })
      .setOrigin(0.5)

    if (isGM) {
      this.add
        .text(width / 2, 130, "You are the Gamemaster — pick a game:", { fontSize: "14px", color: "#7070a0" })
        .setOrigin(0.5)

      const games = [...MINIGAMES] as string[]
      games.forEach((game, idx) => {
        const y = 210 + idx * 70
        const btn = this.add
          .rectangle(width / 2, y, 280, 52, 0x3a2a6e)
          .setInteractive({ useHandCursor: true })
        btn.on("pointerover", () => btn.setFillStyle(0x2a1a4e))
        btn.on("pointerout", () => btn.setFillStyle(0x3a2a6e))
        btn.on("pointerdown", () => sendSelectGame(game))

        this.add
          .text(width / 2, y, `[${idx + 1}]  ${game.toUpperCase()}`, {
            fontSize: "20px",
            color: "#44ff88",
            fontStyle: "bold",
          })
          .setOrigin(0.5)

        this.input.keyboard?.once(`keydown-${idx + 1}`, () => sendSelectGame(game))
      })
    } else {
      const gmEntry = [...this.room.state.players.values()].find(p => p.isGamemaster)
      const gmName = gmEntry?.name ?? "Gamemaster"
      this.add
        .text(width / 2, height / 2, `Waiting for ${gmName} to choose a game...`, {
          fontSize: "16px",
          color: "#7070a0",
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
