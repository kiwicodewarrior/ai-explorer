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

type GameSceneData = {
  characterId?: CharacterId;
};

const ROAD_TOP = LEVEL1_CONFIG.topSafeHeight;
const ROAD_BOTTOM = GAME_HEIGHT - LEVEL1_CONFIG.bottomSafeHeight;
const START_Y = GAME_HEIGHT - LEVEL1_CONFIG.bottomSafeHeight / 2;
const LANE_COLORS = [0xff8b8b, 0xffca85, 0x9ee08f, 0x7db6ff, 0xd3a1ff];

export class GameScene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private cars!: Phaser.Physics.Arcade.Group;
  private laneConfigs: LaneConfig[] = [];
  private laneSpawnTimers: Phaser.Time.TimerEvent[] = [];

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private jumpKey?: Phaser.Input.Keyboard.Key;
  private upKey?: Phaser.Input.Keyboard.Key;
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
  private invulnerableUntil = 0;

  constructor() {
    super("game");
  }

  create(data: GameSceneData = {}) {
    this.cameras.main.setBackgroundColor(0x8fc7ff);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.selectedCharacter = this.resolveCharacter(data.characterId);
    this.health = this.selectedCharacter.maxHealth;

    this.createTextures();
    this.drawLevelOneBackground();
    this.createPlayer();
    this.createHud();
    this.bindInput();
    this.createTraffic();

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
    this.add.rectangle(GAME_WIDTH / 2, ROAD_TOP / 2, GAME_WIDTH, ROAD_TOP, 0x7cc67b);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - LEVEL1_CONFIG.bottomSafeHeight / 2, GAME_WIDTH, LEVEL1_CONFIG.bottomSafeHeight, 0x84cd7e);
    this.add.rectangle(GAME_WIDTH / 2, (ROAD_TOP + ROAD_BOTTOM) / 2, GAME_WIDTH, ROAD_BOTTOM - ROAD_TOP, 0x353741);

    const laneHeight = (ROAD_BOTTOM - ROAD_TOP) / LEVEL1_CONFIG.laneCount;
    for (let index = 1; index < LEVEL1_CONFIG.laneCount; index += 1) {
      const y = ROAD_TOP + laneHeight * index;
      this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH, 2, 0x52576b);
    }

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
      .text(GAME_WIDTH / 2, ROAD_TOP / 2, "GOAL", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "24px",
        color: "#174525",
      })
      .setOrigin(0.5);
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
    this.restartKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.retryKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  private createTraffic() {
    this.cars = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    const laneHeight = (ROAD_BOTTOM - ROAD_TOP) / LEVEL1_CONFIG.laneCount;

    for (let laneIndex = 0; laneIndex < LEVEL1_CONFIG.laneCount; laneIndex += 1) {
      const direction: 1 | -1 = laneIndex % 2 === 0 ? 1 : -1;
      const y = ROAD_TOP + laneHeight * (laneIndex + 0.5);
      const speed = Phaser.Math.Between(LEVEL1_CONFIG.carMinSpeed, LEVEL1_CONFIG.carMaxSpeed);
      const tint = LANE_COLORS[laneIndex % LANE_COLORS.length];
      const laneConfig: LaneConfig = { y, direction, speed, tint };
      this.laneConfigs.push(laneConfig);

      this.spawnCar(laneConfig);
      const timer = this.time.addEvent({
        delay: LEVEL1_CONFIG.carSpawnMs + laneIndex * 110,
        loop: true,
        callback: () => {
          if (!this.levelComplete && !this.levelFailed) this.spawnCar(laneConfig);
        },
      });
      this.laneSpawnTimers.push(timer);
    }

    this.physics.add.overlap(this.player, this.cars, () => this.handleCarHit(), undefined, this);
  }

  private spawnCar(lane: LaneConfig) {
    const carWidth = LEVEL1_CONFIG.carWidth;
    const x = lane.direction === 1 ? -carWidth : GAME_WIDTH + carWidth;
    const car = this.physics.add.image(x, lane.y, "level1-car");
    car.setImmovable(true).setTint(lane.tint);

    const body = car.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocityX(lane.direction * lane.speed);
    body.setSize(LEVEL1_CONFIG.carWidth - 8, LEVEL1_CONFIG.carHeight, true);

    this.cars.add(car);
  }

  private handleCarHit() {
    if (this.levelComplete || this.levelFailed) return;
    if (this.time.now < this.invulnerableUntil) return;

    this.health -= 1;
    this.invulnerableUntil = this.time.now + LEVEL1_CONFIG.hitInvulnMs;
    this.player.setPosition(GAME_WIDTH / 2, START_Y);
    this.player.setVelocity(0, 0);
    this.isJumping = false;

    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      yoyo: true,
      repeat: 5,
      duration: 60,
      onComplete: () => this.player.setAlpha(1),
    });

    if (this.health <= 0) {
      this.failLevel();
      return;
    }

    this.statusText.setText("Hit by traffic! Be careful.");
    this.time.delayedCall(900, () => {
      if (!this.levelComplete && !this.levelFailed) this.statusText.setText("");
    });
  }

  private failLevel() {
    if (this.levelFailed) return;

    this.levelFailed = true;
    this.levelEndTime = this.time.now;
    this.stopTraffic();
    this.player.setVelocity(0, 0);
    this.statusText.setText("Out of health. Press R or ENTER to retry.");
  }

  private completeLevel() {
    if (this.levelComplete) return;

    this.levelComplete = true;
    this.levelEndTime = this.time.now;
    this.stopTraffic();
    this.player.setVelocity(0, 0);
    this.statusText.setText("Level 1 complete! Press ENTER to replay.");
  }

  private stopTraffic() {
    this.laneSpawnTimers.forEach((timer) => timer.remove(false));
    this.laneSpawnTimers.length = 0;

    this.cars.getChildren().forEach((child) => {
      const car = child as Phaser.Physics.Arcade.Image;
      car.setVelocityX(0);
    });
  }

  private updateHud() {
    this.healthText.setText(`Health: ${Math.max(0, this.health)}`);
    this.hudText.setText(
      `Character: ${this.selectedCharacter.name} | Speed: ${this.selectedCharacter.speed} | Attack: ${this.selectedCharacter.attackPower}`,
    );

    const elapsedMs = (this.levelEndTime ?? this.time.now) - this.levelStartTime;
    this.timerText.setText(`Time: ${(elapsedMs / 1000).toFixed(1)}s`);
  }

  update() {
    this.cleanupOffscreenCars();

    if (this.levelComplete) {
      if (this.retryKey && Phaser.Input.Keyboard.JustDown(this.retryKey)) {
        this.scene.restart({ characterId: this.selectedCharacter.id });
      }
      this.updateHud();
      return;
    }

    if (this.levelFailed) {
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
    const jumpPressed =
      (this.jumpKey ? Phaser.Input.Keyboard.JustDown(this.jumpKey) : false) ||
      (this.upKey ? Phaser.Input.Keyboard.JustDown(this.upKey) : false) ||
      (this.cursors?.up ? Phaser.Input.Keyboard.JustDown(this.cursors.up) : false);

    if (!jumpPressed || this.isJumping) return;

    this.isJumping = true;
    const targetY = Math.max(ROAD_TOP - 10, this.player.y - this.selectedCharacter.jumpDistance);

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
    if (this.player.y <= ROAD_TOP + 6) {
      this.completeLevel();
    }
  }

  private cleanupOffscreenCars() {
    this.cars.getChildren().forEach((child) => {
      const car = child as Phaser.Physics.Arcade.Image;
      if (car.x < -120 || car.x > GAME_WIDTH + 120) {
        car.destroy();
      }
    });
  }

  private cleanupScene() {
    this.stopTraffic();
  }
}
