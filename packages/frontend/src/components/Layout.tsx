import { Link, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div>
      <header>
        <h1>Sahai</h1>
        <nav>
          <ul>
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <Link to="/projects">Projects</Link>
            </li>
          </ul>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
