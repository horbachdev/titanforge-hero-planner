/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional URL of a hosted game-data.json (or API) loaded before the bundled data. */
  readonly VITE_GAME_DATA_URL?: string;
}
