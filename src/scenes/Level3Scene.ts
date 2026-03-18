import Phaser from "phaser";
import {
  CHARACTER_OPTIONS,
  DEFAULT_CHARACTER_ID,
  GAME_HEIGHT,
  GAME_WIDTH,
  type CharacterConfig,
  type CharacterId,
} from "../config";

type Level3SceneData = {
  characterId?: CharacterId;
};

type ObstacleKind = "low" | "high";

const RUN_DURATION_MS = 35_000;
const MAX_DEATHS = 3;
const HIT_INVULN_MS = 700;
const SPAWN_MS = 720;
const PLAYER_Y = GAME_HEIGHT - 110;
const LANE_X = [GAME_WIDTH * 0.32, GAME_WIDTH * 0.5, GAME_WIDTH * 0.68] as const;

const TEXTURE_KEYS = {
  player: "level3-player",
  lowObstacle: "level3-obstacle-low",
  highObstacle: "level3-obstacle-high",
} as const;

export class Level3Scene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private obstacles!: Phaser.Physics.Arcade.Group;
  private roadStripes: Phaser.GameObjects.Rectangle[] = [];

  private obstacleOverlap?: Phaser.Physics.Arcade.Collider;
  private obstacleSpawnTimer?: Phaser.Time.TimerEvent;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private aKey?: Phaser.Input.Keyboard.Key;
  private dKey?: Phaser.Input.Keyboard.Key;
  private jumpKey?: Phaser.Input.Keyboard.Key;
  private upKey?: Phaser.Input.Keyboard.Key;
  private confirmKey?: Phaser.Input.Keyboard.Key;

  private hudText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  private health = 3;
  private deathCount = 0;
  private outOfLives = false;
  private levelComplete = false;
  private levelElapsedMs = 0;
  private levelEndTime?: number;
  private damageCooldownUntil = 0;

  private laneIndex = 1;
  private laneTween?: Phaser.Tweens.Tween;
  private isJumping = false;
  private jumpTween?: Phaser.Tweens.Tween;

  constructor() {
    super("level-3");
  }

  create(data: Level3SceneData = {}) {
    this.selectedCharacter = this.resolveCharacter(data.characterId);
    this.health = this.selectedCharacter.maxHealth;
    this.deathCount = 0;
    this.outOfLives = false;
    this.levelComplete = false;
    this.levelElapsedMs = 0;
    this.levelEndTime = undefined;
    this.damageCooldownUntil = 0;
    this.laneIndex = 1;
    this.isJumping = false;

    this.physics.world.gravity.y = 0;
    this.cameras.main.setBackgroundColor(0x0d1a2c);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createPlayer();
    this.createObstacles();
    this.createHud();
    this.bindInput();

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

    if (!this.textures.exists(TEXTURE_KEYS.lowObstacle)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xffcb6b, 1);
      g.fillRoundedRect(0, 0, 54, 30, 6);
      g.fillStyle(0x9d5f10, 1);
      g.fillRect(8, 8, 38, 8);
      g.generateTexture(TEXTURE_KEYS.lowObstacle, 54, 30);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.highObstacle)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xef6767, 1);
      g.fillRoundedRect(0, 0, 56, 66, 8);
      g.fillStyle(0x7e2323, 1);
      g.fillRect(10, 14, 36, 10);
      g.fillRect(10, 34, 36, 10);
      g.generateTexture(TEXTURE_KEYS.highObstacle, 56, 66);
      g.destroy();
    }
  }

  private drawBackground() {
    const roadLeft = GAME_WIDTH * 0.1;
    const roadRight = GAME_WIDTH * 0.9;
    const roadWidth = roadRight - roadLeft;

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0d1a2c);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.28, GAME_WIDTH, GAME_HEIGHT * 0.56, 0x162946, 0.72);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.62, GAME_WIDTH, GAME_HEIGHT * 0.42, 0x122238, 0.52);

    this.drawRoadsideBuildings(roadLeft, roadRight);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, roadWidth, GAME_HEIGHT, 0x1b2c49, 0.82);
    this.add.rectangle(roadLeft - 20, GAME_HEIGHT / 2, 36, GAME_HEIGHT, 0x335041, 0.38);
    this.add.rectangle(roadRight + 20, GAME_HEIGHT / 2, 36, GAME_HEIGHT, 0x3b3357, 0.38);
    this.add.rectangle(roadLeft + 20, GAME_HEIGHT / 2, 30, GAME_HEIGHT, 0xff8b4a, 0.18);
    this.add.rectangle(roadRight - 20, GAME_HEIGHT / 2, 30, GAME_HEIGHT, 0x3fd8ff, 0.18);
    this.add.rectangle(roadLeft + 34, GAME_HEIGHT / 2, 5, GAME_HEIGHT, 0xffd38b, 0.75);
    this.add.rectangle(roadRight - 34, GAME_HEIGHT / 2, 5, GAME_HEIGHT, 0x9de9ff, 0.75);
    this.add.rectangle(roadLeft, GAME_HEIGHT / 2, 3, GAME_HEIGHT, 0xf6f1df, 0.82);
    this.add.rectangle(roadRight, GAME_HEIGHT / 2, 3, GAME_HEIGHT, 0xf6f1df, 0.82);

    for (let lane = 1; lane < LANE_X.length; lane += 1) {
      const laneX = (LANE_X[lane - 1] + LANE_X[lane]) / 2;
      this.add.rectangle(laneX, GAME_HEIGHT / 2, 3, GAME_HEIGHT, 0x3e5784, 0.4);
    }

    this.roadStripes.length = 0;
    for (let index = 0; index < 18; index += 1) {
      const stripe = this.add.rectangle(GAME_WIDTH / 2, index * 44, 10, 26, 0xe7efff, 0.8);
      this.roadStripes.push(stripe);
    }

    this.add
      .text(GAME_WIDTH / 2, 28, "Level 3: Runner Escape", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f5f8ff",
        stroke: "#08101d",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.add
      .text(GAME_WIDTH / 2, 58, "Switch lanes, jump low barriers, survive the run.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "19px",
        color: "#c9d9f7",
      })
      .setOrigin(0.5)
      .setDepth(20);
  }

  private drawRoadsideBuildings(roadLeft: number, roadRight: number) {
    const baseY = GAME_HEIGHT - 40;
    const buildingConfigs = [
      { x: 34, width: 42, height: 168, bodyColor: 0x203750, windowColor: 0x8fe6ff },
      { x: 74, width: 34, height: 244, bodyColor: 0x29466a, windowColor: 0xc6f6ff },
      { x: roadLeft - 44, width: 52, height: 196, bodyColor: 0x1d314d, windowColor: 0x8fd3ff },
      { x: roadLeft - 12, width: 26, height: 124, bodyColor: 0x35567d, windowColor: 0xffe29a },
      { x: GAME_WIDTH - 34, width: 42, height: 180, bodyColor: 0x243958, windowColor: 0x88f0ff },
      { x: GAME_WIDTH - 74, width: 34, height: 228, bodyColor: 0x304f73, windowColor: 0xbef8ff },
      { x: roadRight + 44, width: 52, height: 208, bodyColor: 0x21344f, windowColor: 0x92d7ff },
      { x: roadRight + 12, width: 26, height: 132, bodyColor: 0x3c5a81, windowColor: 0xffd782 },
    ] as const;

    buildingConfigs.forEach((building) => {
      this.drawBuilding(building.x, baseY, building.width, building.height, building.bodyColor, building.windowColor);
    });
  }

  private drawBuilding(
    x: number,
    baseY: number,
    width: number,
    height: number,
    bodyColor: number,
    windowColor: number,
  ) {
    const centerY = baseY - height / 2;
    this.add.rectangle(x, centerY, width, height, bodyColor, 0.96);
    this.add.rectangle(x, centerY - height / 2 + 8, width, 8, 0x0d1626, 0.28);

    const columns = Math.max(1, Math.floor((width - 10) / 12));
    const rows = Math.max(2, Math.floor((height - 22) / 18));
    const startX = x - ((columns - 1) * 12) / 2;
    const startY = centerY - height / 2 + 18;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        this.add.rectangle(startX + column * 12, startY + row * 18, 5, 8, windowColor, 0.8);
      }
    }
  }

  private createPlayer() {
    this.player = this.physics.add.image(LANE_X[this.laneIndex], PLAYER_Y, TEXTURE_KEYS.player);
    this.player.setTint(this.selectedCharacter.primaryColor);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(24, 34, true);
  }

  private createObstacles() {
    this.obstacles = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    this.obstacleSpawnTimer = this.time.addEvent({
      delay: SPAWN_MS,
      loop: true,
      callback: () => {
        if (this.levelComplete || this.outOfLives) return;
        this.spawnObstacle();
      },
    });

    this.obstacleOverlap = this.physics.add.overlap(this.player, this.obstacles, (_player, obstacle) => {
      this.handleObstacleHit(obstacle as Phaser.Physics.Arcade.Image);
    });
  }

  private spawnObstacle() {
    const laneIndex = Phaser.Math.Between(0, LANE_X.length - 1);
    const x = LANE_X[laneIndex];

    const kind: ObstacleKind = Phaser.Math.Between(0, 99) < 45 ? "low" : "high";
    const texture = kind === "low" ? TEXTURE_KEYS.lowObstacle : TEXTURE_KEYS.highObstacle;

    const obstacle = this.physics.add.image(x, -80, texture);
    obstacle.setData("kind", kind);
    this.obstacles.add(obstacle);

    const body = obstacle.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(kind === "low" ? 42 : 44, kind === "low" ? 24 : 58, true);

    const speed = 300 + this.levelElapsedMs * 0.008;
    body.setVelocityY(speed);
  }

  private createHud() {
    this.hudText = this.add.text(18, GAME_HEIGHT - 32, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "18px",
      color: "#f2f6ff",
    });

    this.healthText = this.add.text(18, 86, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "22px",
      color: "#ffe0e0",
      stroke: "#20142d",
      strokeThickness: 4,
    });

    this.timerText = this.add
      .text(GAME_WIDTH - 18, GAME_HEIGHT - 32, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f2f6ff",
      })
      .setOrigin(1, 0);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 64, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#fff5c7",
        stroke: "#0f1930",
        strokeThickness: 5,
      })
      .setOrigin(0.5);
  }

  private bindInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.cursors = keyboard.createCursorKeys();
    this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.aKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.dKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.upKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.jumpKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  private updateHud() {
    const livesLeft = Math.max(0, MAX_DEATHS - this.deathCount);
    const elapsedMs = this.levelEndTime ?? this.levelElapsedMs;
    const remaining = Math.max(0, RUN_DURATION_MS - elapsedMs);

    this.healthText.setText(`Health: ${Math.max(0, this.health)} | Lives: ${livesLeft}`);
    this.hudText.setText(`Character: ${this.selectedCharacter.name} | Lane ${this.laneIndex + 1}/3`);
    this.timerText.setText(`Survive: ${(remaining / 1000).toFixed(1)}s`);
  }

  update(_time: number, delta: number) {
    this.updateRoadStripes(delta);
    this.cleanupOffscreenObstacles();

    if (this.levelComplete) {
      if (this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
        this.scene.start("character-select");
      }
      this.updateHud();
      return;
    }

    if (this.outOfLives) {
      if (this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
        this.scene.start("character-select");
      }
      this.updateHud();
      return;
    }

    this.levelElapsedMs += delta;
    this.handleLaneInput();
    this.handleJumpInput();
    this.checkRunnerCompletion();
    this.updateHud();
  }

  private updateRoadStripes(delta: number) {
    const speed = 240;
    this.roadStripes.forEach((stripe) => {
      stripe.y += (speed * delta) / 1000;
      if (stripe.y > GAME_HEIGHT + 26) {
        stripe.y = -26;
      }
    });
  }

  private handleLaneInput() {
    if (this.laneTween?.isPlaying()) return;

    const leftPressed =
      (this.leftKey ? Phaser.Input.Keyboard.JustDown(this.leftKey) : false) ||
      (this.aKey ? Phaser.Input.Keyboard.JustDown(this.aKey) : false);
    const rightPressed =
      (this.rightKey ? Phaser.Input.Keyboard.JustDown(this.rightKey) : false) ||
      (this.dKey ? Phaser.Input.Keyboard.JustDown(this.dKey) : false);

    if (leftPressed && this.laneIndex > 0) {
      this.laneIndex -= 1;
      this.moveToLane();
    } else if (rightPressed && this.laneIndex < LANE_X.length - 1) {
      this.laneIndex += 1;
      this.moveToLane();
    }
  }

  private moveToLane() {
    this.laneTween = this.tweens.add({
      targets: this.player,
      x: LANE_X[this.laneIndex],
      duration: 120,
      ease: "Sine.easeOut",
    });
  }

  private handleJumpInput() {
    if (this.isJumping) return;

    const jumpPressed =
      (this.jumpKey ? Phaser.Input.Keyboard.JustDown(this.jumpKey) : false) ||
      (this.upKey ? Phaser.Input.Keyboard.JustDown(this.upKey) : false) ||
      (this.cursors?.up ? Phaser.Input.Keyboard.JustDown(this.cursors.up) : false);
    if (!jumpPressed) return;

    this.isJumping = true;
    this.jumpTween = this.tweens.add({
      targets: this.player,
      y: PLAYER_Y - 94,
      duration: 170,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.isJumping = false;
      },
    });
  }

  private handleObstacleHit(obstacle: Phaser.Physics.Arcade.Image) {
    if (this.levelComplete || this.outOfLives) return;
    if (this.time.now < this.damageCooldownUntil) return;

    const kind = obstacle.getData("kind") as ObstacleKind | undefined;
    if (kind === "low" && this.isJumping) {
      obstacle.destroy();
      return;
    }

    this.damageCooldownUntil = this.time.now + HIT_INVULN_MS;
    this.health -= 1;

    if (this.health > 0) {
      this.statusText.setText(`Hit obstacle! Health left: ${this.health}.`);
      this.time.delayedCall(800, () => {
        if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
      });
      return;
    }

    this.deathCount += 1;
    if (this.deathCount >= MAX_DEATHS) {
      this.outOfLives = true;
      this.levelEndTime = this.levelElapsedMs;
      this.health = 0;
      this.stopRunner();
      this.statusText.setText("You can't play anymore. 3 deaths reached. Press ENTER.");
      return;
    }

    const livesLeft = MAX_DEATHS - this.deathCount;
    this.health = this.selectedCharacter.maxHealth;
    this.resetRunnerState();
    this.statusText.setText(`You crashed! Lives left: ${livesLeft}.`);
    this.time.delayedCall(900, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });
  }

  private resetRunnerState() {
    this.player.setPosition(LANE_X[1], PLAYER_Y);
    this.player.setVelocity(0, 0);
    this.laneIndex = 1;

    this.getGroupChildrenSafe(this.obstacles).forEach((child) => {
      child.destroy();
    });

    this.isJumping = false;
    this.cameras.main.shake(80, 0.004);
  }

  private checkRunnerCompletion() {
    if (this.levelComplete) return;

    if (this.levelElapsedMs < RUN_DURATION_MS) return;

    this.levelComplete = true;
    this.levelEndTime = this.levelElapsedMs;
    this.stopRunner();
    this.statusText.setText("Level 3 complete! Press ENTER to continue.");
  }

  private stopRunner() {
    if (this.obstacleSpawnTimer) {
      this.obstacleSpawnTimer.remove(false);
      this.obstacleSpawnTimer = undefined;
    }

    this.getGroupChildrenSafe(this.obstacles).forEach((child) => {
      const obstacle = child as Phaser.Physics.Arcade.Image;
      obstacle.setVelocity(0, 0);
    });
  }

  private cleanupOffscreenObstacles() {
    this.getGroupChildrenSafe(this.obstacles).forEach((child) => {
      const obstacle = child as Phaser.Physics.Arcade.Image;
      if (obstacle.y > GAME_HEIGHT + 100) {
        obstacle.destroy();
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
    if (this.laneTween) {
      this.laneTween.stop();
      this.laneTween = undefined;
    }
    if (this.jumpTween) {
      this.jumpTween.stop();
      this.jumpTween = undefined;
    }
    if (this.obstacleSpawnTimer) {
      this.obstacleSpawnTimer.remove(false);
      this.obstacleSpawnTimer = undefined;
    }
    if (this.obstacleOverlap) {
      this.obstacleOverlap.destroy();
      this.obstacleOverlap = undefined;
    }

    this.clearGroupSafe(this.obstacles);
    this.roadStripes.length = 0;
  }
}
