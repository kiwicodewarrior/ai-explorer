import Phaser from "phaser";
import {
  CHARACTER_OPTIONS,
  DEFAULT_CHARACTER_ID,
  GAME_HEIGHT,
  GAME_WIDTH,
  type CharacterConfig,
  type CharacterId,
} from "../config";

type Level8SceneData = {
  characterId?: CharacterId;
  startingHealth?: number;
};

const TARGET_MIN_TIME_S = 7;
const TARGET_MAX_TIME_S = 7.5;
const MAX_TRIES = 8;
const TIMER_LIMIT_S = 10;

const TEXTURE_KEYS = {
  player: "level8-player",
} as const;

export class Level8Scene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;

  private confirmKey?: Phaser.Input.Keyboard.Key;
  private spaceKey?: Phaser.Input.Keyboard.Key;

  private hudText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  private currentHealth = 1;
  private triesLeft = MAX_TRIES;
  private timerRunning = false;
  private levelComplete = false;
  private outOfTries = false;
  private attemptStartTime = 0;
  private levelStartTime = 0;
  private levelEndTime?: number;

  constructor() {
    super("level-8");
  }

  create(data: Level8SceneData = {}) {
    this.selectedCharacter = this.resolveCharacter(data.characterId);
    const incomingHealth = Phaser.Math.Clamp(
      data.startingHealth ?? this.selectedCharacter.maxHealth,
      1,
      this.selectedCharacter.maxHealth,
    );

    this.currentHealth = Math.max(1, Math.ceil(incomingHealth / 2));
    this.triesLeft = MAX_TRIES;
    this.timerRunning = false;
    this.levelComplete = false;
    this.outOfTries = false;
    this.attemptStartTime = 0;
    this.levelStartTime = this.time.now;
    this.levelEndTime = undefined;

    this.cameras.main.setBackgroundColor(0x11131f);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createHud();
    this.bindInput();
    this.updateHud();

    this.statusText.setText("Health is halved. Start the stopwatch, then stop it between 7.00 and 7.50 seconds.");
    this.time.delayedCall(2200, () => {
      if (!this.levelComplete && !this.outOfTries && !this.timerRunning) this.statusText.setText("Press SPACE or ENTER to start.");
    });
  }

  private resolveCharacter(characterId?: CharacterId) {
    return (
      CHARACTER_OPTIONS.find((candidate) => candidate.id === (characterId ?? DEFAULT_CHARACTER_ID)) ??
      CHARACTER_OPTIONS[0]
    );
  }

  private createTextures() {
    if (!this.textures.exists(TEXTURE_KEYS.player)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(10, 2, 20, 12, 4);
      g.fillRoundedRect(8, 14, 24, 24, 5);
      g.fillRect(18, 16, 4, 20);
      g.fillRect(10, 38, 8, 8);
      g.fillRect(22, 38, 8, 8);
      g.generateTexture(TEXTURE_KEYS.player, 40, 48);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x11131f);
    this.add.rectangle(GAME_WIDTH / 2, 118, GAME_WIDTH, 200, 0x1b2540, 0.86);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 96, GAME_WIDTH, 192, 0x191320, 0.9);

    for (let x = 56; x < GAME_WIDTH; x += 120) {
      this.add.rectangle(x, GAME_HEIGHT / 2, 2, GAME_HEIGHT - 118, 0x2a3558, 0.2);
    }
    for (let y = 112; y < GAME_HEIGHT - 72; y += 72) {
      this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 96, 2, 0x2a3558, 0.18);
    }

    this.add
      .text(GAME_WIDTH / 2, 28, "Level 8: Seven-Second Stop", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f7fbff",
        stroke: "#080c15",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 58, "You get 8 tries. Stop the stopwatch between 7.00 and 7.50 seconds.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#d7e6f8",
      })
      .setOrigin(0.5);

    this.add.rectangle(176, 166, 220, 92, 0x101829, 0.88).setStrokeStyle(2, 0x5c7091, 0.7);
    this.add.image(104, 166, TEXTURE_KEYS.player).setTint(this.selectedCharacter.primaryColor).setScale(1.6);
    this.add
      .text(158, 144, this.selectedCharacter.name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "28px",
        color: "#f7fbff",
      })
      .setOrigin(0, 0.5);
    this.add
      .text(158, 174, `${this.selectedCharacter.role} | Health halved for this level`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#bfd1ea",
      })
      .setOrigin(0, 0.5);

    this.add.rectangle(GAME_WIDTH / 2, 320, 430, 190, 0x121b2c, 0.92).setStrokeStyle(3, 0x5c7091, 0.75);
    this.add
      .text(GAME_WIDTH / 2, 274, "Blind Stopwatch Challenge", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "28px",
        color: "#fff2cc",
        stroke: "#08111c",
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 330, "No clock and no timer will be shown.\nPress SPACE or ENTER once to start and again to stop.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#d7e6f8",
        align: "center",
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 394, "Try to feel 7 seconds in your head.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#bfd1ea",
      })
      .setOrigin(0.5);
  }

  private createHud() {
    this.hudText = this.add
      .text(18, GAME_HEIGHT - 32, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#eef6ff",
      })
      .setDepth(100);

    this.healthText = this.add
      .text(18, 86, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#ffe0e0",
        stroke: "#20142d",
        strokeThickness: 5,
      })
      .setDepth(100);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 62, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#f6f8ff",
        stroke: "#08111c",
        strokeThickness: 5,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(100);
  }

  private bindInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  private updateHud() {
    this.healthText.setText(`Health: ${this.currentHealth} | Tries: ${this.triesLeft}`);
    this.hudText.setText(`Character: ${this.selectedCharacter.name} | Blind challenge`);
  }

  update() {
    const pressed =
      (this.confirmKey ? Phaser.Input.Keyboard.JustDown(this.confirmKey) : false) ||
      (this.spaceKey ? Phaser.Input.Keyboard.JustDown(this.spaceKey) : false);

    if (this.levelComplete || this.outOfTries) {
      if (pressed) {
        this.scene.start("character-select");
      }
      return;
    }

    if (pressed) {
      if (this.timerRunning) {
        this.stopAttempt();
      } else {
        this.startAttempt();
      }
    }

    if (this.timerRunning) {
      const elapsed = (this.time.now - this.attemptStartTime) / 1000;
      if (elapsed >= TIMER_LIMIT_S) {
        this.resolveAttempt(elapsed, true);
      }
    }

    this.updateHud();
  }

  private startAttempt() {
    if (this.triesLeft <= 0 || this.levelComplete || this.outOfTries) return;

    this.timerRunning = true;
    this.attemptStartTime = this.time.now;
    this.statusText.setText("Timer started. Press SPACE or ENTER when you think 7 to 7.5 seconds has passed.");
  }

  private stopAttempt() {
    if (!this.timerRunning) return;

    const elapsed = (this.time.now - this.attemptStartTime) / 1000;
    this.resolveAttempt(elapsed, false);
  }

  private resolveAttempt(elapsed: number, timedOut: boolean) {
    this.timerRunning = false;
    this.triesLeft = Math.max(0, this.triesLeft - 1);

    const success = elapsed >= TARGET_MIN_TIME_S && elapsed <= TARGET_MAX_TIME_S;

    if (success) {
      this.levelComplete = true;
      this.levelEndTime = this.time.now;
      this.statusText.setText("Level 8 complete! You nailed the stopwatch. Level 9 is not built yet. Press ENTER.");
      return;
    }

    if (this.triesLeft <= 0) {
      this.outOfTries = true;
      this.levelEndTime = this.time.now;
      this.statusText.setText("Out of tries. Level 8 failed. Press ENTER.");
      return;
    }

    const earlyLate = timedOut ? "Timer ran too long." : elapsed < TARGET_MIN_TIME_S ? "Too early." : "Too late.";
    this.statusText.setText(`${earlyLate} ${this.triesLeft} tries left. Press SPACE or ENTER to try again.`);
  }
}
