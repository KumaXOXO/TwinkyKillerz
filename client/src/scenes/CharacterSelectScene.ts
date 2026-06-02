import Phaser from "phaser"
import { CHARACTERS } from "@twinky/shared/constants"
import { sounds } from "../utils/SoundManager"
import { joinByCode, getPublicLobbies, joinLobbyById, type LobbyInfo } from "../network/ColyseusClient"
import { THEME, toHex } from "../utils/Theme"
import { UIFactory } from "../utils/UIFactory"

const COLS = 4
const CARD_W = 160
const CARD_H = 180
const GAP = 20
const GRID_LEFT = (800 - COLS * CARD_W - (COLS - 1) * GAP) / 2
const GRID_TOP = 200
const VERSION = "v0.5.0-ANIMATED"

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
    // Load SpriteSheets
    this.load.spritesheet('char_main', 'assets/Gemini_Generated_Image_qhrnp3qhrnp3qhrn.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('char_robin', 'assets/Gemini_Generated_Image_m0w3i8m0w3i8m0w3.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('char_ingo', 'assets/Gemini_Generated_Image_5pmfmo5pmfmo5pmf.png', { frameWidth: 128, frameHeight: 128 });
  }

  create() {
    const { width, height } = this.scale
    sounds.resume()
    this.cameras.main.setPostPipeline('CRTPipeline')

    // Setup Animations
    CHARACTERS.forEach((ch) => {
      const row = ch.frameRow;
      const start = row * 4;
      const end = start + 3;

      this.anims.create({
        key: `anim_${ch.id}`,
        frames: this.anims.generateFrameNumbers(ch.asset, { start, end }),
        frameRate: 8,
        repeat: -1
      });
    });

    UIFactory.createHeader(this, width / 2, 40, "IDENTITY SELECTION")

    this.add
      .text(width / 2, 80, "AUTHORIZED PERSONNEL ONLY", {
        fontFamily: THEME.fonts.body,
        fontSize: "18px",
        color: THEME.colors.muted
      })
      .setOrigin(0.5)

    // Name input box
    this.add
      .text(width / 2, 120, "SCANNING ID TAG...", {
        fontFamily: THEME.fonts.body,
        fontSize: "16px",
        color: THEME.colors.muted
      })
      .setOrigin(0.5)

    this.add.rectangle(width / 2, 155, 320, 44, toHex(THEME.colors.black)).setStrokeStyle(2, toHex(THEME.colors.border))
    this.nameText = this.add
      .text(width / 2, 155, "", {
        fontFamily: THEME.fonts.header,
        fontSize: "20px",
        color: THEME.colors.white
      })
      .setOrigin(0.5)

    // Character grid
    CHARACTERS.forEach((ch, i) => {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const cx = GRID_LEFT + col * (CARD_W + GAP) + CARD_W / 2
      const cy = GRID_TOP + row * (CARD_H + GAP) + CARD_H / 2

      const container = this.add.container(cx, cy)
      const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, toHex(THEME.colors.panel))
        .setStrokeStyle(2, toHex(THEME.colors.border))
        .setInteractive({ useHandCursor: true })

      const sprite = this.add.sprite(0, -20, ch.asset, ch.frameRow * 4).setScale(ch.asset === 'char_main' ? 2 : 1)
      const name = this.add.text(0, 55, ch.name.toUpperCase(), {
        fontFamily: THEME.fonts.header,
        fontSize: "10px",
        color: ch.color,
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
          y: cy - 10,
          duration: 150,
          ease: 'Power2'
        })
        sprite.play(`anim_${ch.id}`)
      })

      bg.on("pointerout", () => {
        this.tweens.add({
          targets: container,
          scale: this.selectedIdx === i ? 1.05 : 1,
          y: this.selectedIdx === i ? cy - 10 : cy,
          duration: 150,
          ease: 'Power2'
        })
        if (this.selectedIdx !== i) {
          sprite.stop()
          sprite.setFrame(ch.frameRow * 4)
        }
      })

      // Random slow wobble
      this.tweens.add({
        targets: container,
        angle: { from: -0.5, to: 0.5 },
        duration: 3000 + Math.random() * 2000,
        ease: 'Sine.easeInOut',
        yoyo: true,
        loop: -1
      })
    })

    const btnY = height - 60
    this.createBtn = UIFactory.createButton(this, width / 2 - 130, btnY, 240, 48, "INITIALIZE ROOM", () => {
      if (!this.typedName.trim()) return
      sounds.menuConfirm()
      this.showCreateDialog()
    })

    this.joinBtn = UIFactory.createButton(this, width / 2 + 130, btnY, 240, 48, "LINK VIA CODE", () => {
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
      } else if ((event.ctrlKey || event.metaKey) && event.key === "v") {
        navigator.clipboard.readText().then(text => {
          const cleaned = text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6)
          if (cleaned) { this.typedCode = cleaned; this.updateCodeDisplay() }
        }).catch(() => {})
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && this.typedCode.length < 6) {
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
      if (this.selectedIdx < 0) this.selectedIdx += CHARACTERS.length
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
        sprite.setFrame(ch.frameRow * 4)
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
      .text(width / 2, height / 2 - 210, "UPLINK REQUIRED", {
        fontFamily: THEME.fonts.header,
        fontSize: "18px",
        color: THEME.colors.white
      })
      .setOrigin(0.5)
      .setDepth(11)

    const listTitle = this.add
      .text(width / 2 - 170, height / 2 - 170, "AVAILABLE NODES", {
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
      .text(width / 2 + 170, height / 2 - 170, "OR INPUT SEQUENCE", {
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

    const pasteBg = this.add
      .rectangle(width / 2 + 170, height / 2 - 15, 100, 28, toHex(THEME.colors.panel))
      .setStrokeStyle(1, toHex(THEME.colors.border))
      .setInteractive({ useHandCursor: true })
      .setDepth(12)
    const pasteLbl = this.add
      .text(width / 2 + 170, height / 2 - 15, "PASTE", {
        fontFamily: THEME.fonts.header,
        fontSize: "11px",
        color: THEME.colors.muted
      })
      .setOrigin(0.5)
      .setDepth(13)
    pasteBg.on("pointerover", () => pasteBg.setFillStyle(0x1f1f3a))
    pasteBg.on("pointerout", () => pasteBg.setFillStyle(toHex(THEME.colors.panel)))
    pasteBg.on("pointerdown", () => {
      navigator.clipboard.readText().then(text => {
        const cleaned = text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6)
        if (cleaned) { this.typedCode = cleaned; this.updateCodeDisplay() }
      }).catch(() => this.setCodeError("ACCESS DENIED"))
    })

    const codeHint = this.add
      .text(width / 2 + 170, height / 2 + 20, "EXECUTE TO CONNECT", {
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
      .text(width / 2, height / 2 + 210, "ESCAPE TO ABORT", {
        fontFamily: THEME.fonts.body,
        fontSize: "12px",
        color: THEME.colors.muted
      })
      .setOrigin(0.5)
      .setDepth(11)

    this.codeDisplayText = codeDisplay
    this.codeErrorText = errText
    this.choiceGroup.push(overlay, title, listTitle, listBg, codeTitle, codeBg, codeInputBox, codeDisplay, pasteBg, pasteLbl, codeHint, errText, closeHint)

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
        .text(listX, height / 2 + 10, "NO ACTIVE NODES FOUND", {
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
        .text(listX + 120, y, isFull ? "FULL" : "LINK", {
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
    this.setCodeError("UPLINKING...")
    try {
      const room = await joinLobbyById(this.typedName.trim(), ch?.id ?? "lucas", roomId)
      this.scene.start("LobbyScene", {
        name: this.typedName.trim(),
        characterId: ch?.id ?? "lucas",
        joinMode: "existing",
        room,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "LINK FAILED"
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
      .text(width / 2, height / 2 - 130, "SYSTEM INITIALIZATION", {
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

    const playerObjs = makeToggleRow("SLOTS", ["2", "3", "4"], height / 2 - 70,
      () => String(dlgPlayers),
      v => { dlgPlayers = Number(v) }
    )
    const modeObjs = makeToggleRow("PROTOCOL", ["OLYMPIADE", "SINGLE"], height / 2,
      () => dlgMode.toUpperCase(),
      v => { dlgMode = v.toLowerCase() }
    )
    const visObjs = makeToggleRow("VISIBILITY", ["PUBLIC", "PRIVATE"], height / 2 + 70,
      () => (dlgPrivate ? "PRIVATE" : "PUBLIC"),
      v => { dlgPrivate = v === "PRIVATE" }
    )

    const createBtnContainer = UIFactory.createButton(this, width / 2, height / 2 + 120, 240, 40, "INITIALIZE", () => {
      sounds.menuConfirm()
      this.clearDialogGroup(group)
      this.joinPhase = "character"
      this.startCreate(dlgPlayers, dlgMode, dlgPrivate)
    })
    createBtnContainer.setDepth(21)

    const cancelHint = this.add.text(width / 2, height / 2 + 148, "ESCAPE TO ABORT", {
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
    this.setCodeError("UPLINKING...")
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
      const msg = err instanceof Error ? err.message : "LINK FAILED"
      this.setCodeError(msg)
      this.typedCode = ""
      this.updateCodeDisplay()
      this.isConnecting = false
    }
  }
}
