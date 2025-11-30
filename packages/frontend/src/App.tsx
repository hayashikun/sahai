import { Loader2 } from "lucide-react";
import { Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary, Layout } from "./components";
import {
  ProjectDetail,
  ProjectList,
  RepositoryDetail,
  RepositoryList,
  TaskDetail,
} from "./pages";

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/projects" replace />} />
          <Route
            path="projects"
            element={
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <ProjectList />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="projects/:projectId"
            element={
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <ProjectDetail />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="repositories"
            element={
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <RepositoryList />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="repositories/:repositoryId"
            element={
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <RepositoryDetail />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="tasks/:taskId"
            element={
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <TaskDetail />
                </Suspense>
              </ErrorBoundary>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
