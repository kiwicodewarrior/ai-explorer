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

type Level4SceneData = {
  characterId?: CharacterId;
};

type PatrolDroneConfig = {
  x: number;
  y: number;
  axis: "x" | "y";
  travel: number;
  duration: number;
};

type WallSegment = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type EnergyCellConfig = {
  x: number;
  y: number;
};

const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 1080;
const PLAYER_START_X = 136;
const PLAYER_START_Y = WORLD_HEIGHT - 138;
const EXIT_X = WORLD_WIDTH - 154;
const EXIT_Y = 132;
const MAX_DEATHS = DEFAULT_RUN_LIVES;
const HIT_INVULN_MS = 800;
const TOTAL_CELLS = 4;
const EXTRA_DRONE_ROWS = 5;
const EXTRA_DRONE_COLUMNS = 10;//10,220,170,150,44,170
const EXTRA_DRONE_MARGIN_X = 220;
const EXTRA_DRONE_MARGIN_TOP = 170;
const EXTRA_DRONE_MARGIN_BOTTOM = 150;
const EXTRA_DRONE_ROW_STAGGER = 44;
const PLAYER_SPAWN_SAFE_RADIUS = 170;

const TEXTURE_KEYS = {
  wall: "level4-wall",
  player: "level4-player",
  drone: "level4-drone",
  cell: "level4-cell",
  portal: "level4-portal",
} as const;

const WALL_SEGMENTS: readonly WallSegment[] = [
  { x: 460, y: 420, width: 520, height: 40 },
  { x: 320, y: 700, width: 40, height: 240 },
  { x: 780, y: 770, width: 40, height: 360 },
  { x: 1040, y: 300, width: 40, height: 300 },
  { x: 1180, y: 920, width: 560, height: 40 },
  { x: 1440, y: 620, width: 560, height: 40 },
  { x: 1660, y: 820, width: 40, height: 240 },
  { x: 980, y: 200, width: 500, height: 40 },
] as const;

const ENERGY_CELLS: readonly EnergyCellConfig[] = [
  { x: 240, y: 220 },
  { x: 600, y: 790 },
  { x: 930, y: 108 },
  { x: 1730, y: 262 },
] as const;

const BASE_PATROL_DRONES: readonly PatrolDroneConfig[] = [
  { x: 480, y: 220, axis: "x", travel: 180, duration: 1700 },
  { x: 690, y: 600, axis: "y", travel: 220, duration: 1600 },
  { x: 1180, y: 340, axis: "x", travel: 240, duration: 1500 },
  { x: 1440, y: 770, axis: "y", travel: 190, duration: 1320 },
  { x: 1660, y: 420, axis: "y", travel: 220, duration: 1780 },
  { x: 980, y: 870, axis: "x", travel: 250, duration: 1580 },
  { x: 300, y: 520, axis: "y", travel: 170, duration: 1460 },
  { x: 860, y: 520, axis: "x", travel: 150, duration: 1360 },
  { x: 1320, y: 180, axis: "x", travel: 170, duration: 1440 },
  { x: 1560, y: 960, axis: "x", travel: 190, duration: 1520 },
] as const;

function getDistanceFromDronePathToPlayerSpawn(config: PatrolDroneConfig) {
  if (config.axis === "x") {
    const minX = config.x - config.travel;
    const maxX = config.x + config.travel;
    const nearestX = Phaser.Math.Clamp(PLAYER_START_X, minX, maxX);
    return Phaser.Math.Distance.Between(nearestX, config.y, PLAYER_START_X, PLAYER_START_Y);
  }

  const minY = config.y - config.travel;
  const maxY = config.y + config.travel;
  const nearestY = Phaser.Math.Clamp(PLAYER_START_Y, minY, maxY);
  return Phaser.Math.Distance.Between(config.x, nearestY, PLAYER_START_X, PLAYER_START_Y);
}

