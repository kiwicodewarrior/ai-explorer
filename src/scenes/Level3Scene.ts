import Phaser from "phaser";
import {
  CHARACTER_OPTIONS,
  DEFAULT_CHARACTER_ID,
  GAME_HEIGHT,
  GAME_WIDTH,
  type CharacterConfig,
  type CharacterId,
} from "../config";
import { DEFAULT_RUN_LIVES, getRunLives, loseRunLife, rememberRunCharacter } from "../systems/runState";

type Level3SceneData = {
  characterId?: CharacterId;
};

type ObstacleKind = "low" | "high";

type RoadsideBuilding = {
  side: "left" | "right";
  depth: number;
  offset: number;
  width: number;
  height: number;
  bodyColor: number;
  windowColor: number;
};

const RUN_DURATION_MS = 35_000;
const MAX_DEATHS = DEFAULT_RUN_LIVES;
const HIT_INVULN_MS = 700;
const SPAWN_MS = 720;
const PLAYER_Y = GAME_HEIGHT - 110;
const ROAD_HORIZON_Y = 112;
const ROAD_BOTTOM_Y = GAME_HEIGHT + 28;
const ROAD_TOP_WIDTH = 156;
const ROAD_BOTTOM_WIDTH = GAME_WIDTH * 1.04;
const OBSTACLE_SPAWN_DEPTH = 0.02;
const OBSTACLE_DESPAWN_DEPTH = 1.08;
const LANE_FRACTIONS = [0.24, 0.5, 0.76] as const;

const BUILDING_LAYOUT: readonly RoadsideBuilding[] = [
  { side: "left", depth: 0.18, offset: 52, width: 52, height: 168, bodyColor: 0x233552, windowColor: 0x95dcff },
  { side: "right", depth: 0.22, offset: 54, width: 46, height: 154, bodyColor: 0x293b58, windowColor: 0xa6ebff },
  { side: "left", depth: 0.34, offset: 38, width: 42, height: 138, bodyColor: 0x2f4a72, windowColor: 0xffdf8b },
  { side: "right", depth: 0.4, offset: 36, width: 56, height: 176, bodyColor: 0x284468, windowColor: 0x88e3ff },
  { side: "left", depth: 0.56, offset: 30, width: 48, height: 132, bodyColor: 0x345980, windowColor: 0xcff5ff },
  { side: "right", depth: 0.64, offset: 28, width: 40, height: 124, bodyColor: 0x314f73, windowColor: 0xffd47b },
  { side: "left", depth: 0.78, offset: 18, width: 34, height: 104, bodyColor: 0x40658c, windowColor: 0xe2f8ff },
  { side: "right", depth: 0.84, offset: 16, width: 32, height: 96, bodyColor: 0x3d6286, windowColor: 0x9ce2ff },
] as const;

const TEXTURE_KEYS = {
  player: "level3-player",
  lowObstacle: "level3-obstacle-low",
  highObstacle: "level3-obstacle-high",
} as const;

