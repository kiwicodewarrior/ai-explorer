import Phaser from "phaser";
import {
  CHARACTER_OPTIONS,
  DEFAULT_CHARACTER_ID,
  GAME_HEIGHT,
  GAME_WIDTH,
  type CharacterConfig,
  type CharacterId,
} from "../config";
import { DEFAULT_RUN_LIVES, getRunLives, rememberRunCharacter, setRunLives } from "../systems/runState";

type Level5SceneData = {
  characterId?: CharacterId;
};

type RestOption = "restore" | "skip";

type RestOptionCard = {
  key: RestOption;
  panel: Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Rectangle;
  badge: Phaser.GameObjects.Text;
};

const TEXTURE_KEYS = {
  player: "level5-player",
  portal: "level5-portal",
} as const;

const REST_OPTIONS = [
  {
    key: "restore" as const,
    title: "Restore Health",
    summary: "Recover before the next level.",
    detail: "Patch yourself up and head into Level 6 at full strength.",
    fillColor: 0x1f4d53,
    accentColor: 0x8ff7d8,
  },
  {
    key: "skip" as const,
    title: "Skip Next Level",
    summary: "Take the hidden shortcut.",
    detail: "Hold a skip pass for the next stage.",
    fillColor: 0x4a3561,
    accentColor: 0xffdf82,
  },
] as const;

