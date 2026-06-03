import Phaser from "phaser"
import { CHARACTERS } from "@twinky/shared/constants"
import { sounds } from "../utils/SoundManager"
import { joinByCode, getPublicLobbies, joinLobbyById, type LobbyInfo } from "../network/ColyseusClient"
import { THEME, toHex } from "../utils/Theme"
import { UIFactory } from "../utils/UIFactory"

const VERSION = "v0.5.3-STABLE"

export class CharacterSelectScene extends Phaser.Scene {
  private typedName = ""
  private selectedIdx = 0
  private cursorVisible = true
  private cursorTimer = 0
  private nameText!: Phaser.GameObjects.Text
  private hintText!: Phaser.GameObjects.Text
  private cardContainers: Phaser.GameObjects.Container[] = []
  private cardBgs: Phaser.GameObjects.Rectangle[] = []
  private characterSprites: Phaser.GameObjects.Sprite[] = []
  private joinPhase: "character" | "codeInput" | "createDialog" = "character"
  private isConnecting = false
  private typedCode = ""
  private choiceGroup: Phaser.GameObjects.GameObject[] = []
  private codeDisplayText?: Phaser.GameObjects.Text
  private codeErrorText?: Phaser.GameObjects.Text
  private pasteListener: ((e: ClipboardEvent) => void) | null = null
  private lobbyRows: Phaser.GameObjects.GameObject[] = []
  private refreshTimer?: Phaser.Time.TimerEvent
  private createBtn!: Phaser.GameObjects.Container
  private joinBtn!: Phaser.GameObjects.Container

  constructor() {
    super({ key: "CharacterSelectScene" })
  }

  preload() {
    // Exact slicing based on Node dimension check (Width/4, Height/2)
    CHARACTERS.forEach(ch => {
      this.load.spritesheet(ch.asset, `assets/${ch.asset}.png`, { frameWidth: ch.fw, frameHeight: ch.fh });
    });
  }

