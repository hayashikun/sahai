import { eq } from "drizzle-orm";
import type { AgentConfig, AgentType } from "shared";
import { executorToAgentKey } from "shared";
import { db } from "../db/client";
import { settings } from "../db/schema";
import { AGENT_DEFAULTS } from "./defaults";

export type { AgentType, AgentConfig };
export { executorToAgentKey };

export async function getAgentConfig(agent: AgentType): Promise<AgentConfig> {
  const enabledKey = `agent.${agent}.enabled`;
  const pathKey = `agent.${agent}.path`;

  const [enabledSetting, pathSetting] = await Promise.all([
    db.select().from(settings).where(eq(settings.key, enabledKey)),
    db.select().from(settings).where(eq(settings.key, pathKey)),
  ]);

  const defaults = AGENT_DEFAULTS[agent];

  return {
    enabled:
      enabledSetting.length > 0
        ? enabledSetting[0].value === "true"
        : defaults.enabled,
    path:
      pathSetting.length > 0 && pathSetting[0].value !== "null"
        ? pathSetting[0].value
        : defaults.path,
  };
}

export async function isAgentEnabled(agent: AgentType): Promise<boolean> {
  const config = await getAgentConfig(agent);
  return config.enabled;
}

export async function getAgentPath(agent: AgentType): Promise<string> {
  const config = await getAgentConfig(agent);
  return config.path;
}

// Get path by executor name (for use in executor files)
export function getExecutorPath(executorName: string): Promise<string | null> {
  const agentKey = executorToAgentKey[executorName];
  if (!agentKey) {
    return Promise.resolve(null);
  }
  return getAgentPath(agentKey);
}

// Check if executor is enabled by executor name
export function isExecutorEnabled(executorName: string): Promise<boolean> {
  const agentKey = executorToAgentKey[executorName];
  if (!agentKey) {
    return Promise.resolve(false);
  }
  return isAgentEnabled(agentKey);
}
