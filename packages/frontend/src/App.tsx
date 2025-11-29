import { Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components";
import {
  Home,
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
          <Route index element={<Home />} />
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