function moveDroneAwayFromPlayerSpawn(
  config: PatrolDroneConfig,
  xStep: number,
  yStep: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
) {
  if (getDistanceFromDronePathToPlayerSpawn(config) >= PLAYER_SPAWN_SAFE_RADIUS) {
    return config;
  }

  const shiftedX = Phaser.Math.Clamp(config.x + Math.max(xStep, config.travel + 120), xMin, xMax);
  const shiftedAlongX = { ...config, x: shiftedX };
  if (getDistanceFromDronePathToPlayerSpawn(shiftedAlongX) >= PLAYER_SPAWN_SAFE_RADIUS) {
    return shiftedAlongX;
  }

  const shiftedY = Phaser.Math.Clamp(config.y - Math.max(yStep / 2, 120), yMin, yMax);
  return { ...shiftedAlongX, y: shiftedY };
}

function buildExtraPatrolDrones(): PatrolDroneConfig[] {
  const drones: PatrolDroneConfig[] = [];
  const xMin = EXTRA_DRONE_MARGIN_X;
  const xMax = WORLD_WIDTH - EXTRA_DRONE_MARGIN_X;
  const yMin = EXTRA_DRONE_MARGIN_TOP;
  const yMax = WORLD_HEIGHT - EXTRA_DRONE_MARGIN_BOTTOM;
  const xStep = EXTRA_DRONE_COLUMNS > 1 ? (xMax - xMin) / (EXTRA_DRONE_COLUMNS - 1) : 0;
  const yStep = EXTRA_DRONE_ROWS > 1 ? (yMax - yMin) / (EXTRA_DRONE_ROWS - 1) : 0;

  for (let row = 0; row < EXTRA_DRONE_ROWS; row += 1) {
    for (let column = 0; column < EXTRA_DRONE_COLUMNS; column += 1) {
      const stagger = row % 2 === 0 ? 0 : EXTRA_DRONE_ROW_STAGGER;
      const x = Phaser.Math.Clamp(xMin + column * xStep + stagger, xMin, xMax);
      const y = yMin + row * yStep;
      const config = moveDroneAwayFromPlayerSpawn(
        {
          x,
          y,
          axis: (row + column) % 2 === 0 ? "x" : "y",
          travel: 110 + (column % 3) * 30,
          duration: 980 + row * 40 + column * 24,
        },
        xStep,
        yStep,
        xMin,
        xMax,
        yMin,
        yMax,
      );

      drones.push(config);
    }
  }

  return drones;
}

const PATROL_DRONES: readonly PatrolDroneConfig[] = [...BASE_PATROL_DRONES, ...buildExtraPatrolDrones()];

