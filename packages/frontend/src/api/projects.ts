import { Project, type Project as ProjectType } from "shared/schemas";
import { apiPost } from "./client";

export async function createProject(
  name: string,
  description?: string,
): Promise<ProjectType> {
  const data = await apiPost("/projects", {
    name,
    description,
  });
  return Project.parse(data);
}
