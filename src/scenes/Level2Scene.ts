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

type Level2SceneData = {
  characterId?: CharacterId;
};

type MovingHazardConfig = {
  x: number;
  y: number;
  travel: number;
  duration: number;
};

type CheckpointConfig = {
  x: number;
  y: number;
  respawnX: number;
  respawnY: number;
  label: string;
};

type SecretPortalConfig = {
  triggerX: number;
  triggerY: number;
  destinationX: number;
  destinationY: number;
  checkpointIndex: number;
};

const MAX_DEATHS = DEFAULT_RUN_LIVES;
const HIT_INVULN_MS = 800;
const GRAVITY_Y = 980;
const BASE_MOVE_SPEED = 250;
const BASE_JUMP_VELOCITY = 445;
const PLAYER_PLATFORM_RESPAWN_OFFSET_Y = 46;
const CHECKPOINT_ACTIVE_TINT = 0xffd166;
const CHECKPOINT_INACTIVE_TINT = 0x89a0c1;
const SECRET_PORTAL_REVEAL_BACKWARD_MS = 30_000;
const SECRET_PORTAL_REVEAL_GRACE_MS = 650;
const LEFT_SCROLL_BUFFER = GAME_WIDTH / 2;
const LEFT_SCREEN_SCROLL_MARGIN = 72;

const LEVEL_WIDTH = 4960;
const LEVEL_HEIGHT = 760;
const GROUND_HEIGHT = 56;
const START_X = 88;
const START_Y = LEVEL_HEIGHT - GROUND_HEIGHT - 34;
const SECRET_PORTAL_START_ZONE_X = START_X + 36;
const GOAL_X = LEVEL_WIDTH - 96;
const GOAL_Y = 148;

const TEXTURE_KEYS = {
  platform: "level2-hard-platform",
  ground: "level2-hard-ground",
  spike: "level2-hard-spike",
  saw: "level2-hard-saw",
  checkpoint: "level2-hard-checkpoint",
  secretPortal: "level2-hard-secret-portal",
  goal: "level2-hard-goal",
  player: "level2-hard-player",
} as const;

const PLATFORM_LAYOUT = [
  { x: 220, y: 632 },
  { x: 410, y: 556 },
  { x: 590, y: 496 },
  { x: 760, y: 560 },
  { x: 940, y: 474 },
  { x: 1120, y: 412 },
  { x: 1290, y: 470 },
  { x: 1460, y: 388 },
  { x: 1630, y: 330 },
  { x: 1800, y: 272 },
  { x: 1980, y: 220 },
  { x: 2170, y: 298 },
  { x: 2350, y: 366 },
  { x: 2530, y: 292 },
  { x: 2715, y: 228 },
  { x: 2900, y: 314 },
  { x: 3085, y: 244 },
  { x: 3270, y: 186 },
  { x: 3455, y: 248 },
  { x: 3630, y: 184 },
  { x: 3810, y: 258 },
  { x: 3990, y: 322 },
  { x: 4170, y: 252 },
  { x: 4350, y: 194 },
  { x: 4530, y: 254 },
  { x: 4710, y: 186 },
] as const;

const FLOOR_SPIKE_SEGMENTS = [
  { start: 320, end: 560, step: 32 },
  { start: 900, end: 1140, step: 32 },
  { start: 1380, end: 1600, step: 32 },
  { start: 1880, end: 2120, step: 32 },
  { start: 2270, end: 2490, step: 32 },
  { start: 2760, end: 3000, step: 32 },
  { start: 3270, end: 3500, step: 32 },
  { start: 3760, end: 3920, step: 32 },
  { start: 4210, end: 4440, step: 32 },
  { start: 4590, end: 4810, step: 32 },
] as const;

const PLATFORM_SPIKE_PLACEMENTS = [
  { platformIndex: 2, offsetX: -32 },
  { platformIndex: 2, offsetX: 32 },
  { platformIndex: 4, offsetX: 0 },
  { platformIndex: 5, offsetX: -32 },
  { platformIndex: 5, offsetX: 32 },
  { platformIndex: 7, offsetX: 0 },
  { platformIndex: 8, offsetX: -32 },
  { platformIndex: 8, offsetX: 32 },
  { platformIndex: 10, offsetX: 0 },
  { platformIndex: 11, offsetX: -32 },
  { platformIndex: 11, offsetX: 32 },
  { platformIndex: 13, offsetX: 0 },
  { platformIndex: 14, offsetX: -32 },
  { platformIndex: 14, offsetX: 32 },
  { platformIndex: 15, offsetX: 0 },
  { platformIndex: 16, offsetX: -32 },
  { platformIndex: 16, offsetX: 32 },
  { platformIndex: 18, offsetX: 0 },
  { platformIndex: 20, offsetX: 0 },
  { platformIndex: 21, offsetX: -32 },
  { platformIndex: 21, offsetX: 32 },
  { platformIndex: 22, offsetX: 0 },
  { platformIndex: 23, offsetX: -32 },
  { platformIndex: 23, offsetX: 32 },
] as const;

