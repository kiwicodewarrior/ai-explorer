import Phaser from "phaser";
import { ensureRetroMusic } from "../systems/music";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    // Put asset loads here later (images/audio/etc).
  }

  create() {
    ensureRetroMusic(this);

    if (!this.scene.isActive("music-control")) {
      this.scene.launch("music-control");
      this.scene.bringToTop("music-control");
    }

    this.scene.start("intro");
  }
}
