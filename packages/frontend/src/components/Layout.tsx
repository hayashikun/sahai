import {
  FolderKanban,
  GitFork,
  Github,
  ListTodo,
  Menu,
  Settings,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";

export function Layout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { to: "/tasks", label: "Tasks", icon: ListTodo },
    { to: "/projects", label: "Projects", icon: FolderKanban },
    { to: "/repositories", label: "Repositories", icon: GitFork },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="container mx-auto flex h-14 items-center px-4">
          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden flex items-center justify-center rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 min-h-[44px] min-w-[44px] mr-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
          <Link to="/" className="font-bold text-lg">
            Sahai
          </Link>
          {/* Desktop navigation */}
          <nav className="ml-8 hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900",
                    isActive ? "bg-gray-100 text-gray-900" : "text-gray-500",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <a
              href="https://github.com/hayashikun/sahai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
              aria-label="GitHub repository"
            >
              <Github className="h-5 w-5" />
            </a>
          </div>
        </div>
        {/* Mobile navigation menu */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-gray-200 bg-white px-4 py-2">
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900 min-h-[44px]",
                    isActive ? "bg-gray-100 text-gray-900" : "text-gray-500",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