export class Level4Scene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private drones!: Phaser.Physics.Arcade.Group;
  private cells!: Phaser.Physics.Arcade.StaticGroup;
  private exitPortal!: Phaser.Physics.Arcade.Image;

  private playerWallCollider?: Phaser.Physics.Arcade.Collider;
  private droneOverlap?: Phaser.Physics.Arcade.Collider;
  private cellOverlap?: Phaser.Physics.Arcade.Collider;
  private exitOverlap?: Phaser.Physics.Arcade.Collider;
  private droneTweens: Phaser.Tweens.Tween[] = [];

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private upKey?: Phaser.Input.Keyboard.Key;
  private downKey?: Phaser.Input.Keyboard.Key;
  private aKey?: Phaser.Input.Keyboard.Key;
  private dKey?: Phaser.Input.Keyboard.Key;
  private wKey?: Phaser.Input.Keyboard.Key;
  private sKey?: Phaser.Input.Keyboard.Key;
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private reviveKey?: Phaser.Input.Keyboard.Key;

  private hudText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  private livesRemaining = DEFAULT_RUN_LIVES;
  private outOfLives = false;
  private levelComplete = false;
  private damageCooldownUntil = 0;
  private levelStartTime = 0;
  private levelEndTime?: number;
  private collectedCells = 0;
  private portalUnlocked = false;

  constructor() {
    super("level-4");
  }

  create(data: Level4SceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.outOfLives = this.livesRemaining <= 0;
    this.levelComplete = false;
    this.damageCooldownUntil = 0;
    this.levelEndTime = undefined;
    this.collectedCells = 0;
    this.portalUnlocked = false;
    this.droneTweens = [];

    this.physics.world.gravity.y = 0;
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.cameras.main.setBackgroundColor(0x081220);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createWalls();
    this.createCells();
    this.createExitPortal();
    this.createDrones();
    this.createPlayer();
    this.createHud();
    this.bindInput();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(220, 120);

    this.levelStartTime = this.time.now;
    this.statusText.setText("Collect all diamonds, then escape through the portal.");
    this.time.delayedCall(1800, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });
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
    if (!this.textures.exists(TEXTURE_KEYS.wall)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x16304f, 1);
      g.fillRoundedRect(0, 0, 64, 64, 10);
      g.fillStyle(0x28537a, 1);
      g.fillRoundedRect(4, 4, 56, 12, 6);
      g.fillStyle(0x6df2ff, 0.16);
      g.fillRoundedRect(8, 22, 48, 34, 6);
      g.generateTexture(TEXTURE_KEYS.wall, 64, 64);
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

    if (!this.textures.exists(TEXTURE_KEYS.drone)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x57d5ff, 0.2);
      g.fillCircle(24, 24, 22);
      g.fillStyle(0x9ff4ff, 1);
      g.fillCircle(24, 24, 14);
      g.fillStyle(0x17324d, 1);
      g.fillCircle(24, 24, 6);
      g.lineStyle(2, 0xffffff, 0.7);
      g.strokeCircle(24, 24, 17);
      g.generateTexture(TEXTURE_KEYS.drone, 48, 48);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.cell)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x7bf3ff, 0.18);
      g.fillCircle(20, 20, 18);
      g.fillStyle(0xc9fbff, 1);
      g.fillTriangle(20, 2, 34, 18, 20, 38);
      g.fillTriangle(20, 38, 6, 18, 20, 2);
      g.fillStyle(0x42a9c9, 0.8);
      g.fillTriangle(20, 9, 28, 18, 20, 30);
      g.fillTriangle(20, 30, 12, 18, 20, 9);
      g.generateTexture(TEXTURE_KEYS.cell, 40, 40);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.portal)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x6efff6, 0.12);
      g.fillEllipse(32, 32, 52, 52);
      g.lineStyle(5, 0x8cf8ff, 0.85);
      g.strokeEllipse(32, 32, 46, 46);
      g.lineStyle(2, 0xffffff, 0.45);
      g.strokeEllipse(32, 32, 30, 30);
      g.generateTexture(TEXTURE_KEYS.portal, 64, 64);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x081220);
    this.add.rectangle(WORLD_WIDTH / 2, 140, WORLD_WIDTH, 220, 0x0f223b, 0.92);
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT - 120, WORLD_WIDTH, 240, 0x091827, 0.92);

    for (let x = 0; x <= WORLD_WIDTH; x += 96) {
      this.add.rectangle(x, WORLD_HEIGHT / 2, 2, WORLD_HEIGHT, 0x1d4062, 0.16).setDepth(0);
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += 96) {
      this.add.rectangle(WORLD_WIDTH / 2, y, WORLD_WIDTH, 2, 0x1d4062, 0.16).setDepth(0);
    }

    this.add.ellipse(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH * 0.9, WORLD_HEIGHT * 0.7, 0x1a3656, 0.2);
    this.add.ellipse(1360, 260, 420, 240, 0x2b6a7e, 0.12);
    this.add.ellipse(400, 860, 520, 260, 0x2b6a7e, 0.1);

    this.add
      .text(GAME_WIDTH / 2, 36, "Level 4: Reactor Vault", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f4f8ff",
        stroke: "#07111f",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(40);

    this.add
      .text(GAME_WIDTH / 2, 72, "Collect every diamond, dodge the drones, then escape.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "19px",
        color: "#cbe1ff",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(40);
  }

  private createWalls() {
    this.walls = this.physics.add.staticGroup();

    WALL_SEGMENTS.forEach((segment) => {
      const wall = this.walls.create(segment.x, segment.y, TEXTURE_KEYS.wall) as Phaser.Physics.Arcade.Image;
      wall.setDisplaySize(segment.width, segment.height);
      wall.setDepth(12);
      wall.refreshBody();
    });
  }

  private createCells() {
    this.cells = this.physics.add.staticGroup();

    ENERGY_CELLS.forEach((config) => {
      const cell = this.cells.create(config.x, config.y, TEXTURE_KEYS.cell) as Phaser.Physics.Arcade.Image;
      cell.setDepth(14);
      cell.setScale(1.05);
      cell.refreshBody();
    });
  }

  private createExitPortal() {
    this.exitPortal = this.physics.add.staticImage(EXIT_X, EXIT_Y, TEXTURE_KEYS.portal);
    this.exitPortal.setDepth(16);
    this.exitPortal.setScale(1.1);
    this.exitPortal.setTint(0x4d6c88);
    this.exitPortal.setAlpha(0.38);
    this.exitPortal.refreshBody();
  }

  private createDrones() {
    this.drones = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    PATROL_DRONES.forEach((config) => {
      const drone = this.drones.create(config.x, config.y, TEXTURE_KEYS.drone) as Phaser.Physics.Arcade.Image;
      drone.setDepth(18);
      drone.setCircle(18, 6, 6);
      drone.setImmovable(true);

      const body = drone.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.moves = false;

      const tweenProps =
        config.axis === "x"
          ? { x: { from: config.x - config.travel, to: config.x + config.travel } }
          : { y: { from: config.y - config.travel, to: config.y + config.travel } };

      this.droneTweens.push(
        this.tweens.add({
          targets: drone,
          ...tweenProps,
          duration: config.duration,
          yoyo: true,
          repeat: -1,
          ease: "Sine.inOut",
          onUpdate: () => {
            body.updateFromGameObject();
          },
        }),
      );

      this.droneTweens.push(
        this.tweens.add({
          targets: drone,
          angle: 360,
          duration: 950,
          repeat: -1,
          ease: "Linear",
        }),
      );
    });
  }

  private createPlayer() {
    this.player = this.physics.add.image(PLAYER_START_X, PLAYER_START_Y, TEXTURE_KEYS.player);
    this.player.setTint(this.selectedCharacter.primaryColor);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(20);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(24, 34, true);

    this.playerWallCollider = this.physics.add.collider(this.player, this.walls);
    this.droneOverlap = this.physics.add.overlap(this.player, this.drones, () => {
      this.handleHazard("Security drone hit!");
    });
    this.cellOverlap = this.physics.add.overlap(this.player, this.cells, (_player, cell) => {
      this.collectCell(cell as Phaser.Physics.Arcade.Image);
    });
    this.exitOverlap = this.physics.add.overlap(this.player, this.exitPortal, () => {
      this.tryCompleteLevel();
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
      .setDepth(40);

    this.healthText = this.add
      .text(18, 86, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#ffe0e0",
        stroke: "#20142d",
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(40);

    this.timerText = this.add
      .text(GAME_WIDTH - 18, GAME_HEIGHT - 32, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f2f6ff",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(40);

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
      .setDepth(40);
  }

  private bindInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.cursors = keyboard.createCursorKeys();
    this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.upKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.aKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.dKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.wKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.sKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.reviveKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  private updateHud() {
    const elapsedMs = (this.levelEndTime ?? this.time.now) - this.levelStartTime;
    const portalLabel = this.portalUnlocked ? "Open" : "Locked";

    this.healthText.setText(`Lives: ${this.livesRemaining}`);
    this.hudText.setText(
      `Character: ${this.selectedCharacter.name} | Diamonds: ${this.collectedCells}/${TOTAL_CELLS} | Portal: ${portalLabel}`,
    );
    this.timerText.setText(`Time: ${(elapsedMs / 1000).toFixed(1)}s`);
  }

  update() {
    if (this.levelComplete) {
      if (this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
        this.scene.start("level-5", { characterId: this.selectedCharacter.id });
      }
      this.player.setVelocity(0, 0);
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
      this.player.setVelocity(0, 0);
      this.updateHud();
      return;
    }

    this.updateMovement();
    this.updateHud();
  }

  private updateMovement() {
    let moveX = 0;
    let moveY = 0;

    if ((this.cursors?.left?.isDown ?? false) || (this.leftKey?.isDown ?? false) || (this.aKey?.isDown ?? false)) {
      moveX -= 1;
    }
    if ((this.cursors?.right?.isDown ?? false) || (this.rightKey?.isDown ?? false) || (this.dKey?.isDown ?? false)) {
      moveX += 1;
    }
    if ((this.cursors?.up?.isDown ?? false) || (this.upKey?.isDown ?? false) || (this.wKey?.isDown ?? false)) {
      moveY -= 1;
    }
    if ((this.cursors?.down?.isDown ?? false) || (this.downKey?.isDown ?? false) || (this.sKey?.isDown ?? false)) {
      moveY += 1;
    }

    if (moveX === 0 && moveY === 0) {
      this.player.setVelocity(0, 0);
      return;
    }

    const velocity = new Phaser.Math.Vector2(moveX, moveY).normalize().scale(Math.max(220, this.selectedCharacter.speed));
    this.player.setVelocity(velocity.x, velocity.y);

    if (moveX !== 0) {
      this.player.setFlipX(moveX < 0);
    }
  }

  private collectCell(cell: Phaser.Physics.Arcade.Image) {
    if (this.levelComplete || this.outOfLives || !cell.active) return;

    this.tweens.killTweensOf(cell);
    cell.destroy();
    this.collectedCells += 1;
    this.cameras.main.shake(90, 0.0016);
    this.tweens.add({
      targets: this.player,
      scaleX: { from: this.player.scaleX, to: this.player.scaleX + 0.08 },
      scaleY: { from: this.player.scaleY, to: this.player.scaleY + 0.08 },
      duration: 90,
      yoyo: true,
      ease: "Sine.easeOut",
    });

    if (this.collectedCells >= TOTAL_CELLS) {
      this.unlockPortal();
      return;
    }

    this.statusText.setText(`Diamond collected! ${this.collectedCells}/${TOTAL_CELLS} secured.`);
    this.time.delayedCall(900, () => {
      if (!this.levelComplete && !this.outOfLives && !this.portalUnlocked) this.statusText.setText("");
    });
  }

  private unlockPortal() {
    if (this.portalUnlocked) return;

    this.portalUnlocked = true;
    this.exitPortal.setTint(0xb7fcff);
    this.exitPortal.setAlpha(0.92);
    this.statusText.setText("All diamonds collected. Reach the exit.");
    this.cameras.main.shake(160, 0.004);

    this.tweens.add({
      targets: this.exitPortal,
      alpha: { from: 0.8, to: 1 },
      scale: { from: 1.04, to: 1.18 },
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  private tryCompleteLevel() {
    if (this.levelComplete || this.outOfLives) return;

    if (!this.portalUnlocked) {
      this.statusText.setText(`Collect all diamonds first. ${this.collectedCells}/${TOTAL_CELLS} found.`);
      this.time.delayedCall(950, () => {
        if (!this.levelComplete && !this.outOfLives && !this.portalUnlocked) this.statusText.setText("");
      });
      return;
    }

    this.levelComplete = true;
    this.levelEndTime = this.time.now;
    this.player.setVelocity(0, 0);
    this.statusText.setText("Level 4 complete! Press ENTER for Level 5.");
    this.cameras.main.flash(200, 210, 255, 255);
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
    this.statusText.setText(`You were knocked out! Lives left: ${livesLeft}.`);
    this.time.delayedCall(950, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });
  }

  private respawnPlayer() {
    this.player.setPosition(PLAYER_START_X, PLAYER_START_Y);
    this.player.setVelocity(0, 0);
    this.cameras.main.shake(100, 0.004);
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
    if (this.playerWallCollider) {
      this.playerWallCollider.destroy();
      this.playerWallCollider = undefined;
    }
    if (this.droneOverlap) {
      this.droneOverlap.destroy();
      this.droneOverlap = undefined;
    }
    if (this.cellOverlap) {
      this.cellOverlap.destroy();
      this.cellOverlap = undefined;
    }
    if (this.exitOverlap) {
      this.exitOverlap.destroy();
      this.exitOverlap = undefined;
    }

    this.droneTweens.forEach((tween) => tween.remove());
    this.droneTweens = [];

    this.clearGroupSafe(this.walls);
    this.clearGroupSafe(this.drones);
    this.clearGroupSafe(this.cells);
    this.exitPortal?.destroy();
  }
}
