import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    // Put asset loads here later (images/audio/etc).
  }

  create() {
    this.scene.start("level-4");
  }
}
