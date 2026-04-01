import Phaser from "phaser";
import { CHARACTER_OPTIONS, type CharacterConfig, type CharacterId, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { beginRun, buyGemPack, DEFAULT_RUN_LIVES, getGemCount, getGemShopSpend } from "../systems/runState";

type SelectCard = {
  frame: Phaser.GameObjects.Rectangle;
  character: CharacterConfig;
};

export class CharacterSelectScene extends Phaser.Scene {
  private cards: SelectCard[] = [];
  private selectedIndex = 0;
  private transitioning = false;

  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private aKey?: Phaser.Input.Keyboard.Key;
  private dKey?: Phaser.Input.Keyboard.Key;
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private altConfirmKey?: Phaser.Input.Keyboard.Key;
  private gKey?: Phaser.Input.Keyboard.Key;
  private escapeKey?: Phaser.Input.Keyboard.Key;
  private oneKey?: Phaser.Input.Keyboard.Key;
  private twoKey?: Phaser.Input.Keyboard.Key;
  private threeKey?: Phaser.Input.Keyboard.Key;

  private selectedText!: Phaser.GameObjects.Text;
  private gemText!: Phaser.GameObjects.Text;
  private shopStatusText!: Phaser.GameObjects.Text;
  private shopObjects: Array<Phaser.GameObjects.GameObject & { setVisible(value: boolean): Phaser.GameObjects.GameObject }> = [];
  private shopButtons: Phaser.GameObjects.Rectangle[] = [];
  private shopOpen = false;

  constructor() {
    super("character-select");
  }

  create() {
    this.cameras.main.setBackgroundColor(0x121b33);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.drawBackground();
    this.createHeader();
    this.createCards();
    this.createFooter();
    this.createGemHud();
    this.createShopOverlay();
    this.bindKeyboardInput();
    this.refreshSelection();
  }

  private drawBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x121b33);
    this.add.rectangle(GAME_WIDTH / 2, 120, GAME_WIDTH, 150, 0x1d2a4f, 0.6);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 80, GAME_WIDTH, 130, 0x0e1730, 0.85);
  }

  private createHeader() {
    this.add
      .text(GAME_WIDTH / 2, 52, "Choose Your Character", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "44px",
        color: "#f8f0cc",
        stroke: "#0a1228",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 102, "Use A/D or Arrow Keys. Press ENTER or SPACE to start Level 1.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "21px",
        color: "#d2deff",
      })
      .setOrigin(0.5);
  }

  private createCards() {
    const centerX = GAME_WIDTH / 2;
    const startX = centerX - 290;
    const gap = 290;

    CHARACTER_OPTIONS.forEach((character, index) => {
      const x = startX + index * gap;
      const y = 295;

      const frame = this.add
        .rectangle(x, y, 238, 278, 0x273b6c, 0.95)
        .setStrokeStyle(2, 0x5f73b4)
        .setInteractive({ useHandCursor: true });

      this.add
        .circle(x, y - 78, 38, character.primaryColor)
        .setStrokeStyle(4, character.accentColor, 1);

      this.add
        .text(x, y - 22, character.name, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "28px",
          color: "#f8f9ff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      this.add
        .text(x, y + 14, character.role, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "20px",
          color: "#d5e2ff",
        })
        .setOrigin(0.5);

      this.add
        .text(
          x,
          y + 62,
          `Speed ${character.speed}\nAttack ${character.attackPower}\nLives ${DEFAULT_RUN_LIVES}`,
          {
            fontFamily: "system-ui, sans-serif",
            fontSize: "18px",
            color: "#becdf5",
            align: "center",
            lineSpacing: 4,
          },
        )
        .setOrigin(0.5);

      this.add
        .text(x, y + 118, `Press ${index + 1}`, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "16px",
          color: "#a9b9e8",
        })
        .setOrigin(0.5);

      frame.on("pointerdown", () => this.selectCard(index, true));

      this.cards.push({ frame, character });
    });
  }

  private createFooter() {
    this.selectedText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 78, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "24px",
        color: "#f4f8ff",
      })
      .setOrigin(0.5);
  }

  private createGemHud() {
    this.gemText = this.add
      .text(GAME_WIDTH - 20, 18, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f4f8ff",
        align: "right",
      })
      .setOrigin(1, 0)
      .setDepth(5);
  }

  private createShopOverlay() {
    const dimmer = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x04070d, 0.8)
      .setDepth(40)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    dimmer.on("pointerdown", () => this.setShopOpen(false));

    const panel = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 560, 300, 0x18284a, 0.97)
      .setDepth(41)
      .setStrokeStyle(3, 0xf8e092, 0.9)
      .setVisible(false);

    const title = this.add
      .text(GAME_WIDTH / 2, 148, "Gem Shop", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "36px",
        color: "#fff1be",
        stroke: "#0a1228",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(42)
      .setVisible(false);

    const subtitle = this.add
      .text(GAME_WIDTH / 2, 186, "Buy gems here, then spend 1 gem to revive after a game over.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#d5e2ff",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(42)
      .setVisible(false);

    const singlePack = this.add
      .rectangle(GAME_WIDTH / 2 - 130, 278, 200, 112, 0x2e5c72, 0.95)
      .setDepth(42)
      .setStrokeStyle(3, 0x99f7ff, 0.95)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    singlePack.on("pointerdown", () => this.buySingleGemPack());

    const singleText = this.add
      .text(GAME_WIDTH / 2 - 130, 278, "1 Gem\n$1", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "28px",
        color: "#f3fdff",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(43)
      .setVisible(false);

    const triplePack = this.add
      .rectangle(GAME_WIDTH / 2 + 130, 278, 200, 112, 0x63522a, 0.95)
      .setDepth(42)
      .setStrokeStyle(3, 0xffe17c, 0.95)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    triplePack.on("pointerdown", () => this.buyTripleGemPack());

    const tripleText = this.add
      .text(GAME_WIDTH / 2 + 130, 278, "3 Gems\n$2", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "28px",
        color: "#fff9e8",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(43)
      .setVisible(false);

    const footer = this.add
      .text(GAME_WIDTH / 2, 352, "Press 1 or 2 to buy. Press G or ESC to close. Boss wins give +1 gem.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#bdd3ee",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(42)
      .setVisible(false);

    this.shopStatusText = this.add
      .text(GAME_WIDTH / 2, 392, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#eef6ff",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(42)
      .setVisible(false);

    this.shopObjects = [dimmer, panel, title, subtitle, singlePack, singleText, triplePack, tripleText, footer, this.shopStatusText];
    this.shopButtons = [singlePack, triplePack];
  }

  private bindKeyboardInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.aKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.dKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.altConfirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.gKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    this.escapeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.oneKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.twoKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.threeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
  }

  update() {
    if (this.transitioning) return;

    if (this.shopOpen) {
      if ((this.gKey && Phaser.Input.Keyboard.JustDown(this.gKey)) || (this.escapeKey && Phaser.Input.Keyboard.JustDown(this.escapeKey))) {
        this.setShopOpen(false);
        return;
      }
      if (this.oneKey && Phaser.Input.Keyboard.JustDown(this.oneKey)) {
        this.buySingleGemPack();
      }
      if (this.twoKey && Phaser.Input.Keyboard.JustDown(this.twoKey)) {
        this.buyTripleGemPack();
      }
      return;
    }

    if (this.gKey && Phaser.Input.Keyboard.JustDown(this.gKey)) {
      this.setShopOpen(true);
      return;
    }

    if (this.leftKey && Phaser.Input.Keyboard.JustDown(this.leftKey)) this.selectCard(this.selectedIndex - 1);
    if (this.rightKey && Phaser.Input.Keyboard.JustDown(this.rightKey)) this.selectCard(this.selectedIndex + 1);
    if (this.aKey && Phaser.Input.Keyboard.JustDown(this.aKey)) this.selectCard(this.selectedIndex - 1);
    if (this.dKey && Phaser.Input.Keyboard.JustDown(this.dKey)) this.selectCard(this.selectedIndex + 1);

    if (this.oneKey && Phaser.Input.Keyboard.JustDown(this.oneKey)) this.selectCard(0);
    if (this.twoKey && Phaser.Input.Keyboard.JustDown(this.twoKey)) this.selectCard(1);
    if (this.threeKey && Phaser.Input.Keyboard.JustDown(this.threeKey)) this.selectCard(2);

    const confirmPressed =
      (this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey)) ||
      (this.altConfirmKey && Phaser.Input.Keyboard.JustDown(this.altConfirmKey));
    if (confirmPressed) {
      this.startLevelOne(this.cards[this.selectedIndex].character.id);
    }
  }

  private selectCard(index: number, startImmediately = false) {
    if (this.transitioning) return;

    const count = this.cards.length;
    this.selectedIndex = ((index % count) + count) % count;
    this.refreshSelection();

    if (startImmediately) {
      this.startLevelOne(this.cards[this.selectedIndex].character.id);
    }
  }

  private refreshSelection() {
    this.cards.forEach((card, index) => {
      if (index === this.selectedIndex) {
        card.frame.setStrokeStyle(5, 0xffe17c, 1).setFillStyle(0x334b86, 1);
      } else {
        card.frame.setStrokeStyle(2, 0x5f73b4, 1).setFillStyle(0x273b6c, 0.95);
      }
    });

    const selected = this.cards[this.selectedIndex].character;
    this.selectedText.setText(`Selected: ${selected.name} (${selected.role}) | Gems ${getGemCount(this)} | Press G for Gem Shop`);
    this.gemText.setText(`Gems: ${getGemCount(this)}\nPress G for Shop`);
    if (this.shopOpen) {
      this.updateShopStatus();
    }
  }

  private setShopOpen(isOpen: boolean) {
    this.shopOpen = isOpen;
    this.shopObjects.forEach((object) => object.setVisible(isOpen));
    this.shopButtons.forEach((button) => {
      if (isOpen) {
        button.setInteractive({ useHandCursor: true });
      } else {
        button.disableInteractive();
      }
    });

    if (isOpen) {
      this.updateShopStatus("Choose a gem pack.");
    }
  }

  private updateShopStatus(message?: string) {
    if (!this.shopStatusText) return;

    const gems = getGemCount(this);
    const dollarsSpent = getGemShopSpend(this);
    const summary = `Gems: ${gems} | Spent: $${dollarsSpent}`;
    this.shopStatusText.setText(message ? `${message}\n${summary}` : summary);
    this.gemText.setText(`Gems: ${gems}\nPress G for Shop`);
  }

  private buySingleGemPack() {
    const result = buyGemPack(this, 1, 1);
    this.updateShopStatus(`Bought 1 gem for $1. You now have ${result.gems} gem${result.gems === 1 ? "" : "s"}.`);
    this.refreshSelection();
  }

  private buyTripleGemPack() {
    const result = buyGemPack(this, 3, 2);
    this.updateShopStatus(`Bought 3 gems for $2. You now have ${result.gems} gems.`);
    this.refreshSelection();
  }

  private startLevelOne(characterId: CharacterId) {
    if (this.transitioning) return;
    this.transitioning = true;
    beginRun(this, characterId);

    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("game", { characterId });
    });
  }
}
