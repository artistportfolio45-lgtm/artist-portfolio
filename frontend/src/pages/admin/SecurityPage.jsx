import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { securityAPI } from "../../services/api";
import toast from "react-hot-toast";

const emptySetup = {
  currentPassword: "",
  token: "",
  qrCode: "",
  manualKey: "",
  recoveryCodes: [],
};

const SecurityPage = () => {
  const [security, setSecurity] = useState(null);
  const [setup, setSetup] = useState(emptySetup);
  const [disableForm, setDisableForm] = useState({ currentPassword: "", token: "", recoveryCode: "" });
  const [regenerateForm, setRegenerateForm] = useState({ currentPassword: "", token: "" });
  const [newRecoveryCodes, setNewRecoveryCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");

  const loadStatus = async () => {
    const res = await securityAPI.status();
    setSecurity((res.data.data || res.data).security);
  };

  useEffect(() => {
    loadStatus()
      .catch(() => toast.error("Failed to load security status"))
      .finally(() => setLoading(false));
  }, []);

  const startSetup = async (e) => {
    e.preventDefault();
    setWorking("setup");

    try {
      const res = await securityAPI.startTwoFactorSetup(setup.currentPassword);
      const data = res.data.data || res.data;
      setSetup((prev) => ({
        ...prev,
        currentPassword: "",
        qrCode: data.qrCode,
        manualKey: data.manualKey,
      }));
      toast.success("Scan the QR code with your authenticator app");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to start setup");
    } finally {
      setWorking("");
    }
  };

  const verifySetup = async (e) => {
    e.preventDefault();
    setWorking("verify");

    try {
      const res = await securityAPI.verifyTwoFactorSetup(setup.token);
      const data = res.data.data || res.data;
      setSetup((prev) => ({
        ...prev,
        token: "",
        qrCode: "",
        manualKey: "",
        recoveryCodes: data.recoveryCodes || [],
      }));
      await loadStatus();
      toast.success("Two-factor authentication enabled");
    } catch (err) {
      toast.error(err.response?.data?.message || "Invalid authenticator code");
    } finally {
      setWorking("");
    }
  };

  const disableTwoFactor = async (e) => {
    e.preventDefault();
    setWorking("disable");

    try {
      await securityAPI.disableTwoFactor(disableForm);
      setDisableForm({ currentPassword: "", token: "", recoveryCode: "" });
      setSetup(emptySetup);
      setNewRecoveryCodes([]);
      await loadStatus();
      toast.success("Two-factor authentication disabled");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to disable two-factor authentication");
    } finally {
      setWorking("");
    }
  };

  const regenerateRecoveryCodes = async (e) => {
    e.preventDefault();
    setWorking("regenerate");

    try {
      const res = await securityAPI.regenerateRecoveryCodes(regenerateForm);
      const data = res.data.data || res.data;
      setNewRecoveryCodes(data.recoveryCodes || []);
      setRegenerateForm({ currentPassword: "", token: "" });
      await loadStatus();
      toast.success("Recovery codes regenerated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to regenerate recovery codes");
    } finally {
      setWorking("");
    }
  };

  const copyCodes = async (codes) => {
    await navigator.clipboard.writeText(codes.join("\n"));
    toast.success("Recovery codes copied");
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-8 flex justify-center"><LoadingSpinner size="lg" /></div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 md:p-8 max-w-4xl">
        <div className="mb-8">
          <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-1">
            Settings / Security
          </p>
          <h1 className="font-display text-3xl font-light text-charcoal">Security Center</h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-5 shadow-sm">
            <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-1">Email</p>
            <p className="text-sm text-charcoal break-all">{security?.email}</p>
            <p className="mt-1 text-xs text-slate/50">
              {security?.emailVerified ? "Verified" : "Verification required at next login"}
            </p>
          </div>
          <div className="bg-white p-5 shadow-sm">
            <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-1">Authenticator</p>
            <p className="font-display text-2xl font-light text-charcoal">
              {security?.twoFactorEnabled ? "Enabled" : "Disabled"}
            </p>
          </div>
          <div className="bg-white p-5 shadow-sm">
            <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-1">Recovery Codes</p>
            <p className="font-display text-2xl font-light text-charcoal">
              {security?.remainingRecoveryCodes ?? 0}
            </p>
          </div>
          <div className="bg-white p-5 shadow-sm">
            <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-1">Last Login</p>
            <p className="text-sm text-charcoal">
              {security?.lastLogin ? new Date(security.lastLogin).toLocaleString() : "Not recorded"}
            </p>
          </div>
        </div>

        {setup.recoveryCodes.length > 0 && (
          <div className="bg-white p-6 shadow-sm mb-6" role="status">
            <h2 className="font-display text-xl font-light mb-2">Save These Recovery Codes</h2>
            <p className="text-sm text-slate/60 mb-4">
              These codes are shown once. Store them somewhere private before leaving this page.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {setup.recoveryCodes.map((recoveryCode) => (
                <code key={recoveryCode} className="bg-gray-50 border border-gray-100 px-3 py-2 text-sm">
                  {recoveryCode}
                </code>
              ))}
            </div>
            <button type="button" onClick={() => copyCodes(setup.recoveryCodes)} className="btn-secondary text-xs">
              Copy Codes
            </button>
          </div>
        )}

        {!security?.twoFactorEnabled ? (
          <div className="bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl font-light mb-2">Enable Authenticator</h2>
            <p className="text-sm text-slate/60 mb-6">
              Confirm your password, scan the QR code, then enter the 6-digit code from your authenticator app.
            </p>

            {!setup.qrCode ? (
              <form onSubmit={startSetup} className="max-w-md space-y-4">
                <div>
                  <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={setup.currentPassword}
                    onChange={(e) => setSetup({ ...setup, currentPassword: e.target.value })}
                    className="input-field"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <button type="submit" disabled={working === "setup"} className="btn-primary">
                  {working === "setup" ? "Starting..." : "Start Setup"}
                </button>
              </form>
            ) : setup.recoveryCodes.length ? (
              <div>
                <h3 className="font-display text-lg font-light mb-2">Save These Recovery Codes</h3>
                <p className="text-sm text-slate/60 mb-4">
                  These codes are shown once. Store them somewhere private before leaving this page.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                  {setup.recoveryCodes.map((code) => (
                    <code key={code} className="bg-gray-50 border border-gray-100 px-3 py-2 text-sm">
                      {code}
                    </code>
                  ))}
                </div>
                <button type="button" onClick={() => copyCodes(setup.recoveryCodes)} className="btn-secondary text-xs">
                  Copy Codes
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-start">
                <img src={setup.qrCode} alt="Two-factor setup QR code" className="w-52 h-52 border border-gray-100" />
                <form onSubmit={verifySetup} className="space-y-4">
                  <div>
                    <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                      Manual Key
                    </label>
                    <code className="block bg-gray-50 border border-gray-100 px-3 py-2 text-sm break-all">
                      {setup.manualKey}
                    </code>
                  </div>
                  <div>
                    <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                      Authenticator Code
                    </label>
                    <input
                      type="text"
                      value={setup.token}
                      onChange={(e) => setSetup({ ...setup, token: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                      className="input-field"
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      minLength={6}
                      maxLength={6}
                      required
                    />
                  </div>
                  <button type="submit" disabled={working === "verify"} className="btn-primary">
                    {working === "verify" ? "Verifying..." : "Enable 2FA"}
                  </button>
                </form>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <form onSubmit={disableTwoFactor} className="bg-white p-6 shadow-sm space-y-4">
              <h2 className="font-display text-xl font-light">Disable Two-Factor Authentication</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="text-xs font-label tracking-widest uppercase text-slate/60">
                  Current Password
                  <input
                    type="password"
                    value={disableForm.currentPassword}
                    onChange={(e) => setDisableForm({ ...disableForm, currentPassword: e.target.value })}
                    className="input-field mt-1"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60">
                  Authenticator Code
                  <input
                    type="text"
                    value={disableForm.token}
                    onChange={(e) => setDisableForm({ ...disableForm, token: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                    className="input-field mt-1"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                  />
                </label>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60">
                  Or Recovery Code
                  <input
                    type="text"
                    value={disableForm.recoveryCode}
                    onChange={(e) => setDisableForm({ ...disableForm, recoveryCode: e.target.value })}
                    className="input-field mt-1"
                    autoComplete="off"
                  />
                </label>
              </div>
              <button type="submit" disabled={working === "disable"} className="btn-danger">
                {working === "disable" ? "Disabling..." : "Disable 2FA"}
              </button>
            </form>

            <form onSubmit={regenerateRecoveryCodes} className="bg-white p-6 shadow-sm space-y-4">
              <h2 className="font-display text-xl font-light">Regenerate Recovery Codes</h2>
              <p className="text-sm text-slate/60">
                This replaces all existing unused recovery codes.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-xs font-label tracking-widest uppercase text-slate/60">
                  Current Password
                  <input
                    type="password"
                    value={regenerateForm.currentPassword}
                    onChange={(e) => setRegenerateForm({ ...regenerateForm, currentPassword: e.target.value })}
                    className="input-field mt-1"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label className="text-xs font-label tracking-widest uppercase text-slate/60">
                  Authenticator Code
                  <input
                    type="text"
                    value={regenerateForm.token}
                    onChange={(e) => setRegenerateForm({ ...regenerateForm, token: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                    className="input-field mt-1"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                  />
                </label>
              </div>
              <button type="submit" disabled={working === "regenerate"} className="btn-secondary">
                {working === "regenerate" ? "Regenerating..." : "Regenerate Codes"}
              </button>

              {newRecoveryCodes.length > 0 && (
                <div className="pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                    {newRecoveryCodes.map((code) => (
                      <code key={code} className="bg-gray-50 border border-gray-100 px-3 py-2 text-sm">
                        {code}
                      </code>
                    ))}
                  </div>
                  <button type="button" onClick={() => copyCodes(newRecoveryCodes)} className="btn-secondary text-xs">
                    Copy Codes
                  </button>
                </div>
              )}
            </form>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default SecurityPage;