  create() {
    const { width, height } = this.scale
    sounds.resume()
    this.cameras.main.setPostPipeline('CRTPipeline')

    // Setup Animations
    CHARACTERS.forEach((ch) => {
      this.anims.create({
        key: `anim_${ch.id}`,
        frames: this.anims.generateFrameNumbers(ch.asset, { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1
      });
    });

    // Old style header
    this.add.text(width / 2, 40, "TWINKY GAMES", {
        fontSize: "38px",
        color: THEME.colors.text,
        fontStyle: "bold"
    }).setOrigin(0.5);

    this.add
      .text(width / 2, 88, "Choose your character", {
        fontFamily: THEME.fonts.body,
        fontSize: "20px",
        color: THEME.colors.muted
      })
      .setOrigin(0.5)

    this.add
      .text(width - 8, height - 8, VERSION, {
        fontFamily: THEME.fonts.body,
        fontSize: "12px",
        color: THEME.colors.muted
      })
      .setOrigin(1, 1)

    // Name input box
    this.add
      .text(width / 2, 140, "SELECT YOUR NAME", {
        fontFamily: THEME.fonts.body,
        fontSize: "18px",
        color: THEME.colors.muted
      })
      .setOrigin(0.5)

    this.add.rectangle(width / 2, 178, 300, 44, toHex(THEME.colors.black)).setStrokeStyle(2, toHex(THEME.colors.border))
    this.nameText = this.add
      .text(width / 2, 178, "", {
        fontFamily: THEME.fonts.header,
        fontSize: "20px",
        color: THEME.colors.white
      })
      .setOrigin(0.5)

    // Modular Character Grid
    const CARD_W = 180
    const CARD_H = 180
    const GAP = 20
    const MAX_COLS = 3
    const totalChars = CHARACTERS.length
    const rows = Math.ceil(totalChars / MAX_COLS)
    const startY = 220

    CHARACTERS.forEach((ch, i) => {
      const col = i % MAX_COLS
      const row = Math.floor(i / MAX_COLS)

      // Center the grid row
      const rowSize = (row === rows - 1) ? (totalChars % MAX_COLS || MAX_COLS) : MAX_COLS
      const rowWidth = rowSize * CARD_W + (rowSize - 1) * GAP
      const rowStartX = (width - rowWidth) / 2 + CARD_W / 2

      const cx = rowStartX + col * (CARD_W + GAP)
      const cy = startY + row * (CARD_H + GAP) + CARD_H / 2

      const container = this.add.container(cx, cy)
      const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, toHex(THEME.colors.panel))
        .setStrokeStyle(2, toHex(THEME.colors.border))
        .setInteractive({ useHandCursor: true })

      // Individual Sprite
      const sprite = this.add.sprite(0, -15, ch.asset, 0).setScale(0.25)

      const name = this.add.text(0, 65, ch.name.toUpperCase(), {
        fontFamily: THEME.fonts.body,
        fontSize: "24px", // Increased size
        color: ch.color,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: CARD_W - 10 }
      }).setOrigin(0.5)

      container.add([bg, sprite, name])
      this.cardContainers.push(container)
      this.cardBgs.push(bg)
      this.characterSprites.push(sprite)

      bg.on("pointerdown", () => {
        this.selectedIdx = i
        sounds.menuNav()
        this.refreshSelection()
      })

      bg.on("pointerover", () => {
        this.tweens.add({
          targets: container,
          scale: 1.1,
          duration: 150,
          ease: 'Power2'
        })
        bg.setFillStyle(0xffffff, 0.4) // Strong white glow
        bg.setStrokeStyle(3, 0xffffff)
        sprite.play(`anim_${ch.id}`)
      })

      bg.on("pointerout", () => {
        const isSelected = this.selectedIdx === i
        this.tweens.add({
          targets: container,
          scale: isSelected ? 1.05 : 1,
          duration: 150,
          ease: 'Power2'
        })
        if (!isSelected) {
          bg.setFillStyle(toHex(THEME.colors.panel))
          bg.setStrokeStyle(2, toHex(THEME.colors.border))
          sprite.stop()
          sprite.setFrame(0)
        } else {
          bg.setFillStyle(0x2a1a4e)
          bg.setStrokeStyle(2, toHex(THEME.colors.primary))
        }
      })
    })

    const btnY = height - 62
    this.createBtn = UIFactory.createButton(this, width / 2 - 110, btnY, 190, 44, "CREATE ROOM", () => {
      if (!this.typedName.trim()) return
      sounds.menuConfirm()
      this.showCreateDialog()
    })

    this.joinBtn = UIFactory.createButton(this, width / 2 + 110, btnY, 190, 44, "JOIN WITH CODE", () => {
      if (!this.typedName.trim()) return
      sounds.menuNav()
      this.showCodeInput()
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
      if (this.joinPhase === "codeInput") this.updateCodeDisplay()
    }
  }

  shutdown() {
    this.refreshTimer?.remove(false)
    this.refreshTimer = undefined
    if (this.pasteListener) {
      window.removeEventListener("paste", this.pasteListener)
      this.pasteListener = null
    }
    this.joinPhase = "character"
    this.input.keyboard!.off("keydown", this.handleKey, this)
  }

  private handleKey(event: KeyboardEvent) {
    if (this.joinPhase === "createDialog") return
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
      const MAX_COLS = 3
      this.selectedIdx = (this.selectedIdx - MAX_COLS + CHARACTERS.length) % CHARACTERS.length
      if (this.selectedIdx < 0) this.selectedIdx += CHARACTERS.length
      sounds.menuNav()
      this.refreshSelection()
    } else if (event.key === "ArrowDown") {
      const MAX_COLS = 3
      this.selectedIdx = (this.selectedIdx + MAX_COLS) % CHARACTERS.length
      sounds.menuNav()
      this.refreshSelection()
    } else if (event.key === "Enter") {
      if (this.joinPhase !== "character") return
      const name = this.typedName.trim()
      if (!name) return
      sounds.menuConfirm()
      this.showCreateDialog()
    } else if (event.key === "Backspace") {
      this.typedName = this.typedName.slice(0, -1)
      this.refreshNameCursor()
    } else if (event.key.length === 1 && this.typedName.length < 20) {
      this.typedName += event.key
      this.refreshNameCursor()
    }
  }

