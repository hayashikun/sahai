import {
  ChevronRight,
  Folder,
  GitBranch,
  GitFork,
  Home,
  Loader2,
  Package,
  Plus,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { useRepositories } from "../hooks";
import { cn } from "../lib/utils";

export function RepositoryList() {
  const { repositories, mutate } = useRepositories();
  const [open, setOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const [description, setDescription] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
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

  // Load home directory when dialog opens
  useEffect(() => {
    if (open && !browseResult) {
      loadDirectory();
    }
  }, [open, browseResult, loadDirectory]);

  const selectRepository = async (entry: DirectoryEntry) => {
    if (!entry.isGitRepo) {
      // Navigate into directory
      loadDirectory(entry.path);
      return;
    }

    // Select git repository and load git info
    setSelectedPath(entry.path);
    try {
      const gitInfo = await getGitInfo(entry.path);
      const initialDefaultBranch =
        gitInfo.defaultBranch?.trim() || gitInfo.currentBranch;
      const availableBranches = Array.from(
        new Set([initialDefaultBranch, ...gitInfo.branches]),
      );

      setBranches(availableBranches);
      setDefaultBranch(initialDefaultBranch);
    } catch {
      setBranches(["main"]);
      setDefaultBranch("main");
    }

    // If git repo has submodules, also navigate into it to show submodules
    if (entry.hasSubmodules) {
      loadDirectory(entry.path);
    }
  };

  const handleCreateRepository = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPath.trim()) {
      return;
    }

    // Derive name from path (last directory name)
    const name = selectedPath.split("/").filter(Boolean).pop() || "repository";

    try {
      setCreating(true);
      setError(null);
      await createRepository({
        name,
        description: description.trim() || undefined,
        path: selectedPath.trim(),
        defaultBranch: defaultBranch.trim() || "main",
      });
      resetAndClose();
      mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create repository");
    } finally {
      setCreating(false);
    }
  };

  const resetAndClose = () => {
    setOpen(false);
    setSelectedPath("");
    setDescription("");
    setDefaultBranch("");
    setBranches([]);
    setBrowseResult(null);
    setError(null);
  };

  useEffect(() => {
    if (!defaultBranch && branches.length > 0) {
      // Ensure the select shows a value when branches are present
      setDefaultBranch(branches[0]);
    }
  }, [branches, defaultBranch]);

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setOpen(true);
    } else {
      resetAndClose();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Repositories</h1>
          <p className="text-gray-500">Manage your git repositories</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Repository
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Repository</DialogTitle>
            <DialogDescription>
              Select a git repository from your filesystem
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
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
                      {browseResult.currentPath !== browseResult.parentPath && (
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
                          onClick={() => loadDirectory(browseResult.parentPath)}
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
                        browseResult.entries.map((entry) => {
                          // Determine icon and style based on entry type
                          const isSubmodule = entry.isSubmodule;
                          const canNavigate =
                            !entry.isGitRepo || entry.hasSubmodules;

                          return (
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
                              {isSubmodule ? (
                                <Package className="h-4 w-4 text-green-600" />
                              ) : entry.isGitRepo ? (
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
                              {canNavigate && (
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              )}
                            </button>
                          );
                        })
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
                  <Label htmlFor="repo-description">Description</Label>
                  <Textarea
                    id="repo-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the role of this repository"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repo-branch">Default Branch</Label>
                  <Select
                    key={selectedPath}
                    value={defaultBranch || undefined}
                    onValueChange={setDefaultBranch}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch} value={branch}>
                          {branch}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={resetAndClose}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !selectedPath}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {creating ? "Adding..." : "Add Repository"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
                      {repo.description && (
                        <div className="text-sm text-gray-600 line-clamp-2">
                          {repo.description}
                        </div>
                      )}
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