export class Level5Scene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private selectedIndex = 0;
  private choiceLocked = false;
  private selectedReward?: RestOption;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private aKey?: Phaser.Input.Keyboard.Key;
  private dKey?: Phaser.Input.Keyboard.Key;
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private spaceKey?: Phaser.Input.Keyboard.Key;

  private statusText!: Phaser.GameObjects.Text;
  private footerText!: Phaser.GameObjects.Text;
  private optionCards: RestOptionCard[] = [];

  constructor() {
    super("level-5");
  }

  create(data: Level5SceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.selectedIndex = 0;
    this.choiceLocked = false;
    this.selectedReward = undefined;
    this.optionCards = [];

    this.cameras.main.setBackgroundColor(0x09141d);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createHeader();
    this.createCharacterPreview();
    this.createOptionCards();
    this.createFooter();
    this.bindInput();
    this.updateSelectionVisuals();
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

    if (!this.textures.exists(TEXTURE_KEYS.portal)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x7ad8ff, 0.12);
      g.fillEllipse(40, 44, 56, 72);
      g.lineStyle(4, 0xc3fbff, 0.85);
      g.strokeEllipse(40, 44, 56, 72);
      g.lineStyle(2, 0x84f6ff, 0.55);
      g.strokeEllipse(40, 44, 38, 54);
      g.generateTexture(TEXTURE_KEYS.portal, 80, 88);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x09141d);
    this.add.rectangle(GAME_WIDTH / 2, 110, GAME_WIDTH, 220, 0x17314b, 0.88);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 88, GAME_WIDTH, 176, 0x213c30, 0.94);

    for (let x = 50; x < GAME_WIDTH + 90; x += 180) {
      this.add.triangle(x, GAME_HEIGHT - 116, 0, 0, 78, -150, 156, 0, 0x10233b, 0.65).setOrigin(0.5, 1);
    }

    this.add.circle(126, 94, 36, 0xffd27a, 0.2);
    this.add.circle(126, 94, 58, 0xffc25d, 0.1);

    const fireGlow = this.add.ellipse(GAME_WIDTH / 2, GAME_HEIGHT - 118, 110, 40, 0xffa145, 0.14);
    this.tweens.add({
      targets: fireGlow,
      scaleX: 1.08,
      scaleY: 1.16,
      alpha: 0.22,
      duration: 980,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 124, 40, 8, 0x5a341f).setAngle(16);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 124, 40, 8, 0x5a341f).setAngle(-16);
    this.add.triangle(GAME_WIDTH / 2, GAME_HEIGHT - 140, 0, 22, 12, -8, 24, 22, 0xffb14d, 0.95).setOrigin(0.5);
    this.add.triangle(GAME_WIDTH / 2, GAME_HEIGHT - 146, 0, 18, 10, -8, 20, 18, 0xffef9c, 0.92).setOrigin(0.5);

    this.add.rectangle(164, 344, 110, 72, 0x35566d, 0.86).setAngle(-4);
    this.add.triangle(164, 302, 0, 74, 58, 0, 116, 74, 0x4f7690, 0.92).setOrigin(0.5);

    const portal = this.add.image(GAME_WIDTH - 150, 248, TEXTURE_KEYS.portal).setScale(1.5).setAlpha(0.82);
    this.tweens.add({
      targets: portal,
      scaleX: 1.58,
      scaleY: 1.7,
      alpha: 1,
      duration: 920,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  private createHeader() {
    this.add
      .text(GAME_WIDTH / 2, 36, "Level 5: Rest Area", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f7fbff",
        stroke: "#08111a",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.add
      .text(GAME_WIDTH / 2, 74, "Take a breath, pick one reward, then get ready for the next portal.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#d7e7f6",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
  }

  private createCharacterPreview() {
    this.add.rectangle(GAME_WIDTH / 2, 146, 292, 84, 0x10212f, 0.84).setStrokeStyle(2, 0x4f6d88, 0.65);
    this.add.image(GAME_WIDTH / 2 - 102, 148, TEXTURE_KEYS.player).setTint(this.selectedCharacter.primaryColor).setScale(1.5);

    this.add
      .text(GAME_WIDTH / 2 - 56, 124, this.selectedCharacter.name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "28px",
        color: "#f7fbff",
      })
      .setOrigin(0, 0.5);

    this.add
      .text(
        GAME_WIDTH / 2 - 56,
        154,
        `${this.selectedCharacter.role} | Speed ${this.selectedCharacter.speed} | Lives ${getRunLives(this)}`,
        {
          fontFamily: "system-ui, sans-serif",
          fontSize: "16px",
          color: "#bad3ea",
        },
      )
      .setOrigin(0, 0.5);
  }

  private createOptionCards() {
    REST_OPTIONS.forEach((option, index) => {
      const x = index === 0 ? GAME_WIDTH * 0.29 : GAME_WIDTH * 0.71;
      const y = 314;

      this.add.rectangle(x, y + 10, 290, 176, 0x04070c, 0.3);
      const glow = this.add.rectangle(x, y, 300, 186, option.accentColor, 0.12).setVisible(false);
      const panel = this.add
        .rectangle(x, y, 280, 166, option.fillColor, 0.92)
        .setStrokeStyle(2, 0x4b6275, 0.75)
        .setInteractive({ useHandCursor: true });

      this.add.rectangle(x, y - 64, 252, 8, option.accentColor, 0.9);
      this.add
        .text(x, y - 42, option.title, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "26px",
          color: "#f9fcff",
        })
        .setOrigin(0.5);
      this.add
        .text(x, y - 6, option.summary, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "18px",
          color: "#daebf9",
          align: "center",
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 32, option.detail, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "16px",
          color: "#bfd6e9",
          align: "center",
          wordWrap: { width: 220 },
        })
        .setOrigin(0.5);

      const badge = this.add
        .text(x, y + 64, "", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "15px",
          color: "#0d1722",
          backgroundColor: "#ffffff",
          padding: { left: 10, right: 10, top: 5, bottom: 5 },
        })
        .setOrigin(0.5);

      panel.on("pointerover", () => {
        if (this.choiceLocked) return;
        this.selectedIndex = index;
        this.updateSelectionVisuals();
      });
      panel.on("pointerdown", () => {
        if (this.choiceLocked) return;
        this.selectedIndex = index;
        this.updateSelectionVisuals();
        this.confirmChoice();
      });

      this.optionCards.push({ key: option.key, panel, glow, badge });
    });
  }

  private createFooter() {
    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 68, "Choose one reward with Left/Right, then press Enter or Space.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#eef6ff",
        align: "center",
      })
      .setOrigin(0.5);

    this.footerText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 38, "Restore Health sends you into Level 6. Skip jumps to Level 7.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "15px",
        color: "#b7cade",
        align: "center",
      })
      .setOrigin(0.5);
  }

  private bindInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.cursors = keyboard.createCursorKeys();
    this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.aKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.dKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  update() {
    if (this.choiceLocked) {
      const confirmPressed =
        (this.confirmKey ? Phaser.Input.Keyboard.JustDown(this.confirmKey) : false) ||
        (this.spaceKey ? Phaser.Input.Keyboard.JustDown(this.spaceKey) : false);
      if (confirmPressed) {
        if (this.selectedReward === "skip") {
          this.scene.start("level-7", { characterId: this.selectedCharacter.id });
        } else {
          this.scene.start("level-6", { characterId: this.selectedCharacter.id });
        }
      }
      return;
    }

    const leftPressed =
      (this.cursors?.left ? Phaser.Input.Keyboard.JustDown(this.cursors.left) : false) ||
      (this.leftKey ? Phaser.Input.Keyboard.JustDown(this.leftKey) : false) ||
      (this.aKey ? Phaser.Input.Keyboard.JustDown(this.aKey) : false);
    const rightPressed =
      (this.cursors?.right ? Phaser.Input.Keyboard.JustDown(this.cursors.right) : false) ||
      (this.rightKey ? Phaser.Input.Keyboard.JustDown(this.rightKey) : false) ||
      (this.dKey ? Phaser.Input.Keyboard.JustDown(this.dKey) : false);
    const confirmPressed =
      (this.confirmKey ? Phaser.Input.Keyboard.JustDown(this.confirmKey) : false) ||
      (this.spaceKey ? Phaser.Input.Keyboard.JustDown(this.spaceKey) : false);

    if (leftPressed) {
      this.selectedIndex = Phaser.Math.Wrap(this.selectedIndex - 1, 0, REST_OPTIONS.length);
      this.updateSelectionVisuals();
    } else if (rightPressed) {
      this.selectedIndex = Phaser.Math.Wrap(this.selectedIndex + 1, 0, REST_OPTIONS.length);
      this.updateSelectionVisuals();
    }

    if (confirmPressed) {
      this.confirmChoice();
    }
  }

  private updateSelectionVisuals() {
    this.optionCards.forEach((card, index) => {
      const option = REST_OPTIONS[index];
      const isSelected = index === this.selectedIndex;

      card.panel.setScale(isSelected ? 1.04 : 1);
      card.panel.setStrokeStyle(isSelected ? 4 : 2, isSelected ? option.accentColor : 0x4b6275, isSelected ? 1 : 0.75);
      card.glow.setVisible(isSelected);
      card.badge.setText(card.key === "restore" ? "Full Health" : "Skip Level 6");
      card.badge.setColor(isSelected ? "#08121a" : "#223342");
      card.badge.setBackgroundColor(isSelected ? "#ffffff" : "#c9d8e6");
    });
  }

  private confirmChoice() {
    if (this.choiceLocked) return;

    this.choiceLocked = true;
    const selectedOption = REST_OPTIONS[this.selectedIndex];
    this.selectedReward = selectedOption.key;
    this.registry.set("level5Reward", selectedOption.key);

    if (selectedOption.key === "restore") {
      setRunLives(this, DEFAULT_RUN_LIVES);
      this.registry.set("level5HealthRestore", DEFAULT_RUN_LIVES);
      this.statusText.setText("Health restored to full. Press Enter or Space for Level 6.");
    } else {
      this.registry.set("level5HealthRestore", 0);
      this.statusText.setText("Level 6 will be skipped. Press Enter or Space for Level 7.");
    }

    this.footerText.setText("Route locked in. Press Enter or Space when you're ready.");
    this.cameras.main.flash(180, 214, 240, 255);

    const activeCard = this.optionCards[this.selectedIndex];
    this.tweens.add({
      targets: [activeCard.panel, activeCard.glow],
      scaleX: 1.08,
      scaleY: 1.08,
      alpha: { from: 1, to: 0.88 },
      duration: 220,
      yoyo: true,
      ease: "Sine.easeOut",
    });
  }
}