  private refreshSelection() {
    this.cardBgs.forEach((b, i) => {
      const isSelected = i === this.selectedIdx
      b.setStrokeStyle(2, isSelected ? toHex(THEME.colors.primary) : toHex(THEME.colors.border))
      b.setFillStyle(isSelected ? 0x2a1a4e : toHex(THEME.colors.panel))

      const container = this.cardContainers[i]
      const sprite = this.characterSprites[i]
      const ch = CHARACTERS[i]

      if (isSelected) {
        this.tweens.add({
          targets: container,
          scale: 1.05,
          duration: 200,
          ease: 'Back.easeOut'
        })
        sprite.play(`anim_${ch.id}`)
      } else {
        this.tweens.add({
          targets: container,
          scale: 1.0,
          duration: 200,
          ease: 'Power1'
        })
        sprite.stop()
        sprite.setFrame(0)
      }
    })
  }

  private refreshNameCursor() {
    this.nameText?.setText(this.typedName + (this.cursorVisible ? "|" : " "))
    this.refreshButtons()
  }

  private refreshButtons() {
    const hasName = this.typedName.trim().length > 0
    const alpha = hasName ? 1 : 0.4
    this.createBtn?.setAlpha(alpha)
    this.joinBtn?.setAlpha(alpha)
  }

