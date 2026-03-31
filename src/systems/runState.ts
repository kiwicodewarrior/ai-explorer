import type Phaser from "phaser";
import { DEFAULT_CHARACTER_ID, type CharacterId } from "../config";

export const DEFAULT_RUN_LIVES = 10;
export const REVIVE_GEM_COST = 1;

const RUN_CHARACTER_KEY = "runCharacterId";
const RUN_LIVES_KEY = "runLives";
const GEM_COUNT_KEY = "gemCount";
const GEM_SHOP_SPEND_KEY = "gemShopSpend";

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

export function getGemCount(scene: Phaser.Scene) {
  const value = scene.registry.get(GEM_COUNT_KEY);
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  return 0;
}

export function setGemCount(scene: Phaser.Scene, gems: number) {
  scene.registry.set(GEM_COUNT_KEY, Math.max(0, Math.floor(gems)));
}

export function addGems(scene: Phaser.Scene, amount: number) {
  const nextTotal = getGemCount(scene) + Math.max(0, Math.floor(amount));
  setGemCount(scene, nextTotal);
  return nextTotal;
}

export function spendGems(scene: Phaser.Scene, amount: number) {
  const gemCost = Math.max(0, Math.floor(amount));
  const currentGems = getGemCount(scene);
  if (currentGems < gemCost) return false;

  setGemCount(scene, currentGems - gemCost);
  return true;
}

export function getGemShopSpend(scene: Phaser.Scene) {
  const value = scene.registry.get(GEM_SHOP_SPEND_KEY);
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  return 0;
}

export function buyGemPack(scene: Phaser.Scene, gemAmount: number, dollarCost: number) {
  const nextGemTotal = addGems(scene, gemAmount);
  const nextSpend = getGemShopSpend(scene) + Math.max(0, dollarCost);
  scene.registry.set(GEM_SHOP_SPEND_KEY, nextSpend);
  return { gems: nextGemTotal, dollarsSpent: nextSpend };
}

export function useReviveGem(scene: Phaser.Scene) {
  if (!spendGems(scene, REVIVE_GEM_COST)) {
    return false;
  }

  setRunLives(scene, DEFAULT_RUN_LIVES);
  return true;
}
