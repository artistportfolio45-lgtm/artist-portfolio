// src/App.jsx
// Root component — all routes defined here

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./components/shared/AuthContext";
import ProtectedRoute from "./components/shared/ProtectedRoute";
import ScrollToTop from "./components/shared/ScrollToTop";

// ── Public pages
import HomePage           from "./pages/public/HomePage";
import GalleryPage        from "./pages/public/GalleryPage";
import ArtworkDetailPage  from "./pages/public/ArtworkDetailPage";
import AboutPage          from "./pages/public/AboutPage";
import ContactPage        from "./pages/public/ContactPage";

// ── Admin pages
import LoginPage          from "./pages/admin/LoginPage";
import DashboardPage      from "./pages/admin/DashboardPage";
import ProfilePage        from "./pages/admin/ProfilePage";
import AboutPageEditor    from "./pages/admin/AboutPageEditor";
import ArtworksPage       from "./pages/admin/ArtworksPage";
import ArtworkFormPage    from "./pages/admin/ArtworkFormPage";
import BulkArtworkUploadPage from "./pages/admin/BulkArtworkUploadPage";
import UploadHistoryPage from "./pages/admin/UploadHistoryPage";
import InquiriesPage      from "./pages/admin/InquiriesPage";
import ActivityPage       from "./pages/admin/ActivityPage";
import SecurityPage       from "./pages/admin/SecurityPage";
import SettingsPage       from "./pages/admin/SettingsPage";

const App = () => (
  <AuthProvider>
    <ScrollToTop />
    {/* Toast notifications — styled to match the gold palette */}
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: {
          background: "#1C1C1E",
          color: "#F8F5F0",
          borderRadius: "0",
          fontFamily: "Inter, sans-serif",
          fontSize: "13px",
          letterSpacing: "0.02em",
        },
        success: {
          iconTheme: { primary: "#C9A84C", secondary: "#1C1C1E" },
        },
        error: {
          iconTheme: { primary: "#ef4444", secondary: "#1C1C1E" },
        },
      }}
    />

    <Routes>
      {/* ── Public ─────────────────────────────────────────────── */}
      <Route path="/"              element={<HomePage />} />
      <Route path="/gallery"       element={<GalleryPage />} />
      <Route path="/artwork/:id"   element={<ArtworkDetailPage />} />
      <Route path="/about"         element={<AboutPage />} />
      <Route path="/contact"       element={<ContactPage />} />

      {/* ── Admin: login (public) ──────────────────────────────── */}
      <Route path="/admin/login"   element={<LoginPage />} />

      {/* ── Admin: protected ──────────────────────────────────── */}
      <Route
        path="/admin/dashboard"
        element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
      />
      <Route
        path="/admin/profile"
        element={<ProtectedRoute><ProfilePage /></ProtectedRoute>}
      />
      <Route path="/admin/about-page" element={<ProtectedRoute><AboutPageEditor /></ProtectedRoute>} />
      <Route
        path="/admin/artworks"
        element={<ProtectedRoute><ArtworksPage /></ProtectedRoute>}
      />
      <Route
        path="/admin/artworks/new"
        element={<ProtectedRoute><ArtworkFormPage /></ProtectedRoute>}
      />
      <Route
        path="/admin/artworks/bulk"
        element={<ProtectedRoute><BulkArtworkUploadPage /></ProtectedRoute>}
      />
      <Route
        path="/admin/artworks/:id/edit"
        element={<ProtectedRoute><ArtworkFormPage /></ProtectedRoute>}
      />
      <Route path="/admin/upload-history" element={<ProtectedRoute><UploadHistoryPage /></ProtectedRoute>} />
      <Route
        path="/admin/inquiries"
        element={<ProtectedRoute><InquiriesPage /></ProtectedRoute>}
      />
      <Route
        path="/admin/activity"
        element={<ProtectedRoute><ActivityPage /></ProtectedRoute>}
      />
      <Route
        path="/admin/security"
        element={<ProtectedRoute><SecurityPage /></ProtectedRoute>}
      />
      <Route
        path="/admin/settings"
        element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}
      />

      {/* ── Redirect /admin → /admin/dashboard ────────────────── */}
      <Route path="/admin"         element={<Navigate to="/admin/dashboard" replace />} />

      {/* ── 404 fallback ─────────────────────────────────────── */}
      <Route
        path="*"
        element={
          <div className="min-h-screen flex items-center justify-center bg-ivory">
            <div className="text-center">
              <p className="font-display text-8xl font-light text-charcoal/10 mb-4">404</p>
              <h1 className="font-display text-3xl font-light text-charcoal mb-4">Page Not Found</h1>
              <a href="/" className="btn-primary inline-block">Back to Home</a>
            </div>
          </div>
        }
      />
    </Routes>
  </AuthProvider>
);

export default App;
