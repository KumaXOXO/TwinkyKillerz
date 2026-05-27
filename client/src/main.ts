import Phaser from "phaser"
import { CharacterSelectScene } from "./scenes/CharacterSelectScene"
import { LobbyScene } from "./scenes/LobbyScene"
import { WheelScene } from "./scenes/WheelScene"
import { ChessScene } from "./scenes/ChessScene"
import { Connect4Scene } from "./scenes/Connect4Scene"
import { ResultScene } from "./scenes/ResultScene"

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#0d0d1a",
  scene: [CharacterSelectScene, LobbyScene, WheelScene, ChessScene, Connect4Scene, ResultScene],
  parent: document.body,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
})
