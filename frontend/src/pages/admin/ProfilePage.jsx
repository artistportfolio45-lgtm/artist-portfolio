// pages/admin/ProfilePage.jsx
// Edit artist profile — text fields + photo upload + password change

import { useState, useEffect } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { profileAPI, authAPI } from "../../services/api";
import LoadingSpinner, { PageLoader } from "../../components/shared/LoadingSpinner";
import toast from "react-hot-toast";

const ProfilePage = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    profileAPI.get()
      .then((res) => setProfile(res.data.profile))
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await profileAPI.update(profile);
      setProfile(res.data.profile);
      toast.success("Profile saved");
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await profileAPI.uploadPhoto(formData);
      setProfile(res.data.profile);
      toast.success("Photo updated");
    } catch {
      toast.error("Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setSavingPw(true);
    try {
      await authAPI.changePassword({
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      toast.success("Password changed");
      setPwForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to change password");
    } finally {
      setSavingPw(false);
    }
  };

  if (loading) return <AdminLayout><div className="p-8 flex justify-center"><LoadingSpinner size="lg" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="p-6 md:p-8 max-w-3xl">
        <div className="mb-8">
          <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-1">Admin</p>
          <h1 className="font-display text-3xl font-light text-charcoal">Profile</h1>
        </div>

        {/* ── Photo Upload ─────────────────────────────── */}
        <div className="bg-white p-6 shadow-sm mb-6">
          <h2 className="font-display text-xl font-light mb-4">Profile Photo</h2>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 bg-gray-100 overflow-hidden flex-shrink-0">
              {profile?.profilePhoto ? (
                <img src={profile.profilePhoto} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 text-3xl">👤</div>
              )}
            </div>
            <div>
              <label className="cursor-pointer btn-secondary text-xs inline-block">
                {uploadingPhoto ? "Uploading…" : "Upload Photo"}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
              <p className="text-xs text-slate/50 mt-2">JPG, PNG, WebP. Square recommended.</p>
            </div>
          </div>
        </div>

        {/* ── Profile Form ──────────────────────────────── */}
        <form onSubmit={handleSave} className="bg-white p-6 shadow-sm mb-6">
          <h2 className="font-display text-xl font-light mb-4">Artist Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: "name", label: "Artist Name", type: "text" },
              { key: "email", label: "Email", type: "email" },
              { key: "phone", label: "Phone", type: "tel" },
              { key: "whatsapp", label: "WhatsApp Number", type: "text" },
              { key: "instagram", label: "Instagram URL", type: "url" },
              { key: "facebook", label: "Facebook URL", type: "url" },
              { key: "youtube", label: "YouTube URL", type: "url" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">{label}</label>
                <input
                  type={type}
                  value={profile?.[key] || ""}
                  onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                  className="input-field"
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">Address</label>
              <input
                type="text"
                value={profile?.address || ""}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
          <div className="mt-6">
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <><LoadingSpinner size="sm" light />Saving…</> : "Save Profile"}
            </button>
          </div>
        </form>

        {/* ── Change Password ───────────────────────────── */}
        <form onSubmit={handlePasswordChange} className="bg-white p-6 shadow-sm">
          <h2 className="font-display text-xl font-light mb-4">Change Password</h2>
          <div className="space-y-4 max-w-sm">
            {[
              { key: "currentPassword", label: "Current Password" },
              { key: "newPassword", label: "New Password" },
              { key: "confirm", label: "Confirm New Password" },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">{label}</label>
                <input
                  type="password"
                  value={pwForm[key]}
                  onChange={(e) => setPwForm({ ...pwForm, [key]: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
            ))}
            <button type="submit" disabled={savingPw} className="btn-primary flex items-center gap-2">
              {savingPw ? <><LoadingSpinner size="sm" light />Updating…</> : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
};

export default ProfilePage;