const MOVING_HAZARDS: readonly MovingHazardConfig[] = [
  { x: 1110, y: 334, travel: 110, duration: 1800 },
  { x: 2500, y: 192, travel: 120, duration: 1550 },
  { x: 3500, y: 142, travel: 72, duration: 1300 },
  { x: 4060, y: 280, travel: 96, duration: 1450 },
  { x: 4460, y: 154, travel: 104, duration: 1350 },
] as const;

const CHECKPOINTS: readonly CheckpointConfig[] = [
  {
    x: PLATFORM_LAYOUT[1].x - 66,
    y: PLATFORM_LAYOUT[1].y - 12,
    respawnX: PLATFORM_LAYOUT[1].x - 66,
    respawnY: PLATFORM_LAYOUT[1].y - PLAYER_PLATFORM_RESPAWN_OFFSET_Y,
    label: "Checkpoint 1",
  },
  {
    x: PLATFORM_LAYOUT[9].x - 66,
    y: PLATFORM_LAYOUT[9].y - 12,
    respawnX: PLATFORM_LAYOUT[9].x - 66,
    respawnY: PLATFORM_LAYOUT[9].y - PLAYER_PLATFORM_RESPAWN_OFFSET_Y,
    label: "Checkpoint 2",
  },
  {
    x: PLATFORM_LAYOUT[17].x - 66,
    y: PLATFORM_LAYOUT[17].y - 12,
    respawnX: PLATFORM_LAYOUT[17].x - 66,
    respawnY: PLATFORM_LAYOUT[17].y - PLAYER_PLATFORM_RESPAWN_OFFSET_Y,
    label: "Checkpoint 3",
  },
  {
    x: PLATFORM_LAYOUT[24].x - 66,
    y: PLATFORM_LAYOUT[24].y - 12,
    respawnX: PLATFORM_LAYOUT[24].x - 66,
    respawnY: PLATFORM_LAYOUT[24].y - PLAYER_PLATFORM_RESPAWN_OFFSET_Y,
    label: "Checkpoint 4",
  },
] as const;

const SECRET_PORTAL: SecretPortalConfig = {
  triggerX: 28,
  triggerY: LEVEL_HEIGHT - GROUND_HEIGHT,
  destinationX: CHECKPOINTS[3].respawnX,
  destinationY: CHECKPOINTS[3].respawnY,
  checkpointIndex: 3,
} as const;

