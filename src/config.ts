export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const INTRO_DURATION_MS = 20_000;

export const INTRO_BEATS_MS = {
  THEFT: 3_500,
  CHASE: 6_500,
  HERO_SPOTS_THIEF: 11_000,
  PORTAL_ESCAPE: 15_000,
  MISSION_TEXT: 17_500,
} as const;

export type CharacterId = "knight" | "dog" | "officer";

export type CharacterConfig = {
  id: CharacterId;
  name: string;
  role: string;
  speed: number;
  jumpDistance: number;
  maxHealth: number;
  attackPower: number;
  primaryColor: number;
  accentColor: number;
};

export const DEFAULT_CHARACTER_ID: CharacterId = "knight";

export const CHARACTER_OPTIONS: readonly CharacterConfig[] = [
  {
    id: "knight",
    name: "Knight",
    role: "Balanced",
    speed: 235,
    jumpDistance: 62,
    maxHealth: 3,
    attackPower: 1,
    primaryColor: 0x7384d9,
    accentColor: 0xf5d77a,
  },
  {
    id: "dog",
    name: "Dog",
    role: "Fast movement",
    speed: 285,
    jumpDistance: 66,
    maxHealth: 3,
    attackPower: 1,
    primaryColor: 0xc69352,
    accentColor: 0xffe3b8,
  },
  {
    id: "officer",
    name: "Police Officer",
    role: "Stronger attacks",
    speed: 225,
    jumpDistance: 60,
    maxHealth: 3,
    attackPower: 2,
    primaryColor: 0x3c6ec9,
    accentColor: 0xffdc77,
  },
];

export const LEVEL1_CONFIG = {
  topSafeHeight: 72,
  bottomSafeHeight: 88,
  lakeTop: 156,
  lakeBottom: 284,
  roadLaneCount: 7,
  lilyPadRadius: 34,
  carSpawnMs: 3_000,
  carMinSpeed: 170,
  carMaxSpeed: 280,
  carWidth: 72,
  carHeight: 36,
  jumpDurationMs: 200,
  hitInvulnMs: 900,
} as const;
