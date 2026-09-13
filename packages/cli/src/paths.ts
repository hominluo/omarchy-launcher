import os from "node:os"
import path from "node:path"

export const HOME = os.homedir()
export const CONFIG_DIR = path.join(HOME, ".config", "omarchy-launcher")
export const DATA_DIR = path.join(HOME, ".local", "share", "omarchy-launcher")
export const STATE_DIR = path.join(HOME, ".local", "state", "omarchy-launcher")
export const CACHE_DIR = path.join(HOME, ".cache", "omarchy-launcher")
export const EXT_DIR = path.join(DATA_DIR, "extensions")
export const INDEX_FILE = path.join(EXT_DIR, "index.json")
export const SUPPORT_DIR = path.join(DATA_DIR, "support")
export const PREFS_DIR = path.join(CONFIG_DIR, "prefs")
export const SECRETS_DIR = path.join(DATA_DIR, "secrets")
export const PLUGIN_ID = "io.github.hominluo.launcher"
