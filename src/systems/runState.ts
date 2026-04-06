import type Phaser from "phaser";
import { DEFAULT_CHARACTER_ID, type CharacterId } from "../config";

export const DEFAULT_RUN_LIVES = 10;
export const REVIVE_GEM_COST = 1;

const RUN_CHARACTER_KEY = "runCharacterId";
const RUN_LIVES_KEY = "runLives";
const RUN_START_TIME_KEY = "runStartTimeMs";
const LAST_COMPLETED_RUN_KEY = "lastCompletedRunMs";
const BEST_COMPLETED_RUN_KEY = "bestCompletedRunMs";
const GEM_COUNT_KEY = "gemCount";
const GEM_SHOP_SPEND_KEY = "gemShopSpend";
const BEST_COMPLETED_RUN_STORAGE_KEY = "aiExplorerBestCompletedRunMs";

export type CompletedRunSummary = {
  elapsedMs: number;
  bestMs: number;
  isNewRecord: boolean;
};

export function beginRun(scene: Phaser.Scene, characterId: CharacterId) {
  scene.registry.set(RUN_CHARACTER_KEY, characterId);
  scene.registry.set(RUN_LIVES_KEY, DEFAULT_RUN_LIVES);
  scene.registry.set(RUN_START_TIME_KEY, Date.now());
  scene.registry.set(LAST_COMPLETED_RUN_KEY, null);
}

export function rememberRunCharacter(scene: Phaser.Scene, incomingCharacterId?: CharacterId) {
  const resolvedCharacterId = incomingCharacterId ?? getRunCharacterId(scene);
  scene.registry.set(RUN_CHARACTER_KEY, resolvedCharacterId);
  ensureRunTimerStarted(scene);
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

export function ensureRunTimerStarted(scene: Phaser.Scene) {
  const existingStartTime = getRunStartTime(scene);
  if (existingStartTime !== undefined) {
    return existingStartTime;
  }

  const startedAt = Date.now();
  scene.registry.set(RUN_START_TIME_KEY, startedAt);
  return startedAt;
}

export function getRunStartTime(scene: Phaser.Scene) {
  const value = scene.registry.get(RUN_START_TIME_KEY);
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  return undefined;
}

export function getCurrentRunElapsedMs(scene: Phaser.Scene) {
  const startedAt = getRunStartTime(scene);
  if (startedAt === undefined) {
    return 0;
  }

  return Math.max(0, Date.now() - startedAt);
}

export function finalizeCompletedRun(scene: Phaser.Scene): CompletedRunSummary {
  const elapsedMs = getCurrentRunElapsedMs(scene);
  const existingBest = getBestCompletedRunMs(scene);
  const isNewRecord = existingBest === undefined || elapsedMs < existingBest;
  const bestMs = isNewRecord ? elapsedMs : existingBest;

  scene.registry.set(LAST_COMPLETED_RUN_KEY, elapsedMs);

  if (isNewRecord) {
    setBestCompletedRunMs(scene, elapsedMs);
  } else {
    scene.registry.set(BEST_COMPLETED_RUN_KEY, bestMs);
  }

  return {
    elapsedMs,
    bestMs,
    isNewRecord,
  };
}

export function getLastCompletedRunMs(scene: Phaser.Scene) {
  const value = scene.registry.get(LAST_COMPLETED_RUN_KEY);
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  return undefined;
}

export function getBestCompletedRunMs(scene: Phaser.Scene) {
  const registryValue = scene.registry.get(BEST_COMPLETED_RUN_KEY);
  if (typeof registryValue === "number" && Number.isFinite(registryValue) && registryValue >= 0) {
    return registryValue;
  }

  const storedValue = readBestCompletedRunMs();
  if (storedValue !== undefined) {
    scene.registry.set(BEST_COMPLETED_RUN_KEY, storedValue);
  }
  return storedValue;
}

export function formatRunTime(ms: number) {
  const totalMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(totalMs / 1000);
  const hundredths = Math.floor((totalMs % 1000) / 10);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${padTime(minutes)}:${padTime(seconds)}.${padTime(hundredths)}`;
  }

  return `${padTime(minutes)}:${padTime(seconds)}.${padTime(hundredths)}`;
}

function setBestCompletedRunMs(scene: Phaser.Scene, elapsedMs: number) {
  const normalizedTime = Math.max(0, Math.floor(elapsedMs));
  scene.registry.set(BEST_COMPLETED_RUN_KEY, normalizedTime);
  writeBestCompletedRunMs(normalizedTime);
}

function readBestCompletedRunMs() {
  const storage = getLocalStorage();
  if (!storage) return undefined;

  try {
    const rawValue = storage.getItem(BEST_COMPLETED_RUN_STORAGE_KEY);
    if (!rawValue) return undefined;

    const parsedValue = Number(rawValue);
    if (Number.isFinite(parsedValue) && parsedValue >= 0) {
      return Math.floor(parsedValue);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function writeBestCompletedRunMs(elapsedMs: number) {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(BEST_COMPLETED_RUN_STORAGE_KEY, `${Math.max(0, Math.floor(elapsedMs))}`);
  } catch {
    // Ignore storage failures so the game still works without local persistence.
  }
}

function getLocalStorage() {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return undefined;
  }

  return globalThis.localStorage;
}

function padTime(value: number) {
  return value.toString().padStart(2, "0");
}
