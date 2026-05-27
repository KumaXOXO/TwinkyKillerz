import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { sendCheatAttempt, sendCatchCheat } from "../network/ColyseusClient"
import { sounds } from "./SoundManager"

const CHEAT_WINDOW_MS = 1500

const C = {
  hint: "#7070a0",
  active: "#ff4488",
  catch: "#ffcc44",
}

export class CheatHUD {
  private hintText: Phaser.GameObjects.Text
  private selfText: Phaser.GameObjects.Text
  private catchTexts: Map<string, Phaser.GameObjects.Text> = new Map()
  private scene: Phaser.Scene
  private room: Room<GameState>
  private cheatType: string

  constructor(scene: Phaser.Scene, room: Room<GameState>, cheatType: string) {
    this.scene = scene
    this.room = room
    this.cheatType = cheatType

    const { width, height } = scene.scale

    this.hintText = scene.add
      .text(width - 10, height - 70, "C — CHEAT", { fontSize: "12px", color: C.hint })
      .setOrigin(1, 1)
      .setDepth(20)

    this.selfText = scene.add
      .text(width - 10, height - 54, "", { fontSize: "13px", color: C.active, fontStyle: "bold" })
      .setOrigin(1, 1)
      .setDepth(20)

    scene.input.keyboard!.on("keydown-C", this.onPressCheat, this)
  }

  update() {
    const state = this.room.state
    const myId = this.room.sessionId
    const me = state.players.get(myId)

    if (me?.isCheating) {
      const remaining = Math.max(
        0,
        Math.ceil((me.cheatStartTimestamp + CHEAT_WINDOW_MS - Date.now()) / 100) / 10,
      )
      this.selfText.setText(`CHEATING… ${remaining.toFixed(1)}s`)
      this.hintText.setVisible(false)
    } else {
      this.selfText.setText("")
      this.hintText.setVisible(true)
    }

    // Catch buttons for cheating opponents
    const cheatingIds = new Set<string>()
    state.players.forEach((p, id) => {
      if (id !== myId && p.isCheating) cheatingIds.add(id)
    })

    // Remove stale
    for (const [id, text] of this.catchTexts.entries()) {
      if (!cheatingIds.has(id)) {
        text.destroy()
        this.catchTexts.delete(id)
      }
    }

    // Add / update
    let catchY = (this.scene.scale.height as number) - 38
    for (const id of cheatingIds) {
      const name = state.players.get(id)?.name ?? "?"
      if (!this.catchTexts.has(id)) {
        const t = this.scene.add
          .text(this.scene.scale.width - 10, catchY, `⚡ ${name} — CATCH!`, {
            fontSize: "13px",
            color: C.catch,
            fontStyle: "bold",
          })
          .setOrigin(1, 1)
          .setDepth(20)
          .setInteractive({ useHandCursor: true })
        t.on("pointerdown", () => this.onCatch(id))
        this.catchTexts.set(id, t)
      } else {
        const t = this.catchTexts.get(id)!
        t.setPosition(this.scene.scale.width - 10, catchY)
      }
      catchY -= 20
    }
  }

  destroy() {
    this.scene.input.keyboard?.removeListener("keydown-C", this.onPressCheat, this)
    this.hintText.destroy()
    this.selfText.destroy()
    for (const t of this.catchTexts.values()) t.destroy()
    this.catchTexts.clear()
  }

  private onPressCheat() {
    const me = this.room.state.players.get(this.room.sessionId)
    if (me?.isCheating) return
    sounds.menuNav()
    sendCheatAttempt(this.cheatType)
  }

  private onCatch(targetId: string) {
    sounds.menuConfirm()
    sendCatchCheat(targetId)
  }
}
