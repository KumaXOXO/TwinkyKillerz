import Phaser from "phaser"
import { CHARACTERS } from "@twinky/shared/constants"
import { sounds } from "../utils/SoundManager"

const COLS = 3
const ROWS = 2
const CARD_W = 180
const CARD_H = 90
const GAP = 10
const GRID_LEFT = (800 - COLS * CARD_W - (COLS - 1) * GAP) / 2
const GRID_TOP = 240
const VERSION = "v0.2.0"

const C = {
  bg: 0x0d0d1a,
  panel: 0x16162a,
  border: 0x3a2a6e,
  selected: 0x6633cc,
  text: "#e8d5ff",
  muted: "#7070a0",
}

export class CharacterSelectScene extends Phaser.Scene {
  private typedName = ""
  private selectedIdx = 0
  private cursorVisible = true
  private cursorTimer = 0
  private nameText!: Phaser.GameObjects.Text
  private hintText!: Phaser.GameObjects.Text
  private cards: Phaser.GameObjects.Rectangle[] = []
  private cardBorders: Phaser.GameObjects.Rectangle[] = []

  constructor() {
    super({ key: "CharacterSelectScene" })
  }

  create() {
    const { width, height } = this.scale
    sounds.resume()

    this.add
      .text(width / 2, 40, "TWINKY GAMES", { fontSize: "38px", color: C.text, fontStyle: "bold" })
      .setOrigin(0.5)
    this.add
      .text(width / 2, 88, "Choose your character", { fontSize: "16px", color: C.muted })
      .setOrigin(0.5)

    this.add
      .text(width - 8, height - 8, VERSION, { fontSize: "11px", color: C.muted })
      .setOrigin(1, 1)

    // Name input box
    this.add
      .text(width / 2, 148, "Your name:", { fontSize: "15px", color: C.muted })
      .setOrigin(0.5)
    this.add.rectangle(width / 2, 178, 280, 40, C.panel).setStrokeStyle(2, C.border)
    this.nameText = this.add
      .text(width / 2, 178, "", { fontSize: "20px", color: C.text })
      .setOrigin(0.5)

    // Character grid
    CHARACTERS.forEach((ch, i) => {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const cx = GRID_LEFT + col * (CARD_W + GAP) + CARD_W / 2
      const cy = GRID_TOP + row * (CARD_H + GAP) + CARD_H / 2

      const border = this.add
        .rectangle(cx, cy, CARD_W, CARD_H, C.panel)
        .setStrokeStyle(2, C.border)
        .setInteractive({ useHandCursor: true })
      const card = this.add.rectangle(cx, cy, CARD_W - 4, CARD_H - 4, C.panel)
      this.cardBorders.push(border)
      this.cards.push(card)

      border.on("pointerdown", () => {
        this.selectedIdx = i
        sounds.menuNav()
        this.refreshSelection()
      })

      this.add.text(cx, cy - 18, ch.symbol, { fontSize: "28px", color: ch.color }).setOrigin(0.5)
      this.add.text(cx, cy + 18, ch.name, { fontSize: "13px", color: ch.color }).setOrigin(0.5)
    })

    this.hintText = this.add
      .text(width / 2, height - 30, "Arrows: choose  |  ENTER: join", {
        fontSize: "13px",
        color: C.muted,
      })
      .setOrigin(0.5)

    this.refreshSelection()
    this.refreshNameCursor()

    this.input.keyboard!.on("keydown", this.handleKey, this)
  }

  update(_time: number, delta: number) {
    this.cursorTimer += delta
    if (this.cursorTimer >= 500) {
      this.cursorTimer = 0
      this.cursorVisible = !this.cursorVisible
      this.refreshNameCursor()
    }
  }

  shutdown() {
    this.input.keyboard!.off("keydown", this.handleKey, this)
  }

  private handleKey(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") {
      this.selectedIdx = (this.selectedIdx - 1 + CHARACTERS.length) % CHARACTERS.length
      sounds.menuNav()
      this.refreshSelection()
    } else if (event.key === "ArrowRight") {
      this.selectedIdx = (this.selectedIdx + 1) % CHARACTERS.length
      sounds.menuNav()
      this.refreshSelection()
    } else if (event.key === "ArrowUp") {
      this.selectedIdx = (this.selectedIdx - COLS + CHARACTERS.length) % CHARACTERS.length
      sounds.menuNav()
      this.refreshSelection()
    } else if (event.key === "ArrowDown") {
      this.selectedIdx = (this.selectedIdx + COLS) % CHARACTERS.length
      sounds.menuNav()
      this.refreshSelection()
    } else if (event.key === "Enter") {
      const name = this.typedName.trim()
      if (!name) return
      sounds.menuConfirm()
      const ch = CHARACTERS[this.selectedIdx]
      this.scene.start("LobbyScene", { name, characterId: ch?.id ?? "knight" })
    } else if (event.key === "Backspace") {
      this.typedName = this.typedName.slice(0, -1)
      this.refreshNameCursor()
    } else if (event.key.length === 1 && this.typedName.length < 20) {
      this.typedName += event.key
      this.refreshNameCursor()
    }
  }

  private refreshSelection() {
    this.cardBorders.forEach((b, i) => {
      const color = i === this.selectedIdx ? C.selected : C.border
      b.setStrokeStyle(2, color)
    })
    this.cards.forEach((c, i) => {
      c.setFillStyle(i === this.selectedIdx ? C.selected : C.panel)
    })
    const ch = CHARACTERS[this.selectedIdx]
    const name = this.typedName.trim()
    if (ch) {
      this.hintText?.setText(
        name ? `Playing as ${ch.name} — ENTER to join` : "Type your name, then ENTER to join",
      )
    }
  }

  private refreshNameCursor() {
    this.nameText?.setText(this.typedName + (this.cursorVisible ? "|" : " "))
  }
}
