import Phaser from "phaser";
import "./style.css";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { BootScene } from "./scenes/BootScene";
import { CharacterSelectScene } from "./scenes/CharacterSelectScene";
import { CollapsingEscapeScene } from "./scenes/CollapsingEscapeScene";
import { FinalTimeScene } from "./scenes/FinalTimeScene";
import { GameScene } from "./scenes/GameScene";
import { GravityFlipScene } from "./scenes/GravityFlipScene";
import { IntroScene } from "./scenes/IntroScene";
import { Level2Scene } from "./scenes/Level2Scene";
import { Level3Scene } from "./scenes/Level3Scene";
import { Level4Scene } from "./scenes/Level4Scene";
import { Level5Scene } from "./scenes/Level5Scene";
import { Level6Scene } from "./scenes/Level6Scene";
import { Level7Scene } from "./scenes/Level7Scene";
import { Level8Scene } from "./scenes/Level8Scene";
import { Level9Scene } from "./scenes/Level9Scene";
import { Level10Scene } from "./scenes/Level10Scene";
import { MagneticFacilityScene } from "./scenes/MagneticFacilityScene";
import { MusicControlScene } from "./scenes/MusicControlScene";
import { NoiseStealthScene } from "./scenes/NoiseStealthScene";
import { RisingWaterScene } from "./scenes/RisingWaterScene";
import { SizeShiftScene } from "./scenes/SizeShiftScene";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#0b1020",
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scene: [
    BootScene,
    MusicControlScene,
    IntroScene,
    CharacterSelectScene,
    FinalTimeScene,
    GameScene,
    GravityFlipScene,
    RisingWaterScene,
    Level2Scene,
    Level3Scene,
    Level4Scene,
    Level5Scene,
    Level6Scene,
    Level7Scene,
    Level8Scene,
    Level9Scene,
    NoiseStealthScene,
    CollapsingEscapeScene,
    SizeShiftScene,
    MagneticFacilityScene,
    Level10Scene,
  ],
});