export class Level3Scene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private roadGraphics!: Phaser.GameObjects.Graphics;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private player!: Phaser.Physics.Arcade.Image;
  private obstacles!: Phaser.Physics.Arcade.Group;

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

  private livesRemaining = DEFAULT_RUN_LIVES;
  private outOfLives = false;
  private levelComplete = false;
  private levelElapsedMs = 0;
  private levelEndTime?: number;
  private damageCooldownUntil = 0;

  private laneIndex = 1;
  private lanePosition = 1;
  private laneTween?: Phaser.Tweens.Tween;
  private isJumping = false;
  private jumpTween?: Phaser.Tweens.Tween;
  private roadScroll = 0;

  constructor() {
    super("level-3");
  }

  create(data: Level3SceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.outOfLives = this.livesRemaining <= 0;
    this.levelComplete = false;
    this.levelElapsedMs = 0;
    this.levelEndTime = undefined;
    this.damageCooldownUntil = 0;
    this.laneIndex = 1;
    this.lanePosition = 1;
    this.isJumping = false;
    this.roadScroll = 0;

    this.physics.world.gravity.y = 0;
    this.cameras.main.setBackgroundColor(0x09131f);
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
    this.backgroundGraphics = this.add.graphics().setDepth(0);
    this.roadGraphics = this.add.graphics().setDepth(60);

    this.renderStaticBackground();
    this.renderRoad();

    this.add
      .text(GAME_WIDTH / 2, 28, "Level 3: Runner Escape", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f5f8ff",
        stroke: "#08101d",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(1200);

    this.add
      .text(GAME_WIDTH / 2, 58, "Switch lanes, jump low barriers, survive the run.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "19px",
        color: "#d5e2ff",
      })
      .setOrigin(0.5)
      .setDepth(1200);
  }

  private renderStaticBackground() {
    const g = this.backgroundGraphics;
    g.clear();

    g.fillStyle(0x09131f, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.fillStyle(0x12243b, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT * 0.4);
    g.fillStyle(0x20435f, 0.74);
    g.fillRect(0, GAME_HEIGHT * 0.16, GAME_WIDTH, GAME_HEIGHT * 0.28);
    g.fillStyle(0x08131f, 0.4);
    g.fillRect(0, GAME_HEIGHT * 0.72, GAME_WIDTH, GAME_HEIGHT * 0.28);

    g.fillStyle(0xffc96a, 0.14);
    g.fillCircle(GAME_WIDTH / 2, ROAD_HORIZON_Y - 34, 82);
    g.fillStyle(0xf38855, 0.12);
    g.fillCircle(GAME_WIDTH / 2, ROAD_HORIZON_Y - 34, 128);

    this.drawDistantSkyline(g);
    this.drawRoadsideBuildings(g);
  }

  private drawDistantSkyline(g: Phaser.GameObjects.Graphics) {
    const skylineHeights = [44, 78, 54, 96, 62, 86, 58, 108, 70, 90, 48, 72] as const;
    let x = -12;

    skylineHeights.forEach((height, index) => {
      const width = index % 4 === 0 ? 46 : index % 3 === 0 ? 34 : 28;
      const y = ROAD_HORIZON_Y + 18;
      const color = index % 2 === 0 ? 0x0d1a2c : 0x13253a;
      g.fillStyle(color, 0.96);
      g.fillRect(x, y - height, width, height);

      if (index % 3 === 0) {
        g.fillStyle(0x2a5676, 0.35);
        g.fillRect(x + 8, y - height - 18, width - 16, 18);
      }

      x += width - 4;
    });

    g.fillStyle(0x3a6482, 0.26);
    g.fillRect(0, ROAD_HORIZON_Y + 10, GAME_WIDTH, 6);
  }

  private drawRoadsideBuildings(g: Phaser.GameObjects.Graphics) {
    [...BUILDING_LAYOUT]
      .sort((leftBuilding, rightBuilding) => leftBuilding.depth - rightBuilding.depth)
      .forEach((building) => {
        this.drawPerspectiveBuilding(g, building);
      });
  }

  private drawPerspectiveBuilding(g: Phaser.GameObjects.Graphics, building: RoadsideBuilding) {
    const y = this.getRoadYAtDepth(building.depth);
    const scale = Phaser.Math.Linear(0.3, 1.08, building.depth);
    const { left, right } = this.getRoadEdgesAt(y);
    const width = building.width * scale;
    const height = building.height * scale;
    const sideWidth = Math.max(10, width * 0.2);
    const roofHeight = Math.max(8, height * 0.08);
    const offset = Phaser.Math.Linear(58, 18, building.depth) + building.offset * scale * 0.35;
    const centerX = building.side === "left" ? left - offset - width / 2 : right + offset + width / 2;
    const topY = y - height;

    g.fillStyle(building.bodyColor, 0.96);
    g.fillRect(centerX - width / 2, topY, width, height);

    g.fillStyle(this.scaleColor(building.bodyColor, 0.7), 0.9);
    if (building.side === "left") {
      this.fillQuad(
        g,
        centerX - width / 2,
        topY,
        centerX - width / 2 - sideWidth,
        topY + sideWidth * 0.35,
        centerX - width / 2 - sideWidth,
        y,
        centerX - width / 2,
        y,
      );
    } else {
      this.fillQuad(
        g,
        centerX + width / 2,
        topY,
        centerX + width / 2 + sideWidth,
        topY + sideWidth * 0.35,
        centerX + width / 2 + sideWidth,
        y,
        centerX + width / 2,
        y,
      );
    }

    g.fillStyle(this.scaleColor(building.bodyColor, 1.15), 0.95);
    g.fillRect(centerX - width / 2, topY, width, roofHeight);

    const columns = Phaser.Math.Clamp(Math.floor((width - 12) / 14), 1, 3);
    const rows = Phaser.Math.Clamp(Math.floor((height - 18) / 20), 2, 6);
    const startX = centerX - ((columns - 1) * 14) / 2;
    const startY = topY + 16;
    const windowAlpha = Phaser.Math.Linear(0.32, 0.8, building.depth);

    g.fillStyle(building.windowColor, windowAlpha);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        g.fillRect(startX + column * 14 - 3, startY + row * 20, 6, 9);
      }
    }
  }

  private renderRoad() {
    const g = this.roadGraphics;
    g.clear();

    const topY = ROAD_HORIZON_Y;
    const bottomY = ROAD_BOTTOM_Y;
    const topLeft = GAME_WIDTH / 2 - ROAD_TOP_WIDTH / 2;
    const topRight = GAME_WIDTH / 2 + ROAD_TOP_WIDTH / 2;
    const bottomLeft = GAME_WIDTH / 2 - ROAD_BOTTOM_WIDTH / 2;
    const bottomRight = GAME_WIDTH / 2 + ROAD_BOTTOM_WIDTH / 2;

    g.fillStyle(0x284633, 0.7);
    this.fillQuad(g, topLeft - 34, topY, topLeft, topY, bottomLeft, bottomY, bottomLeft - 132, bottomY);
    g.fillStyle(0x3f3753, 0.7);
    this.fillQuad(g, topRight, topY, topRight + 34, topY, bottomRight + 132, bottomY, bottomRight, bottomY);

    g.fillStyle(0x172741, 0.98);
    this.fillQuad(g, topLeft, topY, topRight, topY, bottomRight, bottomY, bottomLeft, bottomY);

    g.fillStyle(0xff8b4a, 0.42);
    this.fillQuad(g, topLeft, topY, topLeft + 14, topY, bottomLeft + 48, bottomY, bottomLeft, bottomY);
    g.fillStyle(0x42dcff, 0.42);
    this.fillQuad(g, topRight - 14, topY, topRight, topY, bottomRight, bottomY, bottomRight - 48, bottomY);

    g.fillStyle(0xf5efe0, 0.95);
    this.fillQuad(g, topLeft + 1, topY, topLeft + 4, topY, bottomLeft + 7, bottomY, bottomLeft + 1, bottomY);
    this.fillQuad(g, topRight - 4, topY, topRight - 1, topY, bottomRight - 1, bottomY, bottomRight - 7, bottomY);

    g.fillStyle(0xffffff, 0.08);
    this.fillQuad(
      g,
      GAME_WIDTH / 2 - 18,
      topY,
      GAME_WIDTH / 2 + 18,
      topY,
      GAME_WIDTH / 2 + 120,
      bottomY,
      GAME_WIDTH / 2 - 120,
      bottomY,
    );

    this.drawLaneDivider(g, 0.37);
    this.drawLaneDivider(g, 0.63);
  }

  private drawLaneDivider(g: Phaser.GameObjects.Graphics, laneFraction: number) {
    for (let segment = 0; segment < 12; segment += 1) {
      const startDepth = (segment * 0.11 + this.roadScroll) % 1;
      const endDepth = Math.min(startDepth + 0.055, 0.99);
      if (endDepth <= startDepth) continue;

      const farY = this.getRoadYAtDepth(startDepth);
      const nearY = this.getRoadYAtDepth(endDepth);
      const farX = this.getRoadXAtFraction(laneFraction, farY);
      const nearX = this.getRoadXAtFraction(laneFraction, nearY);
      const farWidth = Phaser.Math.Linear(2, 6, startDepth);
      const nearWidth = Phaser.Math.Linear(4, 12, endDepth);
      const alpha = Phaser.Math.Linear(0.4, 0.92, endDepth);

      g.fillStyle(0xeef5ff, alpha);
      this.fillQuad(
        g,
        farX - farWidth / 2,
        farY,
        farX + farWidth / 2,
        farY,
        nearX + nearWidth / 2,
        nearY,
        nearX - nearWidth / 2,
        nearY,
      );
    }
  }

  private fillQuad(
    g: Phaser.GameObjects.Graphics,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    dx: number,
    dy: number,
  ) {
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.lineTo(cx, cy);
    g.lineTo(dx, dy);
    g.closePath();
    g.fillPath();
  }

  private scaleColor(color: number, factor: number) {
    const rgb = Phaser.Display.Color.IntegerToRGB(color);
    return Phaser.Display.Color.GetColor(
      Phaser.Math.Clamp(Math.round(rgb.r * factor), 0, 255),
      Phaser.Math.Clamp(Math.round(rgb.g * factor), 0, 255),
      Phaser.Math.Clamp(Math.round(rgb.b * factor), 0, 255),
    );
  }

  private getDepthProgress(y: number) {
    return Phaser.Math.Clamp((y - ROAD_HORIZON_Y) / (ROAD_BOTTOM_Y - ROAD_HORIZON_Y), 0, 1);
  }

  private getRoadYAtDepth(depth: number) {
    return Phaser.Math.Linear(ROAD_HORIZON_Y, ROAD_BOTTOM_Y, Phaser.Math.Clamp(depth, 0, 1));
  }

  private getRoadWidthAt(y: number) {
    return Phaser.Math.Linear(ROAD_TOP_WIDTH, ROAD_BOTTOM_WIDTH, this.getDepthProgress(y));
  }

  private getRoadEdgesAt(y: number) {
    const halfWidth = this.getRoadWidthAt(y) / 2;
    return {
      left: GAME_WIDTH / 2 - halfWidth,
      right: GAME_WIDTH / 2 + halfWidth,
    };
  }

  private getRoadXAtFraction(fraction: number, y: number) {
    const { left, right } = this.getRoadEdgesAt(y);
    return Phaser.Math.Linear(left, right, fraction);
  }

  private getLaneX(lanePosition: number, y: number) {
    const safeLane = Phaser.Math.Clamp(lanePosition, 0, LANE_FRACTIONS.length - 1);
    const baseIndex = Math.floor(safeLane);
    const nextIndex = Math.min(LANE_FRACTIONS.length - 1, baseIndex + 1);
    const localT = safeLane - baseIndex;
    const laneFraction = Phaser.Math.Linear(LANE_FRACTIONS[baseIndex], LANE_FRACTIONS[nextIndex], localT);
    return this.getRoadXAtFraction(laneFraction, y);
  }

  private createPlayer() {
    const playerX = this.getLaneX(this.lanePosition, PLAYER_Y);

    this.playerShadow = this.add.ellipse(playerX, PLAYER_Y + 28, 78, 22, 0x05080d, 0.28).setDepth(580);
    this.player = this.physics.add.image(playerX, PLAYER_Y, TEXTURE_KEYS.player);
    this.player.setTint(this.selectedCharacter.primaryColor);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(24, 34, true);

    this.syncPlayerPerspective();
  }

  private syncPlayerPerspective() {
    if (!this.player?.body) return;

    const jumpLift = Phaser.Math.Clamp((PLAYER_Y - this.player.y) / 94, 0, 1);
    const laneY = this.player.y + 18;
    const depth = this.getDepthProgress(laneY);
    const scale = Phaser.Math.Linear(0.86, 1.14, depth) + jumpLift * 0.05;
    const playerX = this.getLaneX(this.lanePosition, laneY);

    this.player.setPosition(playerX, this.player.y);
    this.player.setScale(scale);
    this.player.setAngle((this.laneIndex - this.lanePosition) * -10);
    this.player.setDepth(820 + Math.round(depth * 120));

    const shadowX = this.getLaneX(this.lanePosition, PLAYER_Y + 18);
    this.playerShadow.setPosition(shadowX, PLAYER_Y + 28);
    this.playerShadow.setScale(Phaser.Math.Linear(1.05, 0.72, jumpLift), Phaser.Math.Linear(1, 0.46, jumpLift));
    this.playerShadow.setAlpha(Phaser.Math.Linear(0.28, 0.11, jumpLift));

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(24 * scale * 0.72, 34 * scale * 0.82, true);
    body.updateFromGameObject();
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
    const laneIndex = Phaser.Math.Between(0, LANE_FRACTIONS.length - 1);
    const kind: ObstacleKind = Phaser.Math.Between(0, 99) < 45 ? "low" : "high";
    const texture = kind === "low" ? TEXTURE_KEYS.lowObstacle : TEXTURE_KEYS.highObstacle;
    const baseWidth = kind === "low" ? 42 : 44;
    const baseHeight = kind === "low" ? 24 : 58;
    const spawnY = this.getRoadYAtDepth(OBSTACLE_SPAWN_DEPTH);

    const obstacle = this.physics.add.image(this.getLaneX(laneIndex, spawnY), spawnY, texture);
    obstacle.setData("kind", kind);
    obstacle.setData("laneIndex", laneIndex);
    obstacle.setData("baseWidth", baseWidth);
    obstacle.setData("baseHeight", baseHeight);
    obstacle.setData("depthProgress", OBSTACLE_SPAWN_DEPTH);
    obstacle.setData("approachSpeed", 0.44 + this.levelElapsedMs * 0.000004);
    this.obstacles.add(obstacle);

    const body = obstacle.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(baseWidth, baseHeight, true);
    body.moves = false;

    this.updateObstaclePerspective(obstacle);
  }

  private updateObstaclePerspective(obstacle: Phaser.Physics.Arcade.Image) {
    if (!obstacle.active || !obstacle.body) return;

    const laneIndex = (obstacle.getData("laneIndex") as number | undefined) ?? 1;
    const kind = (obstacle.getData("kind") as ObstacleKind | undefined) ?? "low";
    const depth = Phaser.Math.Clamp(
      (obstacle.getData("depthProgress") as number | undefined) ?? this.getDepthProgress(obstacle.y),
      0,
      OBSTACLE_DESPAWN_DEPTH,
    );
    const y = this.getRoadYAtDepth(Math.min(depth, 1));
    const x = this.getLaneX(laneIndex, y);
    const scale = kind === "low" ? Phaser.Math.Linear(0.24, 1.18, depth) : Phaser.Math.Linear(0.28, 1.28, depth);

    obstacle.setPosition(x, y);
    obstacle.setScale(scale);
    obstacle.setDepth(620 + Math.round(depth * 240));
    obstacle.setAlpha(Phaser.Math.Linear(0.5, 1, Math.min(depth, 1)));
    obstacle.setAngle(kind === "high" ? Phaser.Math.Linear(-8, 0, depth) : Phaser.Math.Linear(6, 0, depth));

    const body = obstacle.body as Phaser.Physics.Arcade.Body;
    const baseWidth = (obstacle.getData("baseWidth") as number | undefined) ?? 42;
    const baseHeight = (obstacle.getData("baseHeight") as number | undefined) ?? 24;
    const collisionScale = Phaser.Math.Linear(0.46, 1, depth);
    body.setSize(baseWidth * collisionScale, baseHeight * collisionScale, true);
    body.updateFromGameObject();
  }

  private advanceObstacles(delta: number) {
    if (delta <= 0) return;

    const deltaSeconds = delta / 1000;
    this.getGroupChildrenSafe(this.obstacles).forEach((child) => {
      const obstacle = child as Phaser.Physics.Arcade.Image;
      const currentDepth = (obstacle.getData("depthProgress") as number | undefined) ?? OBSTACLE_SPAWN_DEPTH;
      const approachSpeed = (obstacle.getData("approachSpeed") as number | undefined) ?? 0.44;
      const depthBoost = Phaser.Math.Linear(0.65, 2.15, Math.min(currentDepth, 1));
      const nextDepth = currentDepth + deltaSeconds * approachSpeed * depthBoost;

      if (nextDepth > OBSTACLE_DESPAWN_DEPTH) {
        obstacle.destroy();
        return;
      }

      obstacle.setData("depthProgress", nextDepth);
    });
  }

  private updateObstaclesPerspective() {
    this.getGroupChildrenSafe(this.obstacles).forEach((child) => {
      this.updateObstaclePerspective(child as Phaser.Physics.Arcade.Image);
    });
  }

  private createHud() {
    this.hudText = this.add
      .text(18, GAME_HEIGHT - 32, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f2f6ff",
      })
      .setDepth(1200);

    this.healthText = this.add
      .text(18, 86, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#ffe0e0",
        stroke: "#20142d",
        strokeThickness: 4,
      })
      .setDepth(1200);

    this.timerText = this.add
      .text(GAME_WIDTH - 18, GAME_HEIGHT - 32, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f2f6ff",
      })
      .setOrigin(1, 0)
      .setDepth(1200);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 64, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#fff5c7",
        stroke: "#0f1930",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(1200);
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
    const elapsedMs = this.levelEndTime ?? this.levelElapsedMs;
    const remaining = Math.max(0, RUN_DURATION_MS - elapsedMs);

    this.healthText.setText(`Lives: ${this.livesRemaining}`);
    this.hudText.setText(`Character: ${this.selectedCharacter.name} | Lane ${this.laneIndex + 1}/3`);
    this.timerText.setText(`Survive: ${(remaining / 1000).toFixed(1)}s`);
  }

  update(_time: number, delta: number) {
    const runnerActive = !this.levelComplete && !this.outOfLives;

    if (runnerActive) {
      this.levelElapsedMs += delta;
      this.handleLaneInput();
      this.handleJumpInput();
      this.checkRunnerCompletion();
    } else if (this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
      if (this.levelComplete) {
        this.scene.start("level-4", { characterId: this.selectedCharacter.id });
      } else {
        this.scene.start("character-select");
      }
    }

    this.updateRoadStripes(runnerActive ? delta : 0);
    this.advanceObstacles(runnerActive ? delta : 0);
    this.updateObstaclesPerspective();
    this.syncPlayerPerspective();
    this.cleanupOffscreenObstacles();
    this.updateHud();
  }

  private updateRoadStripes(delta: number) {
    if (delta > 0) {
      const speedFactor = Phaser.Math.Linear(0.36, 0.72, Math.min(this.levelElapsedMs / RUN_DURATION_MS, 1));
      this.roadScroll = (this.roadScroll + (delta / 1000) * speedFactor) % 1;
    }

    this.renderRoad();
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
    } else if (rightPressed && this.laneIndex < LANE_FRACTIONS.length - 1) {
      this.laneIndex += 1;
      this.moveToLane();
    }
  }

  private moveToLane() {
    if (this.laneTween) {
      this.laneTween.stop();
      this.laneTween = undefined;
    }

    this.laneTween = this.tweens.add({
      targets: this,
      lanePosition: this.laneIndex,
      duration: 150,
      ease: "Sine.easeOut",
      onUpdate: () => {
        this.syncPlayerPerspective();
      },
      onComplete: () => {
        this.laneTween = undefined;
      },
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
      onUpdate: () => {
        this.syncPlayerPerspective();
      },
      onComplete: () => {
        this.isJumping = false;
        this.jumpTween = undefined;
        this.syncPlayerPerspective();
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
    const livesLeft = loseRunLife(this);
    this.livesRemaining = livesLeft;

    if (livesLeft <= 0) {
      this.outOfLives = true;
      this.levelEndTime = this.levelElapsedMs;
      this.stopRunner();
      this.statusText.setText(`You can't play anymore. ${MAX_DEATHS} lives used. Press ENTER.`);
      return;
    }

    this.resetRunnerState();
    this.statusText.setText(`You crashed! Lives left: ${livesLeft}.`);
    this.time.delayedCall(900, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });
  }

  private resetRunnerState() {
    if (this.laneTween) {
      this.laneTween.stop();
      this.laneTween = undefined;
    }
    if (this.jumpTween) {
      this.jumpTween.stop();
      this.jumpTween = undefined;
    }

    this.player.setPosition(this.getLaneX(1, PLAYER_Y), PLAYER_Y);
    this.player.setVelocity(0, 0);
    this.laneIndex = 1;
    this.lanePosition = 1;
    this.isJumping = false;

    this.getGroupChildrenSafe(this.obstacles).forEach((child) => {
      child.destroy();
    });

    this.syncPlayerPerspective();
    this.cameras.main.shake(80, 0.004);
  }

  private checkRunnerCompletion() {
    if (this.levelComplete) return;
    if (this.levelElapsedMs < RUN_DURATION_MS) return;

    this.levelComplete = true;
    this.levelEndTime = this.levelElapsedMs;
    this.stopRunner();
    this.statusText.setText("Level 3 complete! Press ENTER for Level 4.");
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
      if (obstacle.y > ROAD_BOTTOM_Y + 120) {
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
    this.roadScroll = 0;
  }
}
