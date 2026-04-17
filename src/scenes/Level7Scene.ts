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

type Level7SceneData = {
  characterId?: CharacterId;
  startingHealth?: number;
};

type PlatformConfig = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BarrelSpawnerConfig = {
  machineX: number;
  machineY: number;
  spawnX: number;
  spawnY: number;
  direction: 1 | -1;
  label: string;
};

const GRAVITY_Y = 980;
const MAX_DEATHS = DEFAULT_RUN_LIVES;
const HIT_INVULN_MS = 850;
const BASE_MOVE_SPEED = 235;
const BASE_JUMP_VELOCITY = 470;
const GROUND_HEIGHT = 56;
const GROUND_Y = GAME_HEIGHT - GROUND_HEIGHT / 2;
const START_X = 260;
const START_Y = GAME_HEIGHT - GROUND_HEIGHT - 34;
const START_LOCK_MS = 8_000;
const BARREL_SPAWN_MS = 1_750;
const BARREL_SPEED_MIN = 190;
const BARREL_SPEED_MAX = 250;
const BARREL_SPAWNERS: readonly BarrelSpawnerConfig[] = [
  {
    machineX: GAME_WIDTH - 118,
    machineY: 170,
    spawnX: GAME_WIDTH - 182,
    spawnY: 184,
    direction: -1,
    label: "Barrel Maker",
  },
] as const;
const BARREL_MAKER_X = BARREL_SPAWNERS[0].machineX;
const BARREL_MAKER_Y = BARREL_SPAWNERS[0].machineY;
const BARREL_MAKER_GOAL_Y = 204;

const PLATFORM_LAYOUT: readonly PlatformConfig[] = [
  { x: GAME_WIDTH - 170, y: 234, width: 220, height: 24 },
  { x: 700, y: 300, width: 180, height: 24 },
  { x: 520, y: 326, width: 240, height: 24 },
  { x: 390, y: 368, width: 156, height: 24 },
  { x: 640, y: 404, width: 188, height: 24 },
  { x: 260, y: 418, width: 196, height: 24 },
] as const;

const TEXTURE_KEYS = {
  player: "level7-player",
  platform: "level7-platform",
  ground: "level7-ground",
  barrel: "level7-barrel",
} as const;

