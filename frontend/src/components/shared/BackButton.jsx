import { useNavigate } from "react-router-dom";

const BackButton = ({
  fallbackTo = "/",
  children = "Back",
  ariaLabel = "Go back",
  variant = "light",
  className = "",
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
      return;
    }

    navigate(fallbackTo);
  };

  const variantClasses =
    variant === "dark"
      ? "border-white/25 text-white hover:border-gold hover:bg-gold hover:text-white focus:ring-gold focus:ring-offset-charcoal"
      : "border-charcoal/20 text-charcoal hover:border-gold hover:bg-gold hover:text-white focus:ring-gold focus:ring-offset-white";

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={ariaLabel}
      className={`inline-flex min-h-11 items-center gap-2 border px-4 py-2 text-xs font-label font-medium tracking-widest uppercase transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 ${variantClasses} ${className}`}
      style={{ borderRadius: "var(--theme-button-radius)" }}
    >
      <span aria-hidden="true">{"\u2190"}</span>
      <span>{children}</span>
    </button>
  );
};

export default BackButton;
