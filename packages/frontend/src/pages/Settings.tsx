import {
  Bell,
  Bot,
  Check,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Terminal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Settings as SettingsData, SettingsUpdate } from "shared/schemas";
import {
  getSettings,
  getSounds,
  playSound,
  type SoundsResponse,
  updateSettings,
  validatePath,
} from "../api/settings";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { cn } from "../lib/utils";

type Section = "general" | "agents";
type AgentKey = "claudeCode" | "codex" | "copilot" | "gemini";

const AGENT_NAMES: Record<AgentKey, string> = {
  claudeCode: "Claude Code",
  codex: "Codex",
  copilot: "Copilot",
  gemini: "Gemini",
};

export function Settings() {
  const [activeSection, setActiveSection] = useState<Section>("general");
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [sounds, setSounds] = useState<SoundsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathValidation, setPathValidation] = useState<
    Record<string, { valid: boolean; checking: boolean }>
  >({});

  useEffect(() => {
    Promise.all([getSettings(), getSounds()])
      .then(([settingsData, soundsData]) => {
        setSettings(settingsData);
        setSounds(soundsData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleUpdate = useCallback(
    async (update: SettingsUpdate) => {
      if (!settings) return;
      setSaving(true);
      try {
        const updated = await updateSettings(update);
        setSettings(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [settings],
  );

  const handlePathValidation = useCallback(
    async (key: string, path: string) => {
      if (!path.trim()) {
        setPathValidation((prev) => ({
          ...prev,
          [key]: { valid: false, checking: false },
        }));
        return;
      }
      setPathValidation((prev) => ({
        ...prev,
        [key]: { valid: false, checking: true },
      }));
      try {
        const result = await validatePath(path);
        setPathValidation((prev) => ({
          ...prev,
          [key]: { valid: result.valid && result.executable, checking: false },
        }));
      } catch {
        setPathValidation((prev) => ({
          ...prev,
          [key]: { valid: false, checking: false },
        }));
      }
    },
    [],
  );

  const handleTestSound = useCallback(async (soundName: string) => {
    try {
      await playSound(soundName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to play sound");
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  if (!settings) return null;

  const sidebarItems = [
    { id: "general" as const, label: "General", icon: Settings2 },
    { id: "agents" as const, label: "Agents", icon: Bot },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-6 max-w-5xl mx-auto">
      {/* Sidebar */}
      <nav className="md:w-48 flex-shrink-0">
        <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
          {sidebarItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                  activeSection === item.id
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-2 text-red-500 hover:text-red-700"
            >
              <X className="h-4 w-4 inline" />
            </button>
          </div>
        )}

        {activeSection === "general" && (
          <GeneralSection
            settings={settings}
            sounds={sounds}
            onUpdate={handleUpdate}
            onTestSound={handleTestSound}
            saving={saving}
          />
        )}

        {activeSection === "agents" && (
          <AgentsSection
            settings={settings}
            onUpdate={handleUpdate}
            onValidatePath={handlePathValidation}
            pathValidation={pathValidation}
            saving={saving}
          />
        )}
      </div>
    </div>
  );
}

function GeneralSection({
  settings,
  sounds,
  onUpdate,
  onTestSound,
  saving,
}: {
  settings: SettingsData;
  sounds: SoundsResponse | null;
  onUpdate: (update: SettingsUpdate) => Promise<void>;
  onTestSound: (name: string) => Promise<void>;
  saving: boolean;
}) {
  const [macosApp, setMacosApp] = useState(settings["terminal.macosApp"]);
  const [linuxCommand, setLinuxCommand] = useState(
    settings["terminal.linuxCommand"] ?? "",
  );
  const [testingSound, setTestingSound] = useState(false);

  const handleTestSound = async () => {
    if (!settings["notification.sound"]) return;
    setTestingSound(true);
    try {
      await onTestSound(settings["notification.sound"]);
    } finally {
      setTestingSound(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          General Settings
        </h2>
        <p className="text-sm text-gray-500">
          Configure terminal and notification settings.
        </p>
      </div>

      {/* Terminal Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-gray-500" />
          <h3 className="font-medium text-gray-900">Terminal</h3>
        </div>

        <div className="space-y-4 pl-7">
          <div className="space-y-2">
            <Label htmlFor="macos-app">macOS Terminal App</Label>
            <div className="flex gap-2">
              <Input
                id="macos-app"
                value={macosApp}
                onChange={(e) => setMacosApp(e.target.value)}
                placeholder="Terminal"
                className="flex-1"
              />
              <Button
                onClick={() => onUpdate({ "terminal.macosApp": macosApp })}
                disabled={saving}
                size="sm"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              The macOS application to open (e.g., Terminal, iTerm, Warp)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="linux-command">Linux Terminal Command</Label>
            <div className="flex gap-2">
              <Input
                id="linux-command"
                value={linuxCommand}
                onChange={(e) => setLinuxCommand(e.target.value)}
                placeholder="gnome-terminal --working-directory {path}"
                className="flex-1"
              />
              <Button
                onClick={() =>
                  onUpdate({
                    "terminal.linuxCommand": linuxCommand || null,
                  })
                }
                disabled={saving}
                size="sm"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Custom command for Linux. Use {"{path}"} as placeholder for the
              directory path.
            </p>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-gray-500" />
          <h3 className="font-medium text-gray-900">Notification</h3>
        </div>

        <div className="space-y-4 pl-7">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Notifications</Label>
              <p className="text-xs text-gray-500">
                Play sound when tasks complete
              </p>
            </div>
            <Switch
              checked={settings["notification.enabled"]}
              onCheckedChange={(checked) =>
                onUpdate({ "notification.enabled": checked })
              }
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trigger">Notification Trigger</Label>
            <Select
              value={settings["notification.trigger"]}
              onValueChange={(value) =>
                onUpdate({
                  "notification.trigger": value as
                    | "completed"
                    | "failed"
                    | "all",
                })
              }
              disabled={saving || !settings["notification.enabled"]}
            >
              <SelectTrigger id="trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Completed only</SelectItem>
                <SelectItem value="failed">Failed only</SelectItem>
                <SelectItem value="all">All events</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              When to play notification sounds
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sound">Notification Sound</Label>
            <div className="flex gap-2">
              <Select
                value={settings["notification.sound"] ?? ""}
                onValueChange={(value) =>
                  onUpdate({ "notification.sound": value || null })
                }
                disabled={saving || !settings["notification.enabled"]}
              >
                <SelectTrigger id="sound" className="flex-1">
                  <SelectValue placeholder="Select a sound" />
                </SelectTrigger>
                <SelectContent>
                  {sounds?.sounds.map((sound) => (
                    <SelectItem key={sound.name} value={sound.name}>
                      {sound.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={handleTestSound}
                disabled={
                  !settings["notification.sound"] ||
                  !settings["notification.enabled"] ||
                  testingSound
                }
                title="Test sound"
              >
                {testingSound ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              {sounds?.platform === "darwin"
                ? "macOS system sounds"
                : sounds?.platform === "linux"
                  ? "Linux system sounds"
                  : "System sounds"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentsSection({
  settings,
  onUpdate,
  onValidatePath,
  pathValidation,
  saving,
}: {
  settings: SettingsData;
  onUpdate: (update: SettingsUpdate) => Promise<void>;
  onValidatePath: (key: string, path: string) => Promise<void>;
  pathValidation: Record<string, { valid: boolean; checking: boolean }>;
  saving: boolean;
}) {
  const agents: AgentKey[] = ["claudeCode", "codex", "copilot", "gemini"];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Agent Settings</h2>
        <p className="text-sm text-gray-500">
          Configure AI coding agents. Enable/disable agents and set custom
          command paths.
        </p>
      </div>

      <div className="space-y-6">
        {agents.map((agent) => (
          <AgentCard
            key={agent}
            agent={agent}
            settings={settings}
            onUpdate={onUpdate}
            onValidatePath={onValidatePath}
            pathValidation={pathValidation}
            saving={saving}
          />
        ))}
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  settings,
  onUpdate,
  onValidatePath,
  pathValidation,
  saving,
}: {
  agent: AgentKey;
  settings: SettingsData;
  onUpdate: (update: SettingsUpdate) => Promise<void>;
  onValidatePath: (key: string, path: string) => Promise<void>;
  pathValidation: Record<string, { valid: boolean; checking: boolean }>;
  saving: boolean;
}) {
  const enabledKey = `agent.${agent}.enabled` as keyof SettingsData;
  const pathKey = `agent.${agent}.path` as keyof SettingsData;
  const enabled = settings[enabledKey] as boolean;
  const path = settings[pathKey] as string | null;
  const [localPath, setLocalPath] = useState(path ?? "");
  const validation = pathValidation[pathKey];

  useEffect(() => {
    setLocalPath(path ?? "");
  }, [path]);

  const handlePathBlur = () => {
    if (localPath && localPath !== path) {
      onValidatePath(pathKey, localPath);
    }
  };

  const handleSavePath = () => {
    onUpdate({ [pathKey]: localPath || null } as SettingsUpdate);
  };

  const handleReset = () => {
    const defaults: Record<AgentKey, string> = {
      claudeCode: "claude",
      codex: "codex",
      copilot: "copilot",
      gemini: "gemini",
    };
    setLocalPath(defaults[agent]);
    onUpdate({ [pathKey]: defaults[agent] } as SettingsUpdate);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-gray-500" />
          <div>
            <h3 className="font-medium text-gray-900">{AGENT_NAMES[agent]}</h3>
            <p className="text-xs text-gray-500">AI coding agent</p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) =>
            onUpdate({ [enabledKey]: checked } as SettingsUpdate)
          }
          disabled={saving}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${agent}-path`}>Command Path</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id={`${agent}-path`}
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              onBlur={handlePathBlur}
              placeholder={agent}
              disabled={!enabled || saving}
              className={cn(
                "pr-8",
                validation?.valid === true && "border-green-500",
                validation?.valid === false &&
                  validation?.checking === false &&
                  localPath &&
                  "border-red-500",
              )}
            />
            {validation?.checking && (
              <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-gray-400" />
            )}
            {validation?.valid === true && !validation?.checking && (
              <Check className="absolute right-2 top-2.5 h-4 w-4 text-green-500" />
            )}
            {validation?.valid === false &&
              !validation?.checking &&
              localPath && (
                <X className="absolute right-2 top-2.5 h-4 w-4 text-red-500" />
              )}
          </div>
          <Button
            onClick={handleSavePath}
            disabled={saving || !enabled}
            size="sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={saving || !enabled}
            size="sm"
            className="px-2"
            title="Reset to default"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Path to the {AGENT_NAMES[agent]} CLI executable
        </p>
      </div>
    </div>
  );
}
