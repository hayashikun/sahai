import type { Settings } from "../../../shared/index.js";

// General > Terminal
export const TERMINAL_DEFAULTS = {
  macosApp: "Terminal",
  linuxCommand: null,
} as const;

// General > Notification
export const NOTIFICATION_DEFAULTS = {
  enabled: true,
  trigger: "all" as const,
  sound: process.platform === "darwin" ? "Glass" : null,
} as const;

// General > UI
export const UI_DEFAULTS = {
  loadingAnimation: "dots" as const,
} as const;

// Agent
export const AGENT_DEFAULTS = {
  claudeCode: { enabled: true, path: "claude" },
  codex: { enabled: true, path: "codex" },
  copilot: { enabled: true, path: "copilot" },
  gemini: { enabled: true, path: "gemini" },
} as const;

// All settings defaults
export const SETTINGS_DEFAULTS: Settings = {
  "terminal.macosApp": TERMINAL_DEFAULTS.macosApp,
  "terminal.linuxCommand": TERMINAL_DEFAULTS.linuxCommand,
  "notification.enabled": NOTIFICATION_DEFAULTS.enabled,
  "notification.trigger": NOTIFICATION_DEFAULTS.trigger,
  "notification.sound": NOTIFICATION_DEFAULTS.sound,
  "ui.loadingAnimation": UI_DEFAULTS.loadingAnimation,
  "agent.claudeCode.enabled": AGENT_DEFAULTS.claudeCode.enabled,
  "agent.claudeCode.path": AGENT_DEFAULTS.claudeCode.path,
  "agent.codex.enabled": AGENT_DEFAULTS.codex.enabled,
  "agent.codex.path": AGENT_DEFAULTS.codex.path,
  "agent.copilot.enabled": AGENT_DEFAULTS.copilot.enabled,
  "agent.copilot.path": AGENT_DEFAULTS.copilot.path,
  "agent.gemini.enabled": AGENT_DEFAULTS.gemini.enabled,
  "agent.gemini.path": AGENT_DEFAULTS.gemini.path,
};

// Setting keys
export const SETTING_KEYS = Object.keys(SETTINGS_DEFAULTS) as Array<
  keyof Settings
>;
