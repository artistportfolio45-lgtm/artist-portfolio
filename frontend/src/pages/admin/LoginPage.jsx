import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../components/shared/AuthContext";
import BackButton from "../../components/shared/BackButton";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import toast from "react-hot-toast";

const LoginPage = () => {
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [secondFactor, setSecondFactor] = useState({ code: "", useRecoveryCode: false });
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = requiresTwoFactor
        ? secondFactor.useRecoveryCode
          ? { recoveryCode: secondFactor.code }
          : { twoFactorCode: secondFactor.code }
        : undefined;

      const result = await login(form.email.trim().toLowerCase(), form.password, payload);

      if (result?.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        if (result.setupRequired) {
          setTwoFactorSetup({
            qrCode: result.qrCode,
            manualKey: result.manualKey,
          });
          toast.success("Scan the QR code, then enter the authenticator code");
        } else {
          setTwoFactorSetup(null);
          toast.success("Enter your authenticator code");
        }
        return;
      }

      toast.success("Welcome back!");
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      const message =
        err.response?.data?.message ||
        (err.request ? "Unable to reach the server" : "Invalid credentials");
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <BackButton
          fallbackTo="/"
          ariaLabel="Back to Home"
          variant="dark"
          className="mb-8"
        >
          Back to Home
        </BackButton>

        <div className="text-center mb-10">
          <h1 className="font-display text-4xl font-light text-white mb-2">
            Artist Portfolio
          </h1>
          <p className="text-white/40 text-sm font-label tracking-widest uppercase">
            Admin Dashboard
          </p>
        </div>

        <div className="bg-white p-8">
          <h2 className="font-display text-2xl font-light text-charcoal mb-6">Sign In</h2>
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                Email
              </label>
              <input
                type="email"
                name="portfolio_admin_email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-field"
                placeholder="Email address"
                required
                autoComplete="off"
                disabled={requiresTwoFactor}
              />
            </div>

            <div>
              <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                Password
              </label>
              <input
                type="password"
                name="portfolio_admin_password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input-field"
                placeholder="Enter password"
                required
                autoComplete="new-password"
                disabled={requiresTwoFactor}
              />
            </div>

            {requiresTwoFactor && (
              <div className="space-y-4">
                {twoFactorSetup?.qrCode && (
                  <div className="space-y-3">
                    <img
                      src={twoFactorSetup.qrCode}
                      alt="Google Authenticator setup QR code"
                      className="mx-auto h-48 w-48 border border-gray-100"
                    />
                    <div>
                      <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                        Manual Key
                      </label>
                      <code className="block bg-gray-50 border border-gray-100 px-3 py-2 text-sm break-all">
                        {twoFactorSetup.manualKey}
                      </code>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1">
                    {secondFactor.useRecoveryCode ? "Recovery Code" : "Authenticator Code"}
                  </label>
                  <input
                    type="text"
                    value={secondFactor.code}
                    onChange={(e) => setSecondFactor({ ...secondFactor, code: e.target.value })}
                    className="input-field"
                    placeholder={secondFactor.useRecoveryCode ? "ABCD-EFGH-IJKL-MNOP" : "123456"}
                    required
                    autoComplete="one-time-code"
                    inputMode={secondFactor.useRecoveryCode ? "text" : "numeric"}
                  />
                  {!twoFactorSetup && (
                    <button
                      type="button"
                      onClick={() =>
                        setSecondFactor((prev) => ({
                          ...prev,
                          code: "",
                          useRecoveryCode: !prev.useRecoveryCode,
                        }))
                      }
                      className="text-xs text-slate/50 hover:text-charcoal mt-2"
                    >
                      {secondFactor.useRecoveryCode ? "Use authenticator code instead" : "Use a recovery code instead"}
                    </button>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" light />
                  Signing in...
                </>
              ) : requiresTwoFactor ? (
                "Verify & Sign In"
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {requiresTwoFactor ? (
            <button
              type="button"
              onClick={() => {
                setRequiresTwoFactor(false);
                setTwoFactorSetup(null);
                setSecondFactor({ code: "", useRecoveryCode: false });
              }}
              className="mt-6 text-xs text-center text-slate/40 hover:text-charcoal w-full"
            >
              Use a different email or password
            </button>
          ) : (
            <p className="mt-6 text-xs text-center text-slate/40">
              First-time admin access is configured from the backend environment.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
