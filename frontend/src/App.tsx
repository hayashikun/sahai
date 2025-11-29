import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components";
import { Home, ProjectDetail, ProjectList } from "./pages";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="projects" element={<ProjectList />} />
          <Route path="projects/:projectId" element={<ProjectDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
