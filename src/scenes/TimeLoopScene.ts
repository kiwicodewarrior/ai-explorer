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

type TimeLoopSceneData = {
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

type SpikeSegmentConfig = {
  start: number;
  end: number;
  step: number;
};

type LavaPoolConfig = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type GuardConfig = {
  x: number;
  y: number;
  minX: number;
  maxX: number;
  duration: number;
};

type GhostFrame = {
  x: number;
  y: number;
  flipX: boolean;
};

type GhostRun = {
  frames: GhostFrame[];
  sprite: Phaser.GameObjects.Image;
};

type LoopPhase = 0 | 1 | 2;

const EXTRA_DOOR_SEGMENTS = 8;
const EXTRA_SEGMENT_WIDTH = 220;
const BASE_LEVEL_WIDTH = 2400;
const LEVEL_WIDTH = BASE_LEVEL_WIDTH + EXTRA_DOOR_SEGMENTS * EXTRA_SEGMENT_WIDTH;
const LEVEL_HEIGHT = GAME_HEIGHT;
const GROUND_HEIGHT = 56;
const GROUND_Y = LEVEL_HEIGHT - GROUND_HEIGHT / 2;
const START_X = 90;
const START_Y = LEVEL_HEIGHT - GROUND_HEIGHT - 34;
const PLAYER_SPEED = 235;
const PLAYER_JUMP_VELOCITY = 452;
const GRAVITY_Y = 980;
const HIT_INVULN_MS = 900;
const RECORD_INTERVAL_MS = 80;
const MAX_DEATHS = DEFAULT_RUN_LIVES;

const SWITCH_1_X = 358;
const SWITCH_2_X = 1260;
const SWITCH_Y = LEVEL_HEIGHT - GROUND_HEIGHT - 8;
const ANCHOR_1_X = 968;
const ANCHOR_2_X = 1830;
const ANCHOR_Y = LEVEL_HEIGHT - GROUND_HEIGHT - 26;
const GOAL_X = LEVEL_WIDTH - 128;
const GOAL_Y = LEVEL_HEIGHT - GROUND_HEIGHT - 26;
const DOOR_1_X = 742;
const DOOR_2_X = 1548;
const DOOR_WIDTH = 34;
const DOOR_HEIGHT = 214;

const PLATFORM_LAYOUT: readonly PlatformConfig[] = [
  { x: 500, y: 404, width: 140, height: 20 },
  { x: 1236, y: 404, width: 164, height: 20 },
  { x: 1678, y: 348, width: 188, height: 20 },
  { x: 1984, y: 286, width: 174, height: 20 },
  { x: 2236, y: 356, width: 184, height: 20 },
  { x: 2476, y: 442, width: 176, height: 20 },
  { x: 2716, y: 362, width: 186, height: 20 },
  { x: 2958, y: 286, width: 174, height: 20 },
  { x: 3198, y: 376, width: 188, height: 20 },
  { x: 3444, y: 300, width: 178, height: 20 },
  { x: 3688, y: 382, width: 180, height: 20 },
  { x: 3924, y: 310, width: 180, height: 20 },
] as const;

const FLOOR_SPIKE_SEGMENTS: readonly SpikeSegmentConfig[] = [
  { start: 2140, end: 2364, step: 32 },
  { start: 2864, end: 3088, step: 32 },
  { start: 3560, end: 3784, step: 32 },
] as const;

const LAVA_POOLS: readonly LavaPoolConfig[] = [
  { x: 2588, y: LEVEL_HEIGHT - GROUND_HEIGHT, width: 260, height: 28 },
  { x: 3320, y: LEVEL_HEIGHT - GROUND_HEIGHT, width: 320, height: 28 },
] as const;

const GUARD_LAYOUT: readonly GuardConfig[] = [
  { x: 2236, y: 322, minX: 2164, maxX: 2308, duration: 1800 },
  { x: 2716, y: 328, minX: 2646, maxX: 2786, duration: 1700 },
  { x: 3198, y: 342, minX: 3128, maxX: 3268, duration: 1850 },
  { x: 3688, y: 348, minX: 3618, maxX: 3758, duration: 1650 },
  { x: 3924, y: 276, minX: 3860, maxX: 3988, duration: 1500 },
] as const;

const TEXTURE_KEYS = {
  player: "time-loop-player",
  ghost: "time-loop-ghost",
  ground: "time-loop-ground",
  platform: "time-loop-platform",
  door: "time-loop-door",
  switch: "time-loop-switch",
  anchor: "time-loop-anchor",
  goal: "time-loop-goal",
  spike: "time-loop-spike",
  lava: "time-loop-lava",
  guard: "time-loop-guard",
} as const;

export class TimeLoopScene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private ground!: Phaser.Physics.Arcade.StaticGroup;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  private lavaPools!: Phaser.Physics.Arcade.StaticGroup;
  private guards!: Phaser.Physics.Arcade.Group;
  private door1!: Phaser.Physics.Arcade.Image;
  private door2!: Phaser.Physics.Arcade.Image;
  private anchor!: Phaser.Physics.Arcade.Image;
  private goal!: Phaser.Physics.Arcade.Image;

  private groundCollider?: Phaser.Physics.Arcade.Collider;
  private platformCollider?: Phaser.Physics.Arcade.Collider;
  private spikeOverlap?: Phaser.Physics.Arcade.Collider;
  private lavaOverlap?: Phaser.Physics.Arcade.Collider;
  private guardOverlap?: Phaser.Physics.Arcade.Collider;
  private door1Collider?: Phaser.Physics.Arcade.Collider;
  private door2Collider?: Phaser.Physics.Arcade.Collider;
  private anchorOverlap?: Phaser.Physics.Arcade.Collider;
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

  private livesText!: Phaser.GameObjects.Text;
  private loopText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private switch1Rect!: Phaser.GameObjects.Rectangle;
  private switch2Rect!: Phaser.GameObjects.Rectangle;
  private anchorLabel!: Phaser.GameObjects.Text;
  private goalLabel!: Phaser.GameObjects.Text;
  private door1Glow!: Phaser.GameObjects.Rectangle;
  private door2Glow!: Phaser.GameObjects.Rectangle;

  private livesRemaining = DEFAULT_RUN_LIVES;
  private outOfLives = false;
  private levelComplete = false;
  private transitioningToBoss = false;
  private damageCooldownUntil = 0;
  private loopPhase: LoopPhase = 0;
  private loopStartTime = 0;
  private lastRecordAt = 0;
  private recordedFrames: GhostFrame[] = [];
  private ghostRuns: GhostRun[] = [];
  private guardTweens: Phaser.Tweens.Tween[] = [];
  private switch1Latched = false;
  private switch2Latched = false;

  private upgrade: UpgradeOption = "triple-damage";
  private damageBonus = 1;
  private cloneCount = 0;

  constructor() {
    super("time-loop");
  }

  create(data: TimeLoopSceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.outOfLives = this.livesRemaining <= 0;
    this.levelComplete = false;
    this.transitioningToBoss = false;
    this.damageCooldownUntil = 0;
    this.loopPhase = 0;
    this.loopStartTime = this.time.now;
    this.lastRecordAt = this.time.now;
    this.recordedFrames = [];
    this.ghostRuns = [];
    this.guardTweens = [];
    this.switch1Latched = false;
    this.switch2Latched = false;
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

    this.cameras.main.setBackgroundColor(0x080d19);
    this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createPlatforms();
    this.createDoors();
    this.createAnchorAndGoal();
    this.createPlayer();
    this.createHazards();
    this.createHud();
    this.bindInput();
    this.resetAttempt(false);
    this.updateLoopTargets();
    this.updateSwitchesAndDoors();
    this.updateHud();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(220, 120);

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

    if (!this.textures.exists(TEXTURE_KEYS.ghost)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x9ff0ff, 0.95);
      g.fillRoundedRect(10, 2, 20, 12, 4);
      g.fillRoundedRect(8, 14, 24, 24, 5);
      g.fillRect(18, 16, 4, 20);
      g.fillRect(10, 38, 8, 8);
      g.fillRect(22, 38, 8, 8);
      g.generateTexture(TEXTURE_KEYS.ghost, 40, 48);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.ground)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x2f2d3f, 1);
      g.fillRect(0, 0, 128, GROUND_HEIGHT);
      g.fillStyle(0x66607f, 1);
      g.fillRect(0, 0, 128, 14);
      g.fillStyle(0x181523, 1);
      for (let x = 12; x < 128; x += 26) {
        g.fillRect(x, 18, 10, GROUND_HEIGHT - 20);
      }
      g.generateTexture(TEXTURE_KEYS.ground, 128, GROUND_HEIGHT);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.platform)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x7a6f52, 1);
      g.fillRoundedRect(0, 0, 128, 20, 6);
      g.fillStyle(0x463d2d, 1);
      g.fillRect(0, 12, 128, 8);
      g.fillStyle(0xe8d7a4, 0.7);
      g.fillRect(8, 4, 112, 4);
      g.generateTexture(TEXTURE_KEYS.platform, 128, 20);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.door)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x4d3d67, 1);
      g.fillRoundedRect(0, 0, DOOR_WIDTH, DOOR_HEIGHT, 6);
      g.fillStyle(0xb096ff, 0.42);
      g.fillRect(8, 10, DOOR_WIDTH - 16, DOOR_HEIGHT - 20);
      g.generateTexture(TEXTURE_KEYS.door, DOOR_WIDTH, DOOR_HEIGHT);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.switch)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x2e415c, 1);
      g.fillRoundedRect(0, 0, 68, 16, 6);
      g.fillStyle(0x8ee1ff, 0.75);
      g.fillRoundedRect(8, 4, 52, 8, 4);
      g.generateTexture(TEXTURE_KEYS.switch, 68, 16);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.anchor)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x14243e, 1);
      g.fillCircle(32, 32, 30);
      g.lineStyle(5, 0x7df0ff, 1);
      g.strokeCircle(32, 32, 20);
      g.lineStyle(3, 0xffffff, 0.8);
      g.strokeCircle(32, 32, 10);
      g.generateTexture(TEXTURE_KEYS.anchor, 64, 64);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.goal)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x1a2d35, 1);
      g.fillCircle(32, 32, 30);
      g.lineStyle(5, 0xffde8d, 1);
      g.strokeCircle(32, 32, 20);
      g.lineStyle(3, 0xffffff, 0.8);
      g.strokeCircle(32, 32, 10);
      g.generateTexture(TEXTURE_KEYS.goal, 64, 64);
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

    if (!this.textures.exists(TEXTURE_KEYS.lava)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x4d0e08, 1);
      g.fillRoundedRect(0, 0, 128, 28, 10);
      g.fillStyle(0xff5b26, 1);
      g.fillRoundedRect(4, 8, 120, 16, 8);
      g.fillStyle(0xffc05d, 0.8);
      for (let x = 12; x < 116; x += 22) {
        g.fillCircle(x, 10 + ((x / 22) % 2) * 3, 5);
      }
      g.generateTexture(TEXTURE_KEYS.lava, 128, 28);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.guard)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xd8c0ff, 1);
      g.fillRoundedRect(8, 4, 28, 14, 6);
      g.fillStyle(0x7648d9, 1);
      g.fillRoundedRect(6, 18, 32, 18, 6);
      g.fillStyle(0xf8f3ff, 1);
      g.fillCircle(16, 11, 3);
      g.fillCircle(28, 11, 3);
      g.fillStyle(0x3a225f, 1);
      g.fillRect(10, 36, 8, 10);
      g.fillRect(26, 36, 8, 10);
      g.generateTexture(TEXTURE_KEYS.guard, 44, 48);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT / 2, LEVEL_WIDTH, LEVEL_HEIGHT, 0x080d19);
    this.add.rectangle(LEVEL_WIDTH / 2, 120, LEVEL_WIDTH, 200, 0x1b2440, 0.54);
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT - 96, LEVEL_WIDTH, 170, 0x18162a, 0.9);
    this.add.rectangle((LEVEL_WIDTH + BASE_LEVEL_WIDTH) / 2, LEVEL_HEIGHT - 42, LEVEL_WIDTH - BASE_LEVEL_WIDTH, 84, 0x391012, 0.18);

    for (let x = 100; x < LEVEL_WIDTH; x += 180) {
      this.add.rectangle(x, LEVEL_HEIGHT / 2, 4, LEVEL_HEIGHT - 120, 0x2d3450, 0.22);
    }
    for (let y = 100; y < LEVEL_HEIGHT - 80; y += 88) {
      this.add.rectangle(LEVEL_WIDTH / 2, y, LEVEL_WIDTH - 140, 2, 0x2d3450, 0.16);
    }

    for (let index = 0; index < EXTRA_DOOR_SEGMENTS; index += 1) {
      const x = BASE_LEVEL_WIDTH + index * EXTRA_SEGMENT_WIDTH + EXTRA_SEGMENT_WIDTH / 2;
      this.add.rectangle(x, LEVEL_HEIGHT - GROUND_HEIGHT - 74, 54, 176, 0x6c4fb2, 0.08).setStrokeStyle(3, 0xa98eff, 0.16);
    }

    this.add
      .text(GAME_WIDTH / 2, 28, "Time Loop", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f5fbff",
        stroke: "#050913",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.add
      .text(GAME_WIDTH / 2, 58, "Record a loop, rewind, then survive the longer hazard corridor beyond the anchors.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#dce7f8",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
  }

  private createPlatforms() {
    this.ground = this.physics.add.staticGroup();
    this.platforms = this.physics.add.staticGroup();

    const ground = this.ground.create(LEVEL_WIDTH / 2, GROUND_Y, TEXTURE_KEYS.ground) as Phaser.Physics.Arcade.Image;
    ground.setDisplaySize(LEVEL_WIDTH, GROUND_HEIGHT);
    ground.refreshBody();

    PLATFORM_LAYOUT.forEach((config) => {
      const platform = this.platforms.create(config.x, config.y, TEXTURE_KEYS.platform) as Phaser.Physics.Arcade.Image;
      platform.setDisplaySize(config.width, config.height);
      platform.refreshBody();
    });
  }

  private createDoors() {
    const doorY = LEVEL_HEIGHT - GROUND_HEIGHT - DOOR_HEIGHT / 2;

    this.door1 = this.physics.add.staticImage(DOOR_1_X, doorY, TEXTURE_KEYS.door);
    this.door2 = this.physics.add.staticImage(DOOR_2_X, doorY, TEXTURE_KEYS.door);
    this.door1Glow = this.add.rectangle(DOOR_1_X, doorY, DOOR_WIDTH + 24, DOOR_HEIGHT + 12, 0x8fe7ff, 0.12);
    this.door2Glow = this.add.rectangle(DOOR_2_X, doorY, DOOR_WIDTH + 24, DOOR_HEIGHT + 12, 0xffd98e, 0.12);

    this.switch1Rect = this.add.rectangle(SWITCH_1_X, SWITCH_Y, 68, 16, 0x2e415c, 1).setStrokeStyle(2, 0x8ee1ff, 0.9);
    this.switch2Rect = this.add.rectangle(SWITCH_2_X, SWITCH_Y - 108, 68, 16, 0x5a3d57, 1).setStrokeStyle(2, 0xffb8d7, 0.9);
    this.add.image(SWITCH_1_X, SWITCH_Y, TEXTURE_KEYS.switch);
    this.add.image(SWITCH_2_X, SWITCH_Y - 108, TEXTURE_KEYS.switch).setTint(0xffb8d7);

    this.add.text(SWITCH_1_X, SWITCH_Y - 26, "Switch 1", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "15px",
      color: "#dce7f8",
      stroke: "#050913",
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(SWITCH_2_X, SWITCH_Y - 134, "Switch 2", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "15px",
      color: "#ffd8ea",
      stroke: "#050913",
      strokeThickness: 4,
    }).setOrigin(0.5);
  }

  private createAnchorAndGoal() {
    this.anchor = this.physics.add.staticImage(ANCHOR_1_X, ANCHOR_Y, TEXTURE_KEYS.anchor);
    this.goal = this.physics.add.staticImage(GOAL_X, GOAL_Y, TEXTURE_KEYS.goal);
    this.goal.setVisible(false);
    const goalBody = this.goal.body as Phaser.Physics.Arcade.StaticBody | undefined;
    goalBody?.updateFromGameObject();

    this.anchorLabel = this.add.text(ANCHOR_1_X, ANCHOR_Y - 54, "Time Anchor", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "16px",
      color: "#e7fbff",
      stroke: "#050913",
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.goalLabel = this.add.text(GOAL_X, GOAL_Y - 54, "Boss Gate", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "16px",
      color: "#fff0be",
      stroke: "#050913",
      strokeThickness: 4,
    }).setOrigin(0.5).setVisible(false);
  }

  private createPlayer() {
    this.player = this.physics.add
      .image(START_X, START_Y, TEXTURE_KEYS.player)
      .setTint(this.selectedCharacter.primaryColor)
      .setCollideWorldBounds(true);

    this.player.setDragX(1400);
    this.player.setMaxVelocity(360, 620);

    this.groundCollider = this.physics.add.collider(this.player, this.ground);
    this.platformCollider = this.physics.add.collider(this.player, this.platforms);
    this.door1Collider = this.physics.add.collider(this.player, this.door1);
    this.door2Collider = this.physics.add.collider(this.player, this.door2);
    this.anchorOverlap = this.physics.add.overlap(this.player, this.anchor, () => {
      if (this.loopPhase < 2) {
        this.commitLoop();
      }
    });
    this.goalOverlap = this.physics.add.overlap(this.player, this.goal, () => {
      if (this.loopPhase === 2) {
        this.completeLevel();
      }
    });
  }

  private createHazards() {
    this.createSpikes();
    this.createLavaPools();
    this.createGuards();

    this.spikeOverlap = this.physics.add.overlap(this.player, this.spikes, () => {
      this.handleDeath("Spike hit!");
    });
    this.lavaOverlap = this.physics.add.overlap(this.player, this.lavaPools, () => {
      this.handleDeath("You fell into the lava!");
    });
    this.guardOverlap = this.physics.add.overlap(this.player, this.guards, () => {
      this.handleDeath("A time guard caught you!");
    });
  }

  private createSpikes() {
    this.spikes = this.physics.add.staticGroup();
    const groundTop = LEVEL_HEIGHT - GROUND_HEIGHT;

    FLOOR_SPIKE_SEGMENTS.forEach((segment) => {
      for (let x = segment.start; x <= segment.end; x += segment.step) {
        const spike = this.spikes.create(x, groundTop, TEXTURE_KEYS.spike) as Phaser.Physics.Arcade.Image;
        spike.setOrigin(0.5, 1);
        spike.setDepth(6);
        spike.refreshBody();
      }
    });
  }

  private createLavaPools() {
    this.lavaPools = this.physics.add.staticGroup();

    LAVA_POOLS.forEach((pool) => {
      const lava = this.lavaPools.create(pool.x, pool.y, TEXTURE_KEYS.lava) as Phaser.Physics.Arcade.Image;
      lava.setOrigin(0.5, 1);
      lava.setDepth(5);
      lava.setDisplaySize(pool.width, pool.height);
      lava.refreshBody();
      this.add.rectangle(pool.x, pool.y - pool.height + 6, pool.width + 10, 6, 0xffd17a, 0.36).setDepth(4);
    });
  }

  private createGuards() {
    this.guards = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    GUARD_LAYOUT.forEach((config) => {
      const guard = this.guards.create(config.x, config.y, TEXTURE_KEYS.guard) as Phaser.Physics.Arcade.Image;
      guard.setDepth(8);
      guard.setImmovable(true);

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

  private createHud() {
    this.livesText = this.add
      .text(20, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#f5fbff",
      })
      .setScrollFactor(0)
      .setDepth(10);

    this.loopText = this.add
      .text(GAME_WIDTH / 2, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#bfefff",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(10);

    this.hudText = this.add
      .text(GAME_WIDTH - 20, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#dbe8f7",
        align: "right",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(10);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 26, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f4fbff",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10);
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
        this.startBossArena();
      }
      this.player.setVelocityX(0);
      this.updateGhosts();
      this.updateSwitchesAndDoors();
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
      this.updateGhosts();
      this.updateSwitchesAndDoors();
      this.updateHud();
      return;
    }

    this.updateMovement();
    this.recordFrame();
    this.updateGhosts();
    this.updateSwitchesAndDoors();

    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    if (body && this.player.y > LEVEL_HEIGHT + 40) {
      this.handleDeath("You slipped out of the loop.");
    }

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

  private recordFrame() {
    if (this.time.now - this.lastRecordAt < RECORD_INTERVAL_MS) return;

    while (this.time.now - this.lastRecordAt >= RECORD_INTERVAL_MS) {
      this.recordedFrames.push({
        x: this.player.x,
        y: this.player.y,
        flipX: this.player.flipX,
      });
      this.lastRecordAt += RECORD_INTERVAL_MS;
    }
  }

  private updateGhosts() {
    const loopElapsed = this.time.now - this.loopStartTime;
    this.ghostRuns.forEach((run) => {
      if (run.frames.length === 0) return;

      const frameIndex = Math.min(run.frames.length - 1, Math.floor(loopElapsed / RECORD_INTERVAL_MS));
      const frame = run.frames[frameIndex];
      run.sprite.setPosition(frame.x, frame.y);
      run.sprite.setFlipX(frame.flipX);
    });
  }

  private updateSwitchesAndDoors() {
    if (this.isSwitchPressed(this.switch1Rect)) {
      this.switch1Latched = true;
    }

    if (this.isSwitchPressed(this.switch2Rect)) {
      this.switch2Latched = true;
    }

    const door1Open = this.switch1Latched;
    const door2Open = this.loopPhase >= 1 && this.switch1Latched && this.switch2Latched;

    this.setDoorState(this.door1, this.door1Collider, door1Open);
    this.setDoorState(this.door2, this.door2Collider, door2Open);

    this.door1.setAlpha(door1Open ? 0.25 : 1);
    this.door2.setAlpha(door2Open ? 0.25 : 1);
    this.door1Glow.setFillStyle(door1Open ? 0x8fe7ff : 0x4d3d67, door1Open ? 0.28 : 0.1);
    this.door2Glow.setFillStyle(door2Open ? 0xffd98e : 0x4d3d67, door2Open ? 0.28 : 0.1);
    this.switch1Rect.setFillStyle(0x2e415c, this.switch1Latched ? 1 : 0.7);
    this.switch1Rect.setStrokeStyle(2, this.switch1Latched ? 0xbef3ff : 0x8ee1ff, 1);
    this.switch2Rect.setFillStyle(0x5a3d57, this.switch2Latched ? 1 : 0.7);
    this.switch2Rect.setStrokeStyle(2, this.switch2Latched ? 0xffe3ef : 0xffb8d7, 1);
  }

  private isSwitchPressed(switchRect: Phaser.GameObjects.Rectangle) {
    const bounds = switchRect.getBounds();
    const actors = [this.player, ...this.ghostRuns.map((run) => run.sprite)];
    return actors.some((actor) => this.isActorStandingOnSwitch(actor, bounds));
  }

  private isActorStandingOnSwitch(actor: Phaser.GameObjects.Image, switchBounds: Phaser.Geom.Rectangle) {
    const actorBounds = actor.getBounds();
    const feetBounds = new Phaser.Geom.Rectangle(
      actorBounds.x + 6,
      actorBounds.bottom - 14,
      Math.max(8, actorBounds.width - 12),
      18,
    );

    return Phaser.Geom.Intersects.RectangleToRectangle(feetBounds, switchBounds);
  }

  private setDoorState(
    door: Phaser.Physics.Arcade.Image,
    collider: Phaser.Physics.Arcade.Collider | undefined,
    open: boolean,
  ) {
    if (collider) {
      collider.active = !open;
    }

    const body = door.body as Phaser.Physics.Arcade.StaticBody | undefined;
    if (!body) return;

    body.enable = !open;
    if (!open) {
      body.updateFromGameObject();
    }
  }

  private commitLoop() {
    if (this.levelComplete || this.outOfLives || this.loopPhase >= 2) return;

    const completedFrames =
      this.recordedFrames.length > 0
        ? [...this.recordedFrames]
        : [
            {
              x: this.player.x,
              y: this.player.y,
              flipX: this.player.flipX,
            },
          ];

    const ghostSprite = this.add.image(START_X, START_Y, TEXTURE_KEYS.ghost).setAlpha(0.46).setDepth(4);
    this.ghostRuns.push({ frames: completedFrames, sprite: ghostSprite });
    this.loopPhase = (this.loopPhase + 1) as LoopPhase;
    this.cameras.main.flash(160, 180, 244, 255, false);
    this.resetAttempt(true);
    this.updateLoopTargets();
  }

  private resetAttempt(keepGhosts: boolean) {
    if (!keepGhosts) {
      this.ghostRuns.forEach((run) => run.sprite.destroy());
      this.ghostRuns = [];
      this.loopPhase = 0;
    }

    this.player.setPosition(START_X, START_Y);
    this.player.setVelocity(0, 0);
    this.loopStartTime = this.time.now;
    this.lastRecordAt = this.time.now;
    this.recordedFrames = [
      {
        x: START_X,
        y: START_Y,
        flipX: false,
      },
    ];
    this.switch1Latched = false;
    this.switch2Latched = false;
  }

  private updateLoopTargets() {
    if (this.loopPhase === 0) {
      this.anchor.setPosition(ANCHOR_1_X, ANCHOR_Y);
      this.anchorLabel.setPosition(ANCHOR_1_X, ANCHOR_Y - 54);
      this.anchor.setVisible(true);
      this.anchorLabel.setVisible(true);
      this.goal.setVisible(false);
      this.goalLabel.setVisible(false);
      this.statusText.setText("Loop 1: hit Switch 1, pass Door 1, and enter the Time Anchor.");
    } else if (this.loopPhase === 1) {
      this.anchor.setPosition(ANCHOR_2_X, ANCHOR_Y);
      this.anchorLabel.setPosition(ANCHOR_2_X, ANCHOR_Y - 54);
      this.anchor.setVisible(true);
      this.anchorLabel.setVisible(true);
      this.goal.setVisible(false);
      this.goalLabel.setVisible(false);
      this.statusText.setText("Loop 2: your ghost opens Door 1. Hit Switch 2 and reach the second anchor.");
    } else {
      this.anchor.setVisible(false);
      this.anchorLabel.setVisible(false);
      this.goal.setVisible(true);
      this.goalLabel.setVisible(true);
      this.statusText.setText("Final loop: follow your ghosts, then survive spikes, lava, and guards to reach the boss gate.");
    }

    (this.anchor.body as Phaser.Physics.Arcade.StaticBody | undefined)?.updateFromGameObject();
    (this.goal.body as Phaser.Physics.Arcade.StaticBody | undefined)?.updateFromGameObject();
  }

  private handleDeath(message: string) {
    if (this.levelComplete || this.outOfLives) return;
    if (this.time.now < this.damageCooldownUntil) return;

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

    this.resetAttempt(true);
    this.cameras.main.shake(100, 0.005);
    this.statusText.setText(`${message} Lives left: ${livesLeft}.`);
    this.time.delayedCall(1200, () => {
      if (!this.levelComplete && !this.outOfLives) {
        this.updateLoopTargets();
      }
    });
  }

  private completeLevel() {
    if (this.levelComplete || this.outOfLives) return;

    this.levelComplete = true;
    this.player.setVelocityX(0);
    this.statusText.setText("Time Loop complete! Press ENTER for the boss arena.");
    this.cameras.main.flash(180, 220, 255, 235, false);
  }

  private updateHud() {
    const ghostsReady = this.ghostRuns.length;
    this.livesText.setText(`Lives: ${this.livesRemaining}`);
    this.loopText.setText(`Loops: ${ghostsReady} | Doors: ${this.loopPhase < 2 ? "Anchor" : "Exit"}`);
    this.hudText.setText(`Character: ${this.selectedCharacter.name} | Ghosts: ${ghostsReady}`);
  }

  private startBossArena() {
    if (this.transitioningToBoss) return;

    this.transitioningToBoss = true;
    this.scene.start("level-10", {
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
    this.groundCollider?.destroy();
    this.platformCollider?.destroy();
    this.spikeOverlap?.destroy();
    this.lavaOverlap?.destroy();
    this.guardOverlap?.destroy();
    this.door1Collider?.destroy();
    this.door2Collider?.destroy();
    this.anchorOverlap?.destroy();
    this.goalOverlap?.destroy();

    this.ghostRuns.forEach((run) => run.sprite.destroy());
    this.ghostRuns = [];
    this.guardTweens.forEach((tween) => tween.remove());
    this.guardTweens = [];

    this.clearGroupSafe(this.ground);
    this.clearGroupSafe(this.platforms);
    this.clearGroupSafe(this.spikes);
    this.clearGroupSafe(this.lavaPools);
    this.clearGroupSafe(this.guards);
    this.player?.destroy();
    this.door1?.destroy();
    this.door2?.destroy();
    this.anchor?.destroy();
    this.goal?.destroy();
    this.switch1Rect?.destroy();
    this.switch2Rect?.destroy();
    this.anchorLabel?.destroy();
    this.goalLabel?.destroy();
    this.door1Glow?.destroy();
    this.door2Glow?.destroy();
  }
}
