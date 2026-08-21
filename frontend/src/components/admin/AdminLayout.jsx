import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../shared/AuthContext";
import toast from "react-hot-toast";

const NAV_ITEMS = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/profile", label: "Profile" },
  { to: "/admin/home-page", label: "Home Page" },
  { to: "/admin/about-page", label: "About Page" },
  { to: "/admin/artworks", label: "Artworks" },
  { to: "/admin/upload-history", label: "Upload History" },
  { to: "/admin/inquiries", label: "Inquiries" },
  { to: "/admin/activity", label: "Activity" },
  { to: "/admin/security", label: "Security" },
  { to: "/admin/settings", label: "Settings" },
];

const AdminLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    toast.success("Logged out");
    navigate("/admin/login", { replace: true });
  };

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-gray-950 text-white w-64 flex-shrink-0">
      <div className="px-6 py-6 border-b border-white/10">
        <h2 className="font-display text-xl font-light text-white">Artist Portfolio</h2>
        <p className="text-white/30 text-xs font-label tracking-widest uppercase mt-1">Admin</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/admin/dashboard"}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-white/40 text-xs mb-3 truncate">{user?.email}</p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors w-full"
        >
          <span aria-hidden="true">x</span> Sign Out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <div className="hidden lg:flex lg:flex-shrink-0">
        <Sidebar />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full z-50">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="lg:hidden flex items-center justify-between bg-gray-950 px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white p-1"
            aria-label="Open sidebar"
          >
            <div className="w-5 flex flex-col gap-1">
              <span className="block h-0.5 bg-white" />
              <span className="block h-0.5 bg-white" />
              <span className="block h-0.5 bg-white" />
            </div>
          </button>
          <h2 className="font-display text-lg text-white font-light">Admin</h2>
          <div className="w-7" />
        </div>

        <main className="flex-1 overflow-y-auto bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
