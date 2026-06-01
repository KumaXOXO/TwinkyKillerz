import Phaser from "phaser"
import { CHARACTERS } from "@twinky/shared/constants"
import { sounds } from "../utils/SoundManager"
import { joinByCode, getPublicLobbies, joinLobbyById, type LobbyInfo } from "../network/ColyseusClient"

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
  private joinPhase: "character" | "codeInput" = "character"
  private isConnecting = false
  private typedCode = ""
  private choiceGroup: Phaser.GameObjects.GameObject[] = []
  private codeDisplayText?: Phaser.GameObjects.Text
  private codeErrorText?: Phaser.GameObjects.Text
  private isPrivate = false
  private privateBtn?: Phaser.GameObjects.Rectangle
  private privateBtnLabel?: Phaser.GameObjects.Text
  private lobbyRows: Phaser.GameObjects.GameObject[] = []
  private refreshTimer?: Phaser.Time.TimerEvent
  private createBtn!: Phaser.GameObjects.Rectangle
  private createBtnLabel!: Phaser.GameObjects.Text
  private joinBtn!: Phaser.GameObjects.Rectangle
  private joinBtnLabel!: Phaser.GameObjects.Text

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
      .text(width / 2, height - 30, "Arrows: choose character  |  ENTER: create room", {
        fontSize: "13px",
        color: C.muted,
      })
      .setOrigin(0.5)

    const btnY = height - 62
    this.createBtn = this.add
      .rectangle(width / 2 - 110, btnY, 190, 44, C.border)
      .setInteractive({ useHandCursor: true })
    this.createBtnLabel = this.add
      .text(width / 2 - 110, btnY, "CREATE ROOM", { fontSize: "14px", color: C.text })
      .setOrigin(0.5)
    this.joinBtn = this.add
      .rectangle(width / 2 + 110, btnY, 190, 44, C.border)
      .setInteractive({ useHandCursor: true })
    this.joinBtnLabel = this.add
      .text(width / 2 + 110, btnY, "JOIN WITH CODE", { fontSize: "14px", color: C.text })
      .setOrigin(0.5)

    this.createBtn.on("pointerover", () => {
      if (this.typedName.trim()) this.createBtn.setFillStyle(C.selected)
    })
    this.createBtn.on("pointerout", () => this.createBtn.setFillStyle(C.border))
    this.createBtn.on("pointerdown", () => {
      if (!this.typedName.trim()) return
      sounds.menuConfirm()
      this.startCreate()
    })
    this.joinBtn.on("pointerover", () => {
      if (this.typedName.trim()) this.joinBtn.setFillStyle(C.selected)
    })
    this.joinBtn.on("pointerout", () => this.joinBtn.setFillStyle(C.border))
    this.joinBtn.on("pointerdown", () => {
      if (!this.typedName.trim()) return
      sounds.menuNav()
      this.showCodeInput()
    })

    this.privateBtn = this.add
      .rectangle(width / 2, btnY + 50, 220, 32, C.panel)
      .setStrokeStyle(2, C.border)
      .setInteractive({ useHandCursor: true })
    this.privateBtnLabel = this.add
      .text(width / 2, btnY + 50, "PRIVATE LOBBY: OFF", { fontSize: "12px", color: C.muted })
      .setOrigin(0.5)
    this.privateBtn.on("pointerover", () => this.privateBtn?.setFillStyle(0x1f1f3a))
    this.privateBtn.on("pointerout", () => this.privateBtn?.setFillStyle(C.panel))
    this.privateBtn.on("pointerdown", () => {
      this.isPrivate = !this.isPrivate
      this.privateBtnLabel?.setText(`PRIVATE LOBBY: ${this.isPrivate ? "ON" : "OFF"}`)
      this.privateBtnLabel?.setColor(this.isPrivate ? C.text : C.muted)
      sounds.menuNav()
    })

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
    this.refreshTimer?.remove(false)
    this.refreshTimer = undefined
    this.joinPhase = "character"
    this.input.keyboard!.off("keydown", this.handleKey, this)
  }

  private handleKey(event: KeyboardEvent) {
    if (this.joinPhase === "codeInput") {
      if (event.key === "Escape") {
        this.clearChoiceGroup()
        this.joinPhase = "character"
      } else if (event.key === "Backspace") {
        this.typedCode = this.typedCode.slice(0, -1)
        this.updateCodeDisplay()
      } else if (event.key === "Enter" && this.typedCode.trim().length >= 4) {
        sounds.menuConfirm()
        this.startWithCode()
      } else if (event.key.length === 1 && this.typedCode.length < 6) {
        this.typedCode += event.key.toUpperCase()
        this.updateCodeDisplay()
      }
      return
    }
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
      if (this.joinPhase !== "character") return
      const name = this.typedName.trim()
      if (!name) return
      sounds.menuConfirm()
      this.startCreate()
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
  }

  private refreshNameCursor() {
    this.nameText?.setText(this.typedName + (this.cursorVisible ? "|" : " "))
    this.refreshButtons()
  }

  private refreshButtons() {
    const hasName = this.typedName.trim().length > 0
    const alpha = hasName ? 1 : 0.4
    this.createBtn?.setAlpha(alpha).setFillStyle(C.border)
    this.createBtnLabel?.setAlpha(alpha)
    this.joinBtn?.setAlpha(alpha).setFillStyle(C.border)
    this.joinBtnLabel?.setAlpha(alpha)
  }

  private showCodeInput() {
    this.joinPhase = "codeInput"
    this.typedCode = ""
    this.clearChoiceGroup()
    const { width, height } = this.scale

    const overlay = this.add
      .rectangle(width / 2, height / 2, 720, 460, 0x0d0d1a)
      .setStrokeStyle(2, C.border)
      .setDepth(10)
    const title = this.add
      .text(width / 2, height / 2 - 210, "JOIN A LOBBY", { fontSize: "18px", color: C.text, fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(11)

    const listTitle = this.add
      .text(width / 2 - 170, height / 2 - 170, "PUBLIC LOBBIES", { fontSize: "13px", color: C.muted })
      .setOrigin(0.5)
      .setDepth(11)
    const listBg = this.add
      .rectangle(width / 2 - 170, height / 2 + 10, 320, 340, C.panel)
      .setStrokeStyle(1, C.border)
      .setDepth(11)

    const codeTitle = this.add
      .text(width / 2 + 170, height / 2 - 170, "OR ENTER CODE", { fontSize: "13px", color: C.muted })
      .setOrigin(0.5)
      .setDepth(11)
    const codeBg = this.add
      .rectangle(width / 2 + 170, height / 2 + 10, 320, 340, C.panel)
      .setStrokeStyle(1, C.border)
      .setDepth(11)
    const codeInputBox = this.add
      .rectangle(width / 2 + 170, height / 2 - 60, 240, 44, 0x0a0a16)
      .setStrokeStyle(2, C.border)
      .setDepth(12)
    const codeDisplay = this.add
      .text(width / 2 + 170, height / 2 - 60, "", { fontSize: "22px", color: C.text, fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(13)
    const codeHint = this.add
      .text(width / 2 + 170, height / 2 + 10, "ENTER to join code", { fontSize: "12px", color: C.muted })
      .setOrigin(0.5)
      .setDepth(12)
    const errText = this.add
      .text(width / 2 + 170, height / 2 + 110, "", { fontSize: "13px", color: "#ff5555", wordWrap: { width: 280 }, align: "center" })
      .setOrigin(0.5)
      .setDepth(12)

    const closeHint = this.add
      .text(width / 2, height / 2 + 210, "ESC to close", { fontSize: "11px", color: C.muted })
      .setOrigin(0.5)
      .setDepth(11)

    this.codeDisplayText = codeDisplay
    this.codeErrorText = errText
    this.choiceGroup.push(overlay, title, listTitle, listBg, codeTitle, codeBg, codeInputBox, codeDisplay, codeHint, errText, closeHint)

    this.refreshLobbyList()
    this.refreshTimer = this.time.addEvent({
      delay: 3000,
      loop: true,
      callback: () => this.refreshLobbyList(),
    })
  }

  private async refreshLobbyList(): Promise<void> {
    if (this.joinPhase !== "codeInput") return
    const { width, height } = this.scale
    let lobbies: LobbyInfo[] = []
    try {
      lobbies = await getPublicLobbies()
    } catch {
      lobbies = []
    }
    if (this.joinPhase !== "codeInput") return
    this.lobbyRows.forEach(o => (o as { destroy(): void }).destroy())
    this.lobbyRows = []
    const listX = width / 2 - 170
    const startY = height / 2 - 140
    if (lobbies.length === 0) {
      const empty = this.add
        .text(listX, height / 2 + 10, "No public lobbies yet.\nCreate one!", { fontSize: "13px", color: C.muted, align: "center" })
        .setOrigin(0.5)
        .setDepth(12)
      this.lobbyRows.push(empty)
      return
    }
    lobbies.slice(0, 8).forEach((lobby, idx) => {
      const y = startY + idx * 38
      const isFull = lobby.playerCount >= lobby.maxPlayers
      const rowBg = this.add
        .rectangle(listX, y, 300, 32, 0x0a0a16)
        .setStrokeStyle(1, C.border)
        .setDepth(12)
      const label = this.add
        .text(listX - 140, y, `${lobby.roomCode}  ${lobby.playerCount}/${lobby.maxPlayers}`, {
          fontSize: "13px",
          color: isFull ? "#ff5555" : C.text,
        })
        .setOrigin(0, 0.5)
        .setDepth(13)
      const joinBtn = this.add
        .rectangle(listX + 120, y, 60, 24, isFull ? 0x2a1a2a : C.border)
        .setStrokeStyle(1, isFull ? 0x553333 : C.selected)
        .setDepth(13)
      const joinLabel = this.add
        .text(listX + 120, y, isFull ? "FULL" : "JOIN", {
          fontSize: "11px",
          color: isFull ? "#aa5555" : C.text,
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(14)
      if (!isFull) {
        joinBtn.setInteractive({ useHandCursor: true })
        joinBtn.on("pointerover", () => joinBtn.setFillStyle(C.selected))
        joinBtn.on("pointerout", () => joinBtn.setFillStyle(C.border))
        joinBtn.on("pointerdown", () => this.startWithLobbyId(lobby.roomId))
      }
      this.lobbyRows.push(rowBg, label, joinBtn, joinLabel)
    })
  }

  private async startWithLobbyId(roomId: string): Promise<void> {
    if (this.isConnecting) return
    this.isConnecting = true
    const ch = CHARACTERS[this.selectedIdx]
    this.setCodeError("Connecting...")
    try {
      const room = await joinLobbyById(this.typedName.trim(), ch?.id ?? "knight", roomId)
      this.scene.start("LobbyScene", {
        name: this.typedName.trim(),
        characterId: ch?.id ?? "knight",
        joinMode: "existing",
        room,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Join failed"
      this.setCodeError(msg)
      this.isConnecting = false
    }
  }

  private clearChoiceGroup() {
    this.refreshTimer?.remove(false)
    this.refreshTimer = undefined
    this.lobbyRows.forEach(o => (o as { destroy(): void }).destroy())
    this.lobbyRows = []
    this.choiceGroup.forEach(o => (o as { destroy(): void }).destroy())
    this.choiceGroup = []
    this.codeDisplayText = undefined
    this.codeErrorText = undefined
  }

  private updateCodeDisplay() {
    this.codeDisplayText?.setText(this.typedCode)
  }

  private startCreate() {
    const ch = CHARACTERS[this.selectedIdx]
    this.scene.start("LobbyScene", {
      name: this.typedName.trim(),
      characterId: ch?.id ?? "knight",
      joinMode: "create",
      isPrivate: this.isPrivate,
    })
  }

  private setCodeError(msg: string) {
    this.codeErrorText?.setText(msg)
  }

  private async startWithCode() {
    if (this.isConnecting) return
    this.isConnecting = true
    const ch = CHARACTERS[this.selectedIdx]
    this.setCodeError("Connecting...")
    try {
      const room = await joinByCode(
        this.typedName.trim(),
        ch?.id ?? "knight",
        this.typedCode.trim().toUpperCase(),
      )
      this.scene.start("LobbyScene", {
        name: this.typedName.trim(),
        characterId: ch?.id ?? "knight",
        joinMode: "existing",
        room,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Join failed"
      this.setCodeError(msg)
      this.typedCode = ""
      this.updateCodeDisplay()
      this.isConnecting = false
    }
  }
}
