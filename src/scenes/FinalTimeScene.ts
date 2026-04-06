import Phaser from "phaser";
import { CHARACTER_OPTIONS, DEFAULT_CHARACTER_ID, GAME_HEIGHT, GAME_WIDTH, type CharacterId } from "../config";
import { formatRunTime, getBestCompletedRunMs, getLastCompletedRunMs } from "../systems/runState";

type FinalTimeSceneData = {
  characterId?: CharacterId;
  elapsedMs?: number;
  bestMs?: number;
  isNewRecord?: boolean;
};

export class FinalTimeScene extends Phaser.Scene {
  private confirmKey?: Phaser.Input.Keyboard.Key;
  private altConfirmKey?: Phaser.Input.Keyboard.Key;

  constructor() {
    super("final-time");
  }

  create(data: FinalTimeSceneData = {}) {
    const characterId = this.resolveCharacterId(data.characterId);
    const elapsedMs = data.elapsedMs ?? getLastCompletedRunMs(this) ?? 0;
    const bestMs = data.bestMs ?? getBestCompletedRunMs(this) ?? elapsedMs;
    const isNewRecord = data.isNewRecord ?? elapsedMs === bestMs;
    const character = CHARACTER_OPTIONS.find((option) => option.id === characterId) ?? CHARACTER_OPTIONS[0];

    this.cameras.main.setBackgroundColor(0x081120);
    this.cameras.main.fadeIn(320, 0, 0, 0);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x081120);
    this.add.rectangle(GAME_WIDTH / 2, 124, GAME_WIDTH - 120, 170, 0x132846, 0.88).setStrokeStyle(3, 0x5aa7ff, 0.65);
    this.add.rectangle(GAME_WIDTH / 2, 340, GAME_WIDTH - 180, 210, 0x0f1c34, 0.94).setStrokeStyle(3, 0xffd67a, 0.7);
    this.add.circle(148, 92, 52, character.primaryColor, 0.2);
    this.add.circle(GAME_WIDTH - 148, 92, 52, 0xffd67a, 0.12);

    this.add
      .text(GAME_WIDTH / 2, 70, "Case Closed", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "42px",
        color: "#f8f2d0",
        stroke: "#07101d",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 118, `${character.name} arrested the thief and recovered the money.`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#d9e6ff",
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 170, isNewRecord ? "New world record for this browser." : "Fastest recorded time saved on this browser.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: isNewRecord ? "#ffe48f" : "#a8c8ff",
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2 - 180, 290, "Your Time", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "24px",
        color: "#c8d9ff",
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2 - 180, 340, formatRunTime(elapsedMs), {
        fontFamily: "system-ui, sans-serif",
        fontSize: "42px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2 + 180, 290, "World Record", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "24px",
        color: "#ffe7a4",
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2 + 180, 340, formatRunTime(bestMs), {
        fontFamily: "system-ui, sans-serif",
        fontSize: "42px",
        color: "#fff4cf",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    if (isNewRecord) {
      this.add
        .text(GAME_WIDTH / 2, 408, "NEW RECORD", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "28px",
          color: "#7df0a3",
          stroke: "#0b1420",
          strokeThickness: 5,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
    }

    this.add
      .text(GAME_WIDTH / 2, 468, "Press ENTER or SPACE to return to character select.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#c8d9ff",
      })
      .setOrigin(0.5);

    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.ENTER, Phaser.Input.Keyboard.KeyCodes.SPACE]);
    this.confirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.altConfirmKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  update() {
    const confirmPressed =
      (this.confirmKey && Phaser.Input.Keyboard.JustDown(this.confirmKey)) ||
      (this.altConfirmKey && Phaser.Input.Keyboard.JustDown(this.altConfirmKey));

    if (confirmPressed) {
      this.scene.start("character-select");
    }
  }

  private resolveCharacterId(characterId?: CharacterId) {
    if (characterId === "knight" || characterId === "dog" || characterId === "officer") {
      return characterId;
    }

    return DEFAULT_CHARACTER_ID;
  }
}
