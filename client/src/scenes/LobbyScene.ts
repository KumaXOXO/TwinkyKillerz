import Phaser from "phaser"
import { joinGame, sendPlayerReady } from "../network/ColyseusClient"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"

export class LobbyScene extends Phaser.Scene {
  private room: Room<GameState> | null = null

  constructor() {
    super({ key: "LobbyScene" })
  }

  create() {
    const { width, height } = this.scale

    this.add
      .text(width / 2, height / 2 - 80, "Twinky Olympiade", {
        fontSize: "36px",
        color: "#e8d5ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)

    const statusText = this.add
      .text(width / 2, height / 2, "Click anywhere to join", {
        fontSize: "18px",
        color: "#a0a0c0",
      })
      .setOrigin(0.5)

    const playerList = this.add
      .text(width / 2, height / 2 + 60, "", {
        fontSize: "14px",
        color: "#808090",
        align: "center",
      })
      .setOrigin(0.5)

    this.input.once("pointerdown", async () => {
      statusText.setText("Connecting...")
      try {
        this.room = await joinGame("Player", "default")

        const unsubscribe = this.room.onStateChange((state) => {
          const names = [...state.players.values()].map((p) => p.name).join("\n")
          playerList.setText(names)
          if (state.phase === "wheel") {
            unsubscribe()
            this.scene.start("WheelScene", { room: this.room })
          }
        })

        statusText.setText("Connected! Press SPACE when ready")
        this.input.keyboard?.once("keydown-SPACE", () => {
          statusText.setText("Waiting for others...")
          sendPlayerReady()
        })
      } catch {
        statusText.setText("Connection failed — is the server running?")
      }
    })
  }
}
