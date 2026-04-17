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

type NoiseStealthSceneData = {
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

type QuietZoneConfig = {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
};

type GuardConfig = {
  x: number;
  y: number;
  minX: number;
  maxX: number;
  duration: number;
  hearingRadius: number;
};

type GuardState = {
  sprite: Phaser.Physics.Arcade.Image;
  hearingRing: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Arc;
  tween: Phaser.Tweens.Tween;
  radius: number;
};

const LEVEL_WIDTH = 3000;
const LEVEL_HEIGHT = 760;
const GROUND_HEIGHT = 56;
const START_X = 120;
const START_Y = LEVEL_HEIGHT - GROUND_HEIGHT - 34;
const GOAL_X = LEVEL_WIDTH - 140;
const GOAL_Y = 228;
const PLAYER_SPEED = 235;
const PLAYER_JUMP_VELOCITY = 458;
const GRAVITY_Y = 980;
const HIT_INVULN_MS = 900;
const MAX_DEATHS = DEFAULT_RUN_LIVES;

const MAX_NOISE = 100;
const HEARING_THRESHOLD = 34;
const MOVE_NOISE_PER_SECOND = 18;
const AIR_NOISE_PER_SECOND = 12;
const IDLE_NOISE_DECAY_PER_SECOND = 22;
const QUIET_ZONE_NOISE_MULTIPLIER = 0.22;
const QUIET_ZONE_DECAY_BONUS = 20;
const JUMP_NOISE = 18;
const LANDING_NOISE = 12;

const PLATFORM_LAYOUT: readonly PlatformConfig[] = [
  { x: 330, y: 700, width: 300, height: 22 },
  { x: 620, y: 648, width: 220, height: 20 },
  { x: 880, y: 598, width: 210, height: 20 },
  { x: 1140, y: 546, width: 220, height: 20 },
  { x: 1400, y: 590, width: 210, height: 20 },
  { x: 1660, y: 534, width: 220, height: 20 },
  { x: 1920, y: 478, width: 210, height: 20 },
  { x: 2175, y: 420, width: 220, height: 20 },
  { x: 2410, y: 364, width: 220, height: 20 },
  { x: 2640, y: 300, width: 230, height: 20 },
] as const;

const QUIET_ZONES: readonly QuietZoneConfig[] = [
  { x: 252, y: 680, width: 150, height: 18, label: "Quiet mat" },
  { x: 620, y: 628, width: 128, height: 16 },
  { x: 880, y: 578, width: 124, height: 16 },
  { x: 1140, y: 526, width: 128, height: 16 },
  { x: 1400, y: 570, width: 124, height: 16 },
  { x: 1660, y: 514, width: 128, height: 16 },
  { x: 1920, y: 458, width: 124, height: 16 },
  { x: 2175, y: 400, width: 128, height: 16 },
  { x: 2410, y: 344, width: 128, height: 16 },
  { x: 2640, y: 280, width: 132, height: 16 },
] as const;

const GUARD_LAYOUT: readonly GuardConfig[] = [
  { x: 500, y: 660, minX: 410, maxX: 590, duration: 1800, hearingRadius: 170 },
  { x: 835, y: 558, minX: 760, maxX: 910, duration: 1650, hearingRadius: 162 },
  { x: 1235, y: 506, minX: 1070, maxX: 1300, duration: 1760, hearingRadius: 176 },
  { x: 1485, y: 550, minX: 1340, maxX: 1540, duration: 1700, hearingRadius: 166 },
  { x: 1745, y: 494, minX: 1600, maxX: 1815, duration: 1725, hearingRadius: 174 },
  { x: 2000, y: 438, minX: 1860, maxX: 2060, duration: 1680, hearingRadius: 176 },
  { x: 2260, y: 380, minX: 2130, maxX: 2328, duration: 1600, hearingRadius: 182 },
  { x: 2500, y: 316, minX: 2380, maxX: 2570, duration: 1550, hearingRadius: 188 },
] as const;

const TEXTURE_KEYS = {
  player: "noise-stealth-player",
  ground: "noise-stealth-ground",
  platform: "noise-stealth-platform",
  goal: "noise-stealth-goal",
  guard: "noise-stealth-guard",
} as const;

export class NoiseStealthScene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private ground!: Phaser.Physics.Arcade.StaticGroup;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private guardGroup!: Phaser.Physics.Arcade.Group;
  private goal!: Phaser.Physics.Arcade.Image;
  private quietZones: Phaser.GameObjects.Rectangle[] = [];
  private quietZoneLabels: Phaser.GameObjects.Text[] = [];
  private guards: GuardState[] = [];

  private groundCollider?: Phaser.Physics.Arcade.Collider;
  private platformCollider?: Phaser.Physics.Arcade.Collider;
  private goalOverlap?: Phaser.Physics.Arcade.Collider;
  private guardTouchOverlap?: Phaser.Physics.Arcade.Collider;

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
  private noiseText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  private livesRemaining = DEFAULT_RUN_LIVES;
  private outOfLives = false;
  private levelComplete = false;
  private transitioningToNextLevel = false;
  private damageCooldownUntil = 0;
  private noiseLevel = 0;
  private inQuietZone = false;
  private lastGrounded = false;

  private upgrade: UpgradeOption = "triple-damage";
  private damageBonus = 1;
  private cloneCount = 0;

  constructor() {
    super("noise-stealth");
  }

  create(data: NoiseStealthSceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.outOfLives = this.livesRemaining <= 0;
    this.levelComplete = false;
    this.transitioningToNextLevel = false;
    this.damageCooldownUntil = 0;
    this.noiseLevel = 0;
    this.inQuietZone = false;
    this.lastGrounded = false;
    this.quietZones = [];
    this.quietZoneLabels = [];
    this.guards = [];
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

    this.cameras.main.setBackgroundColor(0x05070b);
    this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createWorld();
    this.createGoal();
    this.createPlayer();
    this.createGuards();
    this.createHud();
    this.bindInput();
    this.updateHud();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(220, 120);

    this.statusText.setText("Stay quiet. Moving and jumping raise noise. Guards hear loud footsteps, but quiet mats dampen sound.");
    this.time.delayedCall(3400, () => {
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

    if (!this.textures.exists(TEXTURE_KEYS.ground)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x20242d, 1);
      g.fillRoundedRect(0, 0, 160, 56, 7);
      g.fillStyle(0x49505d, 0.9);
      g.fillRect(0, 0, 160, 10);
      g.fillStyle(0x11151a, 1);
      g.fillRect(0, 42, 160, 14);
      g.generateTexture(TEXTURE_KEYS.ground, 160, 56);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.platform)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x313845, 1);
      g.fillRoundedRect(0, 0, 160, 24, 7);
      g.fillStyle(0x6f7e96, 0.8);
      g.fillRect(8, 4, 144, 4);
      g.fillStyle(0x151a21, 1);
      g.fillRect(0, 16, 160, 8);
      g.generateTexture(TEXTURE_KEYS.platform, 160, 24);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.guard)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x28171b, 1);
      g.fillRoundedRect(6, 6, 28, 36, 8);
      g.fillStyle(0xd65d69, 1);
      g.fillRoundedRect(10, 10, 20, 28, 6);
      g.fillStyle(0xffd7a6, 1);
      g.fillCircle(20, 11, 7);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(16, 10, 2);
      g.fillCircle(24, 10, 2);
      g.generateTexture(TEXTURE_KEYS.guard, 40, 48);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.goal)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x0f2433, 1);
      g.fillRoundedRect(0, 0, 72, 96, 12);
      g.fillStyle(0x7ef8b9, 0.92);
      g.fillRoundedRect(14, 12, 44, 72, 10);
      g.lineStyle(3, 0xffffff, 0.88);
      g.strokeRoundedRect(16, 14, 40, 68, 10);
      g.generateTexture(TEXTURE_KEYS.goal, 72, 96);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT / 2, LEVEL_WIDTH, LEVEL_HEIGHT, 0x05070b);
    this.add.rectangle(LEVEL_WIDTH / 2, 138, LEVEL_WIDTH, 220, 0x0a1018, 0.92);
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT - 130, LEVEL_WIDTH, 260, 0x0e131a, 0.96);

    for (let x = 120; x < LEVEL_WIDTH; x += 220) {
      this.add.rectangle(x, LEVEL_HEIGHT - 120, 12, 220, 0x1a2028, 0.42);
      this.add.rectangle(x + 40, 120, 8, 180, 0x1b222b, 0.32);
      this.add.rectangle(x + 88, 180, 40, 6, 0x3b4757, 0.3);
    }

    for (let x = 200; x < LEVEL_WIDTH; x += 340) {
      this.add.circle(x, 92, 16, 0x7cf6ff, 0.08);
      this.add.circle(x, 92, 32, 0x7cf6ff, 0.03);
    }

    this.add
      .text(GAME_WIDTH / 2, 36, "Noise Stealth Zone", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f5fbff",
        stroke: "#03111a",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.add
      .text(GAME_WIDTH / 2, 72, "Stay quiet, slip past the patrols, and reach the time gate.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#c9d9ea",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
  }

  private createWorld() {
    this.ground = this.physics.add.staticGroup();
    const ground = this.ground.create(LEVEL_WIDTH / 2, LEVEL_HEIGHT - GROUND_HEIGHT / 2, TEXTURE_KEYS.ground) as Phaser.Physics.Arcade.Image;
    ground.setDisplaySize(LEVEL_WIDTH, GROUND_HEIGHT);
    ground.refreshBody();

    this.platforms = this.physics.add.staticGroup();
    PLATFORM_LAYOUT.forEach((config) => {
      const platform = this.platforms.create(config.x, config.y, TEXTURE_KEYS.platform) as Phaser.Physics.Arcade.Image;
      platform.setDisplaySize(config.width, config.height);
      platform.refreshBody();
    });

    QUIET_ZONES.forEach((config) => {
      const quietZone = this.add.rectangle(config.x, config.y, config.width, config.height, 0x69efff, 0.26);
      quietZone.setStrokeStyle(2, 0xc3fdff, 0.7);
      quietZone.setDepth(3);
      this.quietZones.push(quietZone);

      if (config.label) {
        const label = this.add
          .text(config.x, config.y - 24, config.label, {
            fontFamily: "system-ui, sans-serif",
            fontSize: "14px",
            color: "#d7fbff",
            stroke: "#03111a",
            strokeThickness: 4,
          })
          .setOrigin(0.5)
          .setDepth(4);
        this.quietZoneLabels.push(label);
      }
    });

    this.add.rectangle(GOAL_X, GOAL_Y + 58, 160, 14, 0x233140, 0.9).setDepth(2);
  }

  private createGoal() {
    this.goal = this.physics.add.staticImage(GOAL_X, GOAL_Y, TEXTURE_KEYS.goal);
    this.goal.setDepth(8);
    this.goal.refreshBody();

    this.add
      .text(GOAL_X, GOAL_Y - 82, "Time Gate", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#fff1c3",
        stroke: "#04111b",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
  }

  private createGuards() {
    this.guardGroup = this.physics.add.group({ allowGravity: false, immovable: true });

    GUARD_LAYOUT.forEach((config, index) => {
      const guard = this.guardGroup.create(config.x, config.y, TEXTURE_KEYS.guard) as Phaser.Physics.Arcade.Image;
      guard.setDepth(9);
      guard.setTint(index % 2 === 0 ? 0xd86770 : 0xee8f6e);
      guard.setImmovable(true);
      const guardBody = guard.body as Phaser.Physics.Arcade.Body | null;
      if (guardBody) {
        guardBody.allowGravity = false;
        guardBody.immovable = true;
      }

      const glow = this.add.circle(config.x, config.y, config.hearingRadius + 18, 0xff7d8f, 0.05);
      glow.setDepth(2);
      const hearingRing = this.add.circle(config.x, config.y, config.hearingRadius, 0xff7d8f, 0.08);
      hearingRing.setStrokeStyle(2, 0xffb1bc, 0.22);
      hearingRing.setDepth(3);

      const tween = this.tweens.add({
        targets: guard,
        x: config.maxX,
        duration: config.duration,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        onYoyo: () => guard.setFlipX(true),
        onRepeat: () => guard.setFlipX(false),
      });

      this.guards.push({
        sprite: guard,
        hearingRing,
        glow,
        tween,
        radius: config.hearingRadius,
      });
    });

    this.guardTouchOverlap = this.physics.add.overlap(this.player, this.guardGroup, () => {
      this.handleDeath("A patrol caught you.");
    });
  }

  private createPlayer() {
    this.player = this.physics.add.image(START_X, START_Y, TEXTURE_KEYS.player);
    this.player.setTint(this.selectedCharacter.primaryColor);
    this.player.setDepth(10);
    this.player.setCollideWorldBounds(true);
    this.player.setDragX(1400);
    this.player.setMaxVelocity(360, 780);

    this.groundCollider = this.physics.add.collider(this.player, this.ground);
    this.platformCollider = this.physics.add.collider(this.player, this.platforms);
    this.goalOverlap = this.physics.add.overlap(this.player, this.goal, () => {
      this.completeLevel();
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

    this.noiseText = this.add
      .text(GAME_WIDTH / 2, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#9ce8f8",
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
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.reviveKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  update(_: number, delta: number) {
    if (this.levelComplete) {
      if (this.confirmKey && (Phaser.Input.Keyboard.JustDown(this.confirmKey) || this.confirmKey.isDown)) {
        this.startNextLevel();
      }
      this.player.setVelocityX(0);
      this.updateGuardVisuals();
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
      this.updateGuardVisuals();
      this.updateHud();
      return;
    }

    const deltaSeconds = delta / 1000;
    this.updateMovement();
    this.updateNoise(deltaSeconds);
    this.updateGuardVisuals();
    this.checkGuardDetection();

    if (this.player.y > LEVEL_HEIGHT + 100) {
      this.handleDeath("You dropped into the security pit.");
      return;
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
    this.noiseLevel = Phaser.Math.Clamp(this.noiseLevel + JUMP_NOISE * (this.inQuietZone ? QUIET_ZONE_NOISE_MULTIPLIER : 1), 0, MAX_NOISE);
  }

  private updateNoise(deltaSeconds: number) {
    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body) return;

    const grounded = body.blocked.down || body.touching.down;
    const movingHorizontally = Math.abs(body.velocity.x) > 8;
    this.inQuietZone = this.isPlayerInQuietZone();

    if (movingHorizontally) {
      const baseGain = grounded ? MOVE_NOISE_PER_SECOND : AIR_NOISE_PER_SECOND;
      const gain = baseGain * (this.inQuietZone ? QUIET_ZONE_NOISE_MULTIPLIER : 1);
      this.noiseLevel += gain * deltaSeconds;
    } else {
      const decay = IDLE_NOISE_DECAY_PER_SECOND + (this.inQuietZone ? QUIET_ZONE_DECAY_BONUS : 0);
      this.noiseLevel -= decay * deltaSeconds;
    }

    if (grounded && !this.lastGrounded && Math.abs(body.velocity.y) > 120) {
      this.noiseLevel += LANDING_NOISE * (this.inQuietZone ? QUIET_ZONE_NOISE_MULTIPLIER : 1);
    }

    if (!movingHorizontally && grounded) {
      this.noiseLevel -= 4 * deltaSeconds;
    }

    this.lastGrounded = grounded;
    this.noiseLevel = Phaser.Math.Clamp(this.noiseLevel, 0, MAX_NOISE);
  }

  private isPlayerInQuietZone() {
    const playerBounds = this.player.getBounds();
    const footX = playerBounds.centerX;
    const footY = playerBounds.bottom - 2;

    return this.quietZones.some((quietZone) => {
      const bounds = quietZone.getBounds();
      return Phaser.Geom.Rectangle.Contains(bounds, footX, footY);
    });
  }

  private updateGuardVisuals() {
    this.guards.forEach((guardState) => {
      if (!guardState.sprite.active) return;
      guardState.hearingRing.setPosition(guardState.sprite.x, guardState.sprite.y);
      guardState.glow.setPosition(guardState.sprite.x, guardState.sprite.y);
    });
  }

  private checkGuardDetection() {
    if (this.time.now < this.damageCooldownUntil) return;

    for (const guardState of this.guards) {
      if (!guardState.sprite.active) continue;

      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, guardState.sprite.x, guardState.sprite.y);
      if (distance > guardState.radius) continue;
      if (this.noiseLevel < HEARING_THRESHOLD) continue;

      this.handleDeath("You made too much noise near a guard.");
      return;
    }
  }

  private handleDeath(message: string) {
    if (this.levelComplete || this.outOfLives) return;
    if (this.time.now < this.damageCooldownUntil) return;

    this.damageCooldownUntil = this.time.now + HIT_INVULN_MS;
    const livesLeft = loseRunLife(this);
    this.livesRemaining = livesLeft;
    this.player.setVelocity(0, 0);
    this.noiseLevel = 0;
    this.inQuietZone = false;
    this.cameras.main.shake(110, 0.006);

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

    this.player.setPosition(START_X, START_Y);
    this.player.setVelocity(0, 0);
    this.statusText.setText(`${message} Lives left: ${livesLeft}.`);
    this.time.delayedCall(1100, () => {
      if (!this.levelComplete && !this.outOfLives) {
        this.statusText.setText("");
      }
    });
  }

  private completeLevel() {
    if (this.levelComplete || this.outOfLives) return;

    this.levelComplete = true;
    this.player.setVelocityX(0);
    this.statusText.setText("Noise Stealth complete! Press ENTER for the collapsing escape.");
    this.cameras.main.flash(180, 220, 255, 235, false);
  }

  private updateHud() {
    this.livesText.setText(`Lives: ${this.livesRemaining}`);
    this.noiseText
      .setText(`Noise: ${Math.round(this.noiseLevel)}/${MAX_NOISE}`)
      .setColor(this.noiseLevel >= HEARING_THRESHOLD ? "#ff9aa7" : this.inQuietZone ? "#8ffff8" : "#a9e7ff");
    this.hudText.setText(
      `Character: ${this.selectedCharacter.name} | ${this.inQuietZone ? "Quiet mat" : "Stay low noise"}`,
    );
  }

  private restartLevel() {
    this.scene.restart({
      characterId: this.selectedCharacter.id,
      upgrade: this.upgrade,
      damageBonus: this.damageBonus,
      cloneCount: this.cloneCount,
    });
  }

  private startNextLevel() {
    if (this.transitioningToNextLevel) return;

    this.transitioningToNextLevel = true;
    this.scene.start("collapsing-escape", {
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
    this.goalOverlap?.destroy();
    this.guardTouchOverlap?.destroy();

    this.clearGroupSafe(this.ground);
    this.clearGroupSafe(this.platforms);
    this.clearGroupSafe(this.guardGroup);
    this.player?.destroy();
    this.goal?.destroy();
    this.quietZones.forEach((zone) => zone.destroy());
    this.quietZones = [];
    this.quietZoneLabels.forEach((label) => label.destroy());
    this.quietZoneLabels = [];
    this.guards.forEach((guardState) => {
      guardState.tween.stop();
      guardState.sprite.destroy();
      guardState.hearingRing.destroy();
      guardState.glow.destroy();
    });
    this.guards = [];
    this.livesText?.destroy();
    this.noiseText?.destroy();
    this.hudText?.destroy();
    this.statusText?.destroy();
  }
}
