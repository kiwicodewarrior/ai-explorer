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

type Level6SceneData = {
  characterId?: CharacterId;
  startingHealth?: number;
  skipLevel?: boolean;
};

type LaserGunState = {
  x: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Ellipse;
};

const ROOM_X = 92;
const ROOM_Y = 86;
const ROOM_WIDTH = GAME_WIDTH - 184;
const ROOM_HEIGHT = GAME_HEIGHT - 156;
const PLAYER_START_X = GAME_WIDTH / 2;
const PLAYER_START_Y = GAME_HEIGHT - 112;
const EXIT_X = GAME_WIDTH / 2;
const EXIT_Y = ROOM_Y + 22;
const GUN_Y = ROOM_Y + 20;
const GUN_X_POSITIONS = [GAME_WIDTH * 0.26, GAME_WIDTH / 2, GAME_WIDTH * 0.74] as const;
const SURVIVE_MS = 18_000;
const MAX_DEATHS = DEFAULT_RUN_LIVES;
const HIT_INVULN_MS = 850;
const PLAYER_SPEED = 240;
const LASER_BURST_MS = 2_000;
const LASERS_PER_BURST = 7;
const LASER_BURST_DELAY_MS = 240;
const LASER_SPREAD_DEGREES = 42;
const LASER_SPEED = 330;

const TEXTURE_KEYS = {
  player: "level6-player",
  portal: "level6-portal",
  gun: "level6-gun",
  laser: "level6-laser",
} as const;

export class Level6Scene extends Phaser.Scene {
  private selectedCharacter!: CharacterConfig;
  private player?: Phaser.Physics.Arcade.Image;
  private exitPortal?: Phaser.Physics.Arcade.Image;
  private guns: LaserGunState[] = [];
  private lasers?: Phaser.Physics.Arcade.Group;

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
  private transitioningToLevel7 = false;
  private exitUnlocked = false;
  private skipLevel = false;
  private levelStartTime = 0;
  private levelEndTime?: number;
  private damageCooldownUntil = 0;

  private burstTimer?: Phaser.Time.TimerEvent;
  private laserOverlap?: Phaser.Physics.Arcade.Collider;
  private exitOverlap?: Phaser.Physics.Arcade.Collider;

  constructor() {
    super("level-6");
  }

  create(data: Level6SceneData = {}) {
    const characterId = rememberRunCharacter(this, data.characterId);
    this.selectedCharacter = this.resolveCharacter(characterId);
    this.livesRemaining = getRunLives(this);
    this.outOfLives = this.livesRemaining <= 0;
    this.levelComplete = false;
    this.transitioningToLevel7 = false;
    this.exitUnlocked = false;
    this.skipLevel = data.skipLevel ?? false;
    this.levelStartTime = this.time.now;
    this.levelEndTime = undefined;
    this.damageCooldownUntil = 0;
    this.burstTimer = undefined;
    this.guns = [];

    this.cameras.main.setBackgroundColor(0x070b14);
    this.cameras.main.fadeIn(260, 0, 0, 0);

    this.createTextures();
    this.drawBackground();
    this.createHud();
    this.bindInput();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupScene, this);

    if (this.skipLevel) {
      this.statusText.setText("Level 6 skipped. Press ENTER for Level 7.");
      this.timerText.setText("Skipped");
      this.healthText.setText(`Lives: ${this.livesRemaining}`);
      return;
    }

    this.createExitPortal();
    this.createPlayer();
    this.createGuns();
    this.createLaserSystem();
    this.updateHud();

    this.statusText.setText("Three laser guns are charging. Each fires a 7-shot burst every 2 seconds.");
    this.time.delayedCall(1900, () => {
      if (!this.levelComplete && !this.outOfLives && !this.exitUnlocked) this.statusText.setText("");
    });
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