export class Level7Scene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private barrels!: Phaser.Physics.Arcade.Group;

  private playerPlatformCollider?: Phaser.Physics.Arcade.Collider;
  private barrelPlatformCollider?: Phaser.Physics.Arcade.Collider;
  private barrelOverlap?: Phaser.Physics.Arcade.Collider;
  private barrelSpawnTimer?: Phaser.Time.TimerEvent;
  private barrelMakerGoal?: Phaser.GameObjects.Zone;
  private barrelMakerOverlap?: Phaser.Physics.Arcade.Collider;

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
  private transitioningToLevel8 = false;
  private levelStartTime = 0;
  private levelEndTime?: number;
  private damageCooldownUntil = 0;

  constructor() {
    super("level-7");
  }

  create(data: Level7SceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.outOfLives = this.livesRemaining <= 0;
    this.levelComplete = false;
    this.transitioningToLevel8 = false;
    this.levelStartTime = this.time.now;
    this.levelEndTime = undefined;
    this.damageCooldownUntil = 0;

    this.physics.world.gravity.y = GRAVITY_Y;
    this.cameras.main.setBackgroundColor(0x1b1010);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createPlatforms();
    this.createPlayer();
    this.createBarrelMakerGoal();
    this.createBarrels();
    this.createHud();
    this.bindInput();
    this.updateHud();

    this.statusText.setText("Get ready. Movement unlocks after 8 seconds.");
    this.time.delayedCall(START_LOCK_MS, () => {
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
      g.fillStyle(0x7b5230, 1);
      g.fillRoundedRect(0, 0, 128, 24, 6);
      g.fillStyle(0x4d2e18, 1);
      g.fillRect(0, 16, 128, 8);
      g.fillStyle(0xb88b5b, 0.9);
      g.fillRect(10, 4, 108, 4);
      g.generateTexture(TEXTURE_KEYS.platform, 128, 24);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.ground)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x58311c, 1);
      g.fillRect(0, 0, 128, 56);
      g.fillStyle(0x7b5230, 1);
      g.fillRect(0, 0, 128, 14);
      g.fillStyle(0x2d190f, 1);
      for (let x = 12; x < 128; x += 26) {
        g.fillRect(x, 18, 10, 30);
      }
      g.generateTexture(TEXTURE_KEYS.ground, 128, 56);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.barrel)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x9a6438, 1);
      g.fillCircle(18, 18, 18);
      g.fillStyle(0x623a1f, 1);
      g.fillCircle(18, 18, 14);
      g.lineStyle(4, 0xc6965d, 1);
      g.strokeCircle(18, 18, 15);
      g.lineStyle(3, 0x31190e, 1);
      g.beginPath();
      g.moveTo(10, 6);
      g.lineTo(10, 30);
      g.moveTo(26, 6);
      g.lineTo(26, 30);
      g.strokePath();
      g.generateTexture(TEXTURE_KEYS.barrel, 36, 36);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1b1010);
    this.add.rectangle(GAME_WIDTH / 2, 120, GAME_WIDTH, 220, 0x40201b, 0.78);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 98, GAME_WIDTH, 196, 0x261412, 0.92);

    for (let x = 70; x < GAME_WIDTH; x += 140) {
      this.add.rectangle(x, GAME_HEIGHT / 2, 6, GAME_HEIGHT - 120, 0x2a1715, 0.52);
    }
    for (let y = 120; y < GAME_HEIGHT - 70; y += 82) {
      this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 140, 3, 0x2a1715, 0.4);
    }

    this.add.circle(128, 96, 40, 0xffcb78, 0.22);
    this.add.circle(128, 96, 70, 0xff8d4d, 0.1);

    BARREL_SPAWNERS.forEach((spawner) => {
      this.drawBarrelSpawner(spawner);
    });

    this.add
      .text(GAME_WIDTH / 2, 36, "Level 7: Barrel Rush", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#fff5ec",
        stroke: "#130908",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.add
      .text(GAME_WIDTH / 2, 72, "Jump the barrels as they tumble down toward you.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f2d7c2",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
  }

  private drawBarrelSpawner(spawner: BarrelSpawnerConfig) {
    this.add.rectangle(spawner.machineX, spawner.machineY, 116, 92, 0x384556, 0.95).setStrokeStyle(3, 0x6c89aa, 0.85);
    this.add.rectangle(spawner.machineX, spawner.machineY + 38, 72, 20, 0x1d2631, 0.95);
    this.add.rectangle(spawner.machineX, spawner.machineY - 10, 38, 22, 0xd26a52, 0.65);
    this.add
      .text(spawner.machineX, spawner.machineY - 56, spawner.label, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#f8d7bf",
        stroke: "#180d0a",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
  }

  private createPlatforms() {
    this.platforms = this.physics.add.staticGroup();

    const ground = this.platforms.create(GAME_WIDTH / 2, GROUND_Y, TEXTURE_KEYS.ground) as Phaser.Physics.Arcade.Image;
    ground.setDisplaySize(GAME_WIDTH, GROUND_HEIGHT);
    ground.refreshBody();

    PLATFORM_LAYOUT.forEach((config) => {
      const platform = this.platforms.create(config.x, config.y, TEXTURE_KEYS.platform) as Phaser.Physics.Arcade.Image;
      platform.setDisplaySize(config.width, config.height);
      platform.refreshBody();
    });
  }

  private createPlayer() {
    this.player = this.physics.add.image(START_X, START_Y, TEXTURE_KEYS.player);
    this.player.setTint(this.selectedCharacter.primaryColor);
    this.player.setDepth(20);
    this.player.setCollideWorldBounds(true);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 34, true);

    this.playerPlatformCollider = this.physics.add.collider(this.player, this.platforms);
  }

  private createBarrelMakerGoal() {
    this.barrelMakerGoal = this.add.zone(BARREL_MAKER_X, BARREL_MAKER_GOAL_Y, 124, 84);
    this.physics.add.existing(this.barrelMakerGoal, true);

    this.barrelMakerOverlap = this.physics.add.overlap(this.player, this.barrelMakerGoal, () => {
      this.completeLevel();
    });
  }

  private createBarrels() {
    this.barrels = this.physics.add.group({
      allowGravity: true,
      bounceX: 0,
      bounceY: 0,
      collideWorldBounds: false,
    });

    this.barrelPlatformCollider = this.physics.add.collider(this.barrels, this.platforms);
    this.barrelOverlap = this.physics.add.overlap(this.player, this.barrels, (_player, barrel) => {
      this.handleBarrelHit(barrel as Phaser.Physics.Arcade.Image);
    });

    this.barrelSpawnTimer = this.time.addEvent({
      delay: BARREL_SPAWN_MS,
      loop: true,
      callback: () => {
        if (this.levelComplete || this.outOfLives) return;
        BARREL_SPAWNERS.forEach((spawner, index) => {
          this.time.delayedCall(index * 120, () => {
            if (this.levelComplete || this.outOfLives) return;
            this.spawnBarrel(
              spawner.spawnX,
              spawner.spawnY,
              Phaser.Math.Between(BARREL_SPEED_MIN, BARREL_SPEED_MAX),
              spawner.direction,
            );
          });
        });
      },
    });
  }

  private spawnBarrel(
    spawnX = BARREL_SPAWNERS[0].spawnX,
    spawnY = BARREL_SPAWNERS[0].spawnY,
    rollSpeed = Phaser.Math.Between(BARREL_SPEED_MIN, BARREL_SPEED_MAX),
    direction: 1 | -1 = BARREL_SPAWNERS[0].direction,
  ) {
    const barrel = this.barrels.create(spawnX, spawnY, TEXTURE_KEYS.barrel) as Phaser.Physics.Arcade.Image;
    barrel.setDepth(18);
    barrel.setScale(1.04);
    barrel.setData("rollSpeed", rollSpeed);
    barrel.setData("rollDirection", direction);

    const body = barrel.body as Phaser.Physics.Arcade.Body;
    body.setCircle(16, 2, 2);
    body.setBounce(0.02, 0);
    body.setDragX(0);
    body.setVelocityX((barrel.getData("rollSpeed") as number) * direction);
  }

  private createHud() {
    this.hudText = this.add
      .text(18, GAME_HEIGHT - 32, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#fff0e4",
      })
      .setDepth(100);

    this.healthText = this.add
      .text(18, 86, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#ffe0e0",
        stroke: "#2b1412",
        strokeThickness: 5,
      })
      .setDepth(100);

    this.timerText = this.add
      .text(GAME_WIDTH - 18, 86, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#ffe8c5",
        stroke: "#2a1611",
        strokeThickness: 5,
      })
      .setOrigin(1, 0)
      .setDepth(100);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 62, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#fff6ec",
        stroke: "#120807",
        strokeThickness: 5,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(100);
  }

  private bindInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.cursors = keyboard.createCursorKeys();
    keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.ENTER]);
    this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.upKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.jumpKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.reviveKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  private updateHud() {
    const elapsedMs = (this.levelEndTime ?? this.time.now) - this.levelStartTime;

    this.healthText.setText(`Lives: ${this.livesRemaining}`);
    this.hudText.setText(`Character: ${this.selectedCharacter.name} | Goal: Barrel Maker`);
    this.timerText.setText(`Time: ${(elapsedMs / 1000).toFixed(1)}s`);
  }

  update() {
    if (this.levelComplete) {
      if (this.confirmKey && (Phaser.Input.Keyboard.JustDown(this.confirmKey) || this.confirmKey.isDown)) {
        this.startLevel8();
      }
      this.player.setVelocityX(0);
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
      this.player.setVelocityX(0);
      this.updateHud();
      return;
    }

    if (this.isMovementLocked()) {
      this.player.setVelocityX(0);
    } else {
      this.updateMovement();
    }
    this.updateBarrels();
    this.updateHud();
  }

  private isMovementLocked() {
    return this.time.now - this.levelStartTime < START_LOCK_MS;
  }

  private updateMovement() {
    const leftDown = (this.cursors?.left?.isDown ?? false) || (this.leftKey?.isDown ?? false);
    const rightDown = (this.cursors?.right?.isDown ?? false) || (this.rightKey?.isDown ?? false);

    let xVelocity = 0;
    const moveSpeed = Math.max(BASE_MOVE_SPEED, this.selectedCharacter.speed);
    if (leftDown) xVelocity -= moveSpeed;
    if (rightDown) xVelocity += moveSpeed;
    this.player.setVelocityX(xVelocity);

    if (xVelocity !== 0) {
      this.player.setFlipX(xVelocity < 0);
    }

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

  private updateBarrels() {
    this.getGroupChildrenSafe(this.barrels).forEach((child) => {
      const barrel = child as Phaser.Physics.Arcade.Image;
      const body = barrel.body as Phaser.Physics.Arcade.Body | undefined;
      if (!body) return;

      const rollSpeed = (barrel.getData("rollSpeed") as number | undefined) ?? BARREL_SPEED_MIN;
      const rollDirection = (barrel.getData("rollDirection") as 1 | -1 | undefined) ?? -1;
      const grounded = body.blocked.down || body.touching.down;
      if (grounded) {
        if (rollDirection === -1 && body.velocity.x > -rollSpeed) {
          body.setVelocityX(-rollSpeed);
        } else if (rollDirection === 1 && body.velocity.x < rollSpeed) {
          body.setVelocityX(rollSpeed);
        }
      }

      barrel.angle += (body.velocity.x * 0.08) * (this.game.loop.delta / 16.6667);

      if (barrel.x < -60 || barrel.x > GAME_WIDTH + 60 || barrel.y > GAME_HEIGHT + 80) {
        barrel.destroy();
      }
    });
  }

  private handleBarrelHit(barrel: Phaser.Physics.Arcade.Image) {
    if (this.levelComplete || this.outOfLives) return;
    if (this.time.now < this.damageCooldownUntil) return;

    this.damageCooldownUntil = this.time.now + HIT_INVULN_MS;
    const livesLeft = loseRunLife(this);
    this.livesRemaining = livesLeft;

    if (livesLeft <= 0) {
      this.outOfLives = true;
      this.levelEndTime = this.time.now;
      this.stopBarrels();
      this.player.setVelocity(0, 0);
      const gems = getGemCount(this);
      this.statusText.setText(
        gems >= REVIVE_GEM_COST
          ? `Out of lives. Press R to spend 1 gem (${gems} left) and restart, or ENTER to leave.`
          : `You can't play anymore. ${MAX_DEATHS} lives used. Press ENTER.`,
      );
      return;
    }

    this.resetAfterHit();
    this.statusText.setText(`You got crushed! Lives left: ${livesLeft}.`);
    this.time.delayedCall(950, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });
  }

  private resetAfterHit() {
    this.player.setPosition(START_X, START_Y);
    this.player.setVelocity(0, 0);
    this.cameras.main.shake(90, 0.004);
  }

  private completeLevel() {
    if (this.levelComplete || this.outOfLives) return;
    this.levelComplete = true;
    this.levelEndTime = this.time.now;
    this.stopBarrels();
    this.player.setVelocityX(0);
    this.statusText.setText("Level 7 complete! You reached the barrel maker. Press ENTER for Level 8.");
  }

  private startLevel8() {
    if (this.transitioningToLevel8) return;

    this.transitioningToLevel8 = true;
    this.scene.start("level-8", { characterId: this.selectedCharacter.id });
  }

  private stopBarrels() {
    if (this.barrelSpawnTimer) {
      this.barrelSpawnTimer.remove(false);
      this.barrelSpawnTimer = undefined;
    }

    this.getGroupChildrenSafe(this.barrels).forEach((child) => {
      const barrel = child as Phaser.Physics.Arcade.Image;
      barrel.setVelocity(0, 0);
    });
  }

  private getGroupChildrenSafe(group?: Phaser.Physics.Arcade.Group) {
    if (!group) return [] as Phaser.GameObjects.GameObject[];

    const maybeGroup = group as Phaser.Physics.Arcade.Group & {
      children?: { entries?: Phaser.GameObjects.GameObject[] };
    };
    return maybeGroup.children?.entries ?? [];
  }

  private clearGroupSafe(
    group?:
      | Phaser.Physics.Arcade.Group
      | Phaser.Physics.Arcade.StaticGroup,
  ) {
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
    if (this.barrelPlatformCollider) {
      this.barrelPlatformCollider.destroy();
      this.barrelPlatformCollider = undefined;
    }
    if (this.barrelOverlap) {
      this.barrelOverlap.destroy();
      this.barrelOverlap = undefined;
    }
    if (this.barrelMakerOverlap) {
      this.barrelMakerOverlap.destroy();
      this.barrelMakerOverlap = undefined;
    }
    if (this.barrelSpawnTimer) {
      this.barrelSpawnTimer.remove(false);
      this.barrelSpawnTimer = undefined;
    }

    this.clearGroupSafe(this.barrels);
    this.clearGroupSafe(this.platforms);
    this.barrelMakerGoal?.destroy();
    this.player?.destroy();
  }
}
