import {
  ChevronRight,
  Folder,
  GitBranch,
  GitFork,
  Home,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  type BrowseResult,
  browseDirectory,
  createRepository,
  type DirectoryEntry,
  getGitInfo,
} from "../api";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useRepositories } from "../hooks";
import { cn } from "../lib/utils";

export function RepositoryList() {
  const { repositories, mutate } = useRepositories();
  const [showForm, setShowForm] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Directory browser state
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (path?: string) => {
    try {
      setLoading(true);
      setBrowseError(null);
      const result = await browseDirectory(path);
      setBrowseResult(result);
    } catch (e) {
      setBrowseError(
        e instanceof Error ? e.message : "Failed to browse directory",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Load home directory on mount
  useEffect(() => {
    if (showForm && !browseResult) {
      loadDirectory();
    }
  }, [showForm, browseResult, loadDirectory]);

  const selectRepository = async (entry: DirectoryEntry) => {
    if (!entry.isGitRepo) {
      // Navigate into directory
      loadDirectory(entry.path);
      return;
    }

    // Select git repository
    setSelectedPath(entry.path);
    try {
      const gitInfo = await getGitInfo(entry.path);
      setDefaultBranch(gitInfo.defaultBranch);
    } catch {
      setDefaultBranch("main");
    }
  };

  const handleCreateRepository = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPath.trim()) return;

    // Derive name from path (last directory name)
    const name = selectedPath.split("/").filter(Boolean).pop() || "repository";

    try {
      setCreating(true);
      setError(null);
      await createRepository({
        name,
        path: selectedPath.trim(),
        defaultBranch: defaultBranch.trim() || "main",
      });
      setSelectedPath("");
      setDefaultBranch("main");
      setBrowseResult(null);
      setShowForm(false);
      mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create repository");
    } finally {
      setCreating(false);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setSelectedPath("");
    setDefaultBranch("main");
    setBrowseResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Repositories</h1>
          <p className="text-gray-500">Manage your git repositories</p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Repository
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg">Add Repository</CardTitle>
            <Button variant="ghost" size="icon" onClick={closeForm}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateRepository} className="space-y-4">
              {/* Directory Browser */}
              <div className="space-y-2">
                <Label>Select Git Repository</Label>
                <div className="border rounded-lg overflow-hidden">
                  {/* Path breadcrumb */}
                  {browseResult && (
                    <div className="flex items-center gap-1 px-3 py-2 bg-gray-50 border-b text-sm">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1"
                        onClick={() => loadDirectory()}
                      >
                        <Home className="h-4 w-4" />
                      </Button>
                      <span className="text-gray-400">/</span>
                      <span className="font-mono text-xs text-gray-600 truncate">
                        {browseResult.currentPath}
                      </span>
                    </div>
                  )}

                  {/* Directory listing */}
                  <div className="max-h-64 overflow-y-auto">
                    {loading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                      </div>
                    ) : browseError ? (
                      <div className="p-4 text-sm text-red-600">
                        {browseError}
                      </div>
                    ) : browseResult ? (
                      <div className="divide-y">
                        {/* Parent directory */}
                        {browseResult.currentPath !==
                          browseResult.parentPath && (
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
                            onClick={() =>
                              loadDirectory(browseResult.parentPath)
                            }
                          >
                            <Folder className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-500">..</span>
                          </button>
                        )}

                        {browseResult.entries.length === 0 ? (
                          <div className="p-4 text-sm text-gray-500 text-center">
                            No directories found
                          </div>
                        ) : (
                          browseResult.entries.map((entry) => (
                            <button
                              key={entry.path}
                              type="button"
                              className={cn(
                                "w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left",
                                entry.isGitRepo &&
                                  "bg-green-50 hover:bg-green-100",
                                selectedPath === entry.path &&
                                  "bg-blue-100 hover:bg-blue-100",
                              )}
                              onClick={() => selectRepository(entry)}
                            >
                              {entry.isGitRepo ? (
                                <GitFork className="h-4 w-4 text-green-600" />
                              ) : (
                                <Folder className="h-4 w-4 text-gray-400" />
                              )}
                              <span
                                className={cn(
                                  "flex-1 truncate",
                                  entry.isGitRepo &&
                                    "font-medium text-green-800",
                                )}
                              >
                                {entry.name}
                              </span>
                              {!entry.isGitRepo && (
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Navigate and select a git repository (highlighted in green)
                </p>
              </div>

              {/* Selected repository info */}
              {selectedPath && (
                <div className="space-y-4 p-3 bg-blue-50 rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">
                      Selected Repository
                    </Label>
                    <div className="font-mono text-sm">{selectedPath}</div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="repo-branch">Default Branch</Label>
                    <Input
                      id="repo-branch"
                      type="text"
                      value={defaultBranch}
                      onChange={(e) => setDefaultBranch(e.target.value)}
                      placeholder="main"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={creating || !selectedPath}>
                  {creating && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {creating ? "Adding..." : "Add Repository"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeForm}
                  disabled={creating}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-4">All Repositories</h2>
        {repositories.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <GitFork className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500">No repositories found.</p>
              <p className="text-sm text-gray-500">
                Add your first repository above.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {repositories.map((repo) => (
              <Link key={repo.id} to={`/repositories/${repo.id}`}>
                <Card className="hover:bg-gray-50 transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <GitFork className="h-4 w-4" />
                      {repo.name}
                    </CardTitle>
                    <CardDescription className="space-y-1">
                      <div className="font-mono text-xs truncate">
                        {repo.path}
                      </div>
                      <div className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {repo.defaultBranch}
                      </div>
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
