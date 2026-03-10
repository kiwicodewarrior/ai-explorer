import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, INTRO_BEATS_MS, INTRO_DURATION_MS } from "../config";

type EnvironmentPalette = {
  name: string;
  sky: number;
  ground: number;
  accent: number;
};

const ENVIRONMENTS: EnvironmentPalette[] = [
  { name: "Forest Trail", sky: 0x8fd2ff, ground: 0x4f8f4a, accent: 0x7bc96f },
  { name: "City Streets", sky: 0x9dadcb, ground: 0x5d6675, accent: 0x9aa6ba },
  { name: "Canyon Pass", sky: 0xffbe75, ground: 0xb56c3b, accent: 0xd98e55 },
  { name: "Ice Ridge", sky: 0xbfe8ff, ground: 0x789cb5, accent: 0xd4f2ff },
];

const ACTOR_GROUND_Y = GAME_HEIGHT - 112;
const BANK_MONEY_X = GAME_WIDTH * 0.76;
const PORTAL_X = GAME_WIDTH * 0.9;

export class IntroScene extends Phaser.Scene {
  private sky!: Phaser.GameObjects.Rectangle;
  private ground!: Phaser.GameObjects.Rectangle;
  private roadStripes: Phaser.GameObjects.Rectangle[] = [];
  private townDecor!: Phaser.GameObjects.Container;
  private thief!: Phaser.GameObjects.Container;
  private hero!: Phaser.GameObjects.Container;
  private thiefLoot!: Phaser.GameObjects.Ellipse;
  private moneyBag!: Phaser.GameObjects.Container;
  private portal!: Phaser.GameObjects.Container;
  private narrationText!: Phaser.GameObjects.Text;
  private missionText!: Phaser.GameObjects.Text;
  private skipSpaceKey?: Phaser.Input.Keyboard.Key;
  private skipEnterKey?: Phaser.Input.Keyboard.Key;
  private transitioning = false;
  private cleanedUp = false;
  private scheduledEvents: Phaser.Time.TimerEvent[] = [];
  private managedTweens: Phaser.Tweens.Tween[] = [];

  constructor() {
    super("intro");
  }

  create() {
    this.buildBackdrop();
    this.createActors();
    this.createUi();
    this.registerSkipInput();
    this.runIntroTimeline();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
  }

  update() {
    if (this.transitioning) return;

    const skipPressed =
      (this.skipSpaceKey ? Phaser.Input.Keyboard.JustDown(this.skipSpaceKey) : false) ||
      (this.skipEnterKey ? Phaser.Input.Keyboard.JustDown(this.skipEnterKey) : false);
    if (skipPressed) {
      this.handleSkip();
    }
  }

