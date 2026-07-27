// components/shared/AuthContext.jsx
// Global auth state — login, logout, token persistence

import { createContext, useContext, useState, useEffect } from "react";
import { authAPI, clearStoredAuth } from "../../services/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Verify token on mount
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      authAPI.me()
        .then((res) => {
          const userData = (res.data.data || res.data).user;
          if (!userData) throw new Error("Invalid session response");
          localStorage.setItem("user", JSON.stringify(userData));
          setUser(userData);
        })
        .catch(() => {
          clearStoredAuth();
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
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
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));
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
