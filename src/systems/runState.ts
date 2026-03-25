import type Phaser from "phaser";
import { DEFAULT_CHARACTER_ID, type CharacterId } from "../config";

export const DEFAULT_RUN_LIVES = 10;

const RUN_CHARACTER_KEY = "runCharacterId";
const RUN_LIVES_KEY = "runLives";

export function beginRun(scene: Phaser.Scene, characterId: CharacterId) {
  scene.registry.set(RUN_CHARACTER_KEY, characterId);
  scene.registry.set(RUN_LIVES_KEY, DEFAULT_RUN_LIVES);
}

export function rememberRunCharacter(scene: Phaser.Scene, incomingCharacterId?: CharacterId) {
  const resolvedCharacterId = incomingCharacterId ?? getRunCharacterId(scene);
  scene.registry.set(RUN_CHARACTER_KEY, resolvedCharacterId);
  return resolvedCharacterId;
}

export function getRunCharacterId(scene: Phaser.Scene): CharacterId {
  const value = scene.registry.get(RUN_CHARACTER_KEY);
  if (value === "knight" || value === "dog" || value === "officer") {
    return value;
  }

  return DEFAULT_CHARACTER_ID;
}

export function getRunLives(scene: Phaser.Scene) {
  const value = scene.registry.get(RUN_LIVES_KEY);
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  return DEFAULT_RUN_LIVES;
}

export function setRunLives(scene: Phaser.Scene, lives: number) {
  scene.registry.set(RUN_LIVES_KEY, Math.max(0, Math.floor(lives)));
}

export function loseRunLife(scene: Phaser.Scene) {
  const nextLives = Math.max(0, getRunLives(scene) - 1);
  setRunLives(scene, nextLives);
  return nextLives;
}
