import Phaser from "phaser"
import type { Room } from "colyseus.js"
import type { GameState } from "@twinky/shared/schema"
import { MINIGAMES, WHEEL_ARROW_INFLUENCE, WHEEL_BASE_DECEL } from "@twinky/shared/constants"
import { computeSegmentWeights } from "@twinky/shared/wheelLogic"
import { sendWheelDone, sendPlaceChip } from "../network/ColyseusClient"
import { initJuice, type JuiceConfig } from "../juice/index"
import { climax } from "../juice/climax"
import { sounds } from "../utils/SoundManager"
import { THEME, toHex } from "../utils/Theme"
import { UIFactory } from "../utils/UIFactory"

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
  private _brakeHitZone: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle | null = null
  private arrowSprite!: Phaser.GameObjects.Graphics

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

    this.cameras.main.setPostPipeline('CRTPipeline')

    UIFactory.createHeader(this, width / 2, 40, "OUTCOME ENGINE")

    const round = this.room.state.olympiade.currentRound
    this.add
      .text(width / 2, 70, `SEQUENCE ${round}`, {
        fontFamily: THEME.fonts.body,
        fontSize: "18px",
        color: THEME.colors.muted
      })
      .setOrigin(0.5)

    this.wheelContainer = this.add.container(width / 2, height / 2)
    this.buildWheel()

    // Mechanical Hub Overlay
    const hub = this.add.container(width / 2, height / 2)
    const hubOuter = this.add.circle(0, 0, 30, toHex(THEME.colors.panel)).setStrokeStyle(3, toHex(THEME.colors.border))
    const hubInner = this.add.circle(0, 0, 15, toHex(THEME.colors.bg)).setStrokeStyle(2, toHex(THEME.colors.secondary))
    hub.add([hubOuter, hubInner])
    hub.setDepth(10)

    this.arrowSprite = this.add.graphics()
    this.drawArrow(0)
    this.arrowSprite.setPosition(width / 2, height / 2 - RADIUS - 25)
    this.arrowSprite.setDepth(15)

    this.statusText = this.add
      .text(width / 2, height / 2 + RADIUS + 50, "", {
        fontFamily: THEME.fonts.body,
        fontSize: "20px",
        color: THEME.colors.white
      })
      .setOrigin(0.5)

    this.timerText = this.add
      .text(width / 2, height / 2 + RADIUS + 80, "", {
        fontFamily: THEME.fonts.body,
        fontSize: "16px",
        color: THEME.colors.muted
      })
      .setOrigin(0.5)

    this.chipsText = this.add
      .text(width / 2, height / 2 + RADIUS + 108, "", {
        fontFamily: THEME.fonts.body,
        fontSize: "16px",
        color: THEME.colors.success
      })
      .setOrigin(0.5)

    this.resultText = this.add
      .text(width / 2, height / 2 + RADIUS + 90, "", {
        fontFamily: THEME.fonts.header,
        fontSize: "24px",
        color: THEME.colors.warning
      })
      .setOrigin(0.5)

    this.cursors = this.input.keyboard!.createCursorKeys()

    this.buildChipSidebar()

    this.inPlacementPhase = this.room.state.olympiade.wheel.placementPhase
    if (this.inPlacementPhase) {
      this.buildPlacementUI()
    } else {
      const hasAnyChips = [...this.room.state.players.values()].some(p => p.chips > 0)
      if (!hasAnyChips) {
        this.statusText.setText("NO CHIPS DETECTED")
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
        this.resultText.setText(`${state.olympiade.currentMinigame.toUpperCase()} LOADED`)
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

  private drawArrow(rotation: number) {
    this.arrowSprite.clear()
    this.arrowSprite.fillStyle(toHex(THEME.colors.primary))
    this.arrowSprite.fillTriangle(0, 15, -12, -15, 12, -15)
    this.arrowSprite.lineStyle(2, toHex(THEME.colors.white))
    this.arrowSprite.strokeTriangle(0, 15, -12, -15, 12, -15)
    this.arrowSprite.setRotation(rotation)
  }

  update(_time: number, delta: number) {
    if (this.inPlacementPhase) {
      const remaining = Math.max(
        0,
        Math.ceil((this.room.state.olympiade.wheel.placementDeadline - Date.now()) / 1000),
      )
      this.timerText?.setText(`TIMEOUT IN ${remaining}S`)
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
    const prevAngle = this.angle
    this.angle += this.velocity * (delta / 1000)
    this.wheelContainer.setAngle(this.angle)

    // Peg Tick Logic
    const segmentSize = 360 / MINIGAMES.length
    const currentSegment = Math.floor(((this.angle + 90) % 360) / segmentSize)
    const prevSegment = Math.floor(((prevAngle + 90) % 360) / segmentSize)

    if (currentSegment !== prevSegment && this.velocity > 0) {
      sounds.wheelTick()
      this.tweens.add({
        targets: this.arrowSprite,
        angle: { from: 15, to: 0 },
        duration: 100,
        ease: 'Back.easeOut'
      })
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
    this.add.text(15, 90, "RESOURCES", {
      fontFamily: THEME.fonts.header,
      fontSize: "10px",
      color: THEME.colors.muted
    })
    let y = 115
    this.room.state.players.forEach((player, id) => {
      const color = id === this.room.sessionId ? THEME.colors.primary : THEME.colors.text
      const t = this.add.text(15, y, "", {
        fontFamily: THEME.fonts.body,
        fontSize: "14px",
        color
      })
      this.chipSidebarTexts.set(id, t)
      y += 22
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
    const { width, height } = this.scale

    // Pulse wheel during placement
    this.tweens.killTweensOf(this.wheelContainer)
    this.tweens.add({
      targets: this.wheelContainer,
      scaleX: 1.04, scaleY: 1.04,
      duration: 600, yoyo: true, repeat: -1,
      ease: "Sine.easeInOut"
    })

    if (!me || me.chips <= 0) {
      this.statusText.setText("WAITING FOR OTHERS...")
      this.chipsText.setText("")
      return
    }

    const myChips = me.chips
    this.statusText.setText("PLACE YOUR CHIPS")
    this.chipsText.setText(`CHIPS: ${myChips}`)

    const games = [...MINIGAMES] as string[]
    const cols = games.length
    const btnW = Math.min(120, (width - 40) / cols)
    const startX = width / 2 - ((cols - 1) / 2) * (btnW + 8)

    games.forEach((game, idx) => {
      const bx = startX + idx * (btnW + 8)
      const by = height / 2 + RADIUS + 55

      const chipCount = this.room.state.olympiade.wheel.fields.get(game)?.fixedChips ?? 0

      const bg = this.add.rectangle(bx, by, btnW, 44, toHex(THEME.colors.panel))
        .setStrokeStyle(2, toHex(THEME.colors.border))
        .setInteractive({ useHandCursor: true })
        .setDepth(5)
      const lbl = this.add.text(bx, by - 6, game.toUpperCase(), {
        fontFamily: THEME.fonts.header, fontSize: "9px", color: THEME.colors.muted
      }).setOrigin(0.5).setDepth(6)
      const cnt = this.add.text(bx, by + 9, `${chipCount}`, {
        fontFamily: THEME.fonts.header, fontSize: "14px", color: THEME.colors.warning
      }).setOrigin(0.5).setDepth(6)

      bg.on("pointerover", () => bg.setFillStyle(0x2a1a4e))
      bg.on("pointerout", () => bg.setFillStyle(toHex(THEME.colors.panel)))
      bg.on("pointerdown", () => {
        sendPlaceChip(idx)
        this.tweens.add({ targets: bg, scaleX: 0.9, scaleY: 0.9, duration: 60, yoyo: true })
      })

      bg.setScale(0); lbl.setScale(0); cnt.setScale(0)
      this.tweens.add({ targets: [bg, lbl, cnt], scale: 1, duration: 200, delay: idx * 40, ease: "Back.easeOut" })

      this.placementTexts.push(bg as unknown as Phaser.GameObjects.Text, lbl, cnt)

      const handler = () => sendPlaceChip(idx)
      this.placementKeyHandlers[idx] = handler
      this.input.keyboard?.on(`keydown-${idx + 1}`, handler)
    })
  }

  private clearPlacementUI() {
    this.tweens.killTweensOf(this.wheelContainer)
    this.wheelContainer.setScale(1)
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

    this.chipsText?.setText(myChips > 0 ? `CHIPS: ${myChips}` : "")
    this.statusText?.setText(myChips > 0 ? "PLACE YOUR CHIPS" : "WAITING FOR OTHERS...")

    // Update chip counts on segment buttons (every 3rd object = cnt text)
    const games = [...MINIGAMES] as string[]
    games.forEach((game, idx) => {
      const chips = this.room.state.olympiade.wheel.fields.get(game)?.fixedChips ?? 0
      const cnt = this.placementTexts[idx * 3 + 2] as Phaser.GameObjects.Text | undefined
      cnt?.setText?.(`${chips}`)
    })
  }

  private buildSpinUI() {
    const spinnerName =
      this.room.state.players.get(this.room.state.olympiade.wheel.spinnerId)?.name ?? "?"
    const isSpinner = this.room.state.olympiade.wheel.spinnerId === this.room.sessionId

    this.statusText?.setText(
      isSpinner ? "PRESS [SPACE] TO SPIN" : `WAITING FOR ${spinnerName.toUpperCase()}`,
    )
    this.timerText?.setText("")
    this.chipsText?.setText("")

    if (!isSpinner) return

    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2

    // Left half = brake zone (invisible rectangle)
    const brakeZone = this.add
      .rectangle(cx - RADIUS / 2, cy, RADIUS, RADIUS * 2, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(20)
    brakeZone.on("pointerdown", () => {
      if (!this.isSpinning || this.isDone) return
      this.decelMult = Math.min(1 + WHEEL_ARROW_INFLUENCE * 4, this.decelMult + WHEEL_ARROW_INFLUENCE * 2)
      this.tweens.add({ targets: this.wheelContainer, scaleX: 0.95, scaleY: 0.95, duration: 80, yoyo: true, ease: "Cubic.easeOut" })
    })

    // Right half = slight accelerate zone
    const accelZone = this.add
      .rectangle(cx + RADIUS / 2, cy, RADIUS, RADIUS * 2, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(20)
    accelZone.on("pointerdown", () => {
      if (!this.isSpinning || this.isDone) return
      this.decelMult = Math.max(1 - WHEEL_ARROW_INFLUENCE, this.decelMult - WHEEL_ARROW_INFLUENCE * 0.5)
    })

    // Labels visible only to spinner
    const brakeLabel = this.add.text(cx - RADIUS - 10, cy, "◄ BRAKE", {
      fontFamily: THEME.fonts.body, fontSize: "14px", color: THEME.colors.primary
    }).setOrigin(1, 0.5).setDepth(20).setAlpha(0)
    const accelLabel = this.add.text(cx + RADIUS + 10, cy, "BOOST ►", {
      fontFamily: THEME.fonts.body, fontSize: "14px", color: THEME.colors.warning
    }).setOrigin(0, 0.5).setDepth(20).setAlpha(0)

    this._brakeHitZone = brakeZone

    this.spaceHandler = () => {
      const v = this.room.state.olympiade.wheel.velocity
      if (v <= 0) return
      this.velocity = v
      this.isSpinning = true
      this.tweens.add({ targets: [brakeLabel, accelLabel], alpha: 1, duration: 300 })
    }
    this.input.keyboard!.once("keydown-SPACE", this.spaceHandler)
  }

  private buildWheel() {
    this.wheelContainer.removeAll(true)
    const segments = [...MINIGAMES] as string[]
    const chips = segments.map(g => this.room.state.olympiade.wheel.fields.get(g)?.fixedChips ?? 0)
    const weights = computeSegmentWeights(segments.length, chips)
    const total = weights.reduce((s, w) => s + w, 0)

    const g = this.add.graphics()
    let startAngle = -Math.PI / 2

    segments.forEach((game, i) => {
      const arc = (weights[i] / total) * Math.PI * 2
      const end = startAngle + arc

      const color = THEME.colors.segments[i % THEME.colors.segments.length]
      g.fillStyle(toHex(color))
      g.slice(0, 0, RADIUS, startAngle, end, false)
      g.fillPath()

      g.lineStyle(2, toHex(THEME.colors.white), 0.5)
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(Math.cos(startAngle) * RADIUS, Math.sin(startAngle) * RADIUS)
      g.strokePath()

      const mid = startAngle + arc / 2
      const pct = Math.round((weights[i] / total) * 100)
      const label = this.add
        .text(
          Math.cos(mid) * (RADIUS * 0.7),
          Math.sin(mid) * (RADIUS * 0.7),
          `${game.toUpperCase()}\n${pct}%`,
          {
            fontFamily: THEME.fonts.header,
            fontSize: "12px",
            color: THEME.colors.white,
            align: "center"
          },
        )
        .setOrigin(0.5)
      this.wheelContainer.add(label)

      // Small peg circles
      const peg = this.add.circle(Math.cos(startAngle) * RADIUS, Math.sin(startAngle) * RADIUS, 4, toHex(THEME.colors.white))
      this.wheelContainer.add(peg)

      startAngle = end
    })

    g.lineStyle(6, toHex(THEME.colors.secondary))
    g.strokeCircle(0, 0, RADIUS)
    this.wheelContainer.addAt(g, 0)

    // Slow rotate idle
    this.tweens.add({
      targets: this.wheelContainer,
      angle: "+=360",
      duration: 60000,
      repeat: -1
    });
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
    let cumAngle = -90 // degrees, starting at top
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
      duration: 500,
      ease: "Back.easeOut",
      onComplete: () => {
        void climax(this.juice, this, {
          hitstopMs: 120,
          shake: { intensity: 0.01, ms: 250 },
          pop: { x: this.wheelContainer.x, y: this.wheelContainer.y, color: toHex(THEME.colors.primary), count: 30 },
        }).then(() => {
          this.time.delayedCall(1800, () => sendWheelDone())
        })
      },
    })
  }
}
