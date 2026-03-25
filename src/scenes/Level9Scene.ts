import Phaser from "phaser";
import {
  CHARACTER_OPTIONS,
  DEFAULT_CHARACTER_ID,
  GAME_HEIGHT,
  GAME_WIDTH,
  type CharacterConfig,
  type CharacterId,
} from "../config";
import { getRunLives, rememberRunCharacter } from "../systems/runState";

type Level9SceneData = {
  characterId?: CharacterId;
  currentHealth?: number;
};

type UpgradeOption = "triple-damage" | "two-clones";

type UpgradeOptionCard = {
  key: UpgradeOption;
  panel: Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Rectangle;
  badge: Phaser.GameObjects.Text;
};

const TEXTURE_KEYS = {
  player: "level9-player",
} as const;

const UPGRADE_OPTIONS = [
  {
    key: "triple-damage" as const,
    title: "Triple Damage",
    summary: "Your attacks hit three times harder.",
    detail: "Best if you want short, heavy boss damage windows.",
    fillColor: 0x4f261d,
    accentColor: 0xffb37a,
    badge: "x3 Attack",
  },
  {
    key: "two-clones" as const,
    title: "Two Clones",
    summary: "Summon two clones to mirror your pressure.",
    detail: "Best if you want more bodies on screen for the boss.",
    fillColor: 0x173a48,
    accentColor: 0x8ff4ff,
    badge: "2 Clones",
  },
] as const;

