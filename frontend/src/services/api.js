import axios from "axios";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/+$/, "");

export const clearStoredAuth = () => {
  [
    "token",
    "refreshToken",
    "user",
    "admin",
    "totpVerified",
    "twoFactorVerified",
    "requiresTwoFactor",
    "session",
    "auth",
  ].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
};

export const clearLegacyPersistentAuth = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
};

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 60000,
});

api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes("/auth/login");
    const isOnLoginPage = window.location.pathname === "/admin/login";

    if (error.response?.status === 401 && !isLoginRequest && !isOnLoginPage) {
      clearStoredAuth();

      if (window.location.pathname.startsWith("/admin")) {
        window.location.replace("/admin/login");
      }
    }

    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (email, password, secondFactor = {}) => api.post("/auth/login", { email, password, ...secondFactor }),
  me: () => api.get("/auth/me"),
  changePassword: (data) => api.put("/auth/change-password", data),
};

export const securityAPI = {
  status: () => api.get("/security/status"),
  startTwoFactorSetup: (currentPassword) => api.post("/security/2fa/setup", { currentPassword }),
  verifyTwoFactorSetup: (token) => api.post("/security/2fa/verify", { token }),
  disableTwoFactor: (data) => api.post("/security/2fa/disable", data),
  regenerateRecoveryCodes: (data) => api.post("/security/recovery-codes/regenerate", data),
};

export const profileAPI = {
  get: () => api.get("/profile"),
  update: (data) => api.put("/profile", data),
  uploadPhoto: (formData) => api.put("/profile/photo", formData),
};

export const artworkAPI = {
  getAll: (params) => api.get("/artworks", { params }),
  getCategories: () => api.get("/artworks/categories"),
  getById: (id) => api.get(`/artworks/${id}`),
  create: (formData) => api.post("/artworks", formData),
  update: (id, data) => api.put(`/artworks/${id}`, data),
  addImages: (id, formData) => api.post(`/artworks/${id}/images`, formData),
  deleteImage: (id, publicId) =>
    api.delete(`/artworks/${id}/images/${encodeURIComponent(publicId)}`),
  delete: (id) => api.delete(`/artworks/${id}`),
};

export const inquiryAPI = {
  create: (data) => api.post("/inquiries", data),
  submit: (data) => api.post("/inquiries", data),
  getAll: (params) => api.get("/inquiries", { params }),
  getById: (id) => api.get(`/inquiries/${id}`),
  toggleRead: (id) => api.patch(`/inquiries/${id}/read`),
  delete: (id) => api.delete(`/inquiries/${id}`),
};

export const settingsAPI = {
  get: () => api.get("/settings"),
  update: (data) => api.put("/settings", data),
  uploadLogo: (formData) => api.put("/settings/logo", formData),
};

export const activityAPI = {
  getAll: (params) => api.get("/activity", { params }),
};

export const publicSnapshotAPI = {
  rebuild: (reason = "manual-public-data-rebuild") => api.post("/public-data/rebuild", { reason }),
};

export default api;
