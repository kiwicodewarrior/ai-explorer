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
  addGems,
  finalizeCompletedRun,
  type CompletedRunSummary,
  DEFAULT_RUN_LIVES,
  getGemCount,
  getRunLives,
  loseRunLife,
  rememberRunCharacter,
  REVIVE_GEM_COST,
  useReviveGem,
} from "../systems/runState";

type UpgradeOption = "triple-damage" | "two-clones";

type Level10SceneData = {
  characterId?: CharacterId;
  currentHealth?: number;
  upgrade?: UpgradeOption;
  damageBonus?: number;
  cloneCount?: number;
};

type BossPhase = "fight" | "scripted" | "postscript" | "victory";

const GRAVITY_Y = 980;
const FLOOR_HEIGHT = 64;
const FLOOR_Y = GAME_HEIGHT - FLOOR_HEIGHT / 2;
const PLAYER_START_X = 126;
const PLAYER_START_Y = GAME_HEIGHT - FLOOR_HEIGHT - 32;
const PLAYER_SPEED = 235;
const PLAYER_JUMP_VELOCITY = 470;
const MAX_DEATHS = DEFAULT_RUN_LIVES;
const HIT_INVULN_MS = 900;

const BOSS_MAX_HEALTH = 30;
const BOSS_X = GAME_WIDTH - 170;
const BOSS_Y = 164;
const ATTACK_RANGE = 220;
const ATTACK_WINDOW_MS = 2_400;
const BOSS_ATTACK_DELAY_START_MS = 2_200;
const BOSS_ATTACK_DELAY_MIN_MS = 850;
const LASER_SPEED_START = 280;
const LASER_SPEED_MAX = 450;
const LASERS_PER_BURST = 7;
const LASER_BURST_INTERVAL_MS = 90;
const POST_BURST_OPEN_DELAY_MS = (LASERS_PER_BURST - 1) * LASER_BURST_INTERVAL_MS + 160;
const LASER_SPREAD_DEGREES = 32;
const SCRIPTED_SEQUENCE_MS = 30_000;
const BOSS_FALL_START_MS = 900;
const THIEF_REVEAL_MS = 4_000;
const THIEF_RUN_START_MS = 9_000;
const THIEF_TRIP_START_MS = 16_000;
const JAIL_SPAWN_MS = 21_000;
const THIEF_CAPTURE_ENABLE_MS = SCRIPTED_SEQUENCE_MS;
const THIEF_GROUND_Y = GAME_HEIGHT - FLOOR_HEIGHT - 26;
const THIEF_REVEAL_X = BOSS_X + 28;
const THIEF_REVEAL_Y = BOSS_Y + 10;
const THIEF_RUN_TARGET_X = 618;
const THIEF_JAIL_X = 548;
const THIEF_JAIL_Y = THIEF_GROUND_Y;

const PLATFORM_LAYOUT = [
  { x: 160, y: 432, width: 150, height: 22 },
  { x: 304, y: 346, width: 150, height: 22 },
  { x: GAME_WIDTH / 2 - 150, y: 384, width: 190, height: 22 },
  { x: GAME_WIDTH / 2 - 4, y: 252, width: 150, height: 22 },
  { x: GAME_WIDTH / 2 + 24, y: 308, width: 180, height: 22 },
  { x: GAME_WIDTH / 2 + 212, y: 390, width: 160, height: 22 },
  { x: GAME_WIDTH - 270, y: 300, width: 150, height: 22 },
  { x: GAME_WIDTH - 210, y: 228, width: 260, height: 24 },
] as const;

const TEXTURE_KEYS = {
  player: "level10-player",
  platform: "level10-platform",
  ground: "level10-ground",
  boss: "level10-boss",
  laser: "level10-laser",
  thief: "level10-thief",
  money: "level10-money",
} as const;

