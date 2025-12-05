import type {
  Settings,
  SettingsResponse,
  SettingsUpdate,
  SoundsResponse,
  ValidatePathResponse,
} from "shared";
import { apiPost, apiPut, fetcher } from "./client";

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

export function validatePath(path: string): Promise<ValidatePathResponse> {
  return apiPost<ValidatePathResponse>("/settings/validate-path", { path });
}

export function getSounds(): Promise<SoundsResponse> {
  return fetcher<SoundsResponse>("/sounds");
}

export async function playSound(name: string): Promise<void> {
  await apiPost("/sounds/play", { sound: name });
}
