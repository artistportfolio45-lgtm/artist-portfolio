import { useSettings } from "../../hooks/useSettings";

const icons = {
  instagram: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" className="h-full w-full">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.4" cy="6.7" r="1" fill="currentColor" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className="h-full w-full">
      <path d="M13.6 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H7.4V13h2.8v8h3.4Z" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" className="h-full w-full">
      <path d="M21 8.2a2.8 2.8 0 0 0-2-2C17.2 5.7 12 5.7 12 5.7s-5.2 0-7 .5a2.8 2.8 0 0 0-2 2A20 20 0 0 0 2.5 12 20 20 0 0 0 3 15.8a2.8 2.8 0 0 0 2 2c1.8.5 7 .5 7 .5s5.2 0 7-.5a2.8 2.8 0 0 0 2-2 20 20 0 0 0 .5-3.8 20 20 0 0 0-.5-3.8Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10 14.8 5-2.8-5-2.8v5.6Z" fill="currentColor" />
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" className="h-full w-full">
      <path d="M20.5 11.8a8.4 8.4 0 0 1-12.4 7.4L3 20.6l1.4-5A8.4 8.4 0 1 1 20.5 11.8Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.4 7.6c.2-.3.4-.3.7-.3h.5c.2 0 .3.1.4.4l.8 1.9c.1.3 0 .5-.2.7l-.6.7c-.2.2-.1.4 0 .6.7 1.2 1.7 2.1 2.9 2.7.2.1.4.1.6-.1l.8-1c.2-.2.4-.3.7-.2l1.9.9c.3.1.4.3.4.5 0 .3-.2 1.5-1.1 2.1-.6.4-1.4.7-2.4.4-1.1-.3-2.5-.9-4.2-2.4-1.4-1.3-2.4-2.9-2.7-4-.4-1.1 0-2.2.4-2.7l.2-.2Z" fill="currentColor" />
    </svg>
  ),
};

const PublicSocialLinks = ({ tone = "light", compact = false }) => {
  const { settings } = useSettings();
  const links = [
    { key: "instagram", label: "Instagram", href: settings?.instagram },
    { key: "facebook", label: "Facebook", href: settings?.facebook },
    { key: "youtube", label: "YouTube", href: settings?.youtube },
    {
      key: "whatsapp",
      label: "WhatsApp",
      href: settings?.whatsapp
        ? `https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`
        : "",
    },
  ].filter((item) => item.href);

  if (!links.length) return null;

  const toneClasses =
    tone === "dark"
      ? "border-white/15 text-white/55 hover:border-gold/60 hover:text-white"
      : "border-charcoal/15 text-slate/55 hover:border-gold/70 hover:text-charcoal";

  return (
    <div className="flex flex-wrap gap-2" aria-label="Social media">
      {links.map((item) => (
        <a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={item.label}
          title={item.label}
          className={`inline-flex items-center justify-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
            compact ? "h-9 w-9" : "h-10 w-10"
          } ${toneClasses}`}
        >
          <span className="h-[18px] w-[18px]">{icons[item.key]}</span>
        </a>
      ))}
    </div>
  );
};

export default PublicSocialLinks;
