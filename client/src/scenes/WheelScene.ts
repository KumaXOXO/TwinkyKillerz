import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { MINIGAMES, WHEEL_ARROW_INFLUENCE, WHEEL_BASE_DECEL } from "@twinky/shared/constants"
import { sendWheelDone } from "../network/ColyseusClient"

const RADIUS = 200

export class WheelScene extends Phaser.Scene {
  private room!: Room<GameState>
  private wheelContainer!: Phaser.GameObjects.Container
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private angle = 0
  private velocity = 0
  private decelMult = 1.0
  private isSpinning = false
  private isDone = false

  constructor() {
    super({ key: "WheelScene" })
  }

  init(data: { room: Room<GameState> }) {
    this.room = data.room
    this.angle = 0
    this.velocity = 0
    this.decelMult = 1.0
    this.isSpinning = false
    this.isDone = false
  }

  create() {
    const { width, height } = this.scale
    const segments = [...MINIGAMES]

    this.wheelContainer = this.add.container(width / 2, height / 2)
    this.buildWheel(segments)

    const arrow = this.add.graphics()
    arrow.fillStyle(0xff4444)
    arrow.fillTriangle(
      width / 2, height / 2 - RADIUS - 10,
      width / 2 - 12, height / 2 - RADIUS - 34,
      width / 2 + 12, height / 2 - RADIUS - 34,
    )

    this.add
      .text(width / 2, 36, "SPIN THE WHEEL", { fontSize: "24px", color: "#aa77ff", fontStyle: "bold" })
      .setOrigin(0.5)

    const spinnerName = this.room.state.players.get(this.room.state.wheelSpinnerId)?.name ?? "?"
    const isSpinner = this.room.state.wheelSpinnerId === this.room.sessionId

    const statusText = this.add
      .text(
        width / 2,
        height / 2 + RADIUS + 50,
        isSpinner ? "Press SPACE to spin!" : `Waiting for ${spinnerName} to spin...`,
        { fontSize: "18px", color: "#e8d5ff" },
      )
      .setOrigin(0.5)

    const resultText = this.add
      .text(width / 2, height / 2 + RADIUS + 90, "", {
        fontSize: "22px",
        color: "#ffcc44",
        fontStyle: "bold",
      })
      .setOrigin(0.5)

    this.cursors = this.input.keyboard!.createCursorKeys()

    if (isSpinner) {
      this.input.keyboard!.once("keydown-SPACE", () => {
        this.velocity = this.room.state.wheelVelocity
        this.isSpinning = true
        statusText.setText("Left/right arrows to influence")
      })
    }

    const unsubscribe = this.room.onStateChange((state) => {
      if (state.phase === "minigame") {
        unsubscribe()
        resultText.setText(`Next: ${state.currentMinigame.toUpperCase()}!`)
        this.time.delayedCall(500, () => {
          this.scene.start("ChessScene", { room: this.room })
        })
      }
    })
  }

  update(_time: number, delta: number) {
    if (!this.isSpinning || this.isDone) return

    if (this.cursors.left.isDown) {
      this.decelMult = Math.max(
        1 - WHEEL_ARROW_INFLUENCE,
        this.decelMult - WHEEL_ARROW_INFLUENCE * (delta / 1000),
      )
    }
    if (this.cursors.right.isDown) {
      this.decelMult = Math.min(
        1 + WHEEL_ARROW_INFLUENCE,
        this.decelMult + WHEEL_ARROW_INFLUENCE * (delta / 1000),
      )
    }

    this.velocity = Math.max(0, this.velocity - WHEEL_BASE_DECEL * this.decelMult * (delta / 1000))
    this.angle += this.velocity * (delta / 1000)
    this.wheelContainer.setAngle(this.angle)

    if (this.velocity <= 0) {
      this.isDone = true
      this.onWheelStopped()
    }
  }

  private buildWheel(segments: readonly string[]) {
    const g = this.add.graphics()
    const n = segments.length
    const segAngle = (Math.PI * 2) / n
    const palette = [0x2d1b4e, 0x1e3a5f, 0x4e1b2d]

    for (let i = 0; i < n; i++) {
      const start = i * segAngle - Math.PI / 2
      const end = (i + 1) * segAngle - Math.PI / 2
      g.fillStyle(palette[i % palette.length])
      g.slice(0, 0, RADIUS, start, end, false)
      g.fillPath()

      g.lineStyle(2, 0x7744cc)
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(Math.cos(start) * RADIUS, Math.sin(start) * RADIUS)
      g.strokePath()
    }

    g.lineStyle(3, 0xaa66ff)
    g.strokeCircle(0, 0, RADIUS)
    g.fillStyle(0x0d0d1a)
    g.fillCircle(0, 0, 18)

    this.wheelContainer.add(g)

    for (let i = 0; i < n; i++) {
      const mid = (i + 0.5) * segAngle - Math.PI / 2
      const label = this.add
        .text(
          Math.cos(mid) * (RADIUS * 0.6),
          Math.sin(mid) * (RADIUS * 0.6),
          segments[i].toUpperCase(),
          { fontSize: "18px", color: "#e8d5ff", fontStyle: "bold" },
        )
        .setOrigin(0.5)
      this.wheelContainer.add(label)
    }
  }

  private onWheelStopped() {
    const segments = [...MINIGAMES]
    const desiredIdx = segments.indexOf(
      this.room.state.currentMinigame as (typeof MINIGAMES)[number],
    )
    const segSize = 360 / segments.length
    const targetAngle = -((desiredIdx + 0.5) * segSize)
    const n = Math.round((this.angle - targetAngle) / 360)
    const snapAngle = targetAngle + n * 360

    this.tweens.add({
      targets: this.wheelContainer,
      angle: snapAngle,
      duration: 300,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this.time.delayedCall(2000, () => sendWheelDone())
      },
    })
  }
}
