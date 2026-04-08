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
type MazeMode = "light" | "shadow";

type LightShadowSceneData = {
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

type HazardConfig = {
  x: number;
  y: number;
  minX: number;
  maxX: number;
  speed: number;
  tint: number;
};

const LEVEL_WIDTH = 3200;
const LEVEL_HEIGHT = 760;
const GROUND_HEIGHT = 56;
const GROUND_Y = LEVEL_HEIGHT - GROUND_HEIGHT / 2;
const START_X = 96;
const START_Y = LEVEL_HEIGHT - GROUND_HEIGHT - 34;
const GOAL_X = LEVEL_WIDTH - 120;
const GOAL_Y = 154;
const GRAVITY_Y = 980;
const PLAYER_SPEED = 235;
const PLAYER_JUMP_VELOCITY = 460;
const HIT_INVULN_MS = 900;
const TOGGLE_COOLDOWN_MS = 300;
const MAX_DEATHS = DEFAULT_RUN_LIVES;
const PLATFORM_HEIGHT = 22;
const PLATFORM_MIN_WIDTH = 138;
const PLATFORM_MAX_WIDTH = 186;
const PLATFORM_MIN_GAP = 144;
const PLATFORM_MAX_GAP = 232;
const PLATFORM_MIN_RISE = 46;
const PLATFORM_MAX_RISE = 82;
const PLATFORM_TOP_Y = 172;
const PLATFORM_BOTTOM_Y = 612;
const PATH_END_BUFFER = 520;
const HAZARD_TINTS = [0xffc87e, 0x90e4ff, 0xff8ca2, 0xbcff92, 0xc0a0ff, 0xfff19c] as const;

const TEXTURE_KEYS = {
  player: "light-shadow-player",
  ground: "light-shadow-ground",
  lightPlatform: "light-shadow-light-platform",
  shadowPlatform: "light-shadow-shadow-platform",
  orb: "light-shadow-orb",
  goal: "light-shadow-goal",
} as const;

export class LightShadowScene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private ground!: Phaser.Physics.Arcade.StaticGroup;
  private lightPlatforms!: Phaser.Physics.Arcade.StaticGroup;
  private shadowPlatforms!: Phaser.Physics.Arcade.StaticGroup;
  private hazards!: Phaser.Physics.Arcade.Group;
  private goal!: Phaser.Physics.Arcade.Image;
  private lightPlatformLayout: PlatformConfig[] = [];
  private shadowPlatformLayout: PlatformConfig[] = [];
  private hazardLayout: HazardConfig[] = [];

  private groundCollider?: Phaser.Physics.Arcade.Collider;
  private lightPlatformCollider?: Phaser.Physics.Arcade.Collider;
  private shadowPlatformCollider?: Phaser.Physics.Arcade.Collider;
  private hazardGroundCollider?: Phaser.Physics.Arcade.Collider;
  private hazardOverlap?: Phaser.Physics.Arcade.Collider;
  private goalOverlap?: Phaser.Physics.Arcade.Collider;
  private lightPlatformDangerOverlap?: Phaser.Physics.Arcade.Collider;
  private shadowPlatformDangerOverlap?: Phaser.Physics.Arcade.Collider;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private upKey?: Phaser.Input.Keyboard.Key;
  private jumpKey?: Phaser.Input.Keyboard.Key;
  private aKey?: Phaser.Input.Keyboard.Key;
  private dKey?: Phaser.Input.Keyboard.Key;
  private wKey?: Phaser.Input.Keyboard.Key;
  private toggleKey?: Phaser.Input.Keyboard.Key;
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private reviveKey?: Phaser.Input.Keyboard.Key;

  private hudText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private modeGlow!: Phaser.GameObjects.Rectangle;

  private livesRemaining = DEFAULT_RUN_LIVES;
  private outOfLives = false;
  private levelComplete = false;
  private transitioningToBoss = false;
  private damageCooldownUntil = 0;
  private lastToggleAt = -TOGGLE_COOLDOWN_MS;
  private lightModeActive = true;

  private upgrade: UpgradeOption = "triple-damage";
  private damageBonus = 1;
  private cloneCount = 0;

  constructor() {
    super("light-shadow");
  }

  create(data: LightShadowSceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.outOfLives = this.livesRemaining <= 0;
    this.levelComplete = false;
    this.transitioningToBoss = false;
    this.damageCooldownUntil = 0;
    this.lastToggleAt = -TOGGLE_COOLDOWN_MS;
    this.lightModeActive = true;
    this.lightPlatformLayout = [];
    this.shadowPlatformLayout = [];
    this.hazardLayout = [];
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

    this.cameras.main.setBackgroundColor(0x090d19);
    this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.generateLayouts();
    this.createTextures();
    this.drawBackground();
    this.createPlatforms();
    this.createGoal();
    this.createPlayer();
    this.createHazards();
    this.createHud();
    this.bindInput();
    this.applyModeState();
    this.updateHud();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(220, 120);

    this.statusText.setText("Press L to switch modes. Wrong-color platforms are deadly. Reach the boss gate.");
    this.time.delayedCall(2600, () => {
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

  private generateLayouts() {
    const rng = new Phaser.Math.RandomDataGenerator([`${Date.now()}-${Math.random()}`]);
    this.lightPlatformLayout = this.generatePlatformPath(rng, "light");
    this.shadowPlatformLayout = this.generatePlatformPath(rng, "shadow");
    this.hazardLayout = this.generateHazardLayout();
  }

  private generatePlatformPath(rng: Phaser.Math.RandomDataGenerator, mode: MazeMode) {
    const layout: PlatformConfig[] = [];
    let x = mode === "light" ? 224 : 318;
    let y = mode === "light" ? 610 : 568;

    while (x < GOAL_X - PATH_END_BUFFER) {
      const width = rng.between(PLATFORM_MIN_WIDTH, PLATFORM_MAX_WIDTH);
      layout.push({ x, y, width, height: PLATFORM_HEIGHT });

      const nextGap = rng.between(PLATFORM_MIN_GAP, PLATFORM_MAX_GAP);
      const nextRise = rng.between(PLATFORM_MIN_RISE, PLATFORM_MAX_RISE);
      const modeOffsetX = mode === "shadow" ? rng.between(-22, 26) : rng.between(-8, 16);
      const modeOffsetY = mode === "shadow" ? rng.between(-16, 14) : rng.between(-10, 10);

      x += nextGap + modeOffsetX;
      y = Phaser.Math.Clamp(y - nextRise + modeOffsetY, PLATFORM_TOP_Y, PLATFORM_BOTTOM_Y);
    }

    if (mode === "light") {
      layout.push({ x: GOAL_X - 330, y: 248, width: 180, height: PLATFORM_HEIGHT });
      layout.push({ x: GOAL_X - 82, y: 170, width: 144, height: PLATFORM_HEIGHT });
    } else {
      layout.push({ x: GOAL_X - 222, y: 206, width: 154, height: PLATFORM_HEIGHT });
      layout.push({ x: GOAL_X - 38, y: 154, width: 126, height: PLATFORM_HEIGHT });
    }

    return layout;
  }

  private generateHazardLayout() {
    const pathPlatforms = [...this.lightPlatformLayout, ...this.shadowPlatformLayout]
      .filter((platform) => platform.y < GROUND_Y - 24)
      .sort((left, right) => left.x - right.x);

    return pathPlatforms
      .filter((_, index) => index % 2 === 1)
      .slice(0, 10)
      .map((platform, index) => ({
        x: platform.x,
        y: platform.y - 28,
        minX: platform.x - platform.width / 2 + 22,
        maxX: platform.x + platform.width / 2 - 22,
        speed: 102 + index * 8,
        tint: HAZARD_TINTS[index % HAZARD_TINTS.length],
      }));
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
      g.fillStyle(0x2b2d38, 1);
      g.fillRect(0, 0, 128, GROUND_HEIGHT);
      g.fillStyle(0x5d6378, 1);
      g.fillRect(0, 0, 128, 14);
      g.fillStyle(0x151722, 1);
      for (let x = 14; x < 128; x += 24) {
        g.fillRect(x, 20, 10, GROUND_HEIGHT - 22);
      }
      g.generateTexture(TEXTURE_KEYS.ground, 128, GROUND_HEIGHT);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.lightPlatform)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xdcc778, 1);
      g.fillRoundedRect(0, 0, 128, 22, 6);
      g.fillStyle(0x8d7231, 1);
      g.fillRect(0, 14, 128, 8);
      g.fillStyle(0xfff0b9, 0.8);
      g.fillRect(8, 4, 112, 4);
      g.generateTexture(TEXTURE_KEYS.lightPlatform, 128, 22);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.shadowPlatform)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x5c4c8e, 1);
      g.fillRoundedRect(0, 0, 128, 22, 6);
      g.fillStyle(0x2d2354, 1);
      g.fillRect(0, 14, 128, 8);
      g.fillStyle(0xbba7ff, 0.7);
      g.fillRect(8, 4, 112, 4);
      g.generateTexture(TEXTURE_KEYS.shadowPlatform, 128, 22);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.orb)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(16, 16, 16);
      g.fillStyle(0x121827, 1);
      g.fillCircle(11, 14, 4);
      g.fillCircle(21, 14, 4);
      g.fillStyle(0x3a485e, 1);
      g.fillRect(10, 22, 12, 4);
      g.generateTexture(TEXTURE_KEYS.orb, 32, 32);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.goal)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x132438, 1);
      g.fillCircle(32, 32, 30);
      g.lineStyle(5, 0xaee5ff, 1);
      g.strokeCircle(32, 32, 20);
      g.lineStyle(3, 0xffffff, 0.75);
      g.strokeCircle(32, 32, 10);
      g.generateTexture(TEXTURE_KEYS.goal, 64, 64);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT / 2, LEVEL_WIDTH, LEVEL_HEIGHT, 0x090d19);
    this.add.rectangle(LEVEL_WIDTH / 2, 140, LEVEL_WIDTH, 220, 0x1c1334, 0.42);
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT - 120, LEVEL_WIDTH, 220, 0x1c1f2e, 0.88);
    this.add.rectangle(LEVEL_WIDTH * 0.25, 180, LEVEL_WIDTH / 2, 260, 0xffdd7a, 0.05);
    this.add.rectangle(LEVEL_WIDTH * 0.75, 180, LEVEL_WIDTH / 2, 260, 0x8d75ff, 0.08);

    for (let x = 100; x < LEVEL_WIDTH; x += 180) {
      this.add.rectangle(x, LEVEL_HEIGHT / 2, 4, LEVEL_HEIGHT - 120, 0x2f3550, 0.2);
    }
    for (let y = 100; y < LEVEL_HEIGHT - 80; y += 96) {
      this.add.rectangle(LEVEL_WIDTH / 2, y, LEVEL_WIDTH - 120, 2, 0x2f3550, 0.18);
    }

    this.add
      .text(GAME_WIDTH / 2, 28, "Light / Shadow Maze", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f5fbff",
        stroke: "#050913",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.add
      .text(GAME_WIDTH / 2, 58, "Light and shadow reveal different paths.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#dce7f8",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const combinedPlatforms = [...this.lightPlatformLayout, ...this.shadowPlatformLayout];
    combinedPlatforms.forEach((platform, index) => {
      this.add.rectangle(
        platform.x,
        platform.y + 34,
        Math.max(18, Math.min(platform.width - 40, 34)),
        LEVEL_HEIGHT - platform.y - 34,
        index % 2 === 0 ? 0x2e3550 : 0x3f2c63,
        0.18,
      );
    });

    this.modeGlow = this.add
      .rectangle(GAME_WIDTH / 2, 102, 210, 38, 0xffe087, 0.18)
      .setScrollFactor(0)
      .setDepth(8);
  }

  private createPlatforms() {
    this.ground = this.physics.add.staticGroup();
    this.lightPlatforms = this.physics.add.staticGroup();
    this.shadowPlatforms = this.physics.add.staticGroup();

    const ground = this.ground.create(LEVEL_WIDTH / 2, GROUND_Y, TEXTURE_KEYS.ground) as Phaser.Physics.Arcade.Image;
    ground.setDisplaySize(LEVEL_WIDTH, GROUND_HEIGHT);
    ground.refreshBody();

    this.lightPlatformLayout.forEach((config) => {
      const platform = this.lightPlatforms.create(config.x, config.y, TEXTURE_KEYS.lightPlatform) as Phaser.Physics.Arcade.Image;
      platform.setDisplaySize(config.width, config.height);
      platform.refreshBody();
    });

    this.shadowPlatformLayout.forEach((config) => {
      const platform = this.shadowPlatforms.create(config.x, config.y, TEXTURE_KEYS.shadowPlatform) as Phaser.Physics.Arcade.Image;
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
        color: "#f4fbff",
        stroke: "#050913",
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

    this.groundCollider = this.physics.add.collider(this.player, this.ground);
    this.lightPlatformCollider = this.physics.add.collider(this.player, this.lightPlatforms);
    this.shadowPlatformCollider = this.physics.add.collider(this.player, this.shadowPlatforms);
    this.lightPlatformDangerOverlap = this.physics.add.overlap(this.player, this.lightPlatforms, () => {
      if (!this.lightModeActive) {
        this.handleWrongColorTouch("light");
      }
    });
    this.shadowPlatformDangerOverlap = this.physics.add.overlap(this.player, this.shadowPlatforms, () => {
      if (this.lightModeActive) {
        this.handleWrongColorTouch("shadow");
      }
    });
    this.goalOverlap = this.physics.add.overlap(this.player, this.goal, () => {
      this.completeLevel();
    });
  }

  private createHazards() {
    this.hazards = this.physics.add.group({
      allowGravity: true,
      collideWorldBounds: true,
      immovable: false,
    });

    this.hazardLayout.forEach((config, index) => {
      const hazard = this.hazards.create(config.x, config.y, TEXTURE_KEYS.orb) as Phaser.Physics.Arcade.Image;
      hazard.setTint(config.tint);
      hazard.setDragX(1200);
      hazard.setMaxVelocity(200, 540);
      hazard.setData("minX", config.minX);
      hazard.setData("maxX", config.maxX);
      hazard.setData("speed", config.speed);
      hazard.setData("direction", index % 2 === 0 ? 1 : -1);
    });

    this.hazardGroundCollider = this.physics.add.collider(this.hazards, this.ground);
    this.physics.add.collider(this.hazards, this.lightPlatforms);
    this.physics.add.collider(this.hazards, this.shadowPlatforms);
    this.hazardOverlap = this.physics.add.overlap(this.player, this.hazards, () => {
      this.handleHazardHit();
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

    this.modeText = this.add
      .text(GAME_WIDTH / 2, 88, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#fff0bb",
      })
      .setOrigin(0.5)
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
    keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.ENTER, Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.L]);
    this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.upKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.jumpKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.aKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.dKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.wKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.toggleKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.reviveKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  update() {
    if (this.levelComplete) {
      if (this.confirmKey && (Phaser.Input.Keyboard.JustDown(this.confirmKey) || this.confirmKey.isDown)) {
        this.startNextLevel();
      }
      this.player.setVelocityX(0);
      this.updateHazards();
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
      this.updateHazards();
      this.updateHud();
      return;
    }

    if (this.toggleKey && Phaser.Input.Keyboard.JustDown(this.toggleKey)) {
      this.toggleMode();
    }

    this.updateMovement();
    this.updateHazards();
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

  private updateHazards() {
    this.getGroupChildrenSafe(this.hazards).forEach((child) => {
      const hazard = child as Phaser.Physics.Arcade.Image;
      const body = hazard.body as Phaser.Physics.Arcade.Body | undefined;
      if (!body) return;

      const minX = (hazard.getData("minX") as number | undefined) ?? 0;
      const maxX = (hazard.getData("maxX") as number | undefined) ?? LEVEL_WIDTH;
      const speed = (hazard.getData("speed") as number | undefined) ?? 120;
      let direction = (hazard.getData("direction") as number | undefined) ?? 1;

      if (hazard.x <= minX) direction = 1;
      if (hazard.x >= maxX) direction = -1;
      hazard.setData("direction", direction);
      body.setVelocityX(direction * speed);
      hazard.angle += direction * 2.4;
    });
  }

  private updateHud() {
    this.livesText.setText(`Lives: ${this.livesRemaining}`);
    this.modeText.setText(this.lightModeActive ? "Mode: Light" : "Mode: Shadow");
    this.modeText.setColor(this.lightModeActive ? "#fff0bb" : "#d6c7ff");
    this.hudText.setText(`Character: ${this.selectedCharacter.name} | Toggle: L`);
  }

  private toggleMode() {
    if (this.time.now - this.lastToggleAt < TOGGLE_COOLDOWN_MS) return;

    this.lastToggleAt = this.time.now;
    this.lightModeActive = !this.lightModeActive;
    this.applyModeState();
    this.cameras.main.flash(80, this.lightModeActive ? 255 : 160, this.lightModeActive ? 236 : 196, this.lightModeActive ? 186 : 255, false);
    this.statusText.setText(this.lightModeActive ? "Light path revealed." : "Shadow path revealed.");
    this.time.delayedCall(850, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });
  }

  private applyModeState() {
    this.lightPlatformCollider!.active = this.lightModeActive;
    this.shadowPlatformCollider!.active = !this.lightModeActive;
    this.setGroupAlpha(this.lightPlatforms, this.lightModeActive ? 1 : 0.18);
    this.setGroupAlpha(this.shadowPlatforms, this.lightModeActive ? 0.18 : 1);
    this.modeGlow.setFillStyle(this.lightModeActive ? 0xffe087 : 0x8e77ff, 0.18);
  }

  private handleWrongColorTouch(mode: MazeMode) {
    const label = mode === "light" ? "light" : "shadow";
    this.handlePlayerDeath(`The ${label} path burned you.`, true);
  }

  private handleHazardHit() {
    this.handlePlayerDeath("The maze guardian hit you!");
  }

  private handlePlayerDeath(message: string, resetMode = false) {
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

    if (resetMode) {
      this.lightModeActive = true;
      this.lastToggleAt = -TOGGLE_COOLDOWN_MS;
      this.applyModeState();
    }

    this.player.setPosition(START_X, START_Y);
    this.player.setVelocity(0, 0);
    this.cameras.main.shake(110, 0.005);
    this.statusText.setText(`${message} Lives left: ${livesLeft}.`);
    this.time.delayedCall(1000, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });
  }

  private completeLevel() {
    if (this.levelComplete || this.outOfLives) return;

    this.levelComplete = true;
    this.player.setVelocityX(0);
    this.statusText.setText("Light / Shadow complete! Press ENTER for the Time Loop.");
    this.cameras.main.flash(180, 220, 255, 235, false);
  }

  private startNextLevel() {
    if (this.transitioningToBoss) return;

    this.transitioningToBoss = true;
    this.scene.start("time-loop", {
      characterId: this.selectedCharacter.id,
      upgrade: this.upgrade,
      damageBonus: this.damageBonus,
      cloneCount: this.cloneCount,
    });
  }

  private setGroupAlpha(group: Phaser.Physics.Arcade.StaticGroup, alpha: number) {
    this.getGroupChildrenSafe(group).forEach((child) => {
      const gameObject = child as Phaser.GameObjects.GameObject & { setAlpha?: (value: number) => Phaser.GameObjects.GameObject };
      gameObject.setAlpha?.(alpha);
    });
  }

  private getGroupChildrenSafe(
    group?: Phaser.Physics.Arcade.Group | Phaser.Physics.Arcade.StaticGroup,
  ) {
    if (!group) return [] as Phaser.GameObjects.GameObject[];

    const maybeGroup = group as (Phaser.Physics.Arcade.Group | Phaser.Physics.Arcade.StaticGroup) & {
      children?: { entries?: Phaser.GameObjects.GameObject[] };
    };
    return maybeGroup.children?.entries ?? [];
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
    this.lightPlatformCollider?.destroy();
    this.shadowPlatformCollider?.destroy();
    this.hazardGroundCollider?.destroy();
    this.hazardOverlap?.destroy();
    this.goalOverlap?.destroy();
    this.lightPlatformDangerOverlap?.destroy();
    this.shadowPlatformDangerOverlap?.destroy();

    this.clearGroupSafe(this.hazards);
    this.clearGroupSafe(this.lightPlatforms);
    this.clearGroupSafe(this.shadowPlatforms);
    this.clearGroupSafe(this.ground);
    this.goal?.destroy();
    this.player?.destroy();
  }
}
