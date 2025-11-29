import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components";
import { Home, Projects } from "./pages";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="projects" element={<Projects />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
