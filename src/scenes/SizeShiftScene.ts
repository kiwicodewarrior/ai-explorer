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
type SizeMode = "small" | "normal" | "large";

type SizeShiftSceneData = {
  characterId?: CharacterId;
  upgrade?: UpgradeOption;
  damageBonus?: number;
  cloneCount?: number;
};

type RectConfig = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BreakWallConfig = RectConfig;

type SpikeConfig = {
  x: number;
  y: number;
};

type GuardConfig = {
  x: number;
  y: number;
  minX: number;
  maxX: number;
  duration: number;
};

type SizeModeConfig = {
  scale: number;
  bodyWidth: number;
  bodyHeight: number;
  speedMultiplier: number;
  jumpMultiplier: number;
  label: string;
};

const LEVEL_WIDTH = 4200;
const LEVEL_HEIGHT = 760;
const GROUND_HEIGHT = 56;
const GROUND_Y = LEVEL_HEIGHT - GROUND_HEIGHT / 2;
const GROUND_TOP = LEVEL_HEIGHT - GROUND_HEIGHT;
const PLAYER_START_X = 120;
const PLAYER_START_Y = GROUND_TOP - 34;
const PLAYER_SPEED = 238;
const PLAYER_JUMP_VELOCITY = 462;
const GRAVITY_Y = 980;
const HIT_INVULN_MS = 900;
const BULLET_SPEED = 560;
const BULLET_COOLDOWN_MS = 220;
const GUARD_BULLET_SPEED = 280;
const GUARD_FIRE_COOLDOWN_MS = 1200;
const GUARD_FIRE_DISTANCE = 560;
const GUARD_FIRE_VERTICAL_LEEWAY = 220;
const MAX_DEATHS = DEFAULT_RUN_LIVES;
const GOAL_X = LEVEL_WIDTH - 110;
const GOAL_Y = 252;

const TERRAIN_LAYOUT: readonly RectConfig[] = [
  { x: LEVEL_WIDTH / 2, y: GROUND_Y, width: LEVEL_WIDTH, height: GROUND_HEIGHT },
  { x: 700, y: 672, width: 320, height: 18 },
  { x: 1210, y: 642, width: 140, height: 18 },
  { x: 1450, y: 608, width: 180, height: 22 },
  { x: 1720, y: 562, width: 220, height: 22 },
  { x: 1890, y: 518, width: 260, height: 18 },
  { x: 2180, y: 520, width: 210, height: 22 },
  { x: 2500, y: 474, width: 170, height: 22 },
  { x: 2800, y: 430, width: 220, height: 22 },
  { x: 3110, y: 386, width: 220, height: 22 },
  { x: 3340, y: 344, width: 180, height: 22 },
  { x: 3530, y: 310, width: 240, height: 18 },
  { x: 3720, y: 334, width: 190, height: 22 },
  { x: 3980, y: 282, width: 280, height: 22 },
] as const;

const BREAK_WALL_LAYOUT: readonly BreakWallConfig[] = [
  { x: 1010, y: 644, width: 52, height: 120 },
  { x: 2040, y: 504, width: 56, height: 120 },
  { x: 3450, y: 320, width: 56, height: 118 },
] as const;

const SPIKE_LAYOUT: readonly SpikeConfig[] = [
  { x: 1498, y: 608 - 11 },
  { x: 1530, y: 608 - 11 },
  { x: 2230, y: 520 - 11 },
  { x: 2262, y: 520 - 11 },
  { x: 3330, y: 344 - 11 },
  { x: 3362, y: 344 - 11 },
  { x: 3546, y: 310 - 9 },
  { x: 3580, y: 310 - 9 },
] as const;

const GUARD_LAYOUT: readonly GuardConfig[] = [
  { x: 700, y: 638, minX: 620, maxX: 780, duration: 1700 },
  { x: 1775, y: 528, minX: 1658, maxX: 1892, duration: 1800 },
  { x: 2510, y: 440, minX: 2430, maxX: 2570, duration: 1650 },
  { x: 2890, y: 396, minX: 2720, maxX: 3060, duration: 1900 },
  { x: 3815, y: 300, minX: 3704, maxX: 3926, duration: 1600 },
] as const;

