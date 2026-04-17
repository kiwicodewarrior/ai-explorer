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
  REVIVE_GEM_COST,
  getGemCount,
  getRunLives,
  loseRunLife,
  rememberRunCharacter,
  useReviveGem,
} from "../systems/runState";

type UpgradeOption = "triple-damage" | "two-clones";

type MagneticFacilitySceneData = {
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

type MagnetConfig = {
  x: number;
  y: number;
  radius: number;
  impulse: number;
  label: string;
};

type MagnetVisual = {
  config: MagnetConfig;
  ring: Phaser.GameObjects.Arc;
  core: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
};

const LEVEL_WIDTH = 7600;
const LEVEL_HEIGHT = 760;
const PLAYER_START_X = 130;
const PLAYER_START_Y = 660;
const PLAYER_SPEED = 244;
const PLAYER_JUMP_VELOCITY = 458;
const GRAVITY_Y = 980;
const HIT_INVULN_MS = 900;
const MAGNET_COOLDOWN_MS = 260;
const MAGNET_PULL_MS = 220;
const MAX_DEATHS = DEFAULT_RUN_LIVES;
const GOAL_X = 7260;
const GOAL_Y = 138;

const PLATFORM_LAYOUT: readonly RectConfig[] = [
  { x: 220, y: 708, width: 420, height: 26 },
  { x: 960, y: 654, width: 280, height: 22 },
  { x: 1710, y: 596, width: 300, height: 22 },
  { x: 2510, y: 540, width: 300, height: 22 },
  { x: 3370, y: 482, width: 320, height: 22 },
  { x: 4270, y: 420, width: 320, height: 22 },
  { x: 5210, y: 358, width: 320, height: 22 },
  { x: 6170, y: 294, width: 340, height: 22 },
  { x: 7140, y: 228, width: 400, height: 24 },
] as const;

const SHOCK_LAYOUT = createShockLayout();
const LAVA_LAYOUT = createLavaLayout();
const MAGNET_LAYOUT = createMagnetLayout();

const TEXTURE_KEYS = {
  player: "magnetic-facility-player",
  terrain: "magnetic-facility-terrain",
  shock: "magnetic-facility-shock",
  lava: "magnetic-facility-lava",
  goal: "magnetic-facility-goal",
} as const;

function createShockLayout(): RectConfig[] {
  const segments: RectConfig[] = [];

  for (let x = 520; x < LEVEL_WIDTH - 160; x += 430) {
    segments.push({
      x,
      y: 744,
      width: 300,
      height: 20,
    });
  }

  return segments;
}

function createLavaLayout(): RectConfig[] {
  return PLATFORM_LAYOUT.flatMap((platform, index) => {
    if (index === 0 || index === PLATFORM_LAYOUT.length - 1) return [];

    const centerSafeWidth = platform.width >= 340 ? 140 : 120;
    const sideWidth = Math.max(54, Math.floor((platform.width - centerSafeWidth) / 2) - 16);
    const offset = centerSafeWidth / 2 + sideWidth / 2;
    const y = platform.y - platform.height / 2 - 3;

    return [
      { x: platform.x - offset, y, width: sideWidth, height: 14 },
      { x: platform.x + offset, y, width: sideWidth, height: 14 },
    ];
  });
}

function createMagnetLayout(): MagnetConfig[] {
  return PLATFORM_LAYOUT.slice(1).map((platform, index) => ({
    x: platform.x,
    y: platform.y - 136,
    radius: 700,
    impulse: 470 + index * 18,
    label: `M${index + 1}`,
  }));
}

export class MagneticFacilityScene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private terrain!: Phaser.Physics.Arcade.StaticGroup;
  private shocks!: Phaser.Physics.Arcade.StaticGroup;
  private lava!: Phaser.Physics.Arcade.StaticGroup;
  private goal!: Phaser.Physics.Arcade.Image;
  private magnets: MagnetVisual[] = [];

  private terrainCollider?: Phaser.Physics.Arcade.Collider;
  private shockOverlap?: Phaser.Physics.Arcade.Collider;
  private lavaOverlap?: Phaser.Physics.Arcade.Collider;
  private goalOverlap?: Phaser.Physics.Arcade.Collider;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private upKey?: Phaser.Input.Keyboard.Key;
  private jumpKey?: Phaser.Input.Keyboard.Key;
  private aKey?: Phaser.Input.Keyboard.Key;
  private dKey?: Phaser.Input.Keyboard.Key;
  private wKey?: Phaser.Input.Keyboard.Key;
  private pullKey?: Phaser.Input.Keyboard.Key;
  private pushKey?: Phaser.Input.Keyboard.Key;
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private reviveKey?: Phaser.Input.Keyboard.Key;

  private livesText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private magnetText!: Phaser.GameObjects.Text;

  private livesRemaining = DEFAULT_RUN_LIVES;
  private outOfLives = false;
  private levelComplete = false;
  private transitioningToBoss = false;
  private damageCooldownUntil = 0;
  private magnetCooldownUntil = 0;
  private activeMagnetIndex = -1;
  private lockedMagnetIndex = -1;
  private magnetPullTween?: Phaser.Tweens.Tween;

  private upgrade: UpgradeOption = "triple-damage";
  private damageBonus = 1;
  private cloneCount = 0;

  constructor() {
    super("magnetic-facility");
  }

  create(data: MagneticFacilitySceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.outOfLives = this.livesRemaining <= 0;
    this.levelComplete = false;
    this.transitioningToBoss = false;
    this.damageCooldownUntil = 0;
    this.magnetCooldownUntil = 0;
    this.activeMagnetIndex = -1;
    this.lockedMagnetIndex = -1;
    this.magnetPullTween = undefined;
    this.magnets = [];
    this.upgrade = data.upgrade ?? ((this.registry.get("level9Upgrade") as UpgradeOption | undefined) ?? "triple-damage");
    this.damageBonus =
      data.damageBonus ??
      ((this.registry.get("level9DamageMultiplier") as number | undefined) ?? (this.upgrade === "triple-damage" ? 3 : 1));
    this.cloneCount =
      data.cloneCount ??
      ((this.registry.get("level9CloneCount") as number | undefined) ?? (this.upgrade === "two-clones" ? 2 : 0));

    this.physics.world.gravity.y = GRAVITY_Y;
    this.physics.world.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);

    this.cameras.main.setBackgroundColor(0x09111a);
    this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createTerrain();
    this.createShocks();
    this.createLava();
    this.createMagnets();
    this.createGoal();
    this.createPlayer();
    this.createHud();
    this.bindInput();
    this.updateHud();
    this.updateMagnetHighlight();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(220, 150);

    this.statusText.setText("Press Q to pull to the next anchor core. Avoid the lava rails.");
    this.time.delayedCall(3200, () => {
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
      g.fillStyle(0x4c6276, 1);
      g.fillRoundedRect(0, 0, 160, 24, 7);
      g.fillStyle(0x9fe6ff, 0.22);
      g.fillRect(8, 4, 144, 5);
      g.fillStyle(0x16202b, 1);
      g.fillRect(0, 16, 160, 8);
      g.generateTexture(TEXTURE_KEYS.terrain, 160, 24);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.shock)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x43c8ff, 0.8);
      g.fillRoundedRect(0, 6, 180, 14, 7);
      g.lineStyle(3, 0xdbfbff, 0.95);
      g.beginPath();
      for (let x = 0; x <= 180; x += 20) {
        g.moveTo(x, 12);
        g.lineTo(x + 8, 2);
        g.lineTo(x + 16, 18);
      }
      g.strokePath();
      g.generateTexture(TEXTURE_KEYS.shock, 180, 22);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.lava)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x3a0800, 1);
      g.fillRoundedRect(0, 0, 160, 16, 6);
      g.fillStyle(0xff4d00, 1);
      g.fillRoundedRect(0, 4, 160, 10, 5);
      g.fillStyle(0xffb000, 0.95);
      g.fillRoundedRect(10, 2, 34, 6, 3);
      g.fillRoundedRect(60, 3, 28, 5, 3);
      g.fillRoundedRect(110, 2, 38, 6, 3);
      g.generateTexture(TEXTURE_KEYS.lava, 160, 16);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.goal)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x1e2c3c, 1);
      g.fillRoundedRect(0, 0, 70, 96, 12);
      g.fillStyle(0x7df1ff, 0.88);
      g.fillRoundedRect(12, 12, 46, 72, 10);
      g.lineStyle(3, 0xeafcff, 0.95);
      g.strokeRoundedRect(14, 14, 42, 68, 8);
      g.generateTexture(TEXTURE_KEYS.goal, 70, 96);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT / 2, LEVEL_WIDTH, LEVEL_HEIGHT, 0x09111a);
    this.add.rectangle(LEVEL_WIDTH / 2, 120, LEVEL_WIDTH, 220, 0x132235, 0.85);
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT - 80, LEVEL_WIDTH, 180, 0x060a11, 0.96);

    for (let x = 0; x < LEVEL_WIDTH; x += 260) {
      this.add.rectangle(x + 20, LEVEL_HEIGHT / 2, 8, LEVEL_HEIGHT, 0x1b2f45, 0.22);
      this.add.rectangle(x + 110, 160, 90, 6, 0x7cf2ff, 0.1);
      this.add.rectangle(x + 180, 250, 110, 4, 0x7cf2ff, 0.08);
    }

    this.add
      .text(GAME_WIDTH / 2, 36, "Magnetic Facility", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f2fbff",
        stroke: "#031018",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.add
      .text(GAME_WIDTH / 2, 72, "Use magnetic anchors to cross the chamber.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#cfeaff",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
  }

  private createTerrain() {
    this.terrain = this.physics.add.staticGroup();

    PLATFORM_LAYOUT.forEach((config) => {
      const platform = this.terrain.create(config.x, config.y, TEXTURE_KEYS.terrain) as Phaser.Physics.Arcade.Image;
      platform.setDisplaySize(config.width, config.height);
      platform.refreshBody();
    });
  }

  private createShocks() {
    this.shocks = this.physics.add.staticGroup();

    SHOCK_LAYOUT.forEach((config) => {
      const shock = this.shocks.create(config.x, config.y, TEXTURE_KEYS.shock) as Phaser.Physics.Arcade.Image;
      shock.setDisplaySize(config.width, config.height);
      shock.refreshBody();
    });
  }

  private createLava() {
    this.lava = this.physics.add.staticGroup();

    LAVA_LAYOUT.forEach((config) => {
      const strip = this.lava.create(config.x, config.y, TEXTURE_KEYS.lava) as Phaser.Physics.Arcade.Image;
      strip.setDisplaySize(config.width, config.height);
      strip.setDepth(7);
      strip.refreshBody();
    });
  }

  private createMagnets() {
    MAGNET_LAYOUT.forEach((config) => {
      const ring = this.add.circle(config.x, config.y, config.radius, 0x4bd7ff, 0.06);
      ring.setStrokeStyle(3, 0x7fe9ff, 0.35);
      const core = this.add.circle(config.x, config.y, 24, 0x2ed7ff, 0.95);
      core.setStrokeStyle(5, 0xe0fbff, 0.92);
      const label = this.add
        .text(config.x, config.y + 42, config.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "16px",
          color: "#d9f7ff",
          stroke: "#031018",
          strokeThickness: 4,
        })
        .setOrigin(0.5, 0);

      this.magnets.push({ config, ring, core, label });

      this.tweens.add({
        targets: core,
        scaleX: 1.12,
        scaleY: 1.12,
        yoyo: true,
        repeat: -1,
        duration: 700,
        ease: "Sine.inOut",
      });
    });
  }

  private createGoal() {
    this.goal = this.physics.add.staticImage(GOAL_X, GOAL_Y, TEXTURE_KEYS.goal);
    this.goal.setDepth(8);
    this.goal.refreshBody();

    this.add
      .text(GOAL_X, GOAL_Y - 82, "Boss Gate", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#fff2bc",
        stroke: "#031018",
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
    this.player.setMaxVelocity(460, 860);

    this.terrainCollider = this.physics.add.collider(this.player, this.terrain);
    this.shockOverlap = this.physics.add.overlap(this.player, this.shocks, () => {
      this.handleDeath("Electric floor!");
    });
    this.lavaOverlap = this.physics.add.overlap(this.player, this.lava, () => {
      this.handleDeath("Lava burn!");
    });
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

    this.magnetText = this.add
      .text(GAME_WIDTH / 2, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#8eefff",
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
    this.pullKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.pushKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.reviveKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  update() {
    if (this.levelComplete) {
      if (this.confirmKey && (Phaser.Input.Keyboard.JustDown(this.confirmKey) || this.confirmKey.isDown)) {
        this.startBossArena();
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

    if (this.isBeingPulled()) {
      this.updateMagnetHighlight();
      this.updateHud();
      return;
    }

    this.updateMovement();
    this.updateMagnetHighlight();
    this.handleMagnetInput();

    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    if (body && this.player.y > LEVEL_HEIGHT + 120) {
      this.handleDeath("You fell out of the magnetic shaft.");
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
  }

  private updateMagnetHighlight() {
    if (this.lockedMagnetIndex >= 0) {
      const lockedMagnet = this.magnets[this.lockedMagnetIndex];
      if (lockedMagnet) {
        const lockedDistance = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          lockedMagnet.config.x,
          lockedMagnet.config.y,
        );

        if (lockedDistance > lockedMagnet.config.radius + 28) {
          this.lockedMagnetIndex = -1;
        }
      } else {
        this.lockedMagnetIndex = -1;
      }
    }

    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    this.magnets.forEach((magnet, index) => {
      if (index === this.lockedMagnetIndex) return;

      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, magnet.config.x, magnet.config.y);
      if (distance <= magnet.config.radius && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    this.activeMagnetIndex = bestIndex;

    this.magnets.forEach((magnet, index) => {
      const isActive = index === this.activeMagnetIndex;
      magnet.ring.setFillStyle(isActive ? 0x5ee8ff : 0x4bd7ff, isActive ? 0.12 : 0.06);
      magnet.ring.setStrokeStyle(isActive ? 4 : 3, isActive ? 0xe9fcff : 0x7fe9ff, isActive ? 0.7 : 0.35);
      magnet.core.setScale(isActive ? 1.2 : 1);
      magnet.label.setColor(isActive ? "#ffffff" : "#d9f7ff");
    });
  }

  private handleMagnetInput() {
    const canUseMagnet = this.time.now >= this.magnetCooldownUntil;
    const activeMagnet = this.activeMagnetIndex >= 0 ? this.magnets[this.activeMagnetIndex] : undefined;

    if (!activeMagnet) {
      if ((this.pullKey && Phaser.Input.Keyboard.JustDown(this.pullKey)) || (this.pushKey && Phaser.Input.Keyboard.JustDown(this.pushKey))) {
        this.statusText.setText("Move into a magnet ring first.");
      }
      return;
    }

    if (!canUseMagnet) return;

    if (this.pullKey && Phaser.Input.Keyboard.JustDown(this.pullKey)) {
      this.pullPlayerToMagnetCenter(activeMagnet.config);
      return;
    }

    if (this.pushKey && Phaser.Input.Keyboard.JustDown(this.pushKey)) {
      this.applyMagneticImpulse(activeMagnet.config, -1, "Repelled away from anchor.");
    }
  }

  private applyMagneticImpulse(config: MagnetConfig, direction: 1 | -1, message: string) {
    const vector = new Phaser.Math.Vector2(config.x - this.player.x, config.y - this.player.y);
    if (vector.lengthSq() < 1) return;

    vector.normalize().scale(config.impulse * direction);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.velocity.x += vector.x;
    body.velocity.y += vector.y;
    body.velocity.x = Phaser.Math.Clamp(body.velocity.x, -460, 460);
    body.velocity.y = Phaser.Math.Clamp(body.velocity.y, -860, 860);

    this.lockedMagnetIndex = this.activeMagnetIndex;
    this.player.setFlipX(vector.x < 0);
    this.magnetCooldownUntil = this.time.now + MAGNET_COOLDOWN_MS;
    this.statusText.setText(message);
    this.cameras.main.shake(70, 0.0035);
  }

  private pullPlayerToMagnetCenter(config: MagnetConfig) {
    if (this.isBeingPulled()) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body) return;

    body.stop();
    body.setAllowGravity(false);

    this.magnetPullTween = this.tweens.add({
      targets: this.player,
      x: config.x,
      y: config.y,
      duration: MAGNET_PULL_MS,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        body.updateFromGameObject();
      },
      onComplete: () => {
        body.updateFromGameObject();
        body.setAllowGravity(true);
        body.setVelocity(0, 0);
        this.magnetPullTween = undefined;
      },
    });

    this.lockedMagnetIndex = this.activeMagnetIndex;
    this.player.setFlipX(config.x < this.player.x);
    this.magnetCooldownUntil = this.time.now + MAGNET_COOLDOWN_MS;
    this.statusText.setText("Pulled to anchor core.");
    this.cameras.main.shake(90, 0.004);
  }

  private isBeingPulled() {
    return Boolean(this.magnetPullTween?.isPlaying());
  }

  private stopMagnetPull() {
    if (!this.magnetPullTween) return;

    this.magnetPullTween.remove();
    this.magnetPullTween = undefined;

    const body = this.player?.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setAllowGravity(true);
  }

  private handleDeath(message: string) {
    if (this.levelComplete || this.outOfLives) return;
    if (this.time.now < this.damageCooldownUntil) return;

    this.stopMagnetPull();
    this.damageCooldownUntil = this.time.now + HIT_INVULN_MS;
    const livesLeft = loseRunLife(this);
    this.livesRemaining = livesLeft;
    this.player.setVelocity(0, 0);
    this.cameras.main.shake(120, 0.006);

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

    this.stopMagnetPull();
    this.levelComplete = true;
    this.player.setVelocityX(0);
    this.statusText.setText("Magnetic Facility complete! Press ENTER for the boss arena.");
    this.cameras.main.flash(180, 220, 255, 240, false);
  }

  private updateHud() {
    this.livesText.setText(`Lives: ${this.livesRemaining}`);
    this.magnetText.setText(this.activeMagnetIndex >= 0 ? `Anchor: ${this.magnets[this.activeMagnetIndex]?.config.label ?? "-"}` : "Anchor: none");
    this.hudText.setText(`Character: ${this.selectedCharacter.name} | Q pull | E repel`);
  }

  private restartLevel() {
    this.scene.restart({
      characterId: this.selectedCharacter.id,
      upgrade: this.upgrade,
      damageBonus: this.damageBonus,
      cloneCount: this.cloneCount,
    });
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
    this.stopMagnetPull();
    this.terrainCollider?.destroy();
    this.shockOverlap?.destroy();
    this.lavaOverlap?.destroy();
    this.goalOverlap?.destroy();

    this.clearGroupSafe(this.terrain);
    this.clearGroupSafe(this.shocks);
    this.clearGroupSafe(this.lava);
    this.player?.destroy();
    this.goal?.destroy();
    this.magnets.forEach((magnet) => {
      magnet.ring.destroy();
      magnet.core.destroy();
      magnet.label.destroy();
    });
    this.magnets = [];
    this.livesText?.destroy();
    this.hudText?.destroy();
    this.statusText?.destroy();
    this.magnetText?.destroy();
  }
}
