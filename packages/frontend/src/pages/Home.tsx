import { ArrowRight, FolderKanban, GitBranch, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

export function Home() {
  const features = [
    {
      icon: FolderKanban,
      title: "Kanban Board",
      description:
        "Manage tasks with drag-and-drop Kanban boards for each repository.",
    },
    {
      icon: GitBranch,
      title: "Git Worktrees",
      description:
        "Each task runs in an isolated Git worktree for safe parallel development.",
    },
    {
      icon: Zap,
      title: "AI Agents",
      description:
        "Execute tasks with Claude Code or Codex agents automatically.",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Welcome to Sahai</h1>
        <p className="text-xl text-gray-500">
          AI Coding Agent orchestration tool for managing Claude Code and Codex
          agents through a web-based Kanban interface.
        </p>
        <div className="flex gap-4">
          <Button asChild>
            <Link to="/projects">
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {features.map((feature) => (
          <Card key={feature.title}>
            <CardHeader>
              <feature.icon className="h-8 w-8 text-gray-900 mb-2" />
              <CardTitle>{feature.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{feature.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
