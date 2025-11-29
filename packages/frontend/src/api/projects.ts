import { type ProjectResponse, toProject } from "shared/api";
import type { Project } from "shared/types";
import { apiPost } from "./client";

export async function createProject(
  name: string,
  description?: string,
): Promise<Project> {
  const data = await apiPost<ProjectResponse>("/projects", {
    name,
    description,
  });
  return toProject(data);
}
