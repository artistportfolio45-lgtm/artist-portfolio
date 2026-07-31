import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../components/shared/AuthContext";
import BackButton from "../../components/shared/BackButton";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import toast from "react-hot-toast";

const CHALLENGE_STORAGE_KEY = "adminLoginChallenge";

const readStoredChallenge = () => {
  try {
    const value = JSON.parse(sessionStorage.getItem(CHALLENGE_STORAGE_KEY));
    if (
      value?.challengeToken &&
      ["email_otp", "totp"].includes(value.nextStep) &&
      value.expiresAt > Date.now()
    ) {
      return value;
    }
  } catch {
    // Invalid or stale verification state is discarded below.
  }
  sessionStorage.removeItem(CHALLENGE_STORAGE_KEY);
  return null;
};

const LoginPage = () => {
  const {
    login,
    verifyEmailOtp,
    resendEmailOtp,
    verifyTotp,
    isAuthenticated,
    loading: authLoading,
  } = useAuth();
  const navigate = useNavigate();
  const codeInputRef = useRef(null);
  const [form, setForm] = useState({ email: "", password: "" });
  const [challenge, setChallenge] = useState(readStoredChallenge);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const saveChallenge = (data) => {
    const next = {
      challengeToken: data.challengeToken,
      nextStep: data.nextStep,
      maskedEmail: data.maskedEmail || "",
      resendAt:
        data.nextStep === "email_otp"
          ? Date.now() + Number(data.resendAfterSeconds || 60) * 1000
          : 0,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    sessionStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(next));
    setChallenge(next);
    setCode("");
    setError("");
  };

  const resetChallenge = () => {
    sessionStorage.removeItem(CHALLENGE_STORAGE_KEY);
    setChallenge(null);
    setCode("");
    setError("");
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!challenge) return undefined;
    codeInputRef.current?.focus();

    const updateCountdown = () => {
      setCountdown(Math.max(0, Math.ceil((challenge.resendAt - Date.now()) / 1000)));
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [challenge]);

  const getErrorMessage = (err, fallback) =>
    err.response?.data?.message ||
    (err.request ? "Unable to reach the server. Please try again." : fallback);

  const handleCredentials = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await login(form.email.trim().toLowerCase(), form.password);
      saveChallenge(result);
      toast.success(
        result.nextStep === "totp"
          ? "Enter your Authenticator code"
          : "Verification code sent"
      );
    } catch (err) {
      const message = getErrorMessage(err, "Unable to sign in.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerification = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (challenge.nextStep === "totp") {
        const result = await verifyTotp(challenge.challengeToken, code);
        saveChallenge(result);
        toast.success("Email verification code sent");
        return;
      }

      await verifyEmailOtp(challenge.challengeToken, code);
      toast.success("Welcome back!");
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      const message = getErrorMessage(err, "Verification failed.");
      setError(message);
      toast.error(message);
      if (/challenge|expired|too many attempts|sign in again/i.test(message)) {
        sessionStorage.removeItem(CHALLENGE_STORAGE_KEY);
        setChallenge(null);
        setCode("");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || loading) return;
    setLoading(true);
    setError("");

    try {
      const result = await resendEmailOtp(challenge.challengeToken);
      saveChallenge(result);
      toast.success("A new verification code was sent");
    } catch (err) {
      const message = getErrorMessage(err, "Unable to resend the code.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const verificationHeading =
    challenge?.nextStep === "totp"
      ? "Authenticator Verification"
      : "Email Verification";

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
          <h2 className="font-display text-2xl font-light text-charcoal mb-2">
            {challenge ? verificationHeading : "Sign In"}
          </h2>

          {challenge && (
            <p className="text-sm text-slate/60 mb-6">
              {challenge.nextStep === "totp"
                ? "Enter the current 6-digit code from your Authenticator app."
                : `Enter the 6-digit code sent to ${challenge.maskedEmail}.`}
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {!challenge ? (
            <form onSubmit={handleCredentials} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-email"
                  className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1"
                >
                  Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  className="input-field"
                  placeholder="Email address"
                  required
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="admin-password"
                  className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1"
                >
                  Password
                </label>
                <input
                  id="admin-password"
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  className="input-field"
                  placeholder="Enter password"
                  required
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 mt-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <LoadingSpinner size="sm" light />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerification} className="space-y-4">
              <div>
                <label
                  htmlFor="verification-code"
                  className="text-xs font-label tracking-widest uppercase text-slate/60 block mb-1"
                >
                  {challenge.nextStep === "totp"
                    ? "Authenticator Code"
                    : "Verification Code"}
                </label>
                <input
                  ref={codeInputRef}
                  id="verification-code"
                  type="text"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="input-field text-center text-xl tracking-[0.4em]"
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                aria-busy={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <LoadingSpinner size="sm" light />
                    Verifying...
                  </>
                ) : challenge.nextStep === "totp" ? (
                  "Verify Authenticator"
                ) : (
                  "Verify & Sign In"
                )}
              </button>

              {challenge.nextStep === "email_otp" && (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading || countdown > 0}
                  className="w-full text-xs text-slate/50 hover:text-charcoal disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {countdown > 0 ? `Resend code in ${countdown}s` : "Resend code"}
                </button>
              )}
            </form>
          )}

          {challenge ? (
            <button
              type="button"
              onClick={resetChallenge}
              className="mt-6 text-xs text-center text-slate/40 hover:text-charcoal w-full"
            >
              Back to login
            </button>
          ) : (
            <p className="mt-6 text-xs text-center text-slate/40">
              Access is restricted to the registered administrator.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
