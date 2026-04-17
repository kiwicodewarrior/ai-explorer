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

type CollapsingEscapeSceneData = {
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

const LEVEL_WIDTH = 4600;
const LEVEL_HEIGHT = 760;
const PLATFORM_HEIGHT = 22;
const START_PLATFORM_Y = LEVEL_HEIGHT - 76;
const START_X = 120;
const START_Y = START_PLATFORM_Y - PLATFORM_HEIGHT / 2 - 34;
const PLAYER_SPEED = 242;
const PLAYER_JUMP_VELOCITY = 462;
const GRAVITY_Y = 980;
const HIT_INVULN_MS = 900;
const MAX_DEATHS = DEFAULT_RUN_LIVES;
const WAVE_START_X = -280;
const WAVE_WIDTH = 240;
const WAVE_SPEED = 84;
const WAVE_DELAY_MS = 1300;
const CRUMBLE_DELAY_MS = 260;
const CRUMBLE_DROP_DISTANCE = 84;
const GOAL_X = LEVEL_WIDTH - 90;
const GOAL_Y = 250;

const STABLE_PLATFORM_LAYOUT: readonly PlatformConfig[] = [
  { x: 180, y: START_PLATFORM_Y, width: 280, height: PLATFORM_HEIGHT },
  { x: 660, y: 626, width: 186, height: PLATFORM_HEIGHT },
  { x: 790, y: 648, width: 104, height: PLATFORM_HEIGHT },
  { x: 1140, y: 606, width: 196, height: PLATFORM_HEIGHT },
  { x: 1276, y: 584, width: 104, height: PLATFORM_HEIGHT },
  { x: 1620, y: 506, width: 204, height: PLATFORM_HEIGHT },
  { x: 1752, y: 548, width: 108, height: PLATFORM_HEIGHT },
  { x: 2100, y: 626, width: 200, height: PLATFORM_HEIGHT },
  { x: 2232, y: 604, width: 108, height: PLATFORM_HEIGHT },
  { x: 2580, y: 506, width: 204, height: PLATFORM_HEIGHT },
  { x: 2712, y: 528, width: 108, height: PLATFORM_HEIGHT },
  { x: 3060, y: 446, width: 214, height: PLATFORM_HEIGHT },
  { x: 3190, y: 404, width: 104, height: PLATFORM_HEIGHT },
  { x: 3490, y: 344, width: 280, height: PLATFORM_HEIGHT },
  { x: 3480, y: 292, width: 132, height: PLATFORM_HEIGHT },
  { x: 3770, y: 364, width: 180, height: PLATFORM_HEIGHT },
  { x: 4040, y: 426, width: 188, height: PLATFORM_HEIGHT },
  { x: 4290, y: 350, width: 180, height: PLATFORM_HEIGHT },
  { x: 4490, y: 292, width: 220, height: PLATFORM_HEIGHT },
] as const;

const CRUMBLE_PLATFORM_LAYOUT: readonly PlatformConfig[] = [
  { x: 410, y: START_PLATFORM_Y, width: 150, height: PLATFORM_HEIGHT },
  { x: 900, y: 666, width: 150, height: PLATFORM_HEIGHT },
  { x: 1380, y: 566, width: 160, height: PLATFORM_HEIGHT },
  { x: 1860, y: 566, width: 150, height: PLATFORM_HEIGHT },
  { x: 2340, y: 586, width: 160, height: PLATFORM_HEIGHT },
  { x: 2820, y: 546, width: 150, height: PLATFORM_HEIGHT },
  { x: 3300, y: 406, width: 150, height: PLATFORM_HEIGHT },
  { x: 3905, y: 392, width: 150, height: PLATFORM_HEIGHT },
  { x: 4170, y: 382, width: 154, height: PLATFORM_HEIGHT },
  { x: 4405, y: 318, width: 148, height: PLATFORM_HEIGHT },
] as const;

const TEXTURE_KEYS = {
  player: "collapsing-escape-player",
  stablePlatform: "collapsing-escape-stable-platform",
  crumblePlatform: "collapsing-escape-crumble-platform",
  goal: "collapsing-escape-goal",
} as const;

export class CollapsingEscapeScene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player!: Phaser.Physics.Arcade.Image;
  private stablePlatforms!: Phaser.Physics.Arcade.StaticGroup;
  private crumblePlatforms!: Phaser.Physics.Arcade.StaticGroup;
  private goal!: Phaser.Physics.Arcade.Image;

  private stablePlatformCollider?: Phaser.Physics.Arcade.Collider;
  private crumblePlatformCollider?: Phaser.Physics.Arcade.Collider;
  private goalOverlap?: Phaser.Physics.Arcade.Collider;

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
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private collapseWave!: Phaser.GameObjects.Rectangle;
  private collapseWaveGlow!: Phaser.GameObjects.Rectangle;

  private livesRemaining = DEFAULT_RUN_LIVES;
  private outOfLives = false;
  private levelComplete = false;
  private transitioningToBoss = false;
  private damageCooldownUntil = 0;
  private levelStartAt = 0;
  private waveFrontX = WAVE_START_X;
  private collapseEvents: Phaser.Time.TimerEvent[] = [];
  private collapseTweens: Phaser.Tweens.Tween[] = [];

  private upgrade: UpgradeOption = "triple-damage";
  private damageBonus = 1;
  private cloneCount = 0;

  constructor() {
    super("collapsing-escape");
  }

  create(data: CollapsingEscapeSceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.outOfLives = this.livesRemaining <= 0;
    this.levelComplete = false;
    this.transitioningToBoss = false;
    this.damageCooldownUntil = 0;
    this.levelStartAt = this.time.now;
    this.waveFrontX = WAVE_START_X;
    this.collapseEvents = [];
    this.collapseTweens = [];
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
    this.physics.world.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT + 220);

    this.cameras.main.setBackgroundColor(0x120d10);
    this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT + 220);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createPlatforms();
    this.createGoal();
    this.createPlayer();
    this.createHud();
    this.bindInput();
    this.updateWaveVisuals();
    this.updateHud();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(220, 160);

    this.statusText.setText("Run forward. Cracked platforms collapse after you touch them. The collapse wave starts behind you.");
    this.time.delayedCall(2800, () => {
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

    if (!this.textures.exists(TEXTURE_KEYS.stablePlatform)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x5f636f, 1);
      g.fillRoundedRect(0, 0, 160, PLATFORM_HEIGHT, 6);
      g.fillStyle(0x8b909f, 1);
      g.fillRect(10, 4, 140, 4);
      g.fillStyle(0x2c2d36, 1);
      g.fillRect(0, PLATFORM_HEIGHT - 8, 160, 8);
      g.generateTexture(TEXTURE_KEYS.stablePlatform, 160, PLATFORM_HEIGHT);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.crumblePlatform)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x7b5448, 1);
      g.fillRoundedRect(0, 0, 160, PLATFORM_HEIGHT, 6);
      g.lineStyle(2, 0xf4c9ae, 0.8);
      g.beginPath();
      g.moveTo(18, 5);
      g.lineTo(42, 15);
      g.lineTo(68, 4);
      g.moveTo(88, 4);
      g.lineTo(112, 16);
      g.lineTo(144, 5);
      g.strokePath();
      g.fillStyle(0x3b241d, 1);
      g.fillRect(0, PLATFORM_HEIGHT - 8, 160, 8);
      g.generateTexture(TEXTURE_KEYS.crumblePlatform, 160, PLATFORM_HEIGHT);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.goal)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x2a323f, 1);
      g.fillRoundedRect(0, 0, 60, 84, 10);
      g.fillStyle(0xb9f7ff, 0.85);
      g.fillRoundedRect(10, 10, 40, 64, 8);
      g.lineStyle(3, 0xffffff, 0.85);
      g.strokeRoundedRect(12, 12, 36, 60, 8);
      g.generateTexture(TEXTURE_KEYS.goal, 60, 84);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT / 2, LEVEL_WIDTH, LEVEL_HEIGHT, 0x120d10);
    this.add.rectangle(LEVEL_WIDTH / 2, 140, LEVEL_WIDTH, 240, 0x2c2027, 0.8);
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT - 50, LEVEL_WIDTH, 100, 0x24090a, 0.95);
    this.add.rectangle(LEVEL_WIDTH / 2, LEVEL_HEIGHT - 22, LEVEL_WIDTH, 20, 0xff5a2f, 0.45);

    for (let x = 100; x < LEVEL_WIDTH; x += 220) {
      this.add.rectangle(x, LEVEL_HEIGHT - 180, 10, 220, 0x2f2329, 0.44);
      this.add.rectangle(x + 34, LEVEL_HEIGHT - 250, 6, 150, 0x4f3842, 0.24);
    }

    for (let x = 180; x < LEVEL_WIDTH; x += 280) {
      this.add.triangle(x, LEVEL_HEIGHT - 60, 0, 0, 40, -58, 80, 0, 0x4d1713, 0.52).setOrigin(0.5, 1);
    }

    this.collapseWave = this.add.rectangle(WAVE_START_X + WAVE_WIDTH / 2, LEVEL_HEIGHT / 2, WAVE_WIDTH, LEVEL_HEIGHT, 0xff6c3b, 0.16);
    this.collapseWaveGlow = this.add.rectangle(WAVE_START_X + WAVE_WIDTH, LEVEL_HEIGHT / 2, 22, LEVEL_HEIGHT, 0xffd8a0, 0.4);

    this.add
      .text(GAME_WIDTH / 2, 36, "Collapsing Escape", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#fff2e8",
        stroke: "#0a0507",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.add
      .text(GAME_WIDTH / 2, 72, "Keep moving. The ruin collapses behind you.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f0cfc0",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
  }

  private createPlatforms() {
    this.stablePlatforms = this.physics.add.staticGroup();
    this.crumblePlatforms = this.physics.add.staticGroup();

    STABLE_PLATFORM_LAYOUT.forEach((config) => {
      const platform = this.stablePlatforms.create(config.x, config.y, TEXTURE_KEYS.stablePlatform) as Phaser.Physics.Arcade.Image;
      platform.setDisplaySize(config.width, config.height);
      platform.refreshBody();
    });

    CRUMBLE_PLATFORM_LAYOUT.forEach((config) => {
      const platform = this.crumblePlatforms.create(config.x, config.y, TEXTURE_KEYS.crumblePlatform) as Phaser.Physics.Arcade.Image;
      platform.setDisplaySize(config.width, config.height);
      platform.setData("armed", false);
      platform.setData("collapsed", false);
      platform.refreshBody();
    });
  }

  private createGoal() {
    this.goal = this.physics.add.staticImage(GOAL_X, GOAL_Y, TEXTURE_KEYS.goal);
    this.goal.setDepth(8);
    this.goal.refreshBody();

    this.add
      .text(GOAL_X, GOAL_Y - 70, "Boss Gate", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#fff0be",
        stroke: "#050913",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
  }

  private createPlayer() {
    this.player = this.physics.add.image(START_X, START_Y, TEXTURE_KEYS.player);
    this.player.setTint(this.selectedCharacter.primaryColor);
    this.player.setDepth(10);
    this.player.setDragX(1400);
    this.player.setMaxVelocity(360, 720);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 34, true);

    this.stablePlatformCollider = this.physics.add.collider(this.player, this.stablePlatforms);
    this.crumblePlatformCollider = this.physics.add.collider(this.player, this.crumblePlatforms, (_player, platform) => {
      this.armCrumblePlatform(platform as Phaser.Physics.Arcade.Image);
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
        color: "#fff6f0",
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.hudText = this.add
      .text(GAME_WIDTH - 20, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#f0dbd2",
        align: "right",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(20);

    this.waveText = this.add
      .text(GAME_WIDTH / 2, 16, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#ffd3b0",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(20);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 24, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#fff5ed",
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

  update(_time: number, delta: number) {
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

    this.updateMovement();
    this.updateCollapseWave(delta);

    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    if (body && this.player.y > LEVEL_HEIGHT + 110) {
      this.handleDeath("You fell with the ruins.");
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

  private updateCollapseWave(delta: number) {
    if (this.time.now - this.levelStartAt >= WAVE_DELAY_MS) {
      this.waveFrontX += (WAVE_SPEED * delta) / 1000;
    }

    this.updateWaveVisuals();

    const waveEdge = this.waveFrontX + WAVE_WIDTH;
    if (this.player.x < waveEdge - 18) {
      this.handleDeath("The collapse wave caught you.");
      return;
    }

    this.forEachCrumblePlatform((platform) => {
      if (!platform.active || platform.getData("armed") || platform.getData("collapsed")) return;
      if (platform.x + platform.displayWidth / 2 < waveEdge - 30) {
        this.armCrumblePlatform(platform);
      }
    });
  }

  private updateWaveVisuals() {
    this.collapseWave.setPosition(this.waveFrontX + WAVE_WIDTH / 2, LEVEL_HEIGHT / 2);
    this.collapseWaveGlow.setPosition(this.waveFrontX + WAVE_WIDTH, LEVEL_HEIGHT / 2);
  }

  private armCrumblePlatform(platform: Phaser.Physics.Arcade.Image) {
    if (!platform.active || platform.getData("armed") || platform.getData("collapsed")) return;

    platform.setData("armed", true);
    platform.setTint(0xffcfa5);

    this.collapseTweens.push(
      this.tweens.add({
        targets: platform,
        angle: { from: -2, to: 2 },
        duration: 70,
        yoyo: true,
        repeat: 3,
        ease: "Sine.inOut",
      }),
    );

    const collapseEvent = this.time.delayedCall(CRUMBLE_DELAY_MS, () => {
      if (!platform.scene || !platform.active) return;
      if (platform.getData("collapsed")) return;

      platform.setData("collapsed", true);
      const body = platform.body as Phaser.Physics.Arcade.StaticBody | undefined;
      if (body) {
        body.enable = false;
      }

      this.collapseTweens.push(
        this.tweens.add({
          targets: platform,
          y: platform.y + CRUMBLE_DROP_DISTANCE,
          alpha: 0,
          angle: 12,
          duration: 420,
          ease: "Cubic.easeIn",
          onComplete: () => {
            platform.destroy();
          },
        }),
      );
    });
    this.collapseEvents.push(collapseEvent);
  }

  private forEachCrumblePlatform(callback: (platform: Phaser.Physics.Arcade.Image) => void) {
    const children = this.crumblePlatforms?.children?.entries as Phaser.GameObjects.GameObject[] | undefined;
    if (!children) return;

    children.forEach((child) => {
      if (child instanceof Phaser.Physics.Arcade.Image) {
        callback(child);
      }
    });
  }

  private handleDeath(message: string) {
    if (this.levelComplete || this.outOfLives) return;
    if (this.time.now < this.damageCooldownUntil) return;

    this.damageCooldownUntil = this.time.now + HIT_INVULN_MS;
    const livesLeft = loseRunLife(this);
    this.livesRemaining = livesLeft;

    this.cameras.main.shake(120, 0.007);
    this.player.setVelocity(0, 0);

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

    this.levelComplete = true;
    this.player.setVelocityX(0);
    this.statusText.setText("Escape complete! Press ENTER for the size shift level.");
    this.cameras.main.flash(180, 255, 235, 210, false);
  }

  private updateHud() {
    const waveEdge = this.waveFrontX + WAVE_WIDTH;
    const lead = Math.max(0, Math.floor(this.player.x - waveEdge));
    this.livesText.setText(`Lives: ${this.livesRemaining}`);
    this.waveText.setText(`Collapse Lead: ${lead}px`);
    this.hudText.setText(`Character: ${this.selectedCharacter.name} | Escape`);
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
    this.scene.start("size-shift", {
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
    this.stablePlatformCollider?.destroy();
    this.crumblePlatformCollider?.destroy();
    this.goalOverlap?.destroy();

    this.collapseEvents.forEach((event) => event.remove(false));
    this.collapseEvents = [];
    this.collapseTweens.forEach((tween) => tween.remove());
    this.collapseTweens = [];

    this.clearGroupSafe(this.stablePlatforms);
    this.clearGroupSafe(this.crumblePlatforms);
    this.player?.destroy();
    this.goal?.destroy();
    this.collapseWave?.destroy();
    this.collapseWaveGlow?.destroy();
    this.livesText?.destroy();
    this.hudText?.destroy();
    this.statusText?.destroy();
    this.waveText?.destroy();
  }
}
