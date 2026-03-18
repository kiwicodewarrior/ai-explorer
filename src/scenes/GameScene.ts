import Phaser from "phaser";
import {
  CHARACTER_OPTIONS,
  DEFAULT_CHARACTER_ID,
  GAME_HEIGHT,
  GAME_WIDTH,
  LEVEL1_CONFIG,
  type CharacterConfig,
  type CharacterId,
} from "../config";

type LaneConfig = {
  y: number;
  direction: 1 | -1;
  speed: number;
  tint: number;
};

type LilyPad = {
  x: number;
  y: number;
  radius: number;
};

type GameSceneData = {
  characterId?: CharacterId;
};

const TOP_SAFE_BOTTOM = LEVEL1_CONFIG.topSafeHeight;
const LAKE_TOP = LEVEL1_CONFIG.lakeTop;
const LAKE_BOTTOM = LEVEL1_CONFIG.lakeBottom;
const ROAD_TOP = LAKE_BOTTOM;
const ROAD_BOTTOM = GAME_HEIGHT - LEVEL1_CONFIG.bottomSafeHeight;
const START_Y = GAME_HEIGHT - LEVEL1_CONFIG.bottomSafeHeight / 2;
const CAR_MIN_GAP = LEVEL1_CONFIG.carWidth + 64;
const EXTRA_START_CARS = 8;
const SHARK_SPAWN_MS = 2_000;
const INITIAL_MIDDLE_SHARK_COUNT = 8;
const SHARK_MIN_GAP = 72;
const SHARK_SPAWN_ATTEMPTS = 18;
const MIDDLE_SHARK_SPAWN_ATTEMPTS = 40;
const MIDDLE_SHARK_MIN_X = 140;
const MIDDLE_SHARK_MAX_X = GAME_WIDTH - 140;
const MAX_DEATHS = 3;
const LANE_COLORS = [0xff8b8b, 0xffca85, 0x9ee08f, 0x7db6ff, 0xd3a1ff];

