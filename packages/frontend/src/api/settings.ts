import type {
  Settings,
  SettingsUpdate,
  Sound,
  ValidatePathResponse,
} from "shared/schemas";
import { apiPost, apiPut, fetcher } from "./client";

export interface SoundsResponse {
  sounds: Sound[];
  platform: string;
}

interface SettingsResponse {
  settings: Settings;
}

export async function getSettings(): Promise<Settings> {
  const response = await fetcher<SettingsResponse>("/settings");
  return response.settings;
}

export async function updateSettings(
  settings: SettingsUpdate,
): Promise<Settings> {
  const response = await apiPut<SettingsResponse>("/settings", settings);
  return response.settings;
}

export async function validatePath(
  path: string,
): Promise<ValidatePathResponse> {
  return apiPost<ValidatePathResponse>("/settings/validate-path", { path });
}

export async function getSounds(): Promise<SoundsResponse> {
  return fetcher<SoundsResponse>("/sounds");
}

export async function playSound(name: string): Promise<void> {
  await apiPost("/sounds/play", { sound: name });
}
