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

export async function getSettings(): Promise<Settings> {
  return fetcher<Settings>("/settings");
}

export async function updateSettings(
  settings: SettingsUpdate,
): Promise<Settings> {
  return apiPut<Settings>("/settings", settings);
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
  await apiPost("/sounds/play", { name });
}
