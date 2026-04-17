import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";

type DustParticle = {
  sprite: Phaser.GameObjects.Ellipse;
  baseX: number;
  baseY: number;
  driftX: number;
  driftY: number;
  phase: number;
};

export class VisualFxScene extends Phaser.Scene {
  private vignette!: Phaser.GameObjects.Graphics;
  private dust: DustParticle[] = [];
  private beams: Phaser.GameObjects.Rectangle[] = [];
  private glows: Phaser.GameObjects.Ellipse[] = [];
  private sweep!: Phaser.GameObjects.Rectangle;

  constructor() {
    super("visual-fx");
  }

  create() {
    this.createStaticOverlay();
    this.createAtmosphericLights();
    this.createDust();
  }

  update(_: number, delta: number) {
    const dt = delta / 1000;
    this.scene.bringToTop("visual-fx");
    if (this.scene.isActive("music-control")) {
      this.scene.bringToTop("music-control");
    }

    this.animateDust(dt);
    this.animateLights(dt);
  }

  private createStaticOverlay() {
    this.vignette = this.add.graphics().setScrollFactor(0).setDepth(4000);
    this.redrawVignette();
  }

  private redrawVignette() {
    this.vignette.clear();

    this.vignette.fillGradientStyle(0x0a1018, 0x0a1018, 0x000000, 0x000000, 0.2, 0.2, 0.0, 0.0);
    this.vignette.fillRect(0, 0, GAME_WIDTH, 128);

    this.vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.0, 0.0, 0.28, 0.28);
    this.vignette.fillRect(0, GAME_HEIGHT - 160, GAME_WIDTH, 160);

    this.vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.24, 0.0, 0.24, 0.0);
    this.vignette.fillRect(0, 0, 120, GAME_HEIGHT);

    this.vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.0, 0.24, 0.0, 0.24);
    this.vignette.fillRect(GAME_WIDTH - 120, 0, 120, GAME_HEIGHT);
  }

  private createAtmosphericLights() {
    const topGlow = this.add.ellipse(GAME_WIDTH * 0.5, 52, 720, 180, 0x9ae7ff, 0.08).setScrollFactor(0).setDepth(3900);
    const leftGlow = this.add.ellipse(120, 120, 240, 240, 0xffd1b3, 0.05).setScrollFactor(0).setDepth(3900);
    const rightGlow = this.add.ellipse(GAME_WIDTH - 120, 110, 280, 220, 0x93b7ff, 0.05).setScrollFactor(0).setDepth(3900);
    const floorGlow = this.add.ellipse(GAME_WIDTH * 0.5, GAME_HEIGHT - 24, GAME_WIDTH * 0.92, 150, 0x8ec7ff, 0.05).setScrollFactor(0).setDepth(3890);
    this.glows.push(topGlow, leftGlow, rightGlow, floorGlow);

    const beamConfigs = [
      { x: 180, y: -60, angle: -16, width: 160, height: 520, alpha: 0.055 },
      { x: GAME_WIDTH * 0.5, y: -80, angle: 3, width: 220, height: 560, alpha: 0.048 },
      { x: GAME_WIDTH - 180, y: -40, angle: 14, width: 150, height: 500, alpha: 0.05 },
    ];

    beamConfigs.forEach((config) => {
      const beam = this.add
        .rectangle(config.x, config.y, config.width, config.height, 0xe4f5ff, config.alpha)
        .setOrigin(0.5, 0)
        .setAngle(config.angle)
        .setScrollFactor(0)
        .setDepth(3895);
      beam.setBlendMode(Phaser.BlendModes.SCREEN);
      this.beams.push(beam);
    });

    this.sweep = this.add
      .rectangle(GAME_WIDTH * 0.4, GAME_HEIGHT * 0.42, GAME_WIDTH * 0.9, 42, 0xffffff, 0.03)
      .setAngle(-7)
      .setScrollFactor(0)
      .setDepth(3898);
    this.sweep.setBlendMode(Phaser.BlendModes.SCREEN);
  }

  private createDust() {
    for (let index = 0; index < 34; index += 1) {
      const baseX = Phaser.Math.Between(30, GAME_WIDTH - 30);
      const baseY = Phaser.Math.Between(36, GAME_HEIGHT - 36);
      const sprite = this.add
        .ellipse(baseX, baseY, Phaser.Math.Between(3, 7), Phaser.Math.Between(3, 7), 0xf2f8ff, Phaser.Math.FloatBetween(0.03, 0.085))
        .setScrollFactor(0)
        .setDepth(3896);
      sprite.setBlendMode(Phaser.BlendModes.SCREEN);

      this.dust.push({
        sprite,
        baseX,
        baseY,
        driftX: Phaser.Math.FloatBetween(4, 20),
        driftY: Phaser.Math.FloatBetween(2, 10),
        phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      });
    }
  }

  private animateDust(dt: number) {
    const time = this.time.now * 0.001;

    this.dust.forEach((particle) => {
      particle.phase += dt * 0.45;
      particle.baseY += particle.driftY * dt * 0.14;
      particle.baseX += Math.sin(time + particle.phase) * particle.driftX * dt * 0.08;

      if (particle.baseY > GAME_HEIGHT + 24) {
        particle.baseY = -24;
        particle.baseX = Phaser.Math.Between(24, GAME_WIDTH - 24);
      }

      if (particle.baseX < -20) {
        particle.baseX = GAME_WIDTH + 20;
      } else if (particle.baseX > GAME_WIDTH + 20) {
        particle.baseX = -20;
      }

      particle.sprite.setPosition(
        particle.baseX + Math.sin(time * 0.8 + particle.phase) * 6,
        particle.baseY + Math.cos(time * 0.6 + particle.phase) * 4,
      );
    });
  }

  private animateLights(dt: number) {
    const time = this.time.now * 0.001;

    this.beams.forEach((beam, index) => {
      beam.setAlpha(0.035 + Math.sin(time * 0.8 + index) * 0.012 + 0.016);
      beam.setX(beam.x + Math.sin(time * 0.32 + index) * dt * 10);
    });

    this.sweep.setAlpha(0.022 + Math.sin(time * 0.45) * 0.012);
    this.sweep.setY(GAME_HEIGHT * 0.42 + Math.sin(time * 0.3) * 6);

    this.glows[0]?.setAlpha(0.06 + Math.sin(time * 0.55) * 0.015);
    this.glows[1]?.setAlpha(0.04 + Math.sin(time * 0.7 + 1.4) * 0.012);
    this.glows[2]?.setAlpha(0.04 + Math.sin(time * 0.65 + 2.2) * 0.012);
    this.glows[3]?.setAlpha(0.04 + Math.sin(time * 0.4 + 0.8) * 0.01);
  }
}
