import Phaser from "phaser";
import {
  CHARACTER_OPTIONS,
  DEFAULT_CHARACTER_ID,
  GAME_HEIGHT,
  GAME_WIDTH,
  type CharacterConfig,
  type CharacterId,
} from "../config";
import {
  DEFAULT_RUN_LIVES,
  getGemCount,
  getRunLives,
  loseRunLife,
  rememberRunCharacter,
  REVIVE_GEM_COST,
  useReviveGem,
} from "../systems/runState";

type UpgradeOption = "triple-damage" | "two-clones";

type RisingWaterSceneData = {
  characterId?: CharacterId;
  upgrade?: UpgradeOption;
  damageBonus?: number;
  cloneCount?: number;
};

type PlatformConfig = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const LEVEL_HEIGHT = 1700;
const GROUND_HEIGHT = 64;
const FLOOR_Y = LEVEL_HEIGHT - GROUND_HEIGHT / 2;
const START_X = 120;
const START_Y = LEVEL_HEIGHT - GROUND_HEIGHT - 34;
const GOAL_X = GAME_WIDTH - 116;
const GOAL_Y = 124;
const PLAYER_SPEED = 235;
const PLAYER_JUMP_VELOCITY = 462;
const GRAVITY_Y = 980;
const HIT_INVULN_MS = 900;
const START_INVULN_MS = 4_000;
const WATER_START_HEIGHT = 120;
const WATER_RISE_SPEED = 75;
const WATER_RESPITE_MS = 1200;
const MAX_DEATHS = DEFAULT_RUN_LIVES;

const PLATFORM_LAYOUT: readonly PlatformConfig[] = [
  { x: 176, y: 1568, width: 196, height: 22 },
  { x: 316, y: 1480, width: 172, height: 22 },
  { x: 470, y: 1392, width: 176, height: 22 },
  { x: 618, y: 1304, width: 178, height: 22 },
  { x: 548, y: 1216, width: 156, height: 22 },
  { x: 404, y: 1128, width: 164, height: 22 },
  { x: 266, y: 1040, width: 168, height: 22 },
  { x: 392, y: 952, width: 146, height: 22 },
  { x: 548, y: 864, width: 156, height: 22 },
  { x: 700, y: 776, width: 156, height: 22 },
  { x: 586, y: 688, width: 160, height: 22 },
  { x: 434, y: 600, width: 152, height: 22 },
  { x: 296, y: 512, width: 168, height: 22 },
  { x: 418, y: 424, width: 150, height: 22 },
  { x: 572, y: 336, width: 160, height: 22 },
  { x: 718, y: 248, width: 144, height: 22 },
  { x: 830, y: 172, width: 136, height: 22 },
] as const;

const TEXTURE_KEYS = {
  player: "rising-water-player",
  platform: "rising-water-platform",
  ground: "rising-water-ground",
  goal: "rising-water-goal",
} as const;