export class GameScene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private cars!: Phaser.Physics.Arcade.Group;
  private sharks!: Phaser.Physics.Arcade.Group;
  private carOverlap?: Phaser.Physics.Arcade.Collider;
  private sharkOverlap?: Phaser.Physics.Arcade.Collider;
  private sharkSpawnTimer?: Phaser.Time.TimerEvent;
  private laneConfigs: LaneConfig[] = [];
  private lilyPads: LilyPad[] = [];
  private laneSpawnTimers: Phaser.Time.TimerEvent[] = [];

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private jumpKey?: Phaser.Input.Keyboard.Key;
  private upKey?: Phaser.Input.Keyboard.Key;
  private downKey?: Phaser.Input.Keyboard.Key;
  private backKey?: Phaser.Input.Keyboard.Key;
  private restartKey?: Phaser.Input.Keyboard.Key;
  private retryKey?: Phaser.Input.Keyboard.Key;

  private hudText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  private health = 3;
  private levelStartTime = 0;
  private levelEndTime?: number;
  private isJumping = false;
  private levelComplete = false;
  private levelFailed = false;
  private outOfLives = false;
  private deathCount = 0;
  private transitioningToLevel2 = false;
  private levelCompleteEnterHandler?: (event: KeyboardEvent) => void;
  private levelCompleteNumpadHandler?: (event: KeyboardEvent) => void;
  private sectionsCleared = 0;
  private readonly sectionsToClear = 3;

  constructor() {
    super("game");
  }

  create(data: GameSceneData = {}) {
    this.cameras.main.setBackgroundColor(0x8fc7ff);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.selectedCharacter = this.resolveCharacter(data.characterId);
    this.health = this.selectedCharacter.maxHealth;
    this.outOfLives = false;
    this.deathCount = 0;
    this.transitioningToLevel2 = false;
    this.levelCompleteEnterHandler = undefined;
    this.levelCompleteNumpadHandler = undefined;
    this.sectionsCleared = 0;

    this.createTextures();
    this.drawLevelOneBackground();
    this.createPlayer();
    this.createHud();
    this.bindInput();
    this.createTraffic();
    this.createLakeSharks();

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
    this.createCarTexture();
    this.createSharkTexture();
    this.createKnightTexture();
    this.createDogTexture();
    this.createOfficerTexture();
  }

  private createCarTexture() {
    const key = "level1-car";
    if (this.textures.exists(key)) return;

    const g = this.add.graphics({ x: 0, y: 0 });
    g.setVisible(false);

    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 6, LEVEL1_CONFIG.carWidth, LEVEL1_CONFIG.carHeight - 6, 10);
    g.fillStyle(0x2f3f5f, 1);
    g.fillRoundedRect(14, 0, 44, 16, 6);
    g.fillStyle(0x1d273f, 1);
    g.fillCircle(16, LEVEL1_CONFIG.carHeight + 2, 6);
    g.fillCircle(LEVEL1_CONFIG.carWidth - 16, LEVEL1_CONFIG.carHeight + 2, 6);

    g.generateTexture(key, LEVEL1_CONFIG.carWidth, LEVEL1_CONFIG.carHeight + 8);
    g.destroy();
  }

  private createSharkTexture() {
    const key = "lake-shark";
    if (this.textures.exists(key)) return;

    const g = this.add.graphics({ x: 0, y: 0 });
    g.setVisible(false);

    g.fillStyle(0x64758a, 1);
    g.fillEllipse(32, 17, 52, 24);
    g.fillTriangle(14, 17, 0, 10, 0, 24);
    g.fillTriangle(30, 10, 38, -1, 46, 10);
    g.fillStyle(0xdce7f1, 0.95);
    g.fillEllipse(34, 21, 24, 10);
    g.fillStyle(0x1a2430, 1);
    g.fillCircle(43, 14, 2);

    g.generateTexture(key, 64, 34);
    g.destroy();
  }

  private createKnightTexture() {
    const key = "runner-knight";
    if (this.textures.exists(key)) return;

    const g = this.add.graphics({ x: 0, y: 0 });
    g.setVisible(false);

    g.fillStyle(0xd5d8e7, 1);
    g.fillRoundedRect(10, 2, 20, 12, 4);
    g.fillStyle(0x7384d9, 1);
    g.fillRoundedRect(8, 14, 24, 24, 5);
    g.fillStyle(0xf5d77a, 1);
    g.fillRect(18, 16, 4, 20);
    g.fillStyle(0x36436f, 1);
    g.fillRect(10, 38, 8, 8);
    g.fillRect(22, 38, 8, 8);

    g.generateTexture(key, 40, 48);
    g.destroy();
  }

  private createDogTexture() {
    const key = "runner-dog";
    if (this.textures.exists(key)) return;

    const g = this.add.graphics({ x: 0, y: 0 });
    g.setVisible(false);

    g.fillStyle(0x9f6a3d, 1);
    g.fillCircle(10, 12, 7);
    g.fillCircle(30, 12, 7);
    g.fillStyle(0xc69352, 1);
    g.fillEllipse(20, 19, 26, 21);
    g.fillStyle(0x6e4728, 1);
    g.fillRect(10, 30, 6, 14);
    g.fillRect(24, 30, 6, 14);
    g.fillStyle(0x2a221c, 1);
    g.fillCircle(15, 19, 2);
    g.fillCircle(25, 19, 2);

    g.generateTexture(key, 40, 48);
    g.destroy();
  }

  private createOfficerTexture() {
    const key = "runner-officer";
    if (this.textures.exists(key)) return;

    const g = this.add.graphics({ x: 0, y: 0 });
    g.setVisible(false);

    g.fillStyle(0x253f77, 1);
    g.fillRoundedRect(9, 5, 22, 8, 3);
    g.fillStyle(0xffd8b8, 1);
    g.fillCircle(20, 18, 9);
    g.fillStyle(0x3c6ec9, 1);
    g.fillRoundedRect(8, 26, 24, 14, 4);
    g.fillStyle(0xffdc77, 1);
    g.fillRect(18, 28, 4, 9);
    g.fillStyle(0x243962, 1);
    g.fillRect(10, 40, 8, 7);
    g.fillRect(22, 40, 8, 7);

    g.generateTexture(key, 40, 48);
    g.destroy();
  }

  private getTextureForCharacter(characterId: CharacterId) {
    if (characterId === "dog") return "runner-dog";
    if (characterId === "officer") return "runner-officer";
    return "runner-knight";
  }

  private drawLevelOneBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x8fc7ff);
    this.add.rectangle(GAME_WIDTH / 2, TOP_SAFE_BOTTOM / 2, GAME_WIDTH, TOP_SAFE_BOTTOM, 0x7cc67b);
    this.add.rectangle(
      GAME_WIDTH / 2,
      (LAKE_TOP + LAKE_BOTTOM) / 2,
      GAME_WIDTH,
      LAKE_BOTTOM - LAKE_TOP,
      0x319dd2,
      0.95,
    );
    this.add.rectangle(GAME_WIDTH / 2, (ROAD_TOP + ROAD_BOTTOM) / 2, GAME_WIDTH, ROAD_BOTTOM - ROAD_TOP, 0x353741);
    this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT - LEVEL1_CONFIG.bottomSafeHeight / 2,
      GAME_WIDTH,
      LEVEL1_CONFIG.bottomSafeHeight,
      0x84cd7e,
    );

    for (let index = 0; index < 6; index += 1) {
      const y = LAKE_TOP + 16 + index * 20;
      this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH, 2, 0x64bee8, 0.45);
    }

    const laneHeight = (ROAD_BOTTOM - ROAD_TOP) / LEVEL1_CONFIG.roadLaneCount;
    for (let index = 1; index < LEVEL1_CONFIG.roadLaneCount; index += 1) {
      const y = ROAD_TOP + laneHeight * index;
      this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH, 2, 0x52576b);
    }

    this.createLilyPads();

    this.add
      .text(GAME_WIDTH / 2, 26, "Level 1: Cross the Road", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f6f7ff",
        stroke: "#102341",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, TOP_SAFE_BOTTOM / 2, "GOAL", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "24px",
        color: "#174525",
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, (LAKE_TOP + LAKE_BOTTOM) / 2, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "19px",
        color: "#d6f3ff",
        stroke: "#0f4d69",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
  }

  private createLilyPads() {
    const rows = [
      { y: LAKE_BOTTOM - 30, xs: [150, 370, 590, 810] },
      { y: LAKE_TOP + 32, xs: [150, 370, 590, 810] },
    ];

    rows.forEach((row) => {
      row.xs.forEach((x) => {
        this.add.ellipse(x, row.y, 58, 42, 0x5caf54, 0.95).setStrokeStyle(3, 0x2f7e2d, 1);
        this.add.ellipse(x + 8, row.y - 3, 21, 15, 0x7ed67b, 0.7);
        this.lilyPads.push({ x, y: row.y, radius: LEVEL1_CONFIG.lilyPadRadius });
      });
    });
  }

  private createPlayer() {
    const textureKey = this.getTextureForCharacter(this.selectedCharacter.id);
    this.player = this.physics.add.image(GAME_WIDTH / 2, START_Y, textureKey);
    this.player.setCollideWorldBounds(true);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(24, 32, true);
  }

  private createHud() {
    this.hudText = this.add.text(18, GAME_HEIGHT - 30, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "18px",
      color: "#f2f6ff",
    });

    this.timerText = this.add
      .text(GAME_WIDTH - 18, GAME_HEIGHT - 30, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f2f6ff",
      })
      .setOrigin(1, 0);

    this.healthText = this.add.text(18, 52, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "22px",
      color: "#ffe0e0",
      stroke: "#2d1230",
      strokeThickness: 4,
    });

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 58, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#fff5c7",
        stroke: "#1f243d",
        strokeThickness: 5,
      })
      .setOrigin(0.5);
  }

  private bindInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.cursors = keyboard.createCursorKeys();
    this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.jumpKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.upKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.downKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.backKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.restartKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.retryKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.ENTER]);
  }

  private createTraffic() {
    if (this.carOverlap) {
      this.carOverlap.destroy();
      this.carOverlap = undefined;
    }

    this.laneConfigs.length = 0;
    if (this.cars) {
      this.cars.clear(true, true);
    } else {
      this.cars = this.physics.add.group({
        allowGravity: false,
        immovable: true,
      });
    }

    const laneHeight = (ROAD_BOTTOM - ROAD_TOP) / LEVEL1_CONFIG.roadLaneCount;
    const speedBoost = this.sectionsCleared * 6;

    for (let laneIndex = 0; laneIndex < LEVEL1_CONFIG.roadLaneCount; laneIndex += 1) {
      const direction: 1 | -1 = laneIndex % 2 === 0 ? 1 : -1;
      const y = ROAD_TOP + laneHeight * (laneIndex + 0.5);
      const speed = Phaser.Math.Between(LEVEL1_CONFIG.carMinSpeed, LEVEL1_CONFIG.carMaxSpeed) + speedBoost;
      const tint = LANE_COLORS[laneIndex % LANE_COLORS.length];
      const laneConfig: LaneConfig = { y, direction, speed, tint };
      this.laneConfigs.push(laneConfig);
    }

    this.spawnRandomCarWave();
    this.spawnRandomCars(EXTRA_START_CARS);
    this.scheduleRandomBurstInWindow(LEVEL1_CONFIG.carSpawnMs, 8);
    const timer = this.time.addEvent({
      delay: LEVEL1_CONFIG.carSpawnMs,
      loop: true,
      callback: () => {
        if (this.levelComplete || this.levelFailed) return;
        this.spawnRandomCarWave();
      },
    });
    this.laneSpawnTimers.push(timer);
    const randomBurstTimer = this.time.addEvent({
      delay: LEVEL1_CONFIG.carSpawnMs,
      loop: true,
      callback: () => {
        if (this.levelComplete || this.levelFailed) return;
        this.scheduleRandomBurstInWindow(LEVEL1_CONFIG.carSpawnMs, 8);
      },
    });
    this.laneSpawnTimers.push(randomBurstTimer);
    const bonusTimer = this.time.addEvent({
      delay: 1_000,
      loop: true,
      callback: () => {
        if (this.levelComplete || this.levelFailed) return;
        this.spawnRandomCars(2);
      },
    });
    this.laneSpawnTimers.push(bonusTimer);

    this.carOverlap = this.physics.add.overlap(this.player, this.cars, () => this.handleCarHit(), undefined, this);
  }

  private createLakeSharks() {
    if (this.sharkOverlap) {
      this.sharkOverlap.destroy();
      this.sharkOverlap = undefined;
    }
    if (this.sharkSpawnTimer) {
      this.sharkSpawnTimer.remove(false);
      this.sharkSpawnTimer = undefined;
    }

    if (this.sharks) {
      this.sharks.clear(true, true);
    } else {
      this.sharks = this.physics.add.group({
        allowGravity: false,
        immovable: true,
      });
    }

    for (let index = 0; index < INITIAL_MIDDLE_SHARK_COUNT; index += 1) {
      this.spawnMiddleLakeShark();
    }
    this.sharkSpawnTimer = this.time.addEvent({
      delay: SHARK_SPAWN_MS,
      loop: true,
      callback: () => {
        if (this.levelComplete || this.levelFailed) return;
        this.spawnShark();
      },
    });

    this.sharkOverlap = this.physics.add.overlap(this.player, this.sharks, () => this.handleSharkHit(), undefined, this);
  }

  private spawnShark(directionOverride?: 1 | -1) {
    const direction = directionOverride ?? (Phaser.Math.Between(0, 1) === 0 ? 1 : -1);
    const spawnPoint = this.getSafeSharkSpawnPoint(direction);
    if (!spawnPoint) return;

    const speed = Phaser.Math.Between(85, 130);

    const shark = this.physics.add.image(spawnPoint.x, spawnPoint.y, "lake-shark");
    shark.setImmovable(true).setFlipX(direction < 0);
    this.sharks.add(shark);

    const body = shark.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocityX(direction * speed);
    body.setSize(46, 20, true);
    body.setOffset(9, 8);
  }

  private spawnMiddleLakeShark() {
    const spawnPoint = this.getSafeMiddleLakeSharkSpawnPoint();
    if (!spawnPoint) return;

    const direction: 1 | -1 = Phaser.Math.Between(0, 1) === 0 ? 1 : -1;
    const speed = Phaser.Math.Between(85, 130);

    const shark = this.physics.add.image(spawnPoint.x, spawnPoint.y, "lake-shark");
    shark.setImmovable(true).setFlipX(direction < 0);
    this.sharks.add(shark);

    const body = shark.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocityX(direction * speed);
    body.setSize(46, 20, true);
    body.setOffset(9, 8);
  }

  private getSafeMiddleLakeSharkSpawnPoint(ignoreShark?: Phaser.Physics.Arcade.Image) {
    for (let attempt = 0; attempt < MIDDLE_SHARK_SPAWN_ATTEMPTS; attempt += 1) {
      const x = Phaser.Math.Between(MIDDLE_SHARK_MIN_X, MIDDLE_SHARK_MAX_X);
      const y = Phaser.Math.Between(LAKE_TOP + 18, LAKE_BOTTOM - 18);
      if (this.isSharkPositionSafe(x, y, ignoreShark)) {
        return { x, y };
      }
    }

    return undefined;
  }

  private getSafeSharkSpawnPoint(direction: 1 | -1, ignoreShark?: Phaser.Physics.Arcade.Image) {
    const minX = direction === 1 ? -240 : GAME_WIDTH + 70;
    const maxX = direction === 1 ? -70 : GAME_WIDTH + 240;

    for (let attempt = 0; attempt < SHARK_SPAWN_ATTEMPTS; attempt += 1) {
      const x = Phaser.Math.Between(minX, maxX);
      const y = Phaser.Math.Between(LAKE_TOP + 18, LAKE_BOTTOM - 18);
      if (this.isSharkPositionSafe(x, y, ignoreShark)) {
        return { x, y };
      }
    }

    return undefined;
  }

  private isSharkPositionSafe(x: number, y: number, ignoreShark?: Phaser.Physics.Arcade.Image) {
    if (!this.sharks) return true;

    return this.getGroupChildrenSafe(this.sharks).every((child) => {
      const shark = child as Phaser.Physics.Arcade.Image;
      if (!shark.active) return true;
      if (ignoreShark && shark === ignoreShark) return true;
      return Phaser.Math.Distance.Between(x, y, shark.x, shark.y) >= SHARK_MIN_GAP;
    });
  }

  private spawnRandomCarWave() {
    this.spawnRandomCars(Phaser.Math.Between(5, 6));
  }

  private spawnRandomCars(countToSpawn: number) {
    for (let count = 0; count < countToSpawn; count += 1) {
      const laneIndex = Phaser.Math.Between(0, this.laneConfigs.length - 1);
      const lane = this.laneConfigs[laneIndex];
      const direction: 1 | -1 = Phaser.Math.Between(0, 1) === 0 ? 1 : -1;
      const spawnOffset = Phaser.Math.Between(0, 260);
      this.spawnCar(lane, spawnOffset, direction);
    }
  }

  private scheduleRandomBurstInWindow(windowMs: number, carsToSpawn: number) {
    for (let count = 0; count < carsToSpawn; count += 1) {
      const event = this.time.delayedCall(Phaser.Math.Between(0, windowMs), () => {
        if (this.levelComplete || this.levelFailed) return;
        this.spawnRandomCars(1);
      });
      this.laneSpawnTimers.push(event);
    }
  }

  private spawnCar(lane: LaneConfig, spawnOffset = 0, directionOverride?: 1 | -1) {
    const carWidth = LEVEL1_CONFIG.carWidth;
    const direction = directionOverride ?? lane.direction;
    const baseX = direction === 1 ? -carWidth - spawnOffset : GAME_WIDTH + carWidth + spawnOffset;
    const safeX = this.getSafeSpawnX(lane.y, direction, baseX);
    const car = this.physics.add.image(safeX, lane.y, "level1-car");
    car.setImmovable(true).setTint(lane.tint);
    this.cars.add(car);

    const body = car.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocityX(direction * lane.speed);
    body.setSize(LEVEL1_CONFIG.carWidth - 8, LEVEL1_CONFIG.carHeight, true);
  }

  private getSafeSpawnX(laneY: number, direction: 1 | -1, initialX: number) {
    if (!this.cars) return initialX;

    let boundary = direction === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    this.getGroupChildrenSafe(this.cars).forEach((child) => {
      const car = child as Phaser.Physics.Arcade.Image;
      const body = car.body as Phaser.Physics.Arcade.Body | undefined;
      if (!body || body.velocity.x === 0) return;
      if (Math.abs(car.y - laneY) > 1) return;

      const carDirection: 1 | -1 = body.velocity.x > 0 ? 1 : -1;
      if (carDirection !== direction) return;

      if (direction === 1) {
        boundary = Math.min(boundary, car.x);
      } else {
        boundary = Math.max(boundary, car.x);
      }
    });

    if (direction === 1) {
      return Number.isFinite(boundary) ? Math.min(initialX, boundary - CAR_MIN_GAP) : initialX;
    }

    return Number.isFinite(boundary) ? Math.max(initialX, boundary + CAR_MIN_GAP) : initialX;
  }

  private handleCarHit() {
    this.takeDamage("Hit by traffic! Be careful.");
  }

  private handleSharkHit() {
    this.killPlayer("Shark attack! You died and respawned at start.", true);
  }

  private failLevel() {
    if (this.levelFailed) return;

    this.levelFailed = true;
    this.levelEndTime = this.time.now;
    this.stopTraffic();
    this.player.setPosition(GAME_WIDTH / 2, START_Y);
    this.player.setVelocity(0, 0);
    this.isJumping = false;
    this.statusText.setText("Out of health. Press R or ENTER to retry.");
  }

  private completeLevel() {
    if (this.levelComplete) return;

    this.levelComplete = true;
    this.levelEndTime = this.time.now;
    this.stopTraffic();
    this.stopSharks();
    this.player.setVelocity(0, 0);
    this.statusText.setText("Level 1 complete! Press ENTER for Level 2.");

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.levelCompleteEnterHandler = () => {
        this.startLevelTwo();
      };
      this.levelCompleteNumpadHandler = (event: KeyboardEvent) => {
        if (event.code !== "NumpadEnter") return;
        this.startLevelTwo();
      };
      keyboard.on("keydown-ENTER", this.levelCompleteEnterHandler);
      keyboard.on("keydown", this.levelCompleteNumpadHandler);
    }
  }

  private startLevelTwo() {
    if (this.transitioningToLevel2) return;
    this.transitioningToLevel2 = true;

    const keyboard = this.input.keyboard;
    if (keyboard && this.levelCompleteEnterHandler) {
      keyboard.off("keydown-ENTER", this.levelCompleteEnterHandler);
      this.levelCompleteEnterHandler = undefined;
    }
    if (keyboard && this.levelCompleteNumpadHandler) {
      keyboard.off("keydown", this.levelCompleteNumpadHandler);
      this.levelCompleteNumpadHandler = undefined;
    }

    this.scene.start("level-2", { characterId: this.selectedCharacter.id });
  }

  private stopTraffic() {
    this.laneSpawnTimers.forEach((timer) => timer.remove(false));
    this.laneSpawnTimers.length = 0;

    if (!this.cars) return;

    this.getGroupChildrenSafe(this.cars).forEach((child) => {
      const car = child as Phaser.Physics.Arcade.Image;
      car.setVelocityX(0);
    });
  }

  private stopSharks() {
    if (this.sharkSpawnTimer) {
      this.sharkSpawnTimer.remove(false);
      this.sharkSpawnTimer = undefined;
    }
    if (!this.sharks) return;

    this.getGroupChildrenSafe(this.sharks).forEach((child) => {
      const shark = child as Phaser.Physics.Arcade.Image;
      shark.setVelocityX(0);
    });
  }

  private updateHud() {
    const livesLeft = Math.max(0, MAX_DEATHS - this.deathCount);
    this.healthText.setText(`Health: ${Math.max(0, this.health)} | Lives: ${livesLeft}`);
    const sectionLabel = this.levelComplete ? this.sectionsToClear : Math.min(this.sectionsToClear, this.sectionsCleared + 1);
    this.hudText.setText(
      `Character: ${this.selectedCharacter.name} | Section ${sectionLabel}/${this.sectionsToClear} | Speed: ${this.selectedCharacter.speed}`,
    );

    const elapsedMs = (this.levelEndTime ?? this.time.now) - this.levelStartTime;
    this.timerText.setText(`Time: ${(elapsedMs / 1000).toFixed(1)}s`);
  }

  update() {
    this.cleanupOffscreenCars();
    this.updateSharks();

    if (this.levelComplete) {
      const transitionPressed = this.retryKey && (Phaser.Input.Keyboard.JustDown(this.retryKey) || this.retryKey.isDown);
      if (transitionPressed) {
        this.startLevelTwo();
      }
      this.updateHud();
      return;
    }

    if (this.levelFailed) {
      if (this.outOfLives) {
        this.updateHud();
        return;
      }
      const retryPressed =
        (this.restartKey && Phaser.Input.Keyboard.JustDown(this.restartKey)) ||
        (this.retryKey && Phaser.Input.Keyboard.JustDown(this.retryKey));
      if (retryPressed) {
        this.scene.restart({ characterId: this.selectedCharacter.id });
      }
      this.updateHud();
      return;
    }

    this.updateHorizontalMovement();
    this.handleJumpInput();
    this.checkLakeHazard();
    this.checkGoalReached();
    this.updateHud();
  }

  private updateHorizontalMovement() {
    const leftDown = (this.cursors?.left?.isDown ?? false) || (this.leftKey?.isDown ?? false);
    const rightDown = (this.cursors?.right?.isDown ?? false) || (this.rightKey?.isDown ?? false);
    let direction = 0;
    if (leftDown) direction -= 1;
    if (rightDown) direction += 1;

    this.player.setVelocityX(direction * this.selectedCharacter.speed);
  }

  private handleJumpInput() {
    const jumpForwardPressed =
      (this.jumpKey ? Phaser.Input.Keyboard.JustDown(this.jumpKey) : false) ||
      (this.upKey ? Phaser.Input.Keyboard.JustDown(this.upKey) : false) ||
      (this.cursors?.up ? Phaser.Input.Keyboard.JustDown(this.cursors.up) : false);
    const jumpBackwardPressed =
      (this.downKey ? Phaser.Input.Keyboard.JustDown(this.downKey) : false) ||
      (this.backKey ? Phaser.Input.Keyboard.JustDown(this.backKey) : false);

    if ((!jumpForwardPressed && !jumpBackwardPressed) || this.isJumping) return;

    this.isJumping = true;
    const jumpDelta = jumpForwardPressed ? -this.selectedCharacter.jumpDistance : this.selectedCharacter.jumpDistance;
    const targetY = Phaser.Math.Clamp(this.player.y + jumpDelta, TOP_SAFE_BOTTOM - 10, START_Y);

    this.tweens.add({
      targets: this.player,
      y: targetY,
      duration: LEVEL1_CONFIG.jumpDurationMs,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.isJumping = false;
      },
    });
  }

  private checkGoalReached() {
    if (this.player.y <= TOP_SAFE_BOTTOM + 6) {
      this.sectionsCleared += 1;
      if (this.sectionsCleared >= this.sectionsToClear) {
        this.completeLevel();
      } else {
        this.advanceToNextRoadSection();
      }
    }
  }

  private advanceToNextRoadSection() {
    this.stopTraffic();
    if (this.cars) this.cars.clear(true, true);

    this.player.setVelocity(0, 0);
    this.player.setPosition(GAME_WIDTH / 2, START_Y);
    this.isJumping = false;

    this.createTraffic();
    this.cameras.main.flash(180, 232, 247, 255, false);
    this.statusText.setText(`More road appears! Section ${this.sectionsCleared + 1}/${this.sectionsToClear}`);
    this.time.delayedCall(1100, () => {
      if (!this.levelComplete && !this.levelFailed) this.statusText.setText("");
    });
  }

  private checkLakeHazard() {
    if (this.levelComplete || this.levelFailed || this.isJumping) return;

    const inLake = this.player.y > LAKE_TOP && this.player.y < LAKE_BOTTOM;
    if (!inLake) return;

    if (!this.isPlayerOnLilyPad(this.player.x, this.player.y)) {
      this.takeDamage("Splash! You fell in the lake. Land on lily pads.");
    }
  }

  private isPlayerOnLilyPad(x: number, y: number) {
    return this.lilyPads.some((pad) => Phaser.Math.Distance.Between(x, y, pad.x, pad.y) <= pad.radius + 8);
  }

  private takeDamage(message: string) {
    if (this.levelComplete || this.levelFailed) return;

    this.health -= 1;
    if (this.health <= 0) {
      this.killPlayer("You died! Respawning at start.");
      return;
    }

    this.player.setPosition(GAME_WIDTH / 2, START_Y);
    this.player.setVelocity(0, 0);
    this.isJumping = false;
    this.statusText.setText(message);
    this.time.delayedCall(900, () => {
      if (!this.levelComplete && !this.levelFailed) this.statusText.setText("");
    });
  }

  private killPlayer(message: string, shakeCamera = false) {
    if (this.levelComplete || this.levelFailed) return;

    this.deathCount += 1;
    const livesLeft = Math.max(0, MAX_DEATHS - this.deathCount);

    if (this.deathCount >= MAX_DEATHS) {
      this.outOfLives = true;
      this.levelFailed = true;
      this.levelEndTime = this.time.now;
      this.health = 0;
      this.stopTraffic();
      this.stopSharks();
      this.player.setVelocity(0, 0);
      this.isJumping = false;
      this.statusText.setText("You can't play anymore. 3 deaths reached.");
      return;
    }

    this.health = this.selectedCharacter.maxHealth;
    this.player.setPosition(GAME_WIDTH / 2, START_Y);
    this.player.setVelocity(0, 0);
    this.isJumping = false;
    if (shakeCamera) {
      this.cameras.main.shake(120, 0.004);
    }
    this.statusText.setText(`${message} Lives left: ${livesLeft}.`);
    this.time.delayedCall(900, () => {
      if (!this.levelComplete && !this.levelFailed) this.statusText.setText("");
    });
  }

  private updateSharks() {
    if (!this.sharks) return;

    this.getGroupChildrenSafe(this.sharks).forEach((child) => {
      const shark = child as Phaser.Physics.Arcade.Image;
      const body = shark.body as Phaser.Physics.Arcade.Body | undefined;
      if (!body) return;

      if (shark.x < -80) {
        const spawnPoint = this.getSafeSharkSpawnPoint(1, shark);
        if (!spawnPoint) return;
        shark.setPosition(spawnPoint.x, spawnPoint.y);
        body.setVelocityX(Math.abs(body.velocity.x));
        shark.setFlipX(false);
      } else if (shark.x > GAME_WIDTH + 80) {
        const spawnPoint = this.getSafeSharkSpawnPoint(-1, shark);
        if (!spawnPoint) return;
        shark.setPosition(spawnPoint.x, spawnPoint.y);
        body.setVelocityX(-Math.abs(body.velocity.x));
        shark.setFlipX(true);
      }
    });
  }

  private cleanupOffscreenCars() {
    this.getGroupChildrenSafe(this.cars).forEach((child) => {
      const car = child as Phaser.Physics.Arcade.Image;
      if (car.x < -120 || car.x > GAME_WIDTH + 120) {
        car.destroy();
      }
    });
  }

  private getGroupChildrenSafe(group?: Phaser.Physics.Arcade.Group) {
    if (!group) return [] as Phaser.GameObjects.GameObject[];

    const maybeGroup = group as Phaser.Physics.Arcade.Group & {
      children?: { entries?: Phaser.GameObjects.GameObject[] };
    };

    const entries = maybeGroup.children?.entries;
    return Array.isArray(entries) ? entries : ([] as Phaser.GameObjects.GameObject[]);
  }

  private clearGroupSafe(group?: Phaser.Physics.Arcade.Group) {
    if (!group) return;

    const maybeGroup = group as Phaser.Physics.Arcade.Group & {
      children?: { size?: number };
    };
    if (!maybeGroup.children) return;

    group.clear(true, true);
  }

  private cleanupScene() {
    const keyboard = this.input.keyboard;
    if (keyboard && this.levelCompleteEnterHandler) {
      keyboard.off("keydown-ENTER", this.levelCompleteEnterHandler);
      this.levelCompleteEnterHandler = undefined;
    }
    if (keyboard && this.levelCompleteNumpadHandler) {
      keyboard.off("keydown", this.levelCompleteNumpadHandler);
      this.levelCompleteNumpadHandler = undefined;
    }

    this.stopTraffic();
    this.stopSharks();
    if (this.carOverlap) {
      this.carOverlap.destroy();
      this.carOverlap = undefined;
    }
    if (this.sharkOverlap) {
      this.sharkOverlap.destroy();
      this.sharkOverlap = undefined;
    }
    this.clearGroupSafe(this.sharks);
    this.clearGroupSafe(this.cars);
    this.laneConfigs.length = 0;
    this.lilyPads.length = 0;
  }
}