export class Level10Scene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player?: Phaser.Physics.Arcade.Image;
  private platforms?: Phaser.Physics.Arcade.StaticGroup;
  private lasers?: Phaser.Physics.Arcade.Group;

  private bossSprite?: Phaser.GameObjects.Image;
  private bossGlow?: Phaser.GameObjects.Ellipse;
  private thiefSprite?: Phaser.GameObjects.Image;
  private moneySprite?: Phaser.GameObjects.Image;
  private cloneSprites: Phaser.GameObjects.Image[] = [];
  private thiefCaptureZone?: Phaser.GameObjects.Zone;
  private thiefFocusGlow?: Phaser.GameObjects.Ellipse;
  private jailBars?: Phaser.GameObjects.Container;

  private playerPlatformCollider?: Phaser.Physics.Arcade.Collider;
  private laserOverlap?: Phaser.Physics.Arcade.Collider;
  private thiefOverlap?: Phaser.Physics.Arcade.Collider;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private upKey?: Phaser.Input.Keyboard.Key;
  private jumpKey?: Phaser.Input.Keyboard.Key;
  private aKey?: Phaser.Input.Keyboard.Key;
  private dKey?: Phaser.Input.Keyboard.Key;
  private wKey?: Phaser.Input.Keyboard.Key;
  private attackKey?: Phaser.Input.Keyboard.Key;
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private reviveKey?: Phaser.Input.Keyboard.Key;

  private hudText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  private livesRemaining = DEFAULT_RUN_LIVES;
  private outOfLives = false;
  private phase: BossPhase = "fight";
  private bossHealth = BOSS_MAX_HEALTH;
  private bossVulnerable = false;
  private damageCooldownUntil = 0;
  private upgrade: UpgradeOption = "triple-damage";
  private damageBonus = 1;
  private cloneCount = 0;
  private transitioningOut = false;
  private bossGemAwarded = false;
  private thiefLootAttached = false;
  private finalRunSummary?: CompletedRunSummary;

  private bossAttackTimer?: Phaser.Time.TimerEvent;
  private attackWindowTimer?: Phaser.Time.TimerEvent;
  private scriptedTimers: Phaser.Time.TimerEvent[] = [];
  private scriptedTweens: Phaser.Tweens.Tween[] = [];
  private thiefNervousTween?: Phaser.Tweens.Tween;
  private thiefRunTween?: Phaser.Tweens.Tween;
  private thiefRunBobTween?: Phaser.Tweens.Tween;
  private thiefSadTween?: Phaser.Tweens.Tween;

  constructor() {
    super("level-10");
  }

  create(data: Level10SceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.upgrade =
      data.upgrade ??
      ((this.registry.get("level9Upgrade") as UpgradeOption | undefined) ?? "triple-damage");
    this.damageBonus =
      data.damageBonus ??
      ((this.registry.get("level9DamageMultiplier") as number | undefined) ?? (this.upgrade === "triple-damage" ? 3 : 1));
    this.cloneCount =
      data.cloneCount ??
      ((this.registry.get("level9CloneCount") as number | undefined) ?? (this.upgrade === "two-clones" ? 2 : 0));

    this.outOfLives = this.livesRemaining <= 0;
    this.phase = "fight";
    this.bossHealth = BOSS_MAX_HEALTH;
    this.bossVulnerable = false;
    this.damageCooldownUntil = 0;
    this.transitioningOut = false;
    this.bossGemAwarded = false;
    this.thiefLootAttached = false;
    this.finalRunSummary = undefined;
    this.cloneSprites = [];
    this.bossAttackTimer = undefined;
    this.attackWindowTimer = undefined;
    this.scriptedTimers = [];
    this.scriptedTweens = [];
    this.thiefNervousTween = undefined;
    this.thiefRunTween = undefined;
    this.thiefRunBobTween = undefined;
    this.thiefSadTween = undefined;
    this.thiefSprite = undefined;
    this.moneySprite = undefined;
    this.thiefCaptureZone = undefined;
    this.thiefFocusGlow = undefined;
    this.jailBars = undefined;

    this.physics.world.gravity.y = GRAVITY_Y;
    this.cameras.main.setBackgroundColor(0x0a0b12);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createPlatforms();
    this.createBoss();
    this.createPlayer();
    this.createLasers();
    this.createClones();
    this.createHud();
    this.bindInput();
    this.updateHud();

    this.statusText.setText("Boss fight! Dodge the lasers. When the boss opens up, get close and press F to attack.");
    this.time.delayedCall(2200, () => {
      if (this.phase === "fight" && !this.outOfLives && !this.bossVulnerable) {
        this.statusText.setText("");
      }
    });

    this.scheduleNextBossAttack(1_400);

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
      g.fillStyle(0x4c5670, 1);
      g.fillRoundedRect(0, 0, 128, 22, 6);
      g.fillStyle(0x242b3f, 1);
      g.fillRect(0, 14, 128, 8);
      g.fillStyle(0x8ea0c9, 0.75);
      g.fillRect(10, 4, 108, 4);
      g.generateTexture(TEXTURE_KEYS.platform, 128, 22);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.ground)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x2d2431, 1);
      g.fillRect(0, 0, 128, FLOOR_HEIGHT);
      g.fillStyle(0x5b3f46, 1);
      g.fillRect(0, 0, 128, 14);
      g.fillStyle(0x140f18, 1);
      for (let x = 14; x < 128; x += 24) {
        g.fillRect(x, 20, 10, FLOOR_HEIGHT - 22);
      }
      g.generateTexture(TEXTURE_KEYS.ground, 128, FLOOR_HEIGHT);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.boss)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x6a2035, 1);
      g.fillRoundedRect(16, 10, 56, 56, 12);
      g.fillStyle(0xd7547f, 1);
      g.fillCircle(32, 34, 8);
      g.fillCircle(56, 34, 8);
      g.fillStyle(0x1a0711, 1);
      g.fillCircle(32, 34, 4);
      g.fillCircle(56, 34, 4);
      g.fillStyle(0xffd576, 1);
      g.fillTriangle(38, 46, 50, 46, 44, 58);
      g.fillStyle(0x3c1020, 1);
      g.fillRect(22, 66, 12, 18);
      g.fillRect(54, 66, 12, 18);
      g.generateTexture(TEXTURE_KEYS.boss, 88, 88);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.laser)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xfff2d1, 1);
      g.fillRoundedRect(0, 4, 34, 8, 4);
      g.fillStyle(0xff5a82, 1);
      g.fillRoundedRect(8, 2, 26, 12, 4);
      g.generateTexture(TEXTURE_KEYS.laser, 34, 16);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.thief)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x2d3548, 1);
      g.fillRoundedRect(10, 4, 20, 14, 5);
      g.fillStyle(0x182131, 1);
      g.fillRoundedRect(8, 18, 24, 22, 6);
      g.fillStyle(0x111827, 1);
      g.fillRect(12, 40, 6, 10);
      g.fillRect(22, 40, 6, 10);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(16, 25, 2);
      g.fillCircle(24, 25, 2);
      g.generateTexture(TEXTURE_KEYS.thief, 40, 52);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.money)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x7b5a28, 1);
      g.fillRoundedRect(8, 12, 28, 24, 6);
      g.fillStyle(0xcba85c, 1);
      g.fillCircle(22, 12, 10);
      g.fillStyle(0x534014, 1);
      g.fillRect(18, 18, 8, 10);
      g.generateTexture(TEXTURE_KEYS.money, 44, 40);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0b12);
    this.add.rectangle(GAME_WIDTH / 2, 112, GAME_WIDTH, 208, 0x17162a, 0.9);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 92, GAME_WIDTH, 184, 0x17111a, 0.94);

    for (let x = 58; x < GAME_WIDTH; x += 128) {
      this.add.rectangle(x, GAME_HEIGHT / 2, 2, GAME_HEIGHT - 118, 0x43354f, 0.26);
    }
    for (let y = 112; y < GAME_HEIGHT - 72; y += 68) {
      this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 92, 2, 0x43354f, 0.16);
    }

    this.add.circle(132, 88, 40, 0xffd37c, 0.18);
    this.add.circle(132, 88, 68, 0xffb55f, 0.08);

    this.add.rectangle(BOSS_X, 150, 220, 120, 0x241726, 0.7).setStrokeStyle(2, 0x7b5a6c, 0.6);
    this.add.rectangle(BOSS_X, 182, 84, 92, 0x311d2f, 0.92).setStrokeStyle(2, 0xa27a8c, 0.7);
    this.add.rectangle(BOSS_X, 206, 120, 26, 0x231625, 0.92);

    this.add
      .text(GAME_WIDTH / 2, 36, "Level 10: Boss Fight", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f7fbff",
        stroke: "#05080f",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.add
      .text(GAME_WIDTH / 2, 72, "The boss fires faster as it weakens. Watch for the opening and strike back.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#d7e3f7",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
  }

  private createPlatforms() {
    this.platforms = this.physics.add.staticGroup();

    const ground = this.platforms.create(GAME_WIDTH / 2, FLOOR_Y, TEXTURE_KEYS.ground) as Phaser.Physics.Arcade.Image;
    ground.setDisplaySize(GAME_WIDTH, FLOOR_HEIGHT);
    ground.refreshBody();

    PLATFORM_LAYOUT.forEach((config) => {
      const platform = this.platforms!.create(config.x, config.y, TEXTURE_KEYS.platform) as Phaser.Physics.Arcade.Image;
      platform.setDisplaySize(config.width, config.height);
      platform.refreshBody();
    });
  }

  private createBoss() {
    this.bossGlow = this.add.ellipse(BOSS_X, BOSS_Y + 14, 126, 126, 0xff698f, 0.15).setDepth(11);
    this.bossSprite = this.add.image(BOSS_X, BOSS_Y, TEXTURE_KEYS.boss).setDepth(14);
  }

  private createPlayer() {
    this.player = this.physics.add.image(PLAYER_START_X, PLAYER_START_Y, TEXTURE_KEYS.player);
    this.player.setTint(this.selectedCharacter.primaryColor);
    this.player.setDepth(20);
    this.player.setCollideWorldBounds(true);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 34, true);

    this.playerPlatformCollider = this.physics.add.collider(this.player, this.platforms!);
  }

  private createLasers() {
    this.lasers = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    this.laserOverlap = this.physics.add.overlap(this.player!, this.lasers, (_player, laser) => {
      (laser as Phaser.Physics.Arcade.Image).destroy();
      this.handleLaserHit();
    });
  }

  private createClones() {
    if (this.cloneCount <= 0) return;

    for (let index = 0; index < this.cloneCount; index += 1) {
      const clone = this.add
        .image(PLAYER_START_X, PLAYER_START_Y, TEXTURE_KEYS.player)
        .setTint(this.selectedCharacter.accentColor)
        .setAlpha(0.45)
        .setDepth(18);
      this.cloneSprites.push(clone);
    }
  }

  private createHud() {
    this.hudText = this.add
      .text(18, GAME_HEIGHT - 32, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#eef6ff",
      })
      .setDepth(100);

    this.healthText = this.add
      .text(18, 86, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#ffe0e0",
        stroke: "#20142d",
        strokeThickness: 5,
      })
      .setDepth(100);

    this.bossText = this.add
      .text(GAME_WIDTH - 18, 86, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#ffd9e6",
        stroke: "#321321",
        strokeThickness: 5,
      })
      .setOrigin(1, 0)
      .setDepth(100);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 62, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#f6f8ff",
        stroke: "#08111c",
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
    keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.ENTER, Phaser.Input.Keyboard.KeyCodes.F]);
    this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.upKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.jumpKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.aKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.dKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.wKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.attackKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.reviveKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  private updateHud() {
    const upgradeLabel = this.upgrade === "two-clones" ? `Clones: ${this.cloneCount}` : `Damage Up: +${Math.max(0, this.damageBonus - 1)}`;

    this.healthText.setText(`Lives: ${this.livesRemaining}`);
    this.hudText.setText(`Character: ${this.selectedCharacter.name} | Attack: F | ${upgradeLabel}`);
    this.bossText.setText(
      this.phase === "victory"
        ? "Thief Captured"
        : this.phase === "postscript"
          ? "Thief Jailed"
          : this.phase === "scripted"
            ? "Boss Defeated"
            : `Boss HP: ${this.bossHealth}/${BOSS_MAX_HEALTH}`,
    );
  }

  update() {
    if (this.outOfLives || this.phase === "scripted" || this.phase === "victory") {
      if (
        this.outOfLives &&
        this.reviveKey &&
        Phaser.Input.Keyboard.JustDown(this.reviveKey) &&
        useReviveGem(this)
      ) {
        this.scene.restart({
          characterId: this.selectedCharacter.id,
          upgrade: this.upgrade,
          damageBonus: this.damageBonus,
          cloneCount: this.cloneCount,
        });
        return;
      }
      if ((this.outOfLives || this.phase === "victory") && this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
        this.leaveScene();
      }
      this.player?.setVelocity(0, 0);
      this.updateClones();
      this.syncThiefLootPosition();
      this.updateHud();
      return;
    }

    this.updateMovement();
    if (this.phase === "fight") {
      this.cleanupOffscreenLasers();
    }
    this.updateClones();
    this.syncThiefLootPosition();

    if (this.phase === "fight" && this.attackKey && Phaser.Input.Keyboard.JustDown(this.attackKey)) {
      this.attemptBossAttack();
    }

    this.updateHud();
  }

  private updateMovement() {
    if (!this.player) return;

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

  private updateClones() {
    if (!this.player || this.cloneSprites.length === 0) return;

    const offsets = [-26, 26];
    this.cloneSprites.forEach((clone, index) => {
      const offsetX = offsets[index] ?? 0;
      clone.setPosition(this.player!.x + offsetX, this.player!.y + 4);
      clone.setFlipX(this.player!.flipX);
      clone.setVisible(this.phase !== "victory");
    });
  }

  private syncThiefLootPosition() {
    if (!this.thiefLootAttached || !this.thiefSprite || !this.moneySprite) return;

    const lootOffsetX = this.thiefSprite.flipX ? -22 : 22;
    this.moneySprite.setPosition(this.thiefSprite.x + lootOffsetX, this.thiefSprite.y + 12);
    this.moneySprite.setFlipX(this.thiefSprite.flipX);
  }

  private addScriptedTween(config: Phaser.Types.Tweens.TweenBuilderConfig) {
    const tween = this.tweens.add(config);
    this.scriptedTweens.push(tween);
    return tween;
  }

  private addScriptedTimer(delay: number, callback: () => void) {
    const timer = this.time.delayedCall(delay, callback);
    this.scriptedTimers.push(timer);
    return timer;
  }

  private getAudioContext() {
    const soundManager = this.sound as Phaser.Sound.WebAudioSoundManager & { context?: AudioContext };
    const context = soundManager.context;
    if (!context) return undefined;

    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }

    return context;
  }

  private playToneSweep(startFrequency: number, endFrequency: number, durationMs: number, type: OscillatorType, volume: number) {
    const context = this.getAudioContext();
    if (!context) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const endTime = now + durationMs / 1000;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(32, endFrequency), endTime);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(endTime);
  }

  private playBossFallSound() {
    this.playToneSweep(190, 46, 900, "sawtooth", 0.065);
    this.playToneSweep(110, 38, 980, "triangle", 0.04);
  }

  private playTripSound() {
    this.playToneSweep(320, 78, 420, "square", 0.045);
    this.playToneSweep(180, 52, 540, "triangle", 0.035);
  }

  private playJailClangSound() {
    this.playToneSweep(920, 260, 240, "square", 0.05);
    this.playToneSweep(620, 180, 320, "triangle", 0.03);
  }

  private scheduleNextBossAttack(delayOverride?: number) {
    if (this.phase !== "fight" || this.outOfLives) return;
    if (this.bossAttackTimer) {
      this.bossAttackTimer.remove(false);
      this.bossAttackTimer = undefined;
    }

    this.bossAttackTimer = this.time.addEvent({
      delay: delayOverride ?? this.getBossAttackDelay(),
      callback: () => {
        this.startBossAttack();
      },
    });
  }

  private getBossAttackDelay() {
    return Phaser.Math.Linear(BOSS_ATTACK_DELAY_MIN_MS, BOSS_ATTACK_DELAY_START_MS, this.bossHealth / BOSS_MAX_HEALTH);
  }

  private getLaserSpeed() {
    return Phaser.Math.Linear(LASER_SPEED_MAX, LASER_SPEED_START, this.bossHealth / BOSS_MAX_HEALTH);
  }

  private startBossAttack() {
    if (this.phase !== "fight" || this.outOfLives || !this.player || !this.bossSprite || !this.bossGlow) return;

    this.closeAttackWindow(false);
    this.statusText.setText("Boss charging lasers!");
    this.bossGlow.setAlpha(0.3);
    this.bossGlow.setScale(1);

    this.tweens.add({
      targets: this.bossGlow,
      alpha: 0.8,
      scaleX: 1.24,
      scaleY: 1.24,
      duration: 320,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.fireBossBurst();
      },
    });
  }

  private fireBossBurst() {
    if (this.phase !== "fight" || this.outOfLives || !this.player || !this.bossSprite || !this.lasers) return;

    const baseAngle = Phaser.Math.Angle.Between(BOSS_X - 36, BOSS_Y + 8, this.player.x, this.player.y);
    const laserSpeed = this.getLaserSpeed();
    this.cameras.main.shake(100, 0.0022);

    for (let index = 0; index < LASERS_PER_BURST; index += 1) {
      this.time.delayedCall(index * LASER_BURST_INTERVAL_MS, () => {
        if (this.phase !== "fight" || this.outOfLives || !this.lasers) return;

        const spreadOffset = this.getSpreadOffset(index, LASERS_PER_BURST);
        const angle = baseAngle + Phaser.Math.DegToRad(spreadOffset * LASER_SPREAD_DEGREES);
        const spawnX = BOSS_X - 42 + Math.cos(angle) * 28;
        const spawnY = BOSS_Y + 8 + Math.sin(angle) * 18;

        const laser = this.lasers.create(spawnX, spawnY, TEXTURE_KEYS.laser) as Phaser.Physics.Arcade.Image;
        laser.setDepth(17);
        laser.setAngle(Phaser.Math.RadToDeg(angle));
        laser.setTint(index % 2 === 0 ? 0xff5d89 : 0xffdc74);

        const body = laser.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false);
        body.setSize(28, 10, true);
        body.setVelocity(Math.cos(angle) * laserSpeed, Math.sin(angle) * laserSpeed);
      });
    }

    this.time.delayedCall(POST_BURST_OPEN_DELAY_MS, () => {
      this.openAttackWindow();
    });
  }

  private getSpreadOffset(index: number, shotCount: number) {
    if (shotCount <= 1) return 0;
    return index / (shotCount - 1) - 0.5;
  }

  private openAttackWindow() {
    if (this.phase !== "fight" || this.outOfLives || !this.bossSprite || !this.bossGlow) return;

    this.bossVulnerable = true;
    this.bossSprite.setTint(0xffe18a);
    this.bossGlow.setFillStyle(0xffe18a, 0.26);
    this.statusText.setText("Boss vulnerable! Get close and press F to attack.");

    if (this.attackWindowTimer) {
      this.attackWindowTimer.remove(false);
      this.attackWindowTimer = undefined;
    }
    this.attackWindowTimer = this.time.addEvent({
      delay: ATTACK_WINDOW_MS,
      callback: () => {
        this.closeAttackWindow(true);
      },
    });
  }

  private closeAttackWindow(scheduleNextAttack: boolean) {
    if (this.attackWindowTimer) {
      this.attackWindowTimer.remove(false);
      this.attackWindowTimer = undefined;
    }

    this.bossVulnerable = false;
    this.bossSprite?.clearTint();
    this.bossGlow?.setFillStyle(0xff698f, 0.15);
    this.bossGlow?.setAlpha(0.15);
    this.bossGlow?.setScale(1);

    if (scheduleNextAttack && this.phase === "fight" && !this.outOfLives) {
      this.statusText.setText("The boss recovered. Dodge the next burst.");
      this.time.delayedCall(750, () => {
        if (this.phase === "fight" && !this.outOfLives && !this.bossVulnerable) this.statusText.setText("");
      });
      this.scheduleNextBossAttack();
    }
  }

  private attemptBossAttack() {
    if (this.phase !== "fight" || !this.bossVulnerable || !this.player) return;

    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, BOSS_X, BOSS_Y + 8);
    if (distance > ATTACK_RANGE) {
      this.statusText.setText("Get closer to the boss before striking.");
      this.time.delayedCall(700, () => {
        if (this.phase === "fight" && this.bossVulnerable) {
          this.statusText.setText("Boss vulnerable! Get close and press F to attack.");
        }
      });
      return;
    }

    const damage = this.getAttackDamage();
    this.bossHealth = Math.max(0, this.bossHealth - damage);
    this.cameras.main.flash(120, 255, 234, 190, false);
    this.bossSprite?.setScale(1.1);
    this.tweens.add({
      targets: this.bossSprite,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: "Back.easeOut",
    });

    if (this.cloneSprites.length > 0) {
      this.cloneSprites.forEach((clone, index) => {
        this.tweens.add({
          targets: clone,
          x: BOSS_X - 36 + index * 28,
          y: BOSS_Y + 24,
          alpha: 0.7,
          duration: 150,
          yoyo: true,
          ease: "Sine.easeOut",
          onComplete: () => clone.setAlpha(0.45),
        });
      });
    }

    this.closeAttackWindow(false);

    if (this.bossHealth <= 0) {
      this.startBossScriptedEnding();
      return;
    }

    this.statusText.setText(`Direct hit! Boss took ${damage} damage. ${this.bossHealth} HP left.`);
    this.time.delayedCall(750, () => {
      if (this.phase === "fight" && !this.outOfLives) this.statusText.setText("");
    });
    this.scheduleNextBossAttack(900);
  }

  private getAttackDamage() {
    const baseAttack = this.selectedCharacter.attackPower;
    const upgradeBonus = Math.max(0, this.damageBonus - 1);
    return Math.min(4, baseAttack + upgradeBonus + this.cloneCount);
  }

  private handleLaserHit() {
    if (this.phase !== "fight" || this.outOfLives) return;
    if (this.time.now < this.damageCooldownUntil) return;

    this.damageCooldownUntil = this.time.now + HIT_INVULN_MS;
    const livesLeft = loseRunLife(this);
    this.livesRemaining = livesLeft;

    if (livesLeft <= 0) {
      this.outOfLives = true;
      this.stopBossActions();
      this.player?.setVelocity(0, 0);
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
    this.time.delayedCall(900, () => {
      if (this.phase === "fight" && !this.outOfLives && !this.bossVulnerable) this.statusText.setText("");
    });
  }

  private respawnPlayer() {
    if (!this.player) return;

    this.player.setPosition(PLAYER_START_X, PLAYER_START_Y);
    this.player.setVelocity(0, 0);
    this.clearActiveLasers();
    this.cameras.main.shake(90, 0.004);
  }

  private cleanupOffscreenLasers() {
    this.getGroupChildrenSafe(this.lasers).forEach((child) => {
      const laser = child as Phaser.Physics.Arcade.Image;
      if (laser.x < -60 || laser.x > GAME_WIDTH + 60 || laser.y < -60 || laser.y > GAME_HEIGHT + 60) {
        laser.destroy();
      }
    });
  }

  private clearActiveLasers() {
    this.getGroupChildrenSafe(this.lasers).forEach((child) => {
      child.destroy();
    });
  }

  private startBossScriptedEnding() {
    if (this.phase !== "fight") return;

    this.phase = "scripted";
    this.stopBossActions();
    this.player?.setVelocity(0, 0);
    this.bossVulnerable = false;
    this.thiefLootAttached = false;

    if (!this.bossGemAwarded) {
      this.bossGemAwarded = true;
      const gemTotal = addGems(this, 1);
      this.statusText.setText(`Boss defeated! +1 gem. The boss is falling apart. Gems: ${gemTotal}.`);
    } else {
      this.statusText.setText("Boss defeated! The platform is collapsing under them.");
    }

    if (this.bossSprite && this.bossGlow) {
      this.bossSprite.setTint(0xd8a9b8);
      this.addScriptedTween({
        targets: this.bossSprite,
        angle: { from: -8, to: 10 },
        scaleX: { from: 1.04, to: 0.96 },
        scaleY: { from: 0.96, to: 1.06 },
        duration: 220,
        yoyo: true,
        repeat: 3,
        ease: "Sine.easeInOut",
      });
      this.addScriptedTween({
        targets: this.bossGlow,
        alpha: { from: 0.18, to: 0.42 },
        scaleX: { from: 1, to: 1.26 },
        scaleY: { from: 1, to: 1.16 },
        duration: 220,
        yoyo: true,
        repeat: 3,
        ease: "Sine.easeInOut",
      });

      this.addScriptedTimer(BOSS_FALL_START_MS, () => {
        if (!this.bossSprite || !this.bossGlow) return;

        this.statusText.setText("The boss gets pushed backward and tumbles off the platform!");
        this.playBossFallSound();

        this.addScriptedTween({
          targets: this.bossSprite,
          x: BOSS_X + 82,
          y: BOSS_Y - 12,
          angle: 20,
          duration: 650,
          ease: "Back.easeIn",
        });
        this.addScriptedTween({
          targets: this.bossGlow,
          x: BOSS_X + 74,
          y: BOSS_Y + 26,
          alpha: 0.28,
          duration: 650,
          ease: "Sine.easeIn",
        });
        this.addScriptedTween({
          targets: this.bossSprite,
          x: GAME_WIDTH + 170,
          y: GAME_HEIGHT + 160,
          angle: 164,
          alpha: 0.08,
          scaleX: 0.82,
          scaleY: 0.82,
          duration: THIEF_REVEAL_MS - BOSS_FALL_START_MS,
          delay: 650,
          ease: "Quad.easeIn",
        });
        this.addScriptedTween({
          targets: this.bossGlow,
          x: GAME_WIDTH + 120,
          y: GAME_HEIGHT + 150,
          alpha: 0,
          scaleX: 0.25,
          scaleY: 0.25,
          duration: THIEF_REVEAL_MS - BOSS_FALL_START_MS,
          delay: 650,
          ease: "Quad.easeIn",
        });
      });
    }

    this.addScriptedTimer(THIEF_REVEAL_MS, () => this.revealThiefBehindBoss());
    this.addScriptedTimer(THIEF_RUN_START_MS, () => this.startThiefPanicRun());
    this.addScriptedTimer(THIEF_TRIP_START_MS, () => this.tripThiefToGround());
    this.addScriptedTimer(JAIL_SPAWN_MS, () => this.spawnJailAroundThief());
    this.addScriptedTimer(THIEF_CAPTURE_ENABLE_MS, () => this.enablePostscriptControl());
  }

  private revealThiefBehindBoss() {
    if (this.phase !== "scripted") return;

    if (!this.thiefFocusGlow) {
      this.thiefFocusGlow = this.add.ellipse(THIEF_REVEAL_X, THIEF_REVEAL_Y + 8, 128, 74, 0xffd97a, 0.12).setDepth(12);
      this.thiefFocusGlow.setAlpha(0);
    }
    if (!this.moneySprite) {
      this.moneySprite = this.add.image(THIEF_REVEAL_X + 22, THIEF_REVEAL_Y + 12, TEXTURE_KEYS.money).setDepth(13);
      this.moneySprite.setAlpha(0);
    }
    if (!this.thiefSprite) {
      this.thiefSprite = this.add.image(THIEF_REVEAL_X, THIEF_REVEAL_Y, TEXTURE_KEYS.thief).setDepth(15);
      this.thiefSprite.setAlpha(0);
    }

    this.thiefSprite.setPosition(THIEF_REVEAL_X, THIEF_REVEAL_Y);
    this.thiefSprite.setTint(0xc8d2e6);
    this.thiefSprite.setAngle(0);
    this.thiefSprite.setScale(1);
    this.thiefSprite.setFlipX(false);
    this.moneySprite.setAlpha(0);
    this.thiefLootAttached = true;
    this.syncThiefLootPosition();

    this.statusText.setText("A thief is revealed behind the boss, clutching the money and shaking.");

    this.addScriptedTween({
      targets: [this.thiefSprite, this.moneySprite, this.thiefFocusGlow],
      alpha: 1,
      duration: 500,
      ease: "Sine.easeOut",
    });
    this.addScriptedTween({
      targets: this.thiefFocusGlow,
      scaleX: { from: 0.92, to: 1.08 },
      scaleY: { from: 0.88, to: 1.14 },
      alpha: { from: 0.16, to: 0.28 },
      duration: 720,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
    });

    if (this.thiefNervousTween) {
      this.thiefNervousTween.remove();
    }
    this.thiefNervousTween = this.addScriptedTween({
      targets: this.thiefSprite,
      x: { from: THIEF_REVEAL_X - 5, to: THIEF_REVEAL_X + 5 },
      angle: { from: -6, to: 7 },
      duration: 150,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      onUpdate: () => this.syncThiefLootPosition(),
    });
  }

  private startThiefPanicRun() {
    if (this.phase !== "scripted" || !this.thiefSprite) return;

    this.thiefNervousTween?.remove();
    this.thiefNervousTween = undefined;
    this.thiefSprite.setFlipX(true);
    this.thiefSprite.setAngle(0);
    this.thiefSprite.setTint(0xe5edf7);
    this.statusText.setText("The thief panics, turns, and sprints away with the money.");

    this.thiefRunBobTween?.remove();
    this.thiefRunBobTween = this.addScriptedTween({
      targets: this.thiefSprite,
      y: THIEF_REVEAL_Y - 7,
      duration: 180,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      onUpdate: () => this.syncThiefLootPosition(),
    });
    this.thiefRunTween?.remove();
    this.thiefRunTween = this.addScriptedTween({
      targets: this.thiefSprite,
      x: THIEF_RUN_TARGET_X,
      duration: THIEF_TRIP_START_MS - THIEF_RUN_START_MS,
      ease: "Linear",
      onUpdate: () => {
        this.syncThiefLootPosition();
        this.thiefFocusGlow?.setPosition(this.thiefSprite!.x, this.thiefSprite!.y + 8);
      },
    });
    this.addScriptedTween({
      targets: this.thiefFocusGlow,
      x: THIEF_RUN_TARGET_X,
      duration: THIEF_TRIP_START_MS - THIEF_RUN_START_MS,
      ease: "Linear",
    });
  }

  private tripThiefToGround() {
    if (this.phase !== "scripted" || !this.thiefSprite) return;

    this.thiefRunTween?.remove();
    this.thiefRunTween = undefined;
    this.thiefRunBobTween?.remove();
    this.thiefRunBobTween = undefined;
    this.thiefLootAttached = false;
    this.statusText.setText("The thief trips, loses balance, and crashes to the ground.");
    this.playTripSound();

    this.addScriptedTween({
      targets: this.thiefSprite,
      x: THIEF_JAIL_X,
      y: THIEF_GROUND_Y + 20,
      angle: 98,
      duration: JAIL_SPAWN_MS - THIEF_TRIP_START_MS,
      ease: "Quad.easeIn",
    });
    if (this.moneySprite) {
      this.addScriptedTween({
        targets: this.moneySprite,
        x: THIEF_JAIL_X + 34,
        y: THIEF_GROUND_Y + 16,
        angle: 132,
        duration: JAIL_SPAWN_MS - THIEF_TRIP_START_MS,
        ease: "Quad.easeIn",
      });
    }
    if (this.thiefFocusGlow) {
      this.addScriptedTween({
        targets: this.thiefFocusGlow,
        x: THIEF_JAIL_X,
        y: THIEF_GROUND_Y + 24,
        alpha: 0.14,
        duration: JAIL_SPAWN_MS - THIEF_TRIP_START_MS,
        ease: "Quad.easeIn",
      });
    }
  }

  private spawnJailAroundThief() {
    if (this.phase !== "scripted" || !this.thiefSprite) return;

    this.statusText.setText("Jail bars slam down around the thief.");
    this.playJailClangSound();

    this.thiefSprite.setPosition(THIEF_JAIL_X, THIEF_JAIL_Y);
    this.thiefSprite.setAngle(-9);
    this.thiefSprite.setScale(0.95, 0.9);
    this.thiefSprite.setTint(0x95a0b7);
    if (this.moneySprite) {
      this.moneySprite.setPosition(THIEF_JAIL_X + 34, THIEF_JAIL_Y + 16);
      this.moneySprite.setAngle(16);
      this.moneySprite.setScale(0.94);
    }

    if (!this.jailBars) {
      const bars: Phaser.GameObjects.Rectangle[] = [];
      bars.push(this.add.rectangle(0, -36, 88, 10, 0x8897aa, 0.95));
      bars.push(this.add.rectangle(0, 34, 88, 10, 0x5a6779, 0.95));
      [-30, -15, 0, 15, 30].forEach((x) => {
        bars.push(this.add.rectangle(x, -2, 8, 70, 0xa8b6c8, 0.96));
      });
      this.jailBars = this.add.container(THIEF_JAIL_X, THIEF_JAIL_Y - 2, bars).setDepth(17);
    }

    this.jailBars.setPosition(THIEF_JAIL_X, THIEF_JAIL_Y - 2);
    this.jailBars.setAlpha(0);
    this.jailBars.setScale(0.86, 0.2);
    this.addScriptedTween({
      targets: this.jailBars,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 650,
      ease: "Back.easeOut",
    });

    this.thiefSadTween?.remove();
    this.thiefSadTween = this.addScriptedTween({
      targets: this.thiefSprite,
      y: THIEF_JAIL_Y + 4,
      angle: -4,
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private enablePostscriptControl() {
    if (this.phase !== "scripted") return;

    this.phase = "postscript";
    this.createThiefCaptureZone();
    this.statusText.setText("The thief is trapped. Walk over and secure the arrest.");
    this.cameras.main.flash(180, 214, 255, 230, false);
  }

  private createThiefCaptureZone() {
    if (!this.player) return;

    if (!this.thiefCaptureZone) {
      this.thiefCaptureZone = this.add.zone(THIEF_JAIL_X, THIEF_JAIL_Y, 120, 88).setDepth(14);
      this.physics.add.existing(this.thiefCaptureZone, true);
    } else {
      this.thiefCaptureZone.setPosition(THIEF_JAIL_X, THIEF_JAIL_Y);
      const body = this.thiefCaptureZone.body as Phaser.Physics.Arcade.StaticBody | undefined;
      body?.updateFromGameObject();
    }

    if (this.thiefOverlap) {
      this.thiefOverlap.destroy();
    }
    this.thiefOverlap = this.physics.add.overlap(this.player, this.thiefCaptureZone, () => {
      this.captureThief();
    });
  }

  private captureThief() {
    if (this.phase !== "postscript") return;

    this.phase = "victory";
    this.finalRunSummary = this.finalRunSummary ?? finalizeCompletedRun(this);
    this.player?.setVelocity(0, 0);
    this.thiefOverlap?.destroy();
    this.thiefOverlap = undefined;
    this.thiefSadTween?.remove();
    this.thiefSadTween = undefined;
    this.thiefSprite?.setTint(0x7ae582);
    this.thiefSprite?.setAngle(0);
    this.thiefSprite?.setScale(0.96, 0.92);
    this.moneySprite?.setScale(1.08);
    this.statusText.setText("The thief is jailed and the money is recovered!");
    this.cameras.main.flash(200, 214, 255, 225, false);
    this.time.delayedCall(1100, () => {
      if (this.phase === "victory") {
        this.leaveScene();
      }
    });
  }

  private stopBossActions() {
    if (this.bossAttackTimer) {
      this.bossAttackTimer.remove(false);
      this.bossAttackTimer = undefined;
    }
    this.closeAttackWindow(false);
    this.clearActiveLasers();
  }

  private clearScriptedSequence() {
    this.scriptedTimers.forEach((timer) => timer.remove(false));
    this.scriptedTimers = [];

    this.scriptedTweens.forEach((tween) => tween.remove());
    this.scriptedTweens = [];

    this.thiefNervousTween = undefined;
    this.thiefRunTween = undefined;
    this.thiefRunBobTween = undefined;
    this.thiefSadTween = undefined;
  }

  private leaveScene() {
    if (this.transitioningOut) return;
    this.transitioningOut = true;

    if (this.phase === "victory") {
      const summary = this.finalRunSummary ?? finalizeCompletedRun(this);
      this.scene.start("final-time", {
        characterId: this.selectedCharacter.id,
        elapsedMs: summary.elapsedMs,
        bestMs: summary.bestMs,
        isNewRecord: summary.isNewRecord,
      });
      return;
    }

    this.scene.start("character-select");
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
    this.stopBossActions();
    this.clearScriptedSequence();

    if (this.playerPlatformCollider) {
      this.playerPlatformCollider.destroy();
      this.playerPlatformCollider = undefined;
    }
    if (this.laserOverlap) {
      this.laserOverlap.destroy();
      this.laserOverlap = undefined;
    }
    if (this.thiefOverlap) {
      this.thiefOverlap.destroy();
      this.thiefOverlap = undefined;
    }

    this.clearGroupSafe(this.lasers);
    this.clearGroupSafe(this.platforms);
    this.bossSprite?.destroy();
    this.bossGlow?.destroy();
    this.thiefCaptureZone?.destroy();
    this.thiefCaptureZone = undefined;
    this.thiefFocusGlow?.destroy();
    this.thiefFocusGlow = undefined;
    this.jailBars?.destroy();
    this.jailBars = undefined;
    this.thiefSprite?.destroy();
    this.moneySprite?.destroy();
    this.cloneSprites.forEach((clone) => clone.destroy());
    this.cloneSprites = [];
    this.player?.destroy();
  }
}