export class RisingWaterScene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private goal!: Phaser.Physics.Arcade.Image;

  private playerPlatformCollider?: Phaser.Physics.Arcade.Collider;
  private goalOverlap?: Phaser.Physics.Arcade.Collider;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private upKey?: Phaser.Input.Keyboard.Key;
  private jumpKey?: Phaser.Input.Keyboard.Key;
  private aKey?: Phaser.Input.Keyboard.Key;
  private dKey?: Phaser.Input.Keyboard.Key;
  private wKey?: Phaser.Input.Keyboard.Key;
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private reviveKey?: Phaser.Input.Keyboard.Key;

  private hudText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private waterBody!: Phaser.GameObjects.Rectangle;
  private waterGlow!: Phaser.GameObjects.Rectangle;
  private waterLine!: Phaser.GameObjects.Rectangle;

  private livesRemaining = DEFAULT_RUN_LIVES;
  private outOfLives = false;
  private levelComplete = false;
  private transitioningToNextLevel = false;
  private damageCooldownUntil = 0;
  private levelStartTime = 0;
  private levelEndTime?: number;
  private waterRiseStartTime = 0;

  private upgrade: UpgradeOption = "triple-damage";
  private damageBonus = 1;
  private cloneCount = 0;

  constructor() {
    super("rising-water");
  }

  create(data: RisingWaterSceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.outOfLives = this.livesRemaining <= 0;
    this.levelComplete = false;
    this.transitioningToNextLevel = false;
    this.damageCooldownUntil = this.time.now + START_INVULN_MS;
    this.levelStartTime = this.time.now;
    this.levelEndTime = undefined;
    this.waterRiseStartTime = this.time.now + WATER_RESPITE_MS;
    this.upgrade =
      data.upgrade ??
      ((this.registry.get("level9Upgrade") as UpgradeOption | undefined) ?? "triple-damage");
    this.damageBonus =
      data.damageBonus ??
      ((this.registry.get("level9DamageMultiplier") as number | undefined) ?? (this.upgrade === "triple-damage" ? 3 : 1));
    this.cloneCount =
      data.cloneCount ??
      ((this.registry.get("level9CloneCount") as number | undefined) ?? (this.upgrade === "two-clones" ? 2 : 0));

    this.physics.world.gravity.y = GRAVITY_Y;
    this.physics.world.setBounds(0, 0, GAME_WIDTH, LEVEL_HEIGHT);

    this.cameras.main.setBackgroundColor(0x07162b);
    this.cameras.main.setBounds(0, 0, GAME_WIDTH, LEVEL_HEIGHT);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createPlatforms();
    this.createGoal();
    this.createPlayer();
    this.createWater();
    this.createHud();
    this.bindInput();
    this.updateHud();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.1);
    this.cameras.main.setDeadzone(220, 140);

    this.statusText.setText("Climb the ruins before the water catches you. You start with 4 seconds of invincibility.");
    this.time.delayedCall(2200, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupScene, this);
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

    if (!this.textures.exists(TEXTURE_KEYS.platform)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x8f8062, 1);
      g.fillRoundedRect(0, 0, 128, 22, 6);
      g.fillStyle(0x554a36, 1);
      g.fillRect(0, 14, 128, 8);
      g.fillStyle(0xd7cca9, 0.6);
      g.fillRect(10, 4, 108, 4);
      g.generateTexture(TEXTURE_KEYS.platform, 128, 22);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.ground)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x4d4132, 1);
      g.fillRect(0, 0, 128, GROUND_HEIGHT);
      g.fillStyle(0x857155, 1);
      g.fillRect(0, 0, 128, 16);
      g.fillStyle(0x33281d, 1);
      for (let x = 12; x < 128; x += 22) {
        g.fillRect(x, 20, 10, GROUND_HEIGHT - 22);
      }
      g.generateTexture(TEXTURE_KEYS.ground, 128, GROUND_HEIGHT);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.goal)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x102b39, 1);
      g.fillCircle(32, 32, 30);
      g.lineStyle(5, 0x9ef4ff, 1);
      g.strokeCircle(32, 32, 20);
      g.lineStyle(3, 0xffffff, 0.75);
      g.strokeCircle(32, 32, 10);
      g.generateTexture(TEXTURE_KEYS.goal, 64, 64);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(GAME_WIDTH / 2, LEVEL_HEIGHT / 2, GAME_WIDTH, LEVEL_HEIGHT, 0x07162b);
    this.add.rectangle(GAME_WIDTH / 2, 170, GAME_WIDTH, 340, 0x123153, 0.64);
    this.add.rectangle(GAME_WIDTH / 2, LEVEL_HEIGHT - 180, GAME_WIDTH, 380, 0x0a1f34, 0.9);

    for (let x = 68; x < GAME_WIDTH; x += 160) {
      this.add.rectangle(x, LEVEL_HEIGHT / 2, 8, LEVEL_HEIGHT - 120, 0x0f2740, 0.22);
    }

    for (let y = 120; y < LEVEL_HEIGHT - 80; y += 128) {
      this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 110, 3, 0x143151, 0.24);
    }

    PLATFORM_LAYOUT.forEach((platform, index) => {
      if (index % 2 === 0) {
        this.add.rectangle(platform.x - 90, platform.y + 22, 30, 120, 0x1a2f3f, 0.34);
      } else {
        this.add.rectangle(platform.x + 92, platform.y + 22, 30, 120, 0x1a2f3f, 0.34);
      }
    });

    this.add
      .text(GAME_WIDTH / 2, 36, "Rising Water Ruins", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f4fbff",
        stroke: "#06121e",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.add
      .text(GAME_WIDTH / 2, 72, "Climb fast, time your jumps, and beat the flood.", {
        fontFamily: "system-ui, roboto",
        fontSize: "18px",
        color: "#dceaf8",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
  }

  private createPlatforms() {
    this.platforms = this.physics.add.staticGroup();

    const ground = this.platforms.create(GAME_WIDTH / 2, FLOOR_Y, TEXTURE_KEYS.ground) as Phaser.Physics.Arcade.Image;
    ground.setDisplaySize(GAME_WIDTH, GROUND_HEIGHT);
    ground.refreshBody();

    PLATFORM_LAYOUT.forEach((config) => {
      const platform = this.platforms.create(config.x, config.y, TEXTURE_KEYS.platform) as Phaser.Physics.Arcade.Image;
      platform.setDisplaySize(config.width, config.height);
      platform.refreshBody();
    });
  }

  private createGoal() {
    this.goal = this.physics.add.staticImage(GOAL_X, GOAL_Y, TEXTURE_KEYS.goal);
    this.add
      .text(GOAL_X, GOAL_Y - 54, "Boss Gate", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#f5fbff",
        stroke: "#07121c",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
  }

  private createPlayer() {
    this.player = this.physics.add
      .image(START_X, START_Y, TEXTURE_KEYS.player)
      .setTint(this.selectedCharacter.primaryColor)
      .setCollideWorldBounds(true);

    this.player.setDragX(1400);
    this.player.setMaxVelocity(360, 620);
    this.playerPlatformCollider = this.physics.add.collider(this.player, this.platforms);
    this.goalOverlap = this.physics.add.overlap(this.player, this.goal, () => {
      this.completeLevel();
    });
  }

  private createWater() {
    this.waterBody = this.add.rectangle(GAME_WIDTH / 2, LEVEL_HEIGHT - WATER_START_HEIGHT / 2, GAME_WIDTH, WATER_START_HEIGHT, 0x2582d8, 0.72);
    this.waterGlow = this.add.rectangle(
      GAME_WIDTH / 2,
      LEVEL_HEIGHT - (WATER_START_HEIGHT + 24) / 2,
      GAME_WIDTH,
      WATER_START_HEIGHT + 24,
      0x6cd2ff,
      0.14,
    );
    this.waterLine = this.add.rectangle(GAME_WIDTH / 2, LEVEL_HEIGHT - WATER_START_HEIGHT, GAME_WIDTH, 10, 0xc6fbff, 0.74).setOrigin(0.5);

    this.waterBody.setDepth(2);
    this.waterGlow.setDepth(1);
    this.waterLine.setDepth(3);
  }

  private createHud() {
    this.livesText = this.add
      .text(20, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#f5fbff",
      })
      .setDepth(10)
      .setScrollFactor(0);

    this.timerText = this.add
      .text(GAME_WIDTH / 2, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "19px",
        color: "#d7f4ff",
      })
      .setOrigin(0.5, 0)
      .setDepth(10)
      .setScrollFactor(0);

    this.hudText = this.add
      .text(GAME_WIDTH - 20, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#deecf8",
        align: "right",
      })
      .setOrigin(1, 0)
      .setDepth(10)
      .setScrollFactor(0);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 28, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f4fbff",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setScrollFactor(0);
  }

  private bindInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.cursors = keyboard.createCursorKeys();
    keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.ENTER, Phaser.Input.Keyboard.KeyCodes.SPACE]);
    this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.upKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.jumpKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.aKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.dKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.wKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.reviveKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  update() {
    if (this.levelComplete) {
      if (this.confirmKey && (Phaser.Input.Keyboard.JustDown(this.confirmKey) || this.confirmKey.isDown)) {
        this.startNextLevel();
      }
      this.player.setVelocityX(0);
      this.updateWaterVisuals(this.getWaterHeightAt(this.levelEndTime ?? this.time.now));
      this.updateHud();
      return;
    }

    if (this.outOfLives) {
      if (this.reviveKey && Phaser.Input.Keyboard.JustDown(this.reviveKey) && useReviveGem(this)) {
        this.scene.restart({
          characterId: this.selectedCharacter.id,
          upgrade: this.upgrade,
          damageBonus: this.damageBonus,
          cloneCount: this.cloneCount,
        });
        return;
      }
      if (this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
        this.scene.start("character-select");
      }
      this.player.setVelocityX(0);
      this.updateWaterVisuals(this.getWaterHeightAt(this.time.now));
      this.updateHud();
      return;
    }

    this.updateMovement();
    this.updateWater();
    this.updateHud();
  }

  private updateMovement() {
    const leftDown = (this.cursors?.left?.isDown ?? false) || (this.leftKey?.isDown ?? false) || (this.aKey?.isDown ?? false);
    const rightDown =
      (this.cursors?.right?.isDown ?? false) || (this.rightKey?.isDown ?? false) || (this.dKey?.isDown ?? false);

    let xVelocity = 0;
    const moveSpeed = Math.max(PLAYER_SPEED, this.selectedCharacter.speed);
    if (leftDown) xVelocity -= moveSpeed;
    if (rightDown) xVelocity += moveSpeed;
    this.player.setVelocityX(xVelocity);

    if (xVelocity !== 0) {
      this.player.setFlipX(xVelocity < 0);
    }

    const jumpPressed =
      (this.jumpKey ? Phaser.Input.Keyboard.JustDown(this.jumpKey) : false) ||
      (this.upKey ? Phaser.Input.Keyboard.JustDown(this.upKey) : false) ||
      (this.wKey ? Phaser.Input.Keyboard.JustDown(this.wKey) : false) ||
      (this.cursors?.up ? Phaser.Input.Keyboard.JustDown(this.cursors.up) : false);
    if (!jumpPressed) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (!body.blocked.down && !body.touching.down) return;

    const jumpBoost = (this.selectedCharacter.jumpDistance - 60) * 2;
    this.player.setVelocityY(-(PLAYER_JUMP_VELOCITY + jumpBoost));
  }

  private updateWater() {
    const waterHeight = this.getWaterHeightAt(this.time.now);
    this.updateWaterVisuals(waterHeight);

    if (this.time.now < this.damageCooldownUntil) return;

    const playerBottom = this.player.y + this.player.displayHeight / 2;
    const waterTop = LEVEL_HEIGHT - waterHeight;
    if (playerBottom >= waterTop - 4) {
      this.handleWaterHit();
    }
  }

  private getWaterHeightAt(timestamp: number) {
    if (timestamp <= this.waterRiseStartTime) {
      return WATER_START_HEIGHT;
    }

    const elapsedSeconds = (timestamp - this.waterRiseStartTime) / 1000;
    return Math.min(LEVEL_HEIGHT, WATER_START_HEIGHT + elapsedSeconds * WATER_RISE_SPEED);
  }

  private updateWaterVisuals(waterHeight: number) {
    const waterTop = LEVEL_HEIGHT - waterHeight;
    this.waterBody.setSize(GAME_WIDTH, waterHeight);
    this.waterBody.setPosition(GAME_WIDTH / 2, waterTop + waterHeight / 2);
    this.waterGlow.setSize(GAME_WIDTH, waterHeight + 24);
    this.waterGlow.setPosition(GAME_WIDTH / 2, waterTop + (waterHeight + 24) / 2);
    this.waterLine.setPosition(GAME_WIDTH / 2, waterTop);
    this.waterLine.width = GAME_WIDTH;
  }

  private handleWaterHit() {
    if (this.levelComplete || this.outOfLives) return;

    this.damageCooldownUntil = this.time.now + HIT_INVULN_MS;
    const livesLeft = loseRunLife(this);
    this.livesRemaining = livesLeft;

    if (livesLeft <= 0) {
      this.outOfLives = true;
      this.player.setVelocity(0, 0);
      const gems = getGemCount(this);
      this.statusText.setText(
        gems >= REVIVE_GEM_COST
          ? `Out of lives. Press R to spend 1 gem (${gems} left) and restart, or ENTER to leave.`
          : `You can't play anymore. ${MAX_DEATHS} lives used. Press ENTER.`,
      );
      return;
    }

    this.player.setPosition(START_X, START_Y);
    this.player.setVelocity(0, 0);
    this.waterRiseStartTime = this.time.now + WATER_RESPITE_MS;
    this.updateWaterVisuals(WATER_START_HEIGHT);
    this.cameras.main.shake(110, 0.005);
    this.statusText.setText(`The flood got you! Lives left: ${livesLeft}.`);
    this.time.delayedCall(1000, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });
  }

  private completeLevel() {
    if (this.levelComplete || this.outOfLives) return;

    this.levelComplete = true;
    this.levelEndTime = this.time.now;
    this.player.setVelocityX(0);
    this.statusText.setText("Rising Water complete! Press ENTER for the noise stealth zone.");
    this.cameras.main.flash(180, 220, 255, 235, false);
  }

  private updateHud() {
    const elapsedMs = (this.levelEndTime ?? this.time.now) - this.levelStartTime;
    const waterTop = LEVEL_HEIGHT - this.getWaterHeightAt(this.levelEndTime ?? this.time.now);

    this.livesText.setText(`Lives: ${this.livesRemaining}`);
    this.timerText.setText(`Water Height: ${Math.max(0, Math.round(((LEVEL_HEIGHT - waterTop) / LEVEL_HEIGHT) * 100))}%`);
    this.hudText.setText(`Character: ${this.selectedCharacter.name} | Time: ${(elapsedMs / 1000).toFixed(1)}s`);
  }

  private startNextLevel() {
    if (this.transitioningToNextLevel) return;

    this.transitioningToNextLevel = true;
    this.scene.start("noise-stealth", {
      characterId: this.selectedCharacter.id,
      upgrade: this.upgrade,
      damageBonus: this.damageBonus,
      cloneCount: this.cloneCount,
    });
  }

  private clearGroupSafe(group?: Phaser.Physics.Arcade.Group | Phaser.Physics.Arcade.StaticGroup) {
    if (!group) return;

    const maybeGroup = group as (Phaser.Physics.Arcade.Group | Phaser.Physics.Arcade.StaticGroup) & {
      children?: { entries?: Phaser.GameObjects.GameObject[] };
      clear: (removeFromScene?: boolean, destroyChild?: boolean) => void;
    };

    if (!maybeGroup.children?.entries) return;
    maybeGroup.clear(true, true);
  }

  private cleanupScene() {
    if (this.playerPlatformCollider) {
      this.playerPlatformCollider.destroy();
      this.playerPlatformCollider = undefined;
    }
    if (this.goalOverlap) {
      this.goalOverlap.destroy();
      this.goalOverlap = undefined;
    }

    this.clearGroupSafe(this.platforms);
    this.goal?.destroy();
    this.player?.destroy();
    this.waterBody?.destroy();
    this.waterGlow?.destroy();
    this.waterLine?.destroy();
  }
}