const SIZE_MODE_CONFIG: Record<SizeMode, SizeModeConfig> = {
  small: {
    scale: 0.72,
    bodyWidth: 16,
    bodyHeight: 24,
    speedMultiplier: 1.08,
    jumpMultiplier: 1.18,
    label: "Small",
  },
  normal: {
    scale: 1,
    bodyWidth: 24,
    bodyHeight: 34,
    speedMultiplier: 1,
    jumpMultiplier: 1,
    label: "Normal",
  },
  large: {
    scale: 1.32,
    bodyWidth: 32,
    bodyHeight: 48,
    speedMultiplier: 0.9,
    jumpMultiplier: 0.9,
    label: "Large",
  },
};

const SIZE_ORDER: readonly SizeMode[] = ["small", "normal", "large"] as const;

const TEXTURE_KEYS = {
  player: "size-shift-player",
  terrain: "size-shift-terrain",
  breakWall: "size-shift-break-wall",
  spike: "size-shift-spike",
  guard: "size-shift-guard",
  bullet: "size-shift-bullet",
  guardBullet: "size-shift-guard-bullet",
  goal: "size-shift-goal",
} as const;

export class SizeShiftScene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private terrain!: Phaser.Physics.Arcade.StaticGroup;
  private breakWalls!: Phaser.Physics.Arcade.StaticGroup;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  private guards!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private guardBullets!: Phaser.Physics.Arcade.Group;
  private goal!: Phaser.Physics.Arcade.Image;

  private terrainCollider?: Phaser.Physics.Arcade.Collider;
  private breakWallCollider?: Phaser.Physics.Arcade.Collider;
  private spikeOverlap?: Phaser.Physics.Arcade.Collider;
  private guardOverlap?: Phaser.Physics.Arcade.Collider;
  private bulletTerrainCollider?: Phaser.Physics.Arcade.Collider;
  private bulletWallCollider?: Phaser.Physics.Arcade.Collider;
  private bulletGuardOverlap?: Phaser.Physics.Arcade.Collider;
  private guardBulletTerrainCollider?: Phaser.Physics.Arcade.Collider;
  private guardBulletWallCollider?: Phaser.Physics.Arcade.Collider;
  private guardBulletPlayerOverlap?: Phaser.Physics.Arcade.Collider;
  private goalOverlap?: Phaser.Physics.Arcade.Collider;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private upKey?: Phaser.Input.Keyboard.Key;
  private jumpKey?: Phaser.Input.Keyboard.Key;
  private aKey?: Phaser.Input.Keyboard.Key;
  private dKey?: Phaser.Input.Keyboard.Key;
  private wKey?: Phaser.Input.Keyboard.Key;
  private shrinkKey?: Phaser.Input.Keyboard.Key;
  private growKey?: Phaser.Input.Keyboard.Key;
  private fireKey?: Phaser.Input.Keyboard.Key;
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private reviveKey?: Phaser.Input.Keyboard.Key;

  private livesText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;

  private livesRemaining = DEFAULT_RUN_LIVES;
  private outOfLives = false;
  private levelComplete = false;
  private transitioningToNextLevel = false;
  private damageCooldownUntil = 0;
  private lastShotAt = -BULLET_COOLDOWN_MS;
  private sizeMode: SizeMode = "normal";
  private guardTweens: Phaser.Tweens.Tween[] = [];

  private upgrade: UpgradeOption = "triple-damage";
  private damageBonus = 1;
  private cloneCount = 0;

  constructor() {
    super("size-shift");
  }

  create(data: SizeShiftSceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.outOfLives = this.livesRemaining <= 0;
    this.levelComplete = false;
    this.transitioningToNextLevel = false;
    this.damageCooldownUntil = 0;
    this.lastShotAt = -BULLET_COOLDOWN_MS;
    this.sizeMode = "normal";
    this.guardTweens = [];
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
    this.physics.world.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);

    this.cameras.main.setBackgroundColor(0x0f1218);
    this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createTerrain();
    this.createBreakWalls();
    this.createHazards();
    this.createGoal();
    this.createPlayer();
    this.createCombat();
    this.createHud();
    this.bindInput();
    this.applySizeMode("normal");
    this.updateHud();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(220, 150);

    this.statusText.setText("Press Q/E to change size. Press F to shoot. Guard guns are slower than yours.");
    this.time.delayedCall(2800, () => {
      if (!this.levelComplete && !this.outOfLives) {
        this.statusText.setText("");
      }
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

    if (!this.textures.exists(TEXTURE_KEYS.terrain)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x58636e, 1);
      g.fillRoundedRect(0, 0, 160, 24, 6);
      g.fillStyle(0x96a6b2, 0.8);
      g.fillRect(8, 4, 144, 4);
      g.fillStyle(0x2c3137, 1);
      g.fillRect(0, 16, 160, 8);
      g.generateTexture(TEXTURE_KEYS.terrain, 160, 24);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.breakWall)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x78443a, 1);
      g.fillRoundedRect(0, 0, 64, 128, 8);
      g.lineStyle(3, 0xe1b392, 0.75);
      g.beginPath();
      g.moveTo(12, 12);
      g.lineTo(28, 38);
      g.lineTo(18, 70);
      g.moveTo(42, 10);
      g.lineTo(50, 34);
      g.lineTo(38, 82);
      g.moveTo(14, 92);
      g.lineTo(28, 112);
      g.lineTo(22, 124);
      g.strokePath();
      g.generateTexture(TEXTURE_KEYS.breakWall, 64, 128);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.spike)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xe1e7f3, 1);
      g.fillTriangle(2, 24, 16, 0, 30, 24);
      g.fillStyle(0x8190aa, 1);
      g.fillTriangle(8, 24, 16, 8, 24, 24);
      g.generateTexture(TEXTURE_KEYS.spike, 32, 24);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.guard)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xcdd6e2, 1);
      g.fillRoundedRect(8, 4, 28, 14, 6);
      g.fillStyle(0x55687c, 1);
      g.fillRoundedRect(6, 18, 32, 18, 6);
      g.fillStyle(0xffd578, 1);
      g.fillCircle(16, 12, 3);
      g.fillCircle(28, 12, 3);
      g.fillStyle(0x2c3745, 1);
      g.fillRect(10, 36, 8, 10);
      g.fillRect(26, 36, 8, 10);
      g.generateTexture(TEXTURE_KEYS.guard, 44, 48);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.bullet)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xffd27d, 1);
      g.fillRoundedRect(0, 0, 18, 8, 4);
      g.fillStyle(0xffffff, 0.7);
      g.fillRoundedRect(2, 1, 8, 3, 2);
      g.generateTexture(TEXTURE_KEYS.bullet, 18, 8);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.guardBullet)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xff8b8b, 1);
      g.fillRoundedRect(0, 0, 14, 6, 3);
      g.fillStyle(0xffffff, 0.45);
      g.fillRoundedRect(2, 1, 5, 2, 1);
      g.generateTexture(TEXTURE_KEYS.guardBullet, 14, 6);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.goal)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x1d2833, 1);
      g.fillRoundedRect(0, 0, 64, 88, 10);
      g.fillStyle(0xaff4ff, 0.85);
      g.fillRoundedRect(10, 10, 44, 68, 8);
      g.lineStyle(3, 0xffffff, 0.85);
      g.strokeRoundedRect(12, 12, 40, 64, 8);
      g.generateTexture(TEXTURE_KEYS.goal, 64, 88);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT / 2, LEVEL_WIDTH, LEVEL_HEIGHT, 0x0f1218);
    this.add.rectangle(LEVEL_WIDTH / 2, 140, LEVEL_WIDTH, 220, 0x1d2530, 0.8);
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT - 100, LEVEL_WIDTH, 160, 0x17111a, 0.92);

    for (let x = 90; x < LEVEL_WIDTH; x += 260) {
      this.add.rectangle(x, LEVEL_HEIGHT - 180, 10, 220, 0x202836, 0.48);
      this.add.rectangle(x + 40, LEVEL_HEIGHT - 250, 6, 160, 0x344052, 0.28);
    }

    this.add
      .text(GAME_WIDTH / 2, 36, "Size Shift", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f3fbff",
        stroke: "#050913",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.add
      .text(GAME_WIDTH / 2, 72, "Shrink for tunnels. Grow to smash through heavy walls.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#d6e7f2",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
  }

  private createTerrain() {
    this.terrain = this.physics.add.staticGroup();

    TERRAIN_LAYOUT.forEach((config) => {
      const block = this.terrain.create(config.x, config.y, TEXTURE_KEYS.terrain) as Phaser.Physics.Arcade.Image;
      block.setDisplaySize(config.width, config.height);
      block.refreshBody();
    });
  }

  private createBreakWalls() {
    this.breakWalls = this.physics.add.staticGroup();

    BREAK_WALL_LAYOUT.forEach((config) => {
      const wall = this.breakWalls.create(config.x, config.y, TEXTURE_KEYS.breakWall) as Phaser.Physics.Arcade.Image;
      wall.setDisplaySize(config.width, config.height);
      wall.setData("broken", false);
      wall.refreshBody();
    });
  }

  private createHazards() {
    this.spikes = this.physics.add.staticGroup();
    this.guards = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    SPIKE_LAYOUT.forEach((config) => {
      const spike = this.spikes.create(config.x, config.y, TEXTURE_KEYS.spike) as Phaser.Physics.Arcade.Image;
      spike.setOrigin(0.5, 1);
      spike.refreshBody();
    });

    GUARD_LAYOUT.forEach((config) => {
      const guard = this.guards.create(config.x, config.y, TEXTURE_KEYS.guard) as Phaser.Physics.Arcade.Image;
      guard.setDepth(8);
      guard.setImmovable(true);
      guard.setData("lastShotAt", -GUARD_FIRE_COOLDOWN_MS);

      const body = guard.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.moves = false;
      body.setSize(28, 38, true);

      this.guardTweens.push(
        this.tweens.add({
          targets: guard,
          x: { from: config.minX, to: config.maxX },
          duration: config.duration,
          yoyo: true,
          repeat: -1,
          ease: "Sine.inOut",
          onUpdate: () => {
            body.updateFromGameObject();
            const velocity = guard.body?.velocity.x ?? 0;
            if (Math.abs(velocity) > 0.01) {
              guard.setFlipX(velocity < 0);
            }
          },
        }),
      );
    });
  }

  private createGoal() {
    this.goal = this.physics.add.staticImage(GOAL_X, GOAL_Y, TEXTURE_KEYS.goal);
    this.goal.setDepth(8);
    this.goal.refreshBody();

    this.add
      .text(GOAL_X, GOAL_Y - 72, "Boss Gate", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#fff0be",
        stroke: "#050913",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
  }

  private createPlayer() {
    this.player = this.physics.add.image(PLAYER_START_X, PLAYER_START_Y, TEXTURE_KEYS.player);
    this.player.setTint(this.selectedCharacter.primaryColor);
    this.player.setDepth(10);
    this.player.setCollideWorldBounds(true);
    this.player.setDragX(1400);
    this.player.setMaxVelocity(360, 720);

    this.terrainCollider = this.physics.add.collider(this.player, this.terrain);
    this.breakWallCollider = this.physics.add.collider(this.player, this.breakWalls, (_player, wall) => {
      this.handleBreakWallCollision(wall as Phaser.Physics.Arcade.Image);
    });
    this.spikeOverlap = this.physics.add.overlap(this.player, this.spikes, () => {
      this.handleDeath("Spike hit!");
    });
    this.guardOverlap = this.physics.add.overlap(this.player, this.guards, () => {
      this.handleDeath("Guard hit!");
    });
    this.goalOverlap = this.physics.add.overlap(this.player, this.goal, () => {
      this.completeLevel();
    });
  }

  private createCombat() {
    this.bullets = this.physics.add.group({
      allowGravity: false,
      immovable: true,
      maxSize: 10,
    });
    this.guardBullets = this.physics.add.group({
      allowGravity: false,
      immovable: true,
      maxSize: 16,
    });

    this.bulletTerrainCollider = this.physics.add.collider(this.bullets, this.terrain, (bullet) => {
      (bullet as Phaser.Physics.Arcade.Image).destroy();
    });
    this.bulletWallCollider = this.physics.add.collider(this.bullets, this.breakWalls, (bullet) => {
      (bullet as Phaser.Physics.Arcade.Image).destroy();
    });
    this.bulletGuardOverlap = this.physics.add.overlap(this.bullets, this.guards, (bullet, guard) => {
      this.hitGuard(bullet as Phaser.Physics.Arcade.Image, guard as Phaser.Physics.Arcade.Image);
    });
    this.guardBulletTerrainCollider = this.physics.add.collider(this.guardBullets, this.terrain, (bullet) => {
      (bullet as Phaser.Physics.Arcade.Image).destroy();
    });
    this.guardBulletWallCollider = this.physics.add.collider(this.guardBullets, this.breakWalls, (bullet) => {
      (bullet as Phaser.Physics.Arcade.Image).destroy();
    });
    this.guardBulletPlayerOverlap = this.physics.add.overlap(this.guardBullets, this.player, (bullet) => {
      (bullet as Phaser.Physics.Arcade.Image).destroy();
      this.handleDeath("Guard shot you!");
    });
  }

  private createHud() {
    this.livesText = this.add
      .text(20, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#f5fbff",
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.modeText = this.add
      .text(GAME_WIDTH / 2, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#c4ecff",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(20);

    this.hudText = this.add
      .text(GAME_WIDTH - 20, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#dce7f3",
        align: "right",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(20);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 24, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#fff7ef",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);
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
    this.shrinkKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.growKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.fireKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.reviveKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  update() {
    if (this.levelComplete) {
      if (this.confirmKey && (Phaser.Input.Keyboard.JustDown(this.confirmKey) || this.confirmKey.isDown)) {
        this.startMagneticFacility();
      }
      this.player.setVelocityX(0);
      this.updateHud();
      return;
    }

    if (this.outOfLives) {
      if (this.reviveKey && Phaser.Input.Keyboard.JustDown(this.reviveKey) && useReviveGem(this)) {
        this.restartLevel();
        return;
      }
      if (this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
        this.scene.start("character-select");
      }
      this.player.setVelocityX(0);
      this.updateHud();
      return;
    }

    this.handleResizeInput();
    this.updateMovement();
    this.handleFireInput();
    this.handleGuardFire();
    this.cleanupBullets();

    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    if (body && this.player.y > LEVEL_HEIGHT + 100) {
      this.handleDeath("You slipped out of the chamber.");
      return;
    }

    this.updateHud();
  }

  private handleResizeInput() {
    if (this.shrinkKey && Phaser.Input.Keyboard.JustDown(this.shrinkKey)) {
      this.shiftSize(-1);
    }

    if (this.growKey && Phaser.Input.Keyboard.JustDown(this.growKey)) {
      this.shiftSize(1);
    }
  }

  private handleFireInput() {
    if (!this.fireKey || !Phaser.Input.Keyboard.JustDown(this.fireKey)) return;
    if (this.time.now - this.lastShotAt < BULLET_COOLDOWN_MS) return;

    const direction = this.player.flipX ? -1 : 1;
    const bulletX = this.player.x + direction * 22;
    const bulletY = this.player.y - 2;
    const bullet = this.bullets.create(bulletX, bulletY, TEXTURE_KEYS.bullet) as Phaser.Physics.Arcade.Image;
    bullet.setDepth(12);
    bullet.setTint(this.selectedCharacter.accentColor);
    bullet.setVelocityX(BULLET_SPEED * direction);
    bullet.setImmovable(true);

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(18, 8, true);

    this.lastShotAt = this.time.now;
  }

  private cleanupBullets() {
    const children = this.bullets?.children?.entries as Phaser.GameObjects.GameObject[] | undefined;
    children?.forEach((child) => {
      if (!(child instanceof Phaser.Physics.Arcade.Image)) return;
      if (child.x < -40 || child.x > LEVEL_WIDTH + 40) {
        child.destroy();
      }
    });

    const guardChildren = this.guardBullets?.children?.entries as Phaser.GameObjects.GameObject[] | undefined;
    guardChildren?.forEach((child) => {
      if (!(child instanceof Phaser.Physics.Arcade.Image)) return;
      if (child.x < -40 || child.x > LEVEL_WIDTH + 40 || child.y < -40 || child.y > LEVEL_HEIGHT + 40) {
        child.destroy();
      }
    });
  }

  private handleGuardFire() {
    const guards = this.guards?.children?.entries as Phaser.GameObjects.GameObject[] | undefined;
    if (!guards?.length) return;

    guards.forEach((child) => {
      if (!(child instanceof Phaser.Physics.Arcade.Image) || !child.active) return;

      const deltaX = this.player.x - child.x;
      const deltaY = this.player.y - child.y;
      const distance = Phaser.Math.Distance.Between(child.x, child.y, this.player.x, this.player.y);
      if (distance > GUARD_FIRE_DISTANCE || Math.abs(deltaY) > GUARD_FIRE_VERTICAL_LEEWAY) return;

      const lastShotAt = child.getData("lastShotAt") as number | undefined;
      if (this.time.now - (lastShotAt ?? -GUARD_FIRE_COOLDOWN_MS) < GUARD_FIRE_COOLDOWN_MS) return;

      const direction = deltaX < 0 ? -1 : 1;
      child.setFlipX(direction < 0);
      child.setData("lastShotAt", this.time.now);
      this.fireGuardBullet(child, this.player.x, this.player.y - 10);
    });
  }

  private fireGuardBullet(guard: Phaser.Physics.Arcade.Image, targetX: number, targetY: number) {
    const direction = targetX < guard.x ? -1 : 1;
    const bulletX = guard.x + direction * 20;
    const bulletY = guard.y - 10;
    const bullet = this.guardBullets.create(bulletX, bulletY, TEXTURE_KEYS.guardBullet) as Phaser.Physics.Arcade.Image;
    bullet.setDepth(11);
    bullet.setImmovable(true);

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(14, 6, true);

    const aim = new Phaser.Math.Vector2(targetX - bulletX, targetY - bulletY);
    if (aim.lengthSq() === 0) {
      aim.set(direction, 0);
    }
    aim.normalize().scale(GUARD_BULLET_SPEED);
    bullet.setVelocity(aim.x, aim.y);
    bullet.setRotation(aim.angle());
  }

  private shiftSize(direction: -1 | 1) {
    const currentIndex = SIZE_ORDER.indexOf(this.sizeMode);
    const nextIndex = Phaser.Math.Clamp(currentIndex + direction, 0, SIZE_ORDER.length - 1);
    const nextMode = SIZE_ORDER[nextIndex];
    if (nextMode === this.sizeMode) return;

    if (!this.canResizeTo(nextMode)) {
      this.statusText.setText("Not enough room to change size here.");
      return;
    }

    this.applySizeMode(nextMode);
    this.statusText.setText(`Size changed: ${SIZE_MODE_CONFIG[nextMode].label}`);
  }

  private canResizeTo(nextMode: SizeMode) {
    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body) return true;

    const nextConfig = SIZE_MODE_CONFIG[nextMode];
    const bottom = body.y + body.height;
    const centerX = body.x + body.width / 2;
    const testRect = new Phaser.Geom.Rectangle(
      centerX - nextConfig.bodyWidth / 2,
      bottom - nextConfig.bodyHeight,
      nextConfig.bodyWidth,
      nextConfig.bodyHeight,
    );

    if (testRect.left < 0 || testRect.right > LEVEL_WIDTH || testRect.top < 0 || testRect.bottom > LEVEL_HEIGHT) {
      return false;
    }

    return !this.doesRectHitGroup(testRect, this.terrain) && !this.doesRectHitGroup(testRect, this.breakWalls);
  }

  private doesRectHitGroup(
    rect: Phaser.Geom.Rectangle,
    group: Phaser.Physics.Arcade.StaticGroup | Phaser.Physics.Arcade.Group,
  ) {
    const children = (group as { children?: { entries?: Phaser.GameObjects.GameObject[] } }).children?.entries;
    if (!children) return false;

    return children.some((child) => {
      if (!(child instanceof Phaser.Physics.Arcade.Image) || !child.active || !child.visible) {
        return false;
      }

      const body = child.body as { enable?: boolean } | undefined;
      if (body && body.enable === false) {
        return false;
      }

      const bounds = child.getBounds();
      const adjusted = new Phaser.Geom.Rectangle(bounds.x + 1, bounds.y + 1, Math.max(0, bounds.width - 2), Math.max(0, bounds.height - 2));
      return Phaser.Geom.Intersects.RectangleToRectangle(rect, adjusted);
    });
  }

  private applySizeMode(mode: SizeMode) {
    const config = SIZE_MODE_CONFIG[mode];
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const centerX = body.x + body.width / 2;
    const bottom = body.y + body.height;

    this.sizeMode = mode;
    this.player.setScale(config.scale);
    body.setSize(config.bodyWidth, config.bodyHeight, true);
    body.x = centerX - config.bodyWidth / 2;
    body.y = bottom - config.bodyHeight;
  }

  private updateMovement() {
    const leftDown = (this.cursors?.left?.isDown ?? false) || (this.leftKey?.isDown ?? false) || (this.aKey?.isDown ?? false);
    const rightDown =
      (this.cursors?.right?.isDown ?? false) || (this.rightKey?.isDown ?? false) || (this.dKey?.isDown ?? false);

    let xVelocity = 0;
    const sizeConfig = SIZE_MODE_CONFIG[this.sizeMode];
    const moveSpeed = Math.max(PLAYER_SPEED, this.selectedCharacter.speed) * sizeConfig.speedMultiplier;
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
    this.player.setVelocityY(-(PLAYER_JUMP_VELOCITY + jumpBoost) * sizeConfig.jumpMultiplier);
  }

  private handleBreakWallCollision(wall: Phaser.Physics.Arcade.Image) {
    if (!wall.active || wall.getData("broken")) return;

    if (this.sizeMode !== "large") {
      this.statusText.setText("Grow larger to break this wall.");
      return;
    }

    wall.setData("broken", true);
    this.cameras.main.shake(100, 0.006);
    this.tweens.add({
      targets: wall,
      alpha: 0,
      scaleX: 0.7,
      scaleY: 1.1,
      duration: 180,
      ease: "Quad.easeOut",
      onComplete: () => {
        wall.destroy();
      },
    });
  }

  private hitGuard(bullet: Phaser.Physics.Arcade.Image, guard: Phaser.Physics.Arcade.Image) {
    if (!bullet.active || !guard.active) return;

    bullet.destroy();
    this.tweens.killTweensOf(guard);
    this.cameras.main.shake(70, 0.003);
    this.tweens.add({
      targets: guard,
      alpha: 0,
      scaleX: 0.7,
      scaleY: 0.7,
      angle: 12,
      duration: 180,
      ease: "Quad.easeOut",
      onComplete: () => {
        guard.destroy();
      },
    });
  }

  private handleDeath(message: string) {
    if (this.levelComplete || this.outOfLives) return;
    if (this.time.now < this.damageCooldownUntil) return;

    this.damageCooldownUntil = this.time.now + HIT_INVULN_MS;
    const livesLeft = loseRunLife(this);
    this.livesRemaining = livesLeft;
    this.player.setVelocity(0, 0);
    this.cameras.main.shake(100, 0.006);

    if (livesLeft <= 0) {
      this.outOfLives = true;
      const gems = getGemCount(this);
      this.statusText.setText(
        gems >= REVIVE_GEM_COST
          ? `Out of lives. Press R to spend 1 gem (${gems} left) and restart, or ENTER to leave.`
          : `You can't play anymore. ${MAX_DEATHS} lives used. Press ENTER.`,
      );
      return;
    }

    this.statusText.setText(`${message} Lives left: ${livesLeft}.`);
    this.time.delayedCall(650, () => {
      if (!this.levelComplete && !this.outOfLives) {
        this.restartLevel();
      }
    });
  }

  private completeLevel() {
    if (this.levelComplete || this.outOfLives) return;

    this.levelComplete = true;
    this.player.setVelocityX(0);
    this.statusText.setText("Size Shift complete! Press ENTER for the magnetic facility.");
    this.cameras.main.flash(180, 220, 255, 235, false);
  }

  private updateHud() {
    this.livesText.setText(`Lives: ${this.livesRemaining}`);
    this.modeText.setText(`Size: ${SIZE_MODE_CONFIG[this.sizeMode].label}`);
    this.hudText.setText(`Character: ${this.selectedCharacter.name} | Q/E size | F shoot | dodge guard fire`);
  }

  private restartLevel() {
    this.scene.restart({
      characterId: this.selectedCharacter.id,
      upgrade: this.upgrade,
      damageBonus: this.damageBonus,
      cloneCount: this.cloneCount,
    });
  }

  private startMagneticFacility() {
    if (this.transitioningToNextLevel) return;

    this.transitioningToNextLevel = true;
    this.scene.start("magnetic-facility", {
      characterId: this.selectedCharacter.id,
      upgrade: this.upgrade,
      damageBonus: this.damageBonus,
      cloneCount: this.cloneCount,
    });
  }

  private clearGroupSafe(group?: Phaser.Physics.Arcade.StaticGroup | Phaser.Physics.Arcade.Group) {
    if (!group) return;

    const maybeGroup = group as (Phaser.Physics.Arcade.StaticGroup | Phaser.Physics.Arcade.Group) & {
      children?: { entries?: Phaser.GameObjects.GameObject[] };
      clear: (removeFromScene?: boolean, destroyChild?: boolean) => void;
    };

    if (!maybeGroup.children?.entries) return;
    maybeGroup.clear(true, true);
  }

  private cleanupScene() {
    this.terrainCollider?.destroy();
    this.breakWallCollider?.destroy();
    this.spikeOverlap?.destroy();
    this.guardOverlap?.destroy();
    this.bulletTerrainCollider?.destroy();
    this.bulletWallCollider?.destroy();
    this.bulletGuardOverlap?.destroy();
    this.guardBulletTerrainCollider?.destroy();
    this.guardBulletWallCollider?.destroy();
    this.guardBulletPlayerOverlap?.destroy();
    this.goalOverlap?.destroy();
    this.guardTweens.forEach((tween) => tween.remove());
    this.guardTweens = [];

    this.clearGroupSafe(this.terrain);
    this.clearGroupSafe(this.breakWalls);
    this.clearGroupSafe(this.spikes);
    this.clearGroupSafe(this.guards);
    this.clearGroupSafe(this.bullets);
    this.clearGroupSafe(this.guardBullets);
    this.player?.destroy();
    this.goal?.destroy();
    this.livesText?.destroy();
    this.hudText?.destroy();
    this.statusText?.destroy();
    this.modeText?.destroy();
  }
}
