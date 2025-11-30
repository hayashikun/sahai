import { Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components";
import {
  ProjectDetail,
  ProjectList,
  RepositoryDetail,
  RepositoryList,
  TaskDetail,
} from "./pages";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/projects" replace />} />
          <Route
            path="projects"
            element={
              <Suspense fallback={<div>Loading...</div>}>
                <ProjectList />
              </Suspense>
            }
          />
          <Route
            path="projects/:projectId"
            element={
              <Suspense fallback={<div>Loading...</div>}>
                <ProjectDetail />
              </Suspense>
            }
          />
          <Route
            path="repositories"
            element={
              <Suspense fallback={<div>Loading...</div>}>
                <RepositoryList />
              </Suspense>
            }
          />
          <Route
            path="repositories/:repositoryId"
            element={
              <Suspense fallback={<div>Loading...</div>}>
                <RepositoryDetail />
              </Suspense>
            }
          />
          <Route
            path="tasks/:taskId"
            element={
              <Suspense fallback={<div>Loading...</div>}>
                <TaskDetail />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
