import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { sendPlayerReady } from "../network/ColyseusClient"

export class ResultScene extends Phaser.Scene {
  private room!: Room<GameState>

  constructor() {
    super({ key: "ResultScene" })
  }

  init(data: { room: Room<GameState> }) {
    this.room = data.room
  }

  create() {
    const { width, height } = this.scale

    this.add
      .text(width / 2, height / 2 - 100, "Round Results", {
        fontSize: "28px",
        color: "#e8d5ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)

    let y = height / 2 - 50
    const sorted = this.room.state?.players
      ? [...this.room.state.players.values()].sort((a, b) => b.score - a.score)
      : []
    for (const player of sorted) {
      this.add
        .text(width / 2, y, `${player.name}  —  ${player.score} pts`, {
          fontSize: "18px",
          color: "#c0c0e0",
        })
        .setOrigin(0.5)
      y += 30
    }

    this.add
      .text(width / 2, height / 2 + 100, "Press SPACE to continue", {
        fontSize: "14px",
        color: "#606080",
      })
      .setOrigin(0.5)

    this.input.keyboard?.once("keydown-SPACE", () => sendPlayerReady())

    const unsubscribe = this.room.onStateChange((state) => {
      if (state.phase === "wheel") {
        unsubscribe()
        this.scene.start("WheelScene", { room: this.room })
        return
      }
      if (state.phase === "gameover") {
        unsubscribe()
        this.add.text(width / 2, height / 2 + 150, "GAME OVER", {
          fontSize: "24px",
          color: "#ff6060",
        }).setOrigin(0.5)
      }
    })
  }
}
