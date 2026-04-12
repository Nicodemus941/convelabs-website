import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const DesktopNavigation = () => {
  const location = useLocation();
  const { user } = useAuth();

  const handleHashLink = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    if (location.pathname === "/") {
      e.preventDefault();
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const linkClass = (path: string) =>
    `text-base font-medium transition-colors ${
      isActive(path) ? "text-conve-red" : "text-gray-700 hover:text-conve-red"
    }`;

  return (
    <nav className="hidden lg:flex items-center space-x-6">
      <Link to="/" className={linkClass("/")}>
        Home
      </Link>
      <a href="/#how-it-works" onClick={(e) => handleHashLink(e, "#how-it-works")} className="text-base font-medium text-gray-700 hover:text-conve-red transition-colors">
        How It Works
      </a>
      <Link to="/pricing" className={linkClass("/pricing")}>
        Pricing
      </Link>
      <a href="/#service-areas" onClick={(e) => handleHashLink(e, "#service-areas")} className="text-base font-medium text-gray-700 hover:text-conve-red transition-colors">
        Service Areas
      </a>
      <Link to="/about" className={linkClass("/about")}>
        About
      </Link>
      <Link to="/contact" className={linkClass("/contact")}>
        Contact
      </Link>
      {user && (
        <Link to="/dashboard" className={linkClass("/dashboard")}>
          Dashboard
        </Link>
      )}
      {user && ["admin", "super_admin", "office_manager"].includes(user.role) && (
        <Link to="/dashboard/super_admin" className={linkClass("/dashboard/super_admin")}>
          Admin
        </Link>
      )}
    </nav>
  );
};

export default DesktopNavigation;
