import Phaser from "phaser";
import { GAME_WIDTH } from "../config";
import { ensureRetroMusic, isRetroMusicMuted, toggleRetroMusicMute } from "../systems/music";

export class MusicControlScene extends Phaser.Scene {
  private muteText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private muteKey?: Phaser.Input.Keyboard.Key;
  private statusTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super("music-control");
  }

  create() {
    ensureRetroMusic(this);

    this.muteText = this.add
      .text(GAME_WIDTH - 16, 12, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#e8f5ff",
        stroke: "#04111b",
        strokeThickness: 4,
        align: "right",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(5000);

    this.statusText = this.add
      .text(GAME_WIDTH - 16, 34, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#bfe9ff",
        stroke: "#04111b",
        strokeThickness: 4,
        align: "right",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(5000);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.addCapture(Phaser.Input.Keyboard.KeyCodes.M);
      this.muteKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    }

    this.refreshMuteText();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
  }

  update() {
    this.scene.bringToTop("music-control");

    if (this.muteKey && Phaser.Input.Keyboard.JustDown(this.muteKey)) {
      const muted = toggleRetroMusicMute();
      this.refreshMuteText();
      this.showStatus(muted ? "Music muted" : "Music on");
    }
  }

  private refreshMuteText() {
    this.muteText.setText(isRetroMusicMuted() ? "M: Music OFF" : "M: Music ON");
    this.muteText.setColor(isRetroMusicMuted() ? "#ffb9b9" : "#e8f5ff");
  }

  private showStatus(message: string) {
    this.statusText.setText(message);
    this.statusTimer?.destroy();
    this.statusTimer = this.time.delayedCall(1200, () => {
      this.statusText.setText("");
      this.statusTimer = undefined;
    });
  }

  private handleShutdown() {
    this.statusTimer?.destroy();
    this.statusTimer = undefined;
    this.muteText?.destroy();
    this.statusText?.destroy();
  }
}