export class Level2Scene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  private movingHazards!: Phaser.Physics.Arcade.Group;
  private checkpoints!: Phaser.Physics.Arcade.StaticGroup;
  private secretPortal?: Phaser.Physics.Arcade.Image;
  private goal!: Phaser.Physics.Arcade.Image;

  private playerPlatformCollider?: Phaser.Physics.Arcade.Collider;
  private spikeOverlap?: Phaser.Physics.Arcade.Collider;
  private movingHazardOverlap?: Phaser.Physics.Arcade.Collider;
  private checkpointOverlap?: Phaser.Physics.Arcade.Collider;
  private secretPortalOverlap?: Phaser.Physics.Arcade.Collider;
  private goalOverlap?: Phaser.Physics.Arcade.Collider;
  private movingHazardTweens: Phaser.Tweens.Tween[] = [];
  private checkpointSprites: Phaser.Physics.Arcade.Image[] = [];

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private jumpKey?: Phaser.Input.Keyboard.Key;
  private upKey?: Phaser.Input.Keyboard.Key;
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private reviveKey?: Phaser.Input.Keyboard.Key;

  private hudText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  private livesRemaining = DEFAULT_RUN_LIVES;
  private outOfLives = false;
  private levelComplete = false;
  private levelStartTime = 0;
  private levelEndTime?: number;
  private damageCooldownUntil = 0;
  private activeCheckpointIndex = -1;
  private respawnX = START_X;
  private respawnY = START_Y;
  private leftSideWorldUnlocked = false;
  private secretPortalUsed = false;
  private secretPortalRevealed = false;
  private backwardWalkAtStartMs = 0;
  private secretPortalReadyAt = 0;

  constructor() {
    super("level-2");
  }

  create(data: Level2SceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.outOfLives = this.livesRemaining <= 0;
    this.levelComplete = false;
    this.levelEndTime = undefined;
    this.damageCooldownUntil = 0;
    this.movingHazardTweens = [];
    this.checkpointSprites = [];
    this.activeCheckpointIndex = -1;
    this.respawnX = START_X;
    this.respawnY = START_Y;
    this.leftSideWorldUnlocked = false;
    this.secretPortalUsed = false;
    this.secretPortalRevealed = false;
    this.backwardWalkAtStartMs = 0;
    this.secretPortalReadyAt = 0;

    this.physics.world.gravity.y = GRAVITY_Y;
    this.physics.world.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);

    this.cameras.main.setBackgroundColor(0x0e1b2f);
    this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createPlatforms();
    this.createSpikes();
    this.createMovingHazards();
    this.createCheckpoints();
    this.createSecretPortal();
    this.createGoal();
    this.createPlayer();
    this.createHud();
    this.bindInput();

    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setDeadzone(220, 120);

    this.levelStartTime = this.time.now;
    this.updateHud();

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
    if (!this.textures.exists(TEXTURE_KEYS.platform)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x4b607f, 1);
      g.fillRoundedRect(0, 0, 180, 24, 8);
      g.fillStyle(0x7f98be, 1);
      g.fillRect(12, 4, 156, 4);
      g.generateTexture(TEXTURE_KEYS.platform, 180, 24);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.ground)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x2e4e2f, 1);
      g.fillRect(0, 0, LEVEL_WIDTH, GROUND_HEIGHT);
      g.fillStyle(0x507b52, 1);
      g.fillRect(0, 0, LEVEL_WIDTH, 10);
      g.generateTexture(TEXTURE_KEYS.ground, LEVEL_WIDTH, GROUND_HEIGHT);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.spike)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xd0d8e3, 1);
      g.fillTriangle(2, 24, 16, 0, 30, 24);
      g.fillStyle(0x7f8fa3, 1);
      g.fillTriangle(8, 24, 16, 8, 24, 24);
      g.generateTexture(TEXTURE_KEYS.spike, 32, 24);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.saw)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xdbe6f7, 1);
      g.fillCircle(20, 20, 18);
      for (let index = 0; index < 8; index += 1) {
        const angle = Phaser.Math.DegToRad(index * 45);
        const innerX = 20 + Math.cos(angle) * 12;
        const innerY = 20 + Math.sin(angle) * 12;
        const outerX = 20 + Math.cos(angle) * 22;
        const outerY = 20 + Math.sin(angle) * 22;
        const leftAngle = angle - Phaser.Math.DegToRad(10);
        const rightAngle = angle + Phaser.Math.DegToRad(10);
        g.fillTriangle(
          innerX,
          innerY,
          20 + Math.cos(leftAngle) * 16,
          20 + Math.sin(leftAngle) * 16,
          outerX,
          outerY,
        );
        g.fillTriangle(
          innerX,
          innerY,
          outerX,
          outerY,
          20 + Math.cos(rightAngle) * 16,
          20 + Math.sin(rightAngle) * 16,
        );
      }
      g.fillStyle(0x7c8fab, 1);
      g.fillCircle(20, 20, 7);
      g.generateTexture(TEXTURE_KEYS.saw, 40, 40);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.checkpoint)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x6f5337, 1);
      g.fillRect(6, 0, 6, 60);
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(12, 10, 36, 18, 12, 28);
      g.fillStyle(0x24344d, 0.4);
      g.fillRoundedRect(2, 58, 14, 6, 2);
      g.generateTexture(TEXTURE_KEYS.checkpoint, 40, 64);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.secretPortal)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x6a7d7b, 0.18);
      g.fillEllipse(32, 32, 52, 40);
      g.lineStyle(3, 0xbaf5ec, 0.45);
      g.strokeEllipse(32, 32, 52, 40);
      g.lineStyle(2, 0xe8fffb, 0.35);
      g.beginPath();
      g.moveTo(17, 32);
      g.lineTo(47, 32);
      g.moveTo(32, 17);
      g.lineTo(32, 47);
      g.strokePath();
      g.generateTexture(TEXTURE_KEYS.secretPortal, 64, 64);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.goal)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xe7ecf7, 1);
      g.fillRect(0, 0, 8, 72);
      g.fillStyle(0x5aa8ff, 1);
      g.fillTriangle(8, 8, 40, 18, 8, 28);
      g.generateTexture(TEXTURE_KEYS.goal, 44, 72);
      g.destroy();
    }

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
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT / 2, LEVEL_WIDTH, LEVEL_HEIGHT, 0x0e1b2f);
    this.add.rectangle(LEVEL_WIDTH / 2, 120, LEVEL_WIDTH, 230, 0x1a2c4a, 0.72);
    this.add.rectangle(LEVEL_WIDTH / 2, 330, LEVEL_WIDTH, 330, 0x14233c, 0.78);
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT - GROUND_HEIGHT / 2, LEVEL_WIDTH, GROUND_HEIGHT, 0x2e4e2f);

    for (let x = 80; x < LEVEL_WIDTH; x += 220) {
      this.add.triangle(x, LEVEL_HEIGHT - GROUND_HEIGHT, 0, 0, 60, -120, 120, 0, 0x1d314d, 0.45).setOrigin(0.5, 1);
    }

    this.add
      .text(GAME_WIDTH / 2, 36, "Level 2: Hard Platform Run", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f4f7ff",
        stroke: "#0a1222",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);

    this.add
      .text(GAME_WIDTH / 2, 72, "Longer climb. Harder traps. Sometimes the wrong way is right.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#c6d9f9",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);
  }

  private createPlatforms() {
    this.platforms = this.physics.add.staticGroup();

    this.platforms.create(LEVEL_WIDTH / 2, LEVEL_HEIGHT - GROUND_HEIGHT / 2, TEXTURE_KEYS.ground);
    PLATFORM_LAYOUT.forEach((platform) => {
      this.platforms.create(platform.x, platform.y, TEXTURE_KEYS.platform);
    });
  }

  private createSpikes() {
    this.spikes = this.physics.add.staticGroup();
    const groundTop = LEVEL_HEIGHT - GROUND_HEIGHT;

    FLOOR_SPIKE_SEGMENTS.forEach((segment) => {
      for (let x = segment.start; x <= segment.end; x += segment.step) {
        const spike = this.spikes.create(x, groundTop, TEXTURE_KEYS.spike) as Phaser.Physics.Arcade.Image;
        spike.setOrigin(0.5, 1);
        spike.refreshBody();
      }
    });

    PLATFORM_SPIKE_PLACEMENTS.forEach((placement) => {
      const platform = PLATFORM_LAYOUT[placement.platformIndex];
      if (!platform) return;

      const spike = this.spikes.create(
        platform.x + placement.offsetX,
        platform.y - 12,
        TEXTURE_KEYS.spike,
      ) as Phaser.Physics.Arcade.Image;
      spike.setOrigin(0.5, 1);
      spike.refreshBody();
    });
  }

  private createMovingHazards() {
    this.movingHazards = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    MOVING_HAZARDS.forEach((config) => {
      const hazard = this.movingHazards.create(config.x, config.y, TEXTURE_KEYS.saw) as Phaser.Physics.Arcade.Image;
      hazard.setDepth(12);
      hazard.setImmovable(true);
      hazard.setCircle(18, 2, 2);

      const body = hazard.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.moves = false;

      this.movingHazardTweens.push(
        this.tweens.add({
          targets: hazard,
          x: { from: config.x - config.travel, to: config.x + config.travel },
          duration: config.duration,
          yoyo: true,
          repeat: -1,
          ease: "Sine.inOut",
          onUpdate: () => {
            body.updateFromGameObject();
          },
        }),
      );

      this.movingHazardTweens.push(
        this.tweens.add({
          targets: hazard,
          angle: 360,
          duration: 900,
          repeat: -1,
          ease: "Linear",
        }),
      );
    });
  }

  private createCheckpoints() {
    this.checkpoints = this.physics.add.staticGroup();
    this.checkpointSprites = CHECKPOINTS.map((config, index) => {
      const checkpoint = this.checkpoints.create(config.x, config.y, TEXTURE_KEYS.checkpoint) as Phaser.Physics.Arcade.Image;
      checkpoint.setOrigin(0.5, 1);
      checkpoint.setDepth(13);
      checkpoint.setTint(CHECKPOINT_INACTIVE_TINT);
      checkpoint.setData("checkpointIndex", index);
      checkpoint.refreshBody();
      return checkpoint;
    });
  }

  private createSecretPortal() {
    this.secretPortal = this.physics.add.staticImage(SECRET_PORTAL.triggerX, SECRET_PORTAL.triggerY, TEXTURE_KEYS.secretPortal);
    this.secretPortal.setOrigin(0.5, 1);
    this.secretPortal.setDepth(7);
    this.secretPortal.setVisible(false);
    this.secretPortal.setAlpha(0);
    this.secretPortal.refreshBody();
  }

  private createGoal() {
    this.goal = this.physics.add.staticImage(GOAL_X, GOAL_Y, TEXTURE_KEYS.goal);
    this.goal.setOrigin(0.5, 1);
    this.goal.refreshBody();
  }

  private createPlayer() {
    this.player = this.physics.add.image(START_X, START_Y, TEXTURE_KEYS.player);
    this.player.setTint(this.selectedCharacter.primaryColor);
    this.player.setCollideWorldBounds(true);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 34, true);

    this.playerPlatformCollider = this.physics.add.collider(this.player, this.platforms);
    this.spikeOverlap = this.physics.add.overlap(this.player, this.spikes, () => {
      this.handleHazard("Spike hit!");
    });
    this.movingHazardOverlap = this.physics.add.overlap(this.player, this.movingHazards, () => {
      this.handleHazard("Saw hit!");
    });
    this.checkpointOverlap = this.physics.add.overlap(this.player, this.checkpoints, (_player, checkpoint) => {
      this.activateCheckpoint(checkpoint as Phaser.Physics.Arcade.Image);
    });
    if (this.secretPortal) {
      this.secretPortalOverlap = this.physics.add.overlap(this.player, this.secretPortal, () => {
        this.activateSecretPortal();
      });
    }
    this.goalOverlap = this.physics.add.overlap(this.player, this.goal, () => {
      this.completeLevel();
    });
  }

  private createHud() {
    this.hudText = this.add
      .text(18, GAME_HEIGHT - 32, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f2f6ff",
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.healthText = this.add
      .text(18, 86, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#ffe0e0",
        stroke: "#20142d",
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.timerText = this.add
      .text(GAME_WIDTH - 18, GAME_HEIGHT - 32, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f2f6ff",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(20);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 64, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#fff5c7",
        stroke: "#0f1930",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);
  }

  private bindInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.cursors = keyboard.createCursorKeys();
    this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.upKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.jumpKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.reviveKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  private updateHud() {
    const progress = Phaser.Math.Clamp((this.player.x / GOAL_X) * 100, 0, 100);
    const checkpointLabel = this.activeCheckpointIndex >= 0 ? `CP ${this.activeCheckpointIndex + 1}` : "Start";

    this.healthText.setText(`Lives: ${this.livesRemaining}`);
    this.hudText.setText(
      `Character: ${this.selectedCharacter.name} | Progress: ${progress.toFixed(0)}% | Checkpoint: ${checkpointLabel}`,
    );

    const elapsedMs = (this.levelEndTime ?? this.time.now) - this.levelStartTime;
    this.timerText.setText(`Time: ${(elapsedMs / 1000).toFixed(1)}s`);
  }

  update(_time: number, delta: number) {
    if (this.levelComplete) {
      if (this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
        this.scene.start("level-3", { characterId: this.selectedCharacter.id });
      }
      this.updateHud();
      return;
    }

    if (this.outOfLives) {
      if (this.reviveKey && Phaser.Input.Keyboard.JustDown(this.reviveKey) && useReviveGem(this)) {
        this.scene.restart({ characterId: this.selectedCharacter.id });
        return;
      }
      if (this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
        this.scene.start("character-select");
      }
      this.updateHud();
      return;
    }

    this.updateMovement(delta);
    this.checkFallHazard();
    this.updateHud();
  }

  private updateMovement(delta: number) {
    const leftDown = (this.cursors?.left?.isDown ?? false) || (this.leftKey?.isDown ?? false);
    const rightDown = (this.cursors?.right?.isDown ?? false) || (this.rightKey?.isDown ?? false);

    const moveSpeed = Math.max(BASE_MOVE_SPEED, this.selectedCharacter.speed);
    let xVelocity = 0;
    if (leftDown) xVelocity -= moveSpeed;
    if (rightDown) xVelocity += moveSpeed;
    this.player.setVelocityX(xVelocity);
    this.updateLeftSideWorldVisibility(leftDown);
    this.updateLeftSideCameraScroll();
    this.updateSecretPortalProgress(leftDown, rightDown, delta);

    const jumpPressed =
      (this.jumpKey ? Phaser.Input.Keyboard.JustDown(this.jumpKey) : false) ||
      (this.upKey ? Phaser.Input.Keyboard.JustDown(this.upKey) : false) ||
      (this.cursors?.up ? Phaser.Input.Keyboard.JustDown(this.cursors.up) : false);
    if (!jumpPressed) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (!body.blocked.down && !body.touching.down) return;

    const jumpBoost = (this.selectedCharacter.jumpDistance - 60) * 2;
    this.player.setVelocityY(-(BASE_JUMP_VELOCITY + jumpBoost));
  }

  private updateLeftSideWorldVisibility(leftDown: boolean) {
    if (this.leftSideWorldUnlocked || !leftDown) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (!body.blocked.left) return;

    this.leftSideWorldUnlocked = true;
    this.physics.world.setBounds(-LEFT_SCROLL_BUFFER, 0, LEVEL_WIDTH + LEFT_SCROLL_BUFFER, LEVEL_HEIGHT);
    this.cameras.main.setBounds(-LEFT_SCROLL_BUFFER, 0, LEVEL_WIDTH + LEFT_SCROLL_BUFFER, LEVEL_HEIGHT);
  }

  private updateLeftSideCameraScroll() {
    if (!this.leftSideWorldUnlocked) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (body.velocity.x >= 0) return;

    const camera = this.cameras.main;
    const playerScreenX = this.player.x - camera.scrollX;
    if (playerScreenX > LEFT_SCREEN_SCROLL_MARGIN) return;

    const targetScrollX = Phaser.Math.Clamp(this.player.x - LEFT_SCREEN_SCROLL_MARGIN, -LEFT_SCROLL_BUFFER, camera.scrollX);
    if (targetScrollX < camera.scrollX) {
      camera.setScroll(targetScrollX, camera.scrollY);
    }
  }

  private updateSecretPortalProgress(leftDown: boolean, rightDown: boolean, delta: number) {
    if (this.secretPortalRevealed || this.secretPortalUsed) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const grounded = body.blocked.down || body.touching.down;
    const inStartZone = this.player.x <= SECRET_PORTAL_START_ZONE_X;

    if (!grounded || !inStartZone || !leftDown || rightDown) return;

    this.backwardWalkAtStartMs = Math.min(
      SECRET_PORTAL_REVEAL_BACKWARD_MS,
      this.backwardWalkAtStartMs + delta,
    );

    if (this.backwardWalkAtStartMs >= SECRET_PORTAL_REVEAL_BACKWARD_MS) {
      this.revealSecretPortal();
    }
  }

  private checkFallHazard() {
    if (this.player.y <= LEVEL_HEIGHT + 60) return;
    this.handleHazard("You fell!");
  }

  private handleHazard(message: string) {
    if (this.levelComplete || this.outOfLives) return;
    if (this.time.now < this.damageCooldownUntil) return;
    this.damageCooldownUntil = this.time.now + HIT_INVULN_MS;

    const livesLeft = loseRunLife(this);
    this.livesRemaining = livesLeft;

    if (livesLeft <= 0) {
      this.outOfLives = true;
      this.levelEndTime = this.time.now;
      this.player.setVelocity(0, 0);
      const gems = getGemCount(this);
      this.statusText.setText(
        gems >= REVIVE_GEM_COST
          ? `Out of lives. Press R to spend 1 gem (${gems} left) and restart, or ENTER to leave.`
          : `You can't play anymore. ${MAX_DEATHS} lives used. Press ENTER.`,
      );
      return;
    }

    this.respawnPlayer();
    this.statusText.setText(`${message} Lives left: ${livesLeft}.`);
    this.time.delayedCall(1000, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });
  }

  private activateCheckpoint(checkpoint: Phaser.Physics.Arcade.Image) {
    if (this.levelComplete || this.outOfLives) return;

    const checkpointIndex = checkpoint.getData("checkpointIndex") as number | undefined;
    if (checkpointIndex === undefined) return;

    this.unlockCheckpoint(checkpointIndex);
  }

  private unlockCheckpoint(checkpointIndex: number, customMessage?: string) {
    if (checkpointIndex <= this.activeCheckpointIndex) return;
    const config = CHECKPOINTS[checkpointIndex];
    if (!config) return;

    this.activeCheckpointIndex = checkpointIndex;
    this.respawnX = config.respawnX;
    this.respawnY = config.respawnY;
    this.updateCheckpointVisuals();
    this.statusText.setText(customMessage ?? `${config.label} reached!`);
    this.time.delayedCall(900, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });
  }

  private activateSecretPortal() {
    if (this.levelComplete || this.outOfLives || this.secretPortalUsed || !this.secretPortalRevealed) return;
    if (this.time.now < this.secretPortalReadyAt) return;
    if (this.player.x > START_X) return;

    this.secretPortalUsed = true;
    this.player.setPosition(SECRET_PORTAL.destinationX, SECRET_PORTAL.destinationY);
    this.player.setVelocity(0, 0);
    this.unlockCheckpoint(SECRET_PORTAL.checkpointIndex, "Secret path found! Teleporting near the end.");
    this.cameras.main.flash(180, 180, 255, 245);
    this.cameras.main.shake(120, 0.006);

    if (this.secretPortal) {
      this.secretPortal.setAlpha(0.42);
      this.secretPortal.setTint(CHECKPOINT_ACTIVE_TINT);
    }
  }

  private revealSecretPortal() {
    if (this.secretPortalRevealed) return;

    this.secretPortalRevealed = true;
    this.secretPortalReadyAt = this.time.now + SECRET_PORTAL_REVEAL_GRACE_MS;

    if (this.secretPortal) {
      this.secretPortal.setVisible(true);
      this.secretPortal.setAlpha(0.42);
    }

    this.statusText.setText("Something hidden appears behind you...");
    this.time.delayedCall(1200, () => {
      if (!this.levelComplete && !this.outOfLives && !this.secretPortalUsed) this.statusText.setText("");
    });
  }

  private updateCheckpointVisuals() {
    this.checkpointSprites.forEach((checkpoint, index) => {
      checkpoint.setTint(index <= this.activeCheckpointIndex ? CHECKPOINT_ACTIVE_TINT : CHECKPOINT_INACTIVE_TINT);
    });
  }

  private respawnPlayer() {
    this.player.setPosition(this.respawnX, this.respawnY);
    this.player.setVelocity(0, 0);
    this.cameras.main.shake(100, 0.004);
  }

  private completeLevel() {
    if (this.levelComplete || this.outOfLives) return;
    this.levelComplete = true;
    this.levelEndTime = this.time.now;
    this.player.setVelocity(0, 0);
    this.statusText.setText("Level 2 complete! Press ENTER to continue.");
  }

  private clearGroupSafe(group?: Phaser.Physics.Arcade.Group | Phaser.Physics.Arcade.StaticGroup) {
    if (!group) return;

    const maybeGroup = group as (Phaser.Physics.Arcade.Group | Phaser.Physics.Arcade.StaticGroup) & {
      children?: { size?: number };
    };
    if (!maybeGroup.children) return;

    group.clear(true, true);
  }

  private cleanupScene() {
    if (this.playerPlatformCollider) {
      this.playerPlatformCollider.destroy();
      this.playerPlatformCollider = undefined;
    }
    if (this.spikeOverlap) {
      this.spikeOverlap.destroy();
      this.spikeOverlap = undefined;
    }
    if (this.movingHazardOverlap) {
      this.movingHazardOverlap.destroy();
      this.movingHazardOverlap = undefined;
    }
    if (this.checkpointOverlap) {
      this.checkpointOverlap.destroy();
      this.checkpointOverlap = undefined;
    }
    if (this.secretPortalOverlap) {
      this.secretPortalOverlap.destroy();
      this.secretPortalOverlap = undefined;
    }
    if (this.goalOverlap) {
      this.goalOverlap.destroy();
      this.goalOverlap = undefined;
    }

    this.movingHazardTweens.forEach((tween) => tween.remove());
    this.movingHazardTweens = [];

    this.clearGroupSafe(this.platforms);
    this.clearGroupSafe(this.spikes);
    this.clearGroupSafe(this.movingHazards);
    this.clearGroupSafe(this.checkpoints);
    this.secretPortal?.destroy();
    this.secretPortal = undefined;
  }
}
