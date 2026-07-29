// components/shared/AuthContext.jsx
// Global auth state — login, logout, token persistence

import { createContext, useContext, useState, useEffect } from "react";
import { authAPI, clearLegacyPersistentAuth, clearStoredAuth } from "../../services/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Verify token on mount
  useEffect(() => {
    clearLegacyPersistentAuth();

    const token = sessionStorage.getItem("token");
    if (token) {
      authAPI.me()
        .then((res) => {
          const userData = (res.data.data || res.data).user;
          if (!userData) throw new Error("Invalid session response");
          sessionStorage.setItem("user", JSON.stringify(userData));
          setUser(userData);
        })
        .catch(() => {
          clearStoredAuth();
          setUser(null);
          if (window.location.pathname.startsWith("/admin") && window.location.pathname !== "/admin/login") {
            window.location.replace("/admin/login");
          }
        })
        .finally(() => setLoading(false));
    } else {
      sessionStorage.removeItem("user");
      setLoading(false);
    }
  }, []);

  const login = async (email, password, secondFactor) => {
    const res = await authAPI.login(email, password, secondFactor);
    const authData = res.data.data || res.data;
    if (authData.requiresTwoFactor) {
      return authData;
    }

    const { token, user: userData } = authData;
    sessionStorage.setItem("token", token);
    sessionStorage.setItem("user", JSON.stringify(userData));
    clearLegacyPersistentAuth();
    setUser(userData);
    return userData;
  };

  const logout = () => {
    clearStoredAuth();
    setUser(null);
    window.history.replaceState(null, "", "/admin/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
