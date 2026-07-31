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

  const storeAuthenticatedSession = (authData) => {
    const { token, user: userData } = authData;
    sessionStorage.setItem("token", token);
    sessionStorage.setItem("user", JSON.stringify(userData));
    sessionStorage.removeItem("adminLoginChallenge");
    clearLegacyPersistentAuth();
    setUser(userData);
    return userData;
  };

  const login = async (email, password) => {
    const res = await authAPI.login(email, password);
    const authData = res.data.data || res.data;
    return authData;
  };

  const verifyEmailOtp = async (challengeToken, code) => {
    const res = await authAPI.verifyEmailOtp(challengeToken, code);
    return storeAuthenticatedSession(res.data.data || res.data);
  };

  const resendEmailOtp = async (challengeToken) => {
    const res = await authAPI.resendEmailOtp(challengeToken);
    return res.data.data || res.data;
  };

  const verifyTotp = async (challengeToken, code) => {
    const res = await authAPI.verifyTotp(challengeToken, code);
    return res.data.data || res.data;
  };

  const logout = () => {
    clearStoredAuth();
    setUser(null);
    window.history.replaceState(null, "", "/admin/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        verifyEmailOtp,
        resendEmailOtp,
        verifyTotp,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