    if (!this.textures.exists(TEXTURE_KEYS.portal)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x7ad8ff, 0.15);
      g.fillEllipse(34, 38, 46, 62);
      g.lineStyle(4, 0xd0faff, 0.8);
      g.strokeEllipse(34, 38, 46, 62);
      g.lineStyle(2, 0x8ce8ff, 0.55);
      g.strokeEllipse(34, 38, 30, 44);
      g.generateTexture(TEXTURE_KEYS.portal, 68, 76);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.gun)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0x32455f, 1);
      g.fillRoundedRect(18, 10, 52, 26, 8);
      g.fillStyle(0x1e2a3d, 1);
      g.fillRoundedRect(34, 26, 20, 46, 8);
      g.fillStyle(0x89dfff, 0.35);
      g.fillRoundedRect(24, 14, 40, 10, 5);
      g.fillStyle(0x0d1724, 1);
      g.fillCircle(44, 64, 8);
      g.generateTexture(TEXTURE_KEYS.gun, 88, 88);
      g.destroy();
    }

    if (!this.textures.exists(TEXTURE_KEYS.laser)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.setVisible(false);
      g.fillStyle(0xfff3cf, 1);
      g.fillRoundedRect(0, 6, 28, 6, 3);
      g.fillStyle(0xff5f88, 1);
      g.fillRoundedRect(6, 4, 22, 10, 4);
      g.generateTexture(TEXTURE_KEYS.laser, 28, 18);
      g.destroy();
    }
  }

  private drawBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x070b14);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, 180, 0x10192b, 0.5);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, ROOM_WIDTH, ROOM_HEIGHT, 0x0d1320);
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, ROOM_WIDTH + 24, ROOM_HEIGHT + 24, 0x1b2b43, 0.5)
      .setStrokeStyle(4, 0x567194, 0.7);

    this.add.rectangle(GAME_WIDTH / 2, ROOM_Y + 10, 220, 34, 0x22354d, 0.95).setStrokeStyle(2, 0x5f7da4, 0.85);
    this.add.rectangle(GAME_WIDTH / 2, ROOM_Y + 28, 160, 18, 0x10192b, 0.95);

    for (let x = ROOM_X + 22; x < GAME_WIDTH - ROOM_X; x += 54) {
      this.add.rectangle(x, GAME_HEIGHT / 2, 2, ROOM_HEIGHT - 28, 0x22354d, 0.24);
    }
    for (let y = ROOM_Y + 22; y < GAME_HEIGHT - 70; y += 48) {
      this.add.rectangle(GAME_WIDTH / 2, y, ROOM_WIDTH - 26, 2, 0x22354d, 0.22);
    }

    this.add
      .text(GAME_WIDTH / 2, 28, "Level 6: Laser Hall", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "34px",
        color: "#f7fbff",
        stroke: "#050910",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 58, "Watch the gun, dodge the burst, and survive until the exit opens.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#cfe2f8",
      })
      .setOrigin(0.5);
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

    this.timerText = this.add
      .text(GAME_WIDTH - 18, 86, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#d9f3ff",
        stroke: "#122433",
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
    keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.ENTER]);
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

  private createExitPortal() {
    this.exitPortal = this.physics.add.staticImage(EXIT_X, EXIT_Y, TEXTURE_KEYS.portal);
    this.exitPortal.setTint(0x476278);
    this.exitPortal.setAlpha(0.4);
    this.exitPortal.setScale(1.06);
    this.exitPortal.refreshBody();
  }

  private createPlayer() {
    this.player = this.physics.add.image(PLAYER_START_X, PLAYER_START_Y, TEXTURE_KEYS.player);
    this.player.setTint(this.selectedCharacter.primaryColor);
    this.player.setDepth(25);
    this.player.setCollideWorldBounds(true);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(24, 34, true);
    this.physics.world.setBounds(ROOM_X + 12, ROOM_Y + 12, ROOM_WIDTH - 24, ROOM_HEIGHT - 24);

    if (this.exitPortal) {
      this.exitOverlap = this.physics.add.overlap(this.player, this.exitPortal, () => {
        this.tryCompleteLevel();
      });
    }
  }

  private createGuns() {
    GUN_X_POSITIONS.forEach((x) => {
      const glow = this.add.ellipse(x, GUN_Y + 40, 56, 56, 0xff708f, 0.2).setDepth(13);
      const sprite = this.add.image(x, GUN_Y + 34, TEXTURE_KEYS.gun).setDepth(14);
      this.guns.push({ x, sprite, glow });
    });
  }

  private createLaserSystem() {
    this.lasers = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    this.laserOverlap = this.physics.add.overlap(this.player!, this.lasers, (_player, laser) => {
      (laser as Phaser.Physics.Arcade.Image).destroy();
      this.handleLaserHit("Laser burst hit!");
    });

    this.burstTimer = this.time.addEvent({
      delay: LASER_BURST_MS,
      loop: true,
      callback: () => {
        if (this.levelComplete || this.outOfLives || this.skipLevel) return;

        this.statusText.setText("Seven-shot burst incoming!");
        this.time.delayedCall(450, () => {
          if (!this.levelComplete && !this.outOfLives && !this.exitUnlocked) this.statusText.setText("");
        });

        this.guns.forEach((gunState, index) => {
          this.time.delayedCall(index * 90, () => {
            this.chargeAndFireBurst(gunState);
          });
        });
      },
    });
  }

  private chargeAndFireBurst(gunState: LaserGunState) {
    if (this.levelComplete || this.outOfLives || this.skipLevel || !this.player) return;

    const aimAngle = Phaser.Math.Angle.Between(gunState.x, GUN_Y + 34, this.player.x, this.player.y);
    gunState.sprite.setRotation(aimAngle + Math.PI / 2);
    gunState.glow.setAlpha(0.28);
    gunState.glow.setScale(1);

    this.tweens.add({
      targets: gunState.glow,
      alpha: 0.82,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: LASER_BURST_DELAY_MS,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.fireBurst(gunState, aimAngle);
      },
    });
  }

  private fireBurst(gunState: LaserGunState, baseAngle: number) {
    if (this.levelComplete || this.outOfLives || this.skipLevel || !this.player || !this.lasers) return;

    this.cameras.main.shake(80, 0.0022);

    for (let index = 0; index < LASERS_PER_BURST; index += 1) {
      this.time.delayedCall(index * 85, () => {
        if (this.levelComplete || this.outOfLives || this.skipLevel || !this.lasers) return;

        const spreadOffset = this.getSpreadOffset(index, LASERS_PER_BURST);
        const spreadAngle = Phaser.Math.DegToRad(spreadOffset * LASER_SPREAD_DEGREES);
        const shotAngle = baseAngle + spreadAngle + Phaser.Math.FloatBetween(-0.03, 0.03);
        const muzzleX = gunState.x + Math.cos(shotAngle) * 30;
        const muzzleY = GUN_Y + 36 + Math.sin(shotAngle) * 18;

        const laser = this.lasers.create(muzzleX, muzzleY, TEXTURE_KEYS.laser) as Phaser.Physics.Arcade.Image;
        laser.setDepth(18);
        laser.setScale(1.04);
        laser.setAngle(Phaser.Math.RadToDeg(shotAngle));
        laser.setTint(index % 2 === 0 ? 0xff5d89 : 0xffd671);

        const body = laser.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false);
        body.setSize(24, 10, true);
        body.setVelocity(Math.cos(shotAngle) * LASER_SPEED, Math.sin(shotAngle) * LASER_SPEED);
      });
    }
  }

  private updateHud() {
    const elapsedMs = (this.levelEndTime ?? this.time.now) - this.levelStartTime;
    const remainingMs = Math.max(0, SURVIVE_MS - elapsedMs);
    const gateLabel = this.exitUnlocked ? "Open" : "Locked";

    this.healthText.setText(`Lives: ${this.livesRemaining}`);
    this.hudText.setText(`Character: ${this.selectedCharacter.name} | Guns: 3 | 7 shots / 2s | Exit: ${gateLabel}`);
    this.timerText.setText(this.skipLevel ? "Skipped" : `Unlock: ${(remainingMs / 1000).toFixed(1)}s`);
  }

  private getSpreadOffset(index: number, shotCount: number) {
    if (shotCount <= 1) return 0;
    return index / (shotCount - 1) - 0.5;
  }

  update() {
    if (this.skipLevel) {
      if (this.confirmKey && (Phaser.Input.Keyboard.JustDown(this.confirmKey) || this.confirmKey.isDown)) {
        this.startLevel7();
      }
      return;
    }

    if (this.levelComplete || this.outOfLives) {
      if (this.outOfLives && this.reviveKey && Phaser.Input.Keyboard.JustDown(this.reviveKey) && useReviveGem(this)) {
        this.scene.restart({ characterId: this.selectedCharacter.id });
        return;
      }
      if (this.confirmKey && (Phaser.Input.Keyboard.JustDown(this.confirmKey) || (this.levelComplete && this.confirmKey.isDown))) {
        if (this.levelComplete) {
          this.startLevel7();
        } else {
          this.scene.start("character-select");
        }
      }
      this.player?.setVelocity(0, 0);
      this.updateHud();
      return;
    }

    this.updateMovement();
    this.cleanupOffscreenLasers();
    this.checkExitUnlock();
    this.updateHud();
  }

  private updateMovement() {
    if (!this.player) return;

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

    const velocity = new Phaser.Math.Vector2(moveX, moveY).normalize().scale(Math.max(PLAYER_SPEED, this.selectedCharacter.speed));
    this.player.setVelocity(velocity.x, velocity.y);

    if (moveX !== 0) {
      this.player.setFlipX(moveX < 0);
    }
  }

  private cleanupOffscreenLasers() {
    this.getLaserChildren().forEach((child) => {
      const laser = child as Phaser.Physics.Arcade.Image;
      if (
        laser.x < ROOM_X - 80 ||
        laser.x > GAME_WIDTH - ROOM_X + 80 ||
        laser.y < ROOM_Y - 80 ||
        laser.y > GAME_HEIGHT - 40 + 80
      ) {
        laser.destroy();
      }
    });
  }

  private checkExitUnlock() {
    if (this.exitUnlocked) return;
    if (this.time.now - this.levelStartTime < SURVIVE_MS) return;

    this.exitUnlocked = true;
    this.exitPortal?.setTint(0xbafcff);
    this.exitPortal?.setAlpha(0.92);
    this.statusText.setText("Exit unlocked! Reach the gate.");
    this.cameras.main.flash(160, 205, 255, 255, false);
  }

  private tryCompleteLevel() {
    if (this.levelComplete || this.outOfLives) return;

    if (!this.exitUnlocked) {
      this.statusText.setText("The gate is still locked. Keep dodging.");
      this.time.delayedCall(850, () => {
        if (!this.levelComplete && !this.outOfLives && !this.exitUnlocked) this.statusText.setText("");
      });
      return;
    }

    this.levelComplete = true;
    this.levelEndTime = this.time.now;
    this.player?.setVelocity(0, 0);
    this.stopGuns();
    this.statusText.setText("Level 6 complete! Press ENTER for Level 7.");
  }

  private startLevel7() {
    if (this.transitioningToLevel7) return;

    this.transitioningToLevel7 = true;
    this.scene.start("level-7", { characterId: this.selectedCharacter.id });
  }

  private handleLaserHit(message: string) {
    if (this.levelComplete || this.outOfLives) return;
    if (this.time.now < this.damageCooldownUntil) return;

    this.damageCooldownUntil = this.time.now + HIT_INVULN_MS;
    const livesLeft = loseRunLife(this);
    this.livesRemaining = livesLeft;

    if (livesLeft <= 0) {
      this.outOfLives = true;
      this.levelEndTime = this.time.now;
      this.player?.setVelocity(0, 0);
      this.stopGuns();
      const gems = getGemCount(this);
      this.statusText.setText(
        gems >= REVIVE_GEM_COST
          ? `Out of lives. Press R to spend 1 gem (${gems} left) and restart, or ENTER to leave.`
          : `You can't play anymore. ${MAX_DEATHS} lives used. Press ENTER.`,
      );
      return;
    }

    this.respawnPlayer();
    this.statusText.setText(`Laser burst hit! Lives left: ${livesLeft}.`);
    this.time.delayedCall(900, () => {
      if (!this.levelComplete && !this.outOfLives) this.statusText.setText("");
    });
  }

  private respawnPlayer() {
    if (!this.player) return;

    this.player.setPosition(PLAYER_START_X, PLAYER_START_Y);
    this.player.setVelocity(0, 0);
    this.clearActiveLasers();
    this.cameras.main.shake(90, 0.004);
  }

  private clearActiveLasers() {
    this.getLaserChildren().forEach((child) => {
      child.destroy();
    });
  }

  private stopGuns() {
    if (this.burstTimer) {
      this.burstTimer.remove(false);
      this.burstTimer = undefined;
    }

    this.clearActiveLasers();
    this.guns.forEach((gunState) => {
      gunState.glow.setAlpha(0.18);
    });
  }

  private getLaserChildren() {
    if (!this.lasers) return [] as Phaser.GameObjects.GameObject[];

    const maybeGroup = this.lasers as Phaser.Physics.Arcade.Group & {
      children?: { entries?: Phaser.GameObjects.GameObject[] };
    };
    return maybeGroup.children?.entries ?? [];
  }

  private clearGroupSafe(group?: Phaser.Physics.Arcade.Group) {
    if (!group) return;

    const maybeGroup = group as Phaser.Physics.Arcade.Group & {
      children?: { entries?: Phaser.GameObjects.GameObject[] };
      clear: (removeFromScene?: boolean, destroyChild?: boolean) => void;
    };

    if (!maybeGroup.children?.entries) return;
    maybeGroup.clear(true, true);
  }

  private cleanupScene() {
    this.stopGuns();

    if (this.laserOverlap) {
      this.laserOverlap.destroy();
      this.laserOverlap = undefined;
    }
    if (this.exitOverlap) {
      this.exitOverlap.destroy();
      this.exitOverlap = undefined;
    }

    this.clearGroupSafe(this.lasers);
    this.exitPortal?.destroy();
    this.guns.forEach((gunState) => {
      gunState.sprite.destroy();
      gunState.glow.destroy();
    });
    this.guns = [];
    this.player?.destroy();
  }
}