export class Level9Scene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private selectedIndex = 0;
  private choiceLocked = false;
  private transitioningToLevel10 = false;
  private selectedUpgrade?: UpgradeOption;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private aKey?: Phaser.Input.Keyboard.Key;
  private dKey?: Phaser.Input.Keyboard.Key;
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private spaceKey?: Phaser.Input.Keyboard.Key;

  private statusText!: Phaser.GameObjects.Text;
  private footerText!: Phaser.GameObjects.Text;
  private optionCards: UpgradeOptionCard[] = [];

  constructor() {
    super("level-9");
  }

  create(data: Level9SceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.selectedIndex = 0;
    this.choiceLocked = false;
    this.transitioningToLevel10 = false;
    this.selectedUpgrade = undefined;
    this.optionCards = [];

    this.cameras.main.setBackgroundColor(0x0b1222);
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
  }

  private drawBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0b1222);
    this.add.rectangle(GAME_WIDTH / 2, 108, GAME_WIDTH, 216, 0x182641, 0.88);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 92, GAME_WIDTH, 184, 0x1b1628, 0.94);

    for (let x = 60; x < GAME_WIDTH + 80; x += 160) {
      this.add.rectangle(x, GAME_HEIGHT / 2, 2, GAME_HEIGHT - 118, 0x334868, 0.28);
    }
    for (let y = 114; y < GAME_HEIGHT - 72; y += 76) {
      this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 96, 2, 0x334868, 0.2);
    }

    this.add.circle(132, 92, 38, 0xffd78a, 0.18);
    this.add.circle(132, 92, 66, 0xffc15a, 0.08);

    const portalGlow = this.add.ellipse(GAME_WIDTH - 126, 124, 108, 88, 0x8ff4ff, 0.1);
    this.tweens.add({
      targets: portalGlow,
      scaleX: 1.08,
      scaleY: 1.12,
      alpha: 0.18,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    this.add.circle(GAME_WIDTH - 126, 124, 40, 0x6fdcff, 0.12).setStrokeStyle(3, 0xcaf9ff, 0.9);
    this.add.circle(GAME_WIDTH - 126, 124, 24, 0x6fdcff, 0.08).setStrokeStyle(2, 0xcaf9ff, 0.7);
  }

  private createHeader() {
    this.add
      .text(GAME_WIDTH / 2, 30, "Level 9: Power Upgrade", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f7fbff",
        stroke: "#08111a",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 62, "Choose one boss power-up before the final portal opens.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#d9e7f8",
      })
      .setOrigin(0.5);
  }

  private createCharacterPreview() {
    this.add.rectangle(GAME_WIDTH / 2, 148, 320, 92, 0x101b2d, 0.86).setStrokeStyle(2, 0x506883, 0.7);
    this.add.image(GAME_WIDTH / 2 - 110, 150, TEXTURE_KEYS.player).setTint(this.selectedCharacter.primaryColor).setScale(1.55);

    this.add
      .text(GAME_WIDTH / 2 - 60, 126, this.selectedCharacter.name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "28px",
        color: "#f7fbff",
      })
      .setOrigin(0, 0.5);

    this.add
      .text(
        GAME_WIDTH / 2 - 60,
        156,
        `${this.selectedCharacter.role} | Attack ${this.selectedCharacter.attackPower} | Lives ${getRunLives(this)}`,
        {
          fontFamily: "system-ui, sans-serif",
          fontSize: "16px",
          color: "#bdd0e6",
        },
      )
      .setOrigin(0, 0.5);
  }

  private createOptionCards() {
    UPGRADE_OPTIONS.forEach((option, index) => {
      const x = index === 0 ? GAME_WIDTH * 0.29 : GAME_WIDTH * 0.71;
      const y = 320;

      this.add.rectangle(x, y + 12, 304, 194, 0x03070d, 0.34);
      const glow = this.add.rectangle(x, y, 314, 204, option.accentColor, 0.13).setVisible(false);
      const panel = this.add
        .rectangle(x, y, 292, 182, option.fillColor, 0.94)
        .setStrokeStyle(2, 0x4b6275, 0.8)
        .setInteractive({ useHandCursor: true });

      this.add.rectangle(x, y - 72, 258, 8, option.accentColor, 0.92);
      this.add
        .text(x, y - 46, option.title, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "27px",
          color: "#f9fcff",
        })
        .setOrigin(0.5);
      this.add
        .text(x, y - 6, option.summary, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "18px",
          color: "#dcedfa",
          align: "center",
          wordWrap: { width: 226 },
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 42, option.detail, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "16px",
          color: "#c0d7eb",
          align: "center",
          wordWrap: { width: 224 },
        })
        .setOrigin(0.5);

      const badge = this.add
        .text(x, y + 72, option.badge, {
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
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 68, "Choose one upgrade with Left/Right, then press Enter or Space.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#eef6ff",
        align: "center",
      })
      .setOrigin(0.5);

    this.footerText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 38, "Triple Damage boosts boss hits. Two Clones stores a clone power-up for later.", {
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
    keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.ENTER, Phaser.Input.Keyboard.KeyCodes.SPACE]);
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
        this.startLevel10();
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
      this.selectedIndex = Phaser.Math.Wrap(this.selectedIndex - 1, 0, UPGRADE_OPTIONS.length);
      this.updateSelectionVisuals();
    } else if (rightPressed) {
      this.selectedIndex = Phaser.Math.Wrap(this.selectedIndex + 1, 0, UPGRADE_OPTIONS.length);
      this.updateSelectionVisuals();
    }

    if (confirmPressed) {
      this.confirmChoice();
    }
  }

  private updateSelectionVisuals() {
    this.optionCards.forEach((card, index) => {
      const option = UPGRADE_OPTIONS[index];
      const isSelected = index === this.selectedIndex;

      card.panel.setScale(isSelected ? 1.04 : 1);
      card.panel.setStrokeStyle(isSelected ? 4 : 2, isSelected ? option.accentColor : 0x4b6275, isSelected ? 1 : 0.8);
      card.glow.setVisible(isSelected);
      card.badge.setColor(isSelected ? "#08121a" : "#223342");
      card.badge.setBackgroundColor(isSelected ? "#ffffff" : "#c9d8e6");
    });
  }

  private confirmChoice() {
    if (this.choiceLocked) return;

    this.choiceLocked = true;
    const selectedOption = UPGRADE_OPTIONS[this.selectedIndex];
    this.selectedUpgrade = selectedOption.key;
    this.registry.set("level9Upgrade", selectedOption.key);
    this.registry.set("level9DamageMultiplier", selectedOption.key === "triple-damage" ? 3 : 1);
    this.registry.set("level9CloneCount", selectedOption.key === "two-clones" ? 2 : 0);

    if (selectedOption.key === "triple-damage") {
      this.statusText.setText("Triple Damage locked in. Press Enter or Space for Level 10.");
    } else {
      this.statusText.setText("Two Clones locked in. Press Enter or Space for Level 10.");
    }

    this.footerText.setText("Level 10 is ready. Your upgrade will carry into the boss fight.");
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

  private startLevel10() {
    if (this.transitioningToLevel10 || !this.selectedUpgrade) return;

    this.transitioningToLevel10 = true;
    this.scene.start("level-10", {
      characterId: this.selectedCharacter.id,
      upgrade: this.selectedUpgrade,
      damageBonus: this.selectedUpgrade === "triple-damage" ? 3 : 1,
      cloneCount: this.selectedUpgrade === "two-clones" ? 2 : 0,
    });
  }
}
