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

type GravityFlipSceneData = {
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

type EnemyConfig = {
  x: number;
  y: number;
  minX: number;
  maxX: number;
  speed: number;
  tint: number;
};

const GRAVITY_FORCE = 980;
const FLOOR_HEIGHT = 48;
const FLOOR_Y = GAME_HEIGHT - FLOOR_HEIGHT / 2;
const CEILING_Y = FLOOR_HEIGHT / 2;
const PLAYER_START_X = 96;
const PLAYER_START_Y = GAME_HEIGHT - FLOOR_HEIGHT - 30;
const PLAYER_SPEED = 235;
const PLAYER_JUMP_VELOCITY = 455;
const FLIP_COOLDOWN_MS = 550;
const HIT_INVULN_MS = 900;
const MAX_DEATHS = DEFAULT_RUN_LIVES;
const PORTAL_X = GAME_WIDTH - 86;
const PORTAL_Y = GAME_HEIGHT - FLOOR_HEIGHT - 42;

const PLATFORM_LAYOUT: readonly PlatformConfig[] = [
  { x: 342, y: 142, width: 34, height: 220 },
  { x: 612, y: 396, width: 34, height: 220 },
  { x: 212, y: 322, width: 112, height: 18 },
  { x: 496, y: 214, width: 126, height: 18 },
  { x: 792, y: 326, width: 132, height: 18 },
] as const;

const ENEMY_LAYOUT: readonly EnemyConfig[] = [
  { x: 210, y: PLAYER_START_Y, minX: 130, maxX: 286, speed: 92, tint: 0xff8d8d },
  { x: 466, y: PLAYER_START_Y, minX: 372, maxX: 566, speed: 104, tint: 0xffd278 },
  { x: 748, y: PLAYER_START_Y, minX: 664, maxX: 876, speed: 116, tint: 0x87f1ff },
] as const;

const TEXTURE_KEYS = {
  player: "gravity-flip-player",
  surface: "gravity-flip-surface",
  wall: "gravity-flip-wall",
  enemy: "gravity-flip-enemy",
  portal: "gravity-flip-portal",
} as const;

export class GravityFlipScene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private portalZone?: Phaser.GameObjects.Zone;

  private playerPlatformCollider?: Phaser.Physics.Arcade.Collider;
  private enemyPlatformCollider?: Phaser.Physics.Arcade.Collider;
  private enemyOverlap?: Phaser.Physics.Arcade.Collider;
  private portalOverlap?: Phaser.Physics.Arcade.Collider;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private upKey?: Phaser.Input.Keyboard.Key;
  private jumpKey?: Phaser.Input.Keyboard.Key;
  private aKey?: Phaser.Input.Keyboard.Key;
  private dKey?: Phaser.Input.Keyboard.Key;
  private wKey?: Phaser.Input.Keyboard.Key;
  private flipKey?: Phaser.Input.Keyboard.Key;
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private reviveKey?: Phaser.Input.Keyboard.Key;

  private hudText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private gravityText!: Phaser.GameObjects.Text;
  private gravityGlow?: Phaser.GameObjects.Ellipse;

  private livesRemaining = DEFAULT_RUN_LIVES;
  private outOfLives = false;
  private levelComplete = false;
  private transitioningToNextLevel = false;
  private gravityFlipped = false;
  private damageCooldownUntil = 0;
  private lastFlipAt = -FLIP_COOLDOWN_MS;

  private upgrade: UpgradeOption = "triple-damage";
  private damageBonus = 1;
  private cloneCount = 0;

  constructor() {
    super("gravity-flip");
  }

  create(data: GravityFlipSceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.outOfLives = this.livesRemaining <= 0;
    this.levelComplete = false;
    this.transitioningToNextLevel = false;
    this.gravityFlipped = false;
    this.damageCooldownUntil = 0;
    this.lastFlipAt = -FLIP_COOLDOWN_MS;
    this.upgrade =
      data.upgrade ??
      ((this.registry.get("level9Upgrade") as UpgradeOption | undefined) ?? "triple-damage");
    this.damageBonus =
      data.damageBonus ??
      ((this.registry.get("level9DamageMultiplier") as number | undefined) ?? (this.upgrade === "triple-damage" ? 3 : 1));
    this.cloneCount =
      data.cloneCount ??
      ((this.registry.get("level9CloneCount") as number | undefined) ?? (this.upgrade === "two-clones" ? 2 : 0));

    this.physics.world.gravity.y = GRAVITY_FORCE;
    this.cameras.main.setBackgroundColor(0x08131f);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createPlatforms();
    this.createPlayer();
    this.createEnemies();
    this.createPortal();
    this.createHud();
    this.bindInput();
    this.updateHud();

    this.statusText.setText("Press F to flip gravity. The drones flip too. Reach the exit portal.");
    this.time.delayedCall(2500, () => {
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

    if (!this.textures.exists(TEXTURE_KEYS.surface)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x3f6e86, 1);
      g.fillRoundedRect(0, 0, 128, 20, 6);
      g.fillStyle(0x1b3b4a, 1);
      g.fillRect(0, 12, 128, 8);
      g.fillStyle(0xa9f2ff, 0.7);
      g.fillRect(8, 3, 112, 4);
      g.generateTexture(TEXTURE_KEYS.surface, 128, 20);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.wall)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x203444, 1);
      g.fillRect(0, 0, 40, 128);
      g.fillStyle(0x4f86a4, 0.7);
      g.fillRect(6, 0, 28, 128);
      g.fillStyle(0xc3f3ff, 0.3);
      g.fillRect(17, 0, 6, 128);
      g.generateTexture(TEXTURE_KEYS.wall, 40, 128);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.enemy)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xf6f9ff, 1);
      g.fillCircle(16, 16, 16);
      g.fillStyle(0x122538, 1);
      g.fillCircle(12, 14, 4);
      g.fillCircle(20, 14, 4);
      g.fillStyle(0x3f6784, 1);
      g.fillRect(10, 22, 12, 4);
      g.generateTexture(TEXTURE_KEYS.enemy, 32, 32);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.portal)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x132539, 1);
      g.fillCircle(32, 32, 30);
      g.lineStyle(6, 0x86f0ff, 1);
      g.strokeCircle(32, 32, 23);
      g.lineStyle(3, 0xe3f9ff, 0.85);
      g.strokeCircle(32, 32, 13);
      g.generateTexture(TEXTURE_KEYS.portal, 64, 64);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x08131f);
    this.add.rectangle(GAME_WIDTH / 2, 106, GAME_WIDTH, 180, 0x12253a, 0.88);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 94, GAME_WIDTH, 170, 0x0d1c2b, 0.96);

    for (let x = 64; x < GAME_WIDTH; x += 120) {
      this.add.rectangle(x, GAME_HEIGHT / 2, 2, GAME_HEIGHT - 80, 0x1f3650, 0.26);
    }
    for (let y = 82; y < GAME_HEIGHT - 60; y += 74) {
      this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 90, 2, 0x1f3650, 0.22);
    }

    this.gravityGlow = this.add.ellipse(GAME_WIDTH / 2, GAME_HEIGHT / 2, 340, 420, 0x7be9ff, 0.07);
    this.tweens.add({
      targets: this.gravityGlow,
      alpha: 0.15,
      scaleX: 1.04,
      scaleY: 1.06,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    this.add
      .text(GAME_WIDTH / 2, 36, "Level 10: Gravity Flip", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f5fbff",
        stroke: "#07111a",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.add
      .text(GAME_WIDTH / 2, 72, "Switch between ceiling and floor to cross the chamber.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#d7e8f6",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
  }

  private createPlatforms() {
    this.platforms = this.physics.add.staticGroup();

    const floor = this.platforms.create(GAME_WIDTH / 2, FLOOR_Y, TEXTURE_KEYS.surface) as Phaser.Physics.Arcade.Image;
    floor.setDisplaySize(GAME_WIDTH, FLOOR_HEIGHT);
    floor.refreshBody();

    const ceiling = this.platforms.create(GAME_WIDTH / 2, CEILING_Y, TEXTURE_KEYS.surface) as Phaser.Physics.Arcade.Image;
    ceiling.setDisplaySize(GAME_WIDTH, FLOOR_HEIGHT);
    ceiling.refreshBody();

    PLATFORM_LAYOUT.forEach((config) => {
      const texture = config.width <= 40 ? TEXTURE_KEYS.wall : TEXTURE_KEYS.surface;
      const platform = this.platforms.create(config.x, config.y, texture) as Phaser.Physics.Arcade.Image;
      platform.setDisplaySize(config.width, config.height);
      platform.refreshBody();
    });
  }

  private createPlayer() {
    this.player = this.physics.add
      .image(PLAYER_START_X, PLAYER_START_Y, TEXTURE_KEYS.player)
      .setTint(this.selectedCharacter.primaryColor)
      .setCollideWorldBounds(true);

    this.player.setDragX(1400);
    this.player.setMaxVelocity(360, 620);
    this.playerPlatformCollider = this.physics.add.collider(this.player, this.platforms);
    this.applyGravityVisuals();
  }

  private createEnemies() {
    this.enemies = this.physics.add.group({
      allowGravity: true,
      immovable: false,
      bounceX: 0,
      bounceY: 0,
      collideWorldBounds: true,
    });

    ENEMY_LAYOUT.forEach((config) => {
      const enemy = this.enemies.create(config.x, config.y, TEXTURE_KEYS.enemy) as Phaser.Physics.Arcade.Image;
      enemy.setTint(config.tint);
      enemy.setCollideWorldBounds(true);
      enemy.setBounce(0);
      enemy.setDragX(1200);
      enemy.setMaxVelocity(200, 540);
      const body = enemy.body as Phaser.Physics.Arcade.Body | undefined;
      body?.setCircle(16);
      enemy.setData("startX", config.x);
      enemy.setData("startY", config.y);
      enemy.setData("minX", config.minX);
      enemy.setData("maxX", config.maxX);
      enemy.setData("speed", config.speed);
      enemy.setData("direction", Phaser.Math.Between(0, 1) === 0 ? -1 : 1);
    });

    this.enemyPlatformCollider = this.physics.add.collider(this.enemies, this.platforms);
    this.enemyOverlap = this.physics.add.overlap(this.player, this.enemies, () => {
      this.handleEnemyHit();
    });
  }

  private createPortal() {
    this.add.image(PORTAL_X, PORTAL_Y, TEXTURE_KEYS.portal).setScale(1.1);
    const portalGlow = this.add.ellipse(PORTAL_X, PORTAL_Y, 92, 112, 0x86f0ff, 0.16);
    this.tweens.add({
      targets: portalGlow,
      alpha: 0.3,
      scaleX: 1.12,
      scaleY: 1.08,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    this.add
      .text(PORTAL_X, PORTAL_Y - 54, "Boss Gate", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#f2fbff",
        stroke: "#08111c",
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.portalZone = this.add.zone(PORTAL_X, PORTAL_Y, 84, 112);
    this.physics.add.existing(this.portalZone, true);
    this.portalOverlap = this.physics.add.overlap(this.player, this.portalZone, () => {
      this.completeLevel();
    });
  }

  private createHud() {
    this.livesText = this.add
      .text(20, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#f4fbff",
      })
      .setDepth(10);

    this.gravityText = this.add
      .text(GAME_WIDTH / 2, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#bceeff",
      })
      .setOrigin(0.5, 0)
      .setDepth(10);

    this.hudText = this.add
      .text(GAME_WIDTH - 20, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#dcecff",
        align: "right",
      })
      .setOrigin(1, 0)
      .setDepth(10);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 28, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f4fbff",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(10);
  }

  private bindInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.cursors = keyboard.createCursorKeys();
    keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.ENTER, Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.F]);
    this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.upKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.jumpKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.aKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.dKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.wKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.flipKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.reviveKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  update() {
    if (this.levelComplete) {
      if (this.confirmKey && (Phaser.Input.Keyboard.JustDown(this.confirmKey) || this.confirmKey.isDown)) {
        this.startNextLevel();
      }
      this.player.setVelocityX(0);
      this.stopEnemies();
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
      this.stopEnemies();
      this.updateHud();
      return;
    }

    if (this.flipKey && Phaser.Input.Keyboard.JustDown(this.flipKey)) {
      this.flipGravity();
    }

    this.updateMovement();
    this.updateEnemies();
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
    const grounded = this.gravityFlipped ? body.blocked.up || body.touching.up : body.blocked.down || body.touching.down;
    if (!grounded) return;

    const jumpBoost = (this.selectedCharacter.jumpDistance - 60) * 2;
    const jumpVelocity = PLAYER_JUMP_VELOCITY + jumpBoost;
    this.player.setVelocityY(this.gravityFlipped ? jumpVelocity : -jumpVelocity);
  }

  private updateEnemies() {
    this.getGroupChildrenSafe(this.enemies).forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      const body = enemy.body as Phaser.Physics.Arcade.Body | undefined;
      if (!body) return;

      const minX = (enemy.getData("minX") as number | undefined) ?? 0;
      const maxX = (enemy.getData("maxX") as number | undefined) ?? GAME_WIDTH;
      const speed = (enemy.getData("speed") as number | undefined) ?? 100;
      let direction = (enemy.getData("direction") as number | undefined) ?? 1;

      if (enemy.x <= minX) direction = 1;
      if (enemy.x >= maxX) direction = -1;
      enemy.setData("direction", direction);

      body.setVelocityX(direction * speed);
      enemy.angle += direction * 2.2;
      enemy.setFlipY(this.gravityFlipped);
    });
  }

  private updateHud() {
    this.livesText.setText(`Lives: ${this.livesRemaining}`);
    this.gravityText.setText(this.gravityFlipped ? "Gravity: Ceiling Pull" : "Gravity: Floor Pull");
    this.hudText.setText(`Character: ${this.selectedCharacter.name} | Flip: F`);
  }

  private flipGravity() {
    if (this.time.now - this.lastFlipAt < FLIP_COOLDOWN_MS) return;

    this.lastFlipAt = this.time.now;
    this.gravityFlipped = !this.gravityFlipped;
    this.physics.world.gravity.y = this.gravityFlipped ? -GRAVITY_FORCE : GRAVITY_FORCE;
    this.player.setVelocityY(0);
    this.applyGravityVisuals();

    this.cameras.main.flash(90, 162, 233, 255, false);
    this.statusText.setText(this.gravityFlipped ? "Gravity flipped: ceiling pull." : "Gravity flipped: floor pull.");
    this.time.delayedCall(850, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });
  }

  private applyGravityVisuals() {
    this.player.setFlipY(this.gravityFlipped);
    this.gravityGlow?.setFillStyle(this.gravityFlipped ? 0xffd77b : 0x7be9ff, this.gravityFlipped ? 0.08 : 0.07);
  }

  private handleEnemyHit() {
    if (this.levelComplete || this.outOfLives) return;
    if (this.time.now < this.damageCooldownUntil) return;

    this.damageCooldownUntil = this.time.now + HIT_INVULN_MS;
    const livesLeft = loseRunLife(this);
    this.livesRemaining = livesLeft;

    if (livesLeft <= 0) {
      this.outOfLives = true;
      this.player.setVelocity(0, 0);
      this.stopEnemies();
      const gems = getGemCount(this);
      this.statusText.setText(
        gems >= REVIVE_GEM_COST
          ? `Out of lives. Press R to spend 1 gem (${gems} left) and restart, or ENTER to leave.`
          : `You can't play anymore. ${MAX_DEATHS} lives used. Press ENTER.`,
      );
      return;
    }

    this.resetRoomState();
    this.statusText.setText(`Gravity bots hit you! Lives left: ${livesLeft}.`);
    this.time.delayedCall(950, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });
  }

  private resetRoomState() {
    this.gravityFlipped = false;
    this.physics.world.gravity.y = GRAVITY_FORCE;
    this.player.setPosition(PLAYER_START_X, PLAYER_START_Y);
    this.player.setVelocity(0, 0);
    this.applyGravityVisuals();

    this.getGroupChildrenSafe(this.enemies).forEach((child, index) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      const config = ENEMY_LAYOUT[index];
      enemy.setPosition(config?.x ?? PLAYER_START_X + 120, config?.y ?? PLAYER_START_Y);
      enemy.setVelocity(0, 0);
      enemy.setData("direction", index % 2 === 0 ? 1 : -1);
      enemy.setAngle(0);
      enemy.setFlipY(false);
    });

    this.cameras.main.shake(110, 0.005);
  }

  private completeLevel() {
    if (this.levelComplete || this.outOfLives) return;

    this.levelComplete = true;
    this.statusText.setText("Gravity level complete! Press ENTER for the rising water ruins.");
    this.player.setVelocityX(0);
    this.stopEnemies();
    this.cameras.main.flash(160, 220, 255, 235, false);
  }

  private startNextLevel() {
    if (this.transitioningToNextLevel) return;

    this.transitioningToNextLevel = true;
    this.scene.start("rising-water", {
      characterId: this.selectedCharacter.id,
      upgrade: this.upgrade,
      damageBonus: this.damageBonus,
      cloneCount: this.cloneCount,
    });
  }

  private stopEnemies() {
    this.getGroupChildrenSafe(this.enemies).forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      enemy.setVelocity(0, 0);
    });
  }

  private getGroupChildrenSafe(group?: Phaser.Physics.Arcade.Group) {
    if (!group) return [] as Phaser.GameObjects.GameObject[];

    const maybeGroup = group as Phaser.Physics.Arcade.Group & {
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
    if (this.playerPlatformCollider) {
      this.playerPlatformCollider.destroy();
      this.playerPlatformCollider = undefined;
    }
    if (this.enemyPlatformCollider) {
      this.enemyPlatformCollider.destroy();
      this.enemyPlatformCollider = undefined;
    }
    if (this.enemyOverlap) {
      this.enemyOverlap.destroy();
      this.enemyOverlap = undefined;
    }
    if (this.portalOverlap) {
      this.portalOverlap.destroy();
      this.portalOverlap = undefined;
    }

    this.clearGroupSafe(this.enemies);
    this.clearGroupSafe(this.platforms);
    this.portalZone?.destroy();
    this.player?.destroy();
  }
}
