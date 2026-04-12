import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const DesktopNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleScrollLink = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    e.preventDefault();
    if (location.pathname === "/") {
      // Already on homepage — just scroll
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      // Navigate to homepage then scroll after load
      navigate("/");
      setTimeout(() => {
        const el = document.querySelector(hash);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 500);
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
      <a
        href="/#how-it-works"
        onClick={(e) => handleScrollLink(e, "#how-it-works")}
        className="text-base font-medium text-gray-700 hover:text-conve-red transition-colors cursor-pointer"
      >
        How It Works
      </a>
      <Link to="/pricing" className={linkClass("/pricing")}>
        Pricing
      </Link>
      <a
        href="/#service-areas"
        onClick={(e) => handleScrollLink(e, "#service-areas")}
        className="text-base font-medium text-gray-700 hover:text-conve-red transition-colors cursor-pointer"
      >
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
