import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { MINIGAMES, WHEEL_ARROW_INFLUENCE, WHEEL_BASE_DECEL } from "@twinky/shared/constants"
import { computeSegmentWeights } from "@twinky/shared/wheelLogic"
import { sendWheelDone, sendPlaceChip } from "../network/ColyseusClient"
import { initJuice, type JuiceConfig } from "../juice/index"
import { climax } from "../juice/climax"
import { sounds } from "../utils/SoundManager"

const RADIUS = 200
const C = {
  text: "#e8d5ff",
  muted: "#7070a0",
  crown: "#ffcc44",
  chip: "#44ff88",
}

export class WheelScene extends Phaser.Scene {
  private room!: Room<GameState>
  private wheelContainer!: Phaser.GameObjects.Container
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private angle = 0
  private velocity = 0
  private decelMult = 1.0
  private isSpinning = false
  private isDone = false
  private juice!: JuiceConfig
  private lastTickTime = 0
  private stateChangeCallback: ((state: GameState) => void) | null = null
  private spaceHandler: (() => void) | null = null
  private placementTexts: Phaser.GameObjects.Text[] = []
  private placementKeyHandlers: Array<() => void> = []
  private chipsText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text
  private resultText!: Phaser.GameObjects.Text
  private inPlacementPhase = false
  private chipSidebarTexts: Map<string, Phaser.GameObjects.Text> = new Map()
  private _brakeHitZone: Phaser.GameObjects.Arc | null = null

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
    this.inPlacementPhase = false
    this.placementTexts = []
    this.placementKeyHandlers = []
    this.chipSidebarTexts = new Map()
  }

  create() {
    this.juice = initJuice()
    const { width, height } = this.scale

    this.add
      .text(width / 2, 36, "SPIN THE WHEEL", { fontSize: "24px", color: C.text, fontStyle: "bold" })
      .setOrigin(0.5)

    const round = this.room.state.olympiade.currentRound
    this.add
      .text(width / 2, 64, `Round ${round}`, { fontSize: "14px", color: C.muted })
      .setOrigin(0.5)

    this.wheelContainer = this.add.container(width / 2, height / 2)
    this.buildWheel()

    const arrow = this.add.graphics()
    arrow.fillStyle(0xff4444)
    arrow.fillTriangle(
      width / 2, height / 2 - RADIUS - 10,
      width / 2 - 12, height / 2 - RADIUS - 34,
      width / 2 + 12, height / 2 - RADIUS - 34,
    )

    this.statusText = this.add
      .text(width / 2, height / 2 + RADIUS + 50, "", { fontSize: "18px", color: C.text })
      .setOrigin(0.5)

    this.timerText = this.add
      .text(width / 2, height / 2 + RADIUS + 80, "", { fontSize: "14px", color: C.muted })
      .setOrigin(0.5)

    this.chipsText = this.add
      .text(width / 2, height / 2 + RADIUS + 108, "", { fontSize: "14px", color: C.chip })
      .setOrigin(0.5)

    this.resultText = this.add
      .text(width / 2, height / 2 + RADIUS + 90, "", { fontSize: "22px", color: C.crown, fontStyle: "bold" })
      .setOrigin(0.5)

    this.cursors = this.input.keyboard!.createCursorKeys()

    this.buildChipSidebar()

    this.inPlacementPhase = this.room.state.olympiade.wheel.placementPhase
    if (this.inPlacementPhase) {
      this.buildPlacementUI()
    } else {
      const hasAnyChips = [...this.room.state.players.values()].some(p => p.chips > 0)
      if (!hasAnyChips) {
        this.statusText.setText("No chips yet — first round!")
        this.time.delayedCall(2000, () => {
          if (this.statusText?.active) this.statusText.setText("")
        })
      }
      this.buildSpinUI()
    }

    this.stateChangeCallback = (state) => {
      this.refreshChipSidebar()
      if (state.phase === "minigame") {
        if (this.stateChangeCallback) {
          this.room.onStateChange.remove(this.stateChangeCallback)
          this.stateChangeCallback = null
        }
        this.resultText.setText(`Next: ${state.olympiade.currentMinigame.toUpperCase()}!`)
        this.timerText.setText("")
        this.chipsText.setText("")
        this.statusText.setText("")
        this.time.delayedCall(250, () => {
          const sceneKey = state.olympiade.currentMinigame === "connect4" ? "Connect4Scene" : "ChessScene"
          this.scene.start(sceneKey, { room: this.room })
        })
        return
      }
      if (this.inPlacementPhase && !state.olympiade.wheel.placementPhase) {
        this.inPlacementPhase = false
        this.clearPlacementUI()
        this.buildSpinUI()
        this.rebuildWheel()
        return
      }
      if (this.inPlacementPhase) {
        this.refreshPlacementUI()
        this.rebuildWheel()
      }
    }
    this.room.onStateChange(this.stateChangeCallback)
  }

  update(_time: number, delta: number) {
    if (this.inPlacementPhase) {
      const remaining = Math.max(
        0,
        Math.ceil((this.room.state.olympiade.wheel.placementDeadline - Date.now()) / 1000),
      )
      this.timerText?.setText(`${remaining}s remaining`)
      return
    }

    if (!this.isSpinning || this.isDone) return

    if (this.cursors.left.isDown) {
      this.decelMult = Math.max(
        1 - WHEEL_ARROW_INFLUENCE,
        this.decelMult - WHEEL_ARROW_INFLUENCE * (delta / 1000),
      )
    }
    if (this.cursors.right.isDown) {
      this.decelMult = Math.min(
        1 + WHEEL_ARROW_INFLUENCE * 4,
        this.decelMult + WHEEL_ARROW_INFLUENCE * (delta / 1000),
      )
    }

    this.velocity = Math.max(0, this.velocity - WHEEL_BASE_DECEL * this.decelMult * (delta / 1000))
    this.angle += this.velocity * (delta / 1000)
    this.wheelContainer.setAngle(this.angle)

    if (this.isSpinning && !this.isDone && this.velocity > 0) {
      const now = this.time.now
      const interval = Math.max(60, 300 - this.velocity * 0.3)
      if (now - this.lastTickTime > interval) {
        this.lastTickTime = now
        sounds.wheelTick()
      }
    }

    if (this.velocity <= 0) {
      this.isDone = true
      this.onWheelStopped()
    }
  }

  shutdown() {
    this.chipSidebarTexts.forEach(t => t.destroy())
    this.chipSidebarTexts.clear()
    if (this.stateChangeCallback) {
      this.room.onStateChange.remove(this.stateChangeCallback)
      this.stateChangeCallback = null
    }
    if (this.spaceHandler) {
      this.input.keyboard?.removeListener("keydown-SPACE", this.spaceHandler)
      this.spaceHandler = null
    }
    this._brakeHitZone?.destroy()
    this._brakeHitZone = null
  }

  private buildChipSidebar() {
    this.add.text(10, 90, "CHIPS", { fontSize: "11px", color: C.muted })
    let y = 110
    this.room.state.players.forEach((player, id) => {
      const color = id === this.room.sessionId ? C.chip : C.muted
      const t = this.add.text(10, y, "", { fontSize: "13px", color })
      this.chipSidebarTexts.set(id, t)
      y += 20
    })
    this.refreshChipSidebar()
  }

  private refreshChipSidebar() {
    this.room.state.players.forEach((player, id) => {
      const t = this.chipSidebarTexts.get(id)
      if (!t) return
      const chips = player.chips
      const dots = chips > 0 ? "●".repeat(Math.min(chips, 10)) + (chips > 10 ? ` +${chips - 10}` : "") : "—"
      t.setText(`${player.name}: ${dots} (${chips})`)
    })
  }

  private buildPlacementUI() {
    const me = this.room.state.players.get(this.room.sessionId)
    if (!me || me.chips <= 0) {
      this.statusText.setText("Waiting for chip placement...")
      this.chipsText.setText("")
      return
    }

    const myChips = me.chips
    const { width, height } = this.scale

    this.statusText.setText("Place your chips on wheel segments!")
    this.chipsText.setText(`You have ${myChips} chip${myChips !== 1 ? "s" : ""}`)

    const games = [...MINIGAMES] as string[]
    const startY = height / 2 + RADIUS + 138
    games.forEach((game, idx) => {
      const chips = this.room.state.olympiade.wheel.fields.get(game)?.fixedChips ?? 0
      const line = `[${idx + 1}] ${game.toUpperCase()}  (${chips} chip${chips !== 1 ? "s" : ""})`
      const t = this.add
        .text(width / 2, startY + idx * 22, line, { fontSize: "13px", color: C.text })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
      t.on("pointerover", () => t.setColor(C.chip))
      t.on("pointerout", () => t.setColor(C.text))
      t.on("pointerdown", () => sendPlaceChip(idx))
      this.placementTexts.push(t)

      const handler = () => sendPlaceChip(idx)
      this.placementKeyHandlers[idx] = handler
      this.input.keyboard?.on(`keydown-${idx + 1}`, handler)
    })
  }

  private clearPlacementUI() {
    for (const t of this.placementTexts) t.destroy()
    this.placementTexts = []
    const games = [...MINIGAMES] as string[]
    games.forEach((_g, idx) => {
      const handler = this.placementKeyHandlers[idx]
      if (handler) this.input.keyboard?.removeListener(`keydown-${idx + 1}`, handler)
    })
    this.placementKeyHandlers = []
  }

  private refreshPlacementUI() {
    const myChips = this.room.state.players.get(this.room.sessionId)?.chips ?? 0
    const games = [...MINIGAMES] as string[]

    this.chipsText?.setText(
      myChips > 0 ? `You have ${myChips} chip${myChips !== 1 ? "s" : ""}` : "",
    )
    this.statusText?.setText(
      myChips > 0 ? "Place your chips on wheel segments!" : "Waiting for chip placement...",
    )

    games.forEach((game, idx) => {
      const chips = this.room.state.olympiade.wheel.fields.get(game)?.fixedChips ?? 0
      const t = this.placementTexts[idx]
      if (!t) return
      const prefix = myChips > 0 ? `[${idx + 1}] ` : ""
      t.setText(`${prefix}${game.toUpperCase()}  (${chips} chip${chips !== 1 ? "s" : ""})`)
    })
  }

  private buildSpinUI() {
    const spinnerName =
      this.room.state.players.get(this.room.state.olympiade.wheel.spinnerId)?.name ?? "?"
    const isSpinner = this.room.state.olympiade.wheel.spinnerId === this.room.sessionId

    this.statusText?.setText(
      isSpinner ? "Press SPACE to spin!" : `Waiting for ${spinnerName} to spin...`,
    )
    this.timerText?.setText(isSpinner ? "← → or CLICK WHEEL to brake" : "")
    this.chipsText?.setText("")

    if (isSpinner) {
      this.spaceHandler = () => {
        const v = this.room.state.olympiade.wheel.velocity
        if (v <= 0) return
        this.velocity = v
        this.isSpinning = true
        this.timerText?.setText("← → or CLICK WHEEL to brake")
      }
      this.input.keyboard!.once("keydown-SPACE", this.spaceHandler)
      const { width, height } = this.scale
      const hitZone = this.add
        .circle(width / 2, height / 2, RADIUS, 0xffffff, 0)
        .setInteractive({ useHandCursor: true })
        .setDepth(20)
      hitZone.on("pointerdown", () => {
        if (!this.isSpinning || this.isDone) return
        this.decelMult = Math.min(
          1 + WHEEL_ARROW_INFLUENCE * 4,
          this.decelMult + WHEEL_ARROW_INFLUENCE * 2,
        )
        this.tweens.add({
          targets: this.wheelContainer,
          scaleX: 0.95,
          scaleY: 0.95,
          duration: 80,
          yoyo: true,
          ease: "Cubic.easeOut",
        })
      })
      this._brakeHitZone = hitZone
    }
  }

  private buildWheel() {
    this.wheelContainer.removeAll(true)
    const segments = [...MINIGAMES] as string[]
    const chips = segments.map(g => this.room.state.olympiade.wheel.fields.get(g)?.fixedChips ?? 0)
    const weights = computeSegmentWeights(segments.length, chips)
    const total = weights.reduce((s, w) => s + w, 0)

    const g = this.add.graphics()
    const palette = [0x2d1b4e, 0x1e3a5f, 0x4e1b2d, 0x1b4e2d, 0x4e3a1b]
    let startAngle = -Math.PI / 2

    segments.forEach((game, i) => {
      const arc = (weights[i] / total) * Math.PI * 2
      const end = startAngle + arc

      g.fillStyle(palette[i % palette.length])
      g.slice(0, 0, RADIUS, startAngle, end, false)
      g.fillPath()

      g.lineStyle(2, 0x7744cc)
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(Math.cos(startAngle) * RADIUS, Math.sin(startAngle) * RADIUS)
      g.strokePath()

      const mid = startAngle + arc / 2
      const pct = Math.round((weights[i] / total) * 100)
      const label = this.add
        .text(
          Math.cos(mid) * (RADIUS * 0.6),
          Math.sin(mid) * (RADIUS * 0.6),
          `${game.toUpperCase()}\n${pct}%`,
          { fontSize: "14px", color: "#e8d5ff", fontStyle: "bold", align: "center" },
        )
        .setOrigin(0.5)
      this.wheelContainer.add(label)

      startAngle = end
    })

    g.lineStyle(3, 0xaa66ff)
    g.strokeCircle(0, 0, RADIUS)
    g.fillStyle(0x0d0d1a)
    g.fillCircle(0, 0, 18)

    this.wheelContainer.addAt(g, 0)
  }

  private rebuildWheel() {
    this.buildWheel()
  }

  private onWheelStopped() {
    this._brakeHitZone?.destroy()
    this._brakeHitZone = null
    const segments = [...MINIGAMES] as string[]
    const desiredIdx = segments.indexOf(
      this.room.state.olympiade.currentMinigame as (typeof MINIGAMES)[number],
    )
    // Compute actual mid-angle using chip-weighted segment sizes
    const chips = segments.map(g => this.room.state.olympiade.wheel.fields.get(g)?.fixedChips ?? 0)
    const weights = computeSegmentWeights(segments.length, chips)
    const total = weights.reduce((s, w) => s + w, 0)
    let cumAngle = -90 // degrees, starting at top (matching buildWheel's -Math.PI/2)
    let targetAngle = 0
    for (let i = 0; i < segments.length; i++) {
      const arc = (weights[i] / total) * 360
      if (i === desiredIdx) {
        targetAngle = -(cumAngle + arc / 2)
        break
      }
      cumAngle += arc
    }
    const n = Math.round((this.angle - targetAngle) / 360)
    const snapAngle = targetAngle + n * 360

    this.tweens.add({
      targets: this.wheelContainer,
      angle: snapAngle,
      duration: 300,
      ease: "Cubic.easeOut",
      onComplete: () => {
        void climax(this.juice, this, {
          hitstopMs: 60,
          shake: { intensity: 0.006, ms: 180 },
          pop: { x: this.wheelContainer.x, y: this.wheelContainer.y, color: 0xffd700, count: 20 },
        }).then(() => {
          this.time.delayedCall(1800, () => sendWheelDone())
        })
      },
    })
  }
}
