import Phaser from "phaser"
import { CharacterSelectScene } from "./scenes/CharacterSelectScene"
import { LobbyScene } from "./scenes/LobbyScene"
import { WheelScene } from "./scenes/WheelScene"
import { GameSelectScene } from "./scenes/GameSelectScene"
import { ChessScene } from "./scenes/ChessScene"
import { Connect4Scene } from "./scenes/Connect4Scene"
import { ResultScene } from "./scenes/ResultScene"
import { CRTPipeline } from "./shaders/CRTPipeline"

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#0d0221",
  pixelArt: true,
  scene: [CharacterSelectScene, LobbyScene, WheelScene, GameSelectScene, ChessScene, Connect4Scene, ResultScene],
  parent: document.body,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  pipeline: { 'CRTPipeline': CRTPipeline } as any
})
