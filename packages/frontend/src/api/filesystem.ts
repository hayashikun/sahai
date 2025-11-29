import { fetcher } from "./client";

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isGitRepo: boolean;
}

export interface BrowseResult {
  currentPath: string;
  parentPath: string;
  entries: DirectoryEntry[];
}

export interface GitInfo {
  path: string;
  isGitRepo: boolean;
  defaultBranch: string;
}

export async function browseDirectory(path?: string): Promise<BrowseResult> {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return fetcher<BrowseResult>(`/filesystem/browse${query}`);
}

export async function getGitInfo(path: string): Promise<GitInfo> {
  return fetcher<GitInfo>(
    `/filesystem/git-info?path=${encodeURIComponent(path)}`,
  );
}
