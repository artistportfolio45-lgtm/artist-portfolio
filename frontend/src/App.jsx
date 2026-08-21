// src/App.jsx
// Root component — all routes defined here

import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./components/shared/AuthContext";
import ProtectedRoute from "./components/shared/ProtectedRoute";
import ScrollToTop from "./components/shared/ScrollToTop";

// ── Public pages
import HomePage           from "./pages/public/HomePage";
import GalleryPage        from "./pages/public/GalleryPage";
const ArtworkDetailPage = lazy(() => import("./pages/public/ArtworkDetailPage"));
const AboutPage = lazy(() => import("./pages/public/AboutPage"));
const ContactPage = lazy(() => import("./pages/public/ContactPage"));

// ── Admin pages
const LoginPage = lazy(() => import("./pages/admin/LoginPage"));
const DashboardPage = lazy(() => import("./pages/admin/DashboardPage"));
const ProfilePage = lazy(() => import("./pages/admin/ProfilePage"));
const HomePageEditor = lazy(() => import("./pages/admin/HomePageEditor"));
const AboutPageEditor = lazy(() => import("./pages/admin/AboutPageEditor"));
const ArtworksPage = lazy(() => import("./pages/admin/ArtworksPage"));
const ArtworkFormPage = lazy(() => import("./pages/admin/ArtworkFormPage"));
const BulkArtworkUploadPage = lazy(() => import("./pages/admin/BulkArtworkUploadPage"));
const UploadHistoryPage = lazy(() => import("./pages/admin/UploadHistoryPage"));
const InquiriesPage = lazy(() => import("./pages/admin/InquiriesPage"));
const ActivityPage = lazy(() => import("./pages/admin/ActivityPage"));
const SecurityPage = lazy(() => import("./pages/admin/SecurityPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));

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

    <Suspense fallback={<div className="min-h-screen bg-ivory flex items-center justify-center" role="status">Loading page…</div>}>
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
      <Route path="/admin/home-page" element={<ProtectedRoute><HomePageEditor /></ProtectedRoute>} />
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
    </Suspense>
  </AuthProvider>
);

export default App;
