import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { sendPlayerReady } from "../network/ColyseusClient"

const C = {
  text: "#e8d5ff",
  muted: "#7070a0",
  crown: "#ffcc44",
  chip: "#44ff88",
}

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
    const round = this.room.state?.olympiade.currentRound ?? 0

    this.add
      .text(width / 2, 50, `Round ${round} Results`, {
        fontSize: "28px",
        color: C.text,
        fontStyle: "bold",
      })
      .setOrigin(0.5)

    const sorted = this.room.state?.players
      ? [...this.room.state.players.values()].sort((a, b) => b.score - a.score)
      : []

    let y = 110
    sorted.forEach((player, idx) => {
      const medal = idx === 0 ? "★ " : `${idx + 1}. `
      const color = idx === 0 ? C.crown : C.text
      this.add.text(width / 2 - 120, y, `${medal}${player.name}`, { fontSize: "18px", color })
      this.add.text(width / 2 + 40, y, `${player.score} pts`, { fontSize: "18px", color: C.muted })
      if (player.chips > 0) {
        this.add.text(width / 2 + 120, y, `+${player.chips} chip${player.chips !== 1 ? "s" : ""}`, {
          fontSize: "14px",
          color: C.chip,
        })
      }
      y += 34
    })

    this.add
      .text(width / 2, height - 60, "Press SPACE to continue", { fontSize: "14px", color: C.muted })
      .setOrigin(0.5)

    this.input.keyboard?.once("keydown-SPACE", () => sendPlayerReady())

    const onStateChange = (state: GameState) => {
      if (state.phase === "wheel") {
        this.room.onStateChange.remove(onStateChange)
        this.scene.start("WheelScene", { room: this.room })
        return
      }
      if (state.phase === "gameover") {
        this.room.onStateChange.remove(onStateChange)
        this.showGameOver()
      }
    }
    this.room.onStateChange(onStateChange)
  }

  private showGameOver() {
    const { width, height } = this.scale
    this.add.rectangle(width / 2, height / 2, 500, 80, 0x0d0d1a).setStrokeStyle(2, 0xff6060)
    this.add
      .text(width / 2, height / 2, "GAME OVER", { fontSize: "32px", color: "#ff6060", fontStyle: "bold" })
      .setOrigin(0.5)
  }
}
