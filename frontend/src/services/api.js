import axios from "axios";
import { inspectPublicSyncPayload } from "./publicSyncStatus";

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
    "adminLoginChallenge",
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

    if (config.method === "get" && config.url?.startsWith("/artworks")) {
      config.params = { ...(config.params || {}), _t: Date.now() };
      config.headers["Cache-Control"] = "no-cache";
      config.headers.Pragma = "no-cache";
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    inspectPublicSyncPayload(response.data);
    return response;
  },
  (error) => {
    inspectPublicSyncPayload(error.response?.data);
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
  login: (email, password) => api.post("/auth/login", { email, password }),
  verifyEmailOtp: (challengeToken, code) =>
    api.post("/auth/verify-email-otp", { challengeToken, code }),
  resendEmailOtp: (challengeToken) =>
    api.post("/auth/resend-email-otp", { challengeToken }),
  verifyTotp: (challengeToken, code) =>
    api.post("/auth/verify-totp", { challengeToken, code }),
  me: () => api.get("/auth/me"),
  changePassword: (data) => api.put("/auth/change-password", data),
};

export const securityAPI = {
  status: () => api.get("/security/status"),
  startTwoFactorSetup: (currentPassword) => api.post("/security/2fa/setup", { currentPassword }),
  verifyTwoFactorSetup: (token) => api.post("/security/2fa/enable", { token }),
  disableTwoFactor: (data) => api.post("/security/2fa/disable", data),
  regenerateRecoveryCodes: (data) => api.post("/security/recovery-codes/regenerate", data),
};

export const profileAPI = {
  get: () => api.get("/profile"),
  update: (data) => api.put("/profile", data),
  uploadPhoto: (formData) => api.put("/profile/photo", formData),
};

export const aboutAdminAPI = {
  get: () => api.get("/admin/about"),
  save: (content) => api.put("/admin/about", { content }),
  addItem: (section, item) => api.post(`/admin/about/${section}`, item),
  updateItem: (section, itemId, item) => api.put(`/admin/about/${section}/${itemId}`, item),
  deleteItem: (section, itemId) => api.delete(`/admin/about/${section}/${itemId}`),
  reorder: (section, itemIds) => api.patch(`/admin/about/${section}/reorder`, { itemIds }),
  publish: (isPublished = true) => api.patch("/admin/about/publish", { isPublished }),
  uploadMedia: (formData) => api.post("/admin/about/media", formData, { timeout: 0 }),
};

export const artworkAPI = {
  getAll: (params) => api.get("/artworks/manage", { params }),
  getCategories: () => api.get("/artworks/categories"),
  getById: (id) => api.get(`/artworks/manage/${id}`),
  create: (formData) => api.post("/artworks", formData, { timeout: 0 }),
  bulkUpload: (formData, config = {}) => api.post("/artworks/bulk", formData, { timeout: 0, ...config }),
  uploadStatus: (clientUploadId) => api.get(`/artworks/upload-status/${encodeURIComponent(clientUploadId)}`),
  uploadHistory: (params) => api.get("/artworks/upload-history", { params }),
  uploadBatches: () => api.get("/artworks/upload-history/batches"),
  updateBatchSummary: (uploadBatchId, summary) => api.put(`/artworks/upload-history/batches/${encodeURIComponent(uploadBatchId)}`, summary),
  startDeletionJob: (ids) => api.post("/artworks/deletion-jobs", { ids }),
  getDeletionJob: (jobId, config = {}) => api.get(`/artworks/deletion-jobs/${encodeURIComponent(jobId)}`, config),
  cancelDeletionJob: (jobId) => api.post(`/artworks/deletion-jobs/${encodeURIComponent(jobId)}/cancel`),
  update: (id, data) => api.put(`/artworks/${id}`, data),
  addImages: (id, formData) => api.post(`/artworks/${id}/images`, formData, { timeout: 0 }),
  deleteImage: (id, publicId) =>
    api.delete(`/artworks/${id}/images/${encodeURIComponent(publicId)}`),
  delete: (id, config = {}) => api.delete(`/artworks/${id}`, config),
  bulkDelete: (ids) => api.delete("/artworks/bulk", { data: { ids } }),
};

export const inquiryAPI = {
  create: (data) => api.post("/inquiries", data),
  submit: (data) => api.post("/inquiries", data),
  getAll: (params) => api.get("/inquiries", { params }),
  getById: (id) => api.get(`/inquiries/${id}`),
  toggleRead: (id) => api.patch(`/inquiries/${id}/read`),
  toggleResolved: (id) => api.patch(`/inquiries/${id}/resolved`),
  moveToTrash: (id) => api.patch(`/inquiries/${id}/trash`),
  restore: (id) => api.patch(`/inquiries/${id}/restore`),
  permanentDelete: (id) => api.delete(`/inquiries/${id}/permanent`, { data: { confirm: true } }),
  bulkTrash: (ids) => api.post("/inquiries/bulk/trash", { ids }),
  filteredTrash: (filters, excludedIds = []) => api.post("/inquiries/filtered/trash", { filters, excludedIds }),
  bulkRestore: (ids) => api.post("/inquiries/bulk/restore", { ids }),
  filteredRestore: (filters, excludedIds = []) => api.post("/inquiries/filtered/restore", { filters, excludedIds }),
  bulkPermanentDelete: (ids) => api.delete("/inquiries/bulk/permanent", { data: { ids, confirm: true } }),
  filteredPermanentDelete: (filters, excludedIds = []) => api.delete("/inquiries/filtered/permanent", { data: { filters, excludedIds, confirm: true } }),
  emptyTrash: (confirmation) => api.delete("/inquiries/trash/empty", { data: { confirmation } }),
  delete: (id) => api.patch(`/inquiries/${id}/trash`),
};

export const settingsAPI = {
  get: () => api.get("/settings"),
  getHome: () => api.get("/settings/home"),
  update: (data) => api.put("/settings", data),
  updateHome: (data) => api.put("/settings/home", data),
  uploadHomeBackground: (formData) => api.put("/settings/home/background", formData, { timeout: 0 }),
  uploadLogo: (formData) => api.put("/settings/logo", formData),
};

export const activityAPI = {
  getAll: (params) => api.get("/activity", { params }),
};

export const publicSnapshotAPI = {
  sync: (reason = "manual-public-data-sync") => api.post("/public-data/sync", { reason }),
  rebuildSeo: (reason = "explicit-seo-regeneration") => api.post("/public-data/rebuild-seo", { reason, confirmation: "REGENERATE_SEO" }),
};

export default api;