  private showCodeInput() {
    this.joinPhase = "codeInput"
    this.typedCode = ""
    this.clearChoiceGroup()
    const { width, height } = this.scale

    const overlay = this.add
      .rectangle(width / 2, height / 2, 720, 460, toHex(THEME.colors.bg), 0.95)
      .setStrokeStyle(2, toHex(THEME.colors.border))
      .setDepth(10)

    const title = this.add
      .text(width / 2, height / 2 - 210, "JOIN A LOBBY", {
        fontFamily: THEME.fonts.header,
        fontSize: "18px",
        color: THEME.colors.white
      })
      .setOrigin(0.5)
      .setDepth(11)

    const listTitle = this.add
      .text(width / 2 - 170, height / 2 - 170, "PUBLIC LOBBIES", {
        fontFamily: THEME.fonts.body,
        fontSize: "16px",
        color: THEME.colors.muted
      })
      .setOrigin(0.5)
      .setDepth(11)

    const listBg = this.add
      .rectangle(width / 2 - 170, height / 2 + 10, 320, 340, toHex(THEME.colors.panel))
      .setStrokeStyle(1, toHex(THEME.colors.border))
      .setDepth(11)

    const codeTitle = this.add
      .text(width / 2 + 170, height / 2 - 170, "OR ENTER CODE", {
        fontFamily: THEME.fonts.body,
        fontSize: "16px",
        color: THEME.colors.muted
      })
      .setOrigin(0.5)
      .setDepth(11)

    const codeBg = this.add
      .rectangle(width / 2 + 170, height / 2 + 10, 320, 340, toHex(THEME.colors.panel))
      .setStrokeStyle(1, toHex(THEME.colors.border))
      .setDepth(11)

    const codeInputBox = this.add
      .rectangle(width / 2 + 170, height / 2 - 60, 240, 44, toHex(THEME.colors.black))
      .setStrokeStyle(2, toHex(THEME.colors.border))
      .setDepth(12)

    const codeDisplay = this.add
      .text(width / 2 + 170, height / 2 - 60, "", {
        fontFamily: THEME.fonts.header,
        fontSize: "22px",
        color: THEME.colors.white
      })
      .setOrigin(0.5)
      .setDepth(13)

    const codeHint = this.add
      .text(width / 2 + 170, height / 2 + 20, "ENTER to join code", {
        fontFamily: THEME.fonts.body,
        fontSize: "14px",
        color: THEME.colors.muted
      })
      .setOrigin(0.5)
      .setDepth(12)

    const errText = this.add
      .text(width / 2 + 170, height / 2 + 110, "", {
        fontFamily: THEME.fonts.body,
        fontSize: "15px",
        color: "#ff5555",
        wordWrap: { width: 280 },
        align: "center"
      })
      .setOrigin(0.5)
      .setDepth(12)

    const closeHint = this.add
      .text(width / 2, height / 2 + 210, "ESC to close", {
        fontFamily: THEME.fonts.body,
        fontSize: "12px",
        color: THEME.colors.muted
      })
      .setOrigin(0.5)
      .setDepth(11)

    this.codeDisplayText = codeDisplay
    this.codeErrorText = errText
    this.choiceGroup.push(overlay, title, listTitle, listBg, codeTitle, codeBg, codeInputBox, codeDisplay, codeHint, errText, closeHint)

    this.pasteListener = (e: ClipboardEvent) => {
      if (this.joinPhase !== "codeInput") return
      const cleaned = (e.clipboardData?.getData("text") ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6)
      if (cleaned) { this.typedCode = cleaned; this.updateCodeDisplay() }
      e.preventDefault()
    }
    window.addEventListener("paste", this.pasteListener)

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
        .text(listX, height / 2 + 10, "No public lobbies yet.\nCreate one!", {
          fontFamily: THEME.fonts.body,
          fontSize: "15px",
          color: THEME.colors.muted,
          align: "center"
        })
        .setOrigin(0.5)
        .setDepth(12)
      this.lobbyRows.push(empty)
      return
    }
    lobbies.slice(0, 8).forEach((lobby, idx) => {
      const y = startY + idx * 38
      const isFull = lobby.playerCount >= lobby.maxPlayers
      const rowBg = this.add
        .rectangle(listX, y, 300, 32, toHex(THEME.colors.black))
        .setStrokeStyle(1, toHex(THEME.colors.border))
        .setDepth(12)
      const label = this.add
        .text(listX - 140, y, `${lobby.roomCode}  ${lobby.playerCount}/${lobby.maxPlayers}`, {
          fontFamily: THEME.fonts.body,
          fontSize: "14px",
          color: isFull ? "#ff5555" : THEME.colors.text,
        })
        .setOrigin(0, 0.5)
        .setDepth(13)
      const joinBtn = this.add
        .rectangle(listX + 120, y, 60, 24, isFull ? 0x2a1a2a : toHex(THEME.colors.border))
        .setStrokeStyle(1, isFull ? 0x553333 : toHex(THEME.colors.secondary))
        .setDepth(13)
      const joinLabel = this.add
        .text(listX + 120, y, isFull ? "FULL" : "JOIN", {
          fontFamily: THEME.fonts.header,
          fontSize: "10px",
          color: isFull ? "#aa5555" : THEME.colors.white,
        })
        .setOrigin(0.5)
        .setDepth(14)
      if (!isFull) {
        joinBtn.setInteractive({ useHandCursor: true })
        joinBtn.on("pointerover", () => joinBtn.setFillStyle(toHex(THEME.colors.secondary)))
        joinBtn.on("pointerout", () => joinBtn.setFillStyle(toHex(THEME.colors.border)))
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
      const room = await joinLobbyById(this.typedName.trim(), ch?.id ?? "lucas", roomId)
      this.scene.start("LobbyScene", {
        name: this.typedName.trim(),
        characterId: ch?.id ?? "lucas",
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
    if (this.pasteListener) {
      window.removeEventListener("paste", this.pasteListener)
      this.pasteListener = null
    }
    this.lobbyRows.forEach(o => (o as { destroy(): void }).destroy())
    this.lobbyRows = []
    this.choiceGroup.forEach(o => (o as { destroy(): void }).destroy())
    this.choiceGroup = []
    this.codeDisplayText = undefined
    this.codeErrorText = undefined
  }

  private updateCodeDisplay() {
    const cursor = this.joinPhase === "codeInput" && this.cursorVisible ? "|" : " "
    this.codeDisplayText?.setText(this.typedCode + cursor)
  }

  private startCreate(maxPlayers = 2, gameMode = "olympiade", isPrivate = false) {
    const ch = CHARACTERS[this.selectedIdx]
    this.scene.start("LobbyScene", {
      name: this.typedName.trim(),
      characterId: ch?.id ?? "lucas",
      joinMode: "create",
      isPrivate,
      maxPlayers,
      gameMode,
    })
  }

  private showCreateDialog() {
    if (this.joinPhase !== "character") return
    this.joinPhase = "createDialog"
    const { width, height } = this.scale

    let dlgPlayers = 2
    let dlgMode = "olympiade"
    let dlgPrivate = false

    const overlay = this.add
      .rectangle(width / 2, height / 2, 480, 320, toHex(THEME.colors.bg), 0.97)
      .setStrokeStyle(2, toHex(THEME.colors.border))
      .setDepth(20)

    const title = this.add
      .text(width / 2, height / 2 - 130, "CREATE ROOM", {
        fontFamily: THEME.fonts.header,
        fontSize: "18px",
        color: THEME.colors.white
      })
      .setOrigin(0.5)
      .setDepth(21)

    const makeToggleRow = (
      label: string,
      options: string[],
      y: number,
      getCurrent: () => string,
      setValue: (v: string) => void
    ) => {
      const lbl = this.add.text(width / 2 - 180, y, label, {
        fontFamily: THEME.fonts.body,
        fontSize: "14px",
        color: THEME.colors.muted
      }).setOrigin(0, 0.5).setDepth(21)

      const btns = options.map((opt, i) => {
        const bx = width / 2 + (i - (options.length - 1) / 2) * 110
        const bg = this.add.rectangle(bx, y, 100, 32, toHex(THEME.colors.panel))
          .setStrokeStyle(2, toHex(THEME.colors.border))
          .setInteractive({ useHandCursor: true })
          .setDepth(21)
        const txt = this.add.text(bx, y, opt, {
          fontFamily: THEME.fonts.header,
          fontSize: "12px",
          color: THEME.colors.muted
        }).setOrigin(0.5).setDepth(22)

        const refresh = () => {
          const active = getCurrent() === opt
          bg.setFillStyle(active ? 0x2a1a4e : toHex(THEME.colors.panel))
          bg.setStrokeStyle(2, active ? toHex(THEME.colors.primary) : toHex(THEME.colors.border))
          txt.setColor(active ? THEME.colors.white : THEME.colors.muted)
        }
        refresh()

        bg.on("pointerdown", () => {
          setValue(opt)
          sounds.menuNav()
          btns.forEach(b => b.refresh())
        })
        bg.on("pointerover", () => { if (getCurrent() !== opt) bg.setFillStyle(0x1a1a2e) })
        bg.on("pointerout", () => refresh())

        return { bg, txt, refresh }
      })

      return [lbl, ...btns.map(b => b.bg), ...btns.map(b => b.txt)] as Phaser.GameObjects.GameObject[]
    }

    const playerObjs = makeToggleRow("PLAYERS", ["2", "3", "4"], height / 2 - 70,
      () => String(dlgPlayers),
      v => { dlgPlayers = Number(v) }
    )
    const modeObjs = makeToggleRow("MODE", ["OLYMPIADE", "SINGLE"], height / 2,
      () => dlgMode.toUpperCase(),
      v => { dlgMode = v.toLowerCase() }
    )
    const visObjs = makeToggleRow("VISIBILITY", ["PUBLIC", "PRIVATE"], height / 2 + 70,
      () => (dlgPrivate ? "PRIVATE" : "PUBLIC"),
      v => { dlgPrivate = v === "PRIVATE" }
    )

    const createBtnContainer = UIFactory.createButton(this, width / 2, height / 2 + 120, 200, 40, "CREATE", () => {
      sounds.menuConfirm()
      this.clearDialogGroup(group)
      this.joinPhase = "character"
      this.startCreate(dlgPlayers, dlgMode, dlgPrivate)
    })
    createBtnContainer.setDepth(21)

    const cancelHint = this.add.text(width / 2, height / 2 + 148, "ESC to cancel", {
      fontFamily: THEME.fonts.body,
      fontSize: "12px",
      color: THEME.colors.muted
    }).setOrigin(0.5).setDepth(21)

    const group = [overlay, title, ...playerObjs, ...modeObjs, ...visObjs, createBtnContainer, cancelHint]

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.clearDialogGroup(group)
        this.joinPhase = "character"
        this.input.keyboard!.off("keydown", onEsc)
      }
    }
    this.input.keyboard!.on("keydown", onEsc)
  }

  private clearDialogGroup(group: Phaser.GameObjects.GameObject[]) {
    group.forEach(o => {
      try { (o as { destroy(): void }).destroy() } catch { /* already destroyed */ }
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
        ch?.id ?? "lucas",
        this.typedCode.trim().toUpperCase(),
      )
      this.scene.start("LobbyScene", {
        name: this.typedName.trim(),
        characterId: ch?.id ?? "lucas",
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