  private buildBackdrop() {
    this.sky = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x91d6ff);
    this.ground = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 90, GAME_WIDTH, 180, 0x5ba550);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 62, GAME_WIDTH, 68, 0x363945);

    for (let i = 0; i < 5; i += 1) {
      const stripe = this.add
        .rectangle(110 + i * 185, GAME_HEIGHT - 62, 95, 7, 0x87ca7b)
        .setAlpha(0.9);
      this.roadStripes.push(stripe);
    }

    this.townDecor = this.add.container(0, 0);

    const sun = this.add.circle(120, 88, 44, 0xfff3a3, 0.9);
    const mountainA = this.add.triangle(170, 250, 0, 140, 130, 0, 260, 140, 0x7399b2);
    const mountainB = this.add.triangle(420, 235, 0, 160, 170, 0, 340, 160, 0x678ba3);
    const mountainC = this.add.triangle(700, 255, 0, 140, 150, 0, 300, 140, 0x7e9db3);
    const houseA = this.add.rectangle(240, 342, 88, 58, 0xf0e5d4);
    const houseARoof = this.add.triangle(240, 304, 0, 20, 44, -22, 88, 20, 0xb85b4a);
    const houseB = this.add.rectangle(336, 338, 72, 52, 0xe8dccc);
    const houseBRoof = this.add.triangle(336, 307, 0, 18, 36, -18, 72, 18, 0xa44f41);
    const treeTrunk = this.add.rectangle(560, 343, 16, 40, 0x7b4e2c);
    const treeLeaves = this.add.circle(560, 305, 36, 0x4f9348);
    const bankBase = this.add.rectangle(730, 330, 180, 96, 0xdde4ef);
    const bankRoof = this.add.rectangle(730, 266, 200, 22, 0xc0cad8);
    const bankDoor = this.add.rectangle(730, 350, 38, 56, 0x59657f);
    const bankWindowLeft = this.add.rectangle(680, 332, 30, 24, 0xadcdf2);
    const bankWindowRight = this.add.rectangle(780, 332, 30, 24, 0xadcdf2);
    const bankSign = this.add
      .text(730, 297, "BANK", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#2b3953",
      })
      .setOrigin(0.5);

    this.townDecor.add([
      sun,
      mountainA,
      mountainB,
      mountainC,
      houseA,
      houseARoof,
      houseB,
      houseBRoof,
      treeTrunk,
      treeLeaves,
      bankBase,
      bankRoof,
      bankDoor,
      bankWindowLeft,
      bankWindowRight,
      bankSign,
    ]);
  }

  private createActors() {
    this.thief = this.createThief(GAME_WIDTH * 0.15, ACTOR_GROUND_Y);
    this.hero = this.createHero(GAME_WIDTH * 0.05, ACTOR_GROUND_Y);
    this.hero.setAlpha(0).setVisible(false);

    this.moneyBag = this.createMoneyBag(BANK_MONEY_X, ACTOR_GROUND_Y - 10);
    this.portal = this.createPortal(PORTAL_X, ACTOR_GROUND_Y - 6);
    this.portal.setAlpha(0).setScale(0.2).setVisible(false);
  }

  private createUi() {
    this.narrationText = this.add
      .text(GAME_WIDTH / 2, 40, "It was a peaceful day, except for one thing...", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "28px",
        color: "#f6f9ff",
        stroke: "#10203f",
        strokeThickness: 5,
        align: "center",
      })
      .setOrigin(0.5);

    this.missionText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 24, "Catch the thief and recover the money.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "42px",
        color: "#fff6cf",
        stroke: "#1e2a47",
        strokeThickness: 6,
        align: "center",
        wordWrap: { width: 760 },
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.add
      .text(GAME_WIDTH - 24, GAME_HEIGHT - 18, "SPACE or ENTER to skip", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#dce6ff",
      })
      .setOrigin(1, 1)
      .setAlpha(0.8);
  }

  private createThief(x: number, y: number) {
    const hood = this.add.rectangle(0, -18, 24, 10, 0x212121);
    const head = this.add.circle(0, -12, 8, 0xffd0a8);
    const body = this.add.rectangle(0, 8, 20, 30, 0x2b2b2b);
    const leftLeg = this.add.rectangle(-5, 26, 6, 16, 0x191919);
    const rightLeg = this.add.rectangle(5, 26, 6, 16, 0x191919);

    this.thiefLoot = this.add.ellipse(13, 8, 12, 15, 0xb27633).setVisible(false);

    return this.add.container(x, y, [leftLeg, rightLeg, body, head, hood, this.thiefLoot]);
  }

  private createHero(x: number, y: number) {
    const hair = this.add.rectangle(0, -20, 20, 8, 0x435e99);
    const head = this.add.circle(0, -12, 8, 0xffd6b5);
    const body = this.add.rectangle(0, 8, 21, 30, 0x4e79d8);
    const badge = this.add.rectangle(3, 4, 5, 5, 0xffe179);
    const leftLeg = this.add.rectangle(-5, 26, 6, 16, 0x27426f);
    const rightLeg = this.add.rectangle(5, 26, 6, 16, 0x27426f);

    return this.add.container(x, y, [leftLeg, rightLeg, body, badge, head, hair]);
  }

  private createMoneyBag(x: number, y: number) {
    const bag = this.add.ellipse(0, 0, 28, 33, 0xbb843c);
    const knot = this.add.rectangle(0, -14, 14, 5, 0x9a6b31);
    const label = this.add
      .text(0, 1, "$", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#fdf0ce",
      })
      .setOrigin(0.5);

    return this.add.container(x, y, [bag, knot, label]);
  }

  private createPortal(x: number, y: number) {
    const outer = this.add.circle(0, 0, 38, 0x4f42d2, 0.3).setStrokeStyle(4, 0xa6bcff);
    const inner = this.add.circle(0, 0, 19, 0x41d7ff, 0.45).setStrokeStyle(2, 0xffffff);
    const ringA = this.add.ellipse(0, 0, 56, 20, 0x8f7cff, 0.2);

    return this.add.container(x, y, [outer, inner, ringA]);
  }

  private runIntroTimeline() {
    this.setEnvironment(0);

    this.scheduleAt(INTRO_BEATS_MS.THEFT, () => this.playTheftBeat());
    this.scheduleAt(INTRO_BEATS_MS.CHASE, () => this.playChaseBeat());
    this.scheduleAt(INTRO_BEATS_MS.HERO_SPOTS_THIEF, () => this.playHeroBeat());
    this.scheduleAt(INTRO_BEATS_MS.PORTAL_ESCAPE, () => this.playPortalBeat());
    this.scheduleAt(INTRO_BEATS_MS.MISSION_TEXT, () => this.playMissionBeat());
    this.scheduleAt(INTRO_DURATION_MS, () => this.transitionToGame());
  }

  private playTheftBeat() {
    if (this.transitioning) return;

    this.narrationText.setText("A thief robs the town bank and steals $1,000,000.");
    this.addManagedTween({
      targets: this.thief,
      x: BANK_MONEY_X - 28,
      duration: 850,
      ease: "Quad.easeInOut",
      onComplete: () => {
        this.addManagedTween({
          targets: this.moneyBag,
          x: this.thief.x + 18,
          y: this.thief.y - 8,
          duration: 500,
          ease: "Quad.easeIn",
          onComplete: () => {
            this.moneyBag.setVisible(false);
            this.thiefLoot.setVisible(true);
          },
        });
      },
    });
    this.addManagedTween({
      targets: this.thief,
      y: this.thief.y - 10,
      duration: 150,
      yoyo: true,
      repeat: 2,
    });
    this.cameras.main.shake(200, 0.003);
  }

  private playChaseBeat() {
    if (this.transitioning) return;

    this.narrationText.setText("The thief runs away from the town until...");

    this.addManagedTween({
      targets: this.townDecor,
      alpha: 0.2,
      duration: 500,
      ease: "Sine.easeOut",
    });

    ENVIRONMENTS.forEach((_, index) => {
      this.scheduleAfter(index * 900, () => this.setEnvironment(index));
    });

    this.addManagedTween({
      targets: this.thief,
      x: GAME_WIDTH * 0.85,
      duration: 3_200,
      ease: "Sine.easeIn",
    });

    this.roadStripes.forEach((stripe, index) => {
      this.addManagedTween({
        targets: stripe,
        x: stripe.x - 120,
        duration: 430,
        delay: index * 55,
        yoyo: true,
        repeat: 7,
        ease: "Sine.easeInOut",
      });
    });
  }

  private playHeroBeat() {
    if (this.transitioning) return;

    this.narrationText.setText("a civilian notices and starts chasing the thief.");
    this.hero.setVisible(true);
    this.addManagedTween({
      targets: this.hero,
      alpha: 1,
      x: GAME_WIDTH * 0.62,
      duration: 1_300,
      ease: "Quad.easeIn",
    });

    this.addManagedTween({
      targets: this.thief,
      x: GAME_WIDTH * 0.88,
      duration: 1200,
      ease: "Sine.easeIn",
    });
  }

  private playPortalBeat() {
    if (this.transitioning) return;

    this.narrationText.setText("The thief escapes through a portal to multiple levels.");
    this.portal.setVisible(true);

    this.addManagedTween({
      targets: this.portal,
      alpha: 1,
      scale: 1,
      angle: 360,
      duration: 900,
      ease: "Back.easeOut",
    });

    this.addManagedTween({
      targets: this.thief,
      x: this.portal.x,
      y: this.portal.y,
      scaleX: 0.25,
      scaleY: 0.25,
      alpha: 0,
      duration: 1100,
      ease: "Cubic.easeIn",
    });

    this.addManagedTween({
      targets: this.hero,
      x: this.portal.x - 118,
      duration: 850,
      ease: "Quad.easeOut",
    });
  }

  private playMissionBeat() {
    if (this.transitioning) return;

    this.narrationText.setText("");
    this.cameras.main.flash(250, 255, 247, 188, false);

    this.addManagedTween({
      targets: this.missionText,
      alpha: 1,
      y: this.missionText.y - 8,
      duration: 600,
      ease: "Quad.easeOut",
    });
  }

  private setEnvironment(index: number) {
    const palette = ENVIRONMENTS[index % ENVIRONMENTS.length];
    this.sky.setFillStyle(palette.sky, 1);
    this.ground.setFillStyle(palette.ground, 1);
    this.roadStripes.forEach((stripe) => stripe.setFillStyle(palette.accent, 0.9));
  }

  private registerSkipInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    this.skipSpaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.skipEnterKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.ENTER]);
  }

  private handleSkip() {
    this.transitionToGame();
  }

  private scheduleAt(delayMs: number, callback: () => void) {
    const event = this.time.delayedCall(delayMs, callback);
    this.scheduledEvents.push(event);
  }

  private scheduleAfter(delayMs: number, callback: () => void) {
    const event = this.time.delayedCall(delayMs, callback);
    this.scheduledEvents.push(event);
  }

  private addManagedTween(config: Phaser.Types.Tweens.TweenBuilderConfig | Phaser.Types.Tweens.TweenChainBuilderConfig) {
    const tween = this.tweens.add(config as Phaser.Types.Tweens.TweenBuilderConfig);
    this.managedTweens.push(tween);
    return tween;
  }

  private transitionToGame() {
    console.log("transitionToGame");
    if (this.transitioning) return;
    this.transitioning = true;

    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.time.delayedCall(500, () => {
      if (this.scene.isActive("intro")) {
        this.scene.start("character-select", { playedIntro: true });
      }
    });
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("character-select", { playedIntro: true });
    });
  }

  private handleShutdown() {
    if (this.cleanedUp) return;
    this.cleanedUp = true;

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
      keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.ENTER);
    }

    this.scheduledEvents.forEach((event) => event.remove(false));
    this.scheduledEvents.length = 0;

    this.managedTweens.forEach((tween) => tween.stop());
    this.managedTweens.length = 0;

    const mainCamera = this.cameras?.main;
    if (mainCamera) {
      mainCamera.off(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE);
    }
  }
}
