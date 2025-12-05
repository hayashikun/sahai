import { fetcher } from "./client";

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isGitRepo: boolean;
  isSubmodule?: boolean;
  hasSubmodules?: boolean;
}

export interface BrowseResult {
  currentPath: string;
  parentPath: string;
  entries: DirectoryEntry[];
}

export interface GitInfo {
  path: string;
  isGitRepo: boolean;
  currentBranch: string;
  defaultBranch: string;
  branches: string[];
}

export function browseDirectory(path?: string): Promise<BrowseResult> {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return fetcher<BrowseResult>(`/filesystem/browse${query}`);
}

export function getGitInfo(path: string): Promise<GitInfo> {
  return fetcher<GitInfo>(
    `/filesystem/git-info?path=${encodeURIComponent(path)}`,
  );
}
