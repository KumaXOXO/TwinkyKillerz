import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"

export class ChessScene extends Phaser.Scene {
  private room!: Room<GameState>

  constructor() {
    super({ key: "ChessScene" })
  }

  init(data: { room: Room<GameState> }) {
    this.room = data.room
  }

  create() {
    const { width, height } = this.scale
    this.add
      .text(width / 2, height / 2, "Chess Scene (stub)\nPress SPACE to go to Results", {
        fontSize: "20px",
        color: "#e8d5ff",
        align: "center",
      })
      .setOrigin(0.5)

    this.input.keyboard?.once("keydown-SPACE", () => {
      this.scene.start("ResultScene", { room: this.room })
    })
  }
}
