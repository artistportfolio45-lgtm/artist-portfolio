// pages/admin/InquiriesPage.jsx
// Email-style inbox for visitor inquiries.

import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { inquiryAPI } from "../../services/api";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import toast from "react-hot-toast";

const formatDate = (iso, options = {}) => {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(new Date(iso));
};

const getSubject = (inquiry) => inquiry?.subject?.trim() || "General Enquiry";

const getInitials = (name = "") => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "IN";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
};

const getPreview = (message = "") => message.replace(/\s+/g, " ").trim();

const getArtworkImage = (inquiry) => {
  const artwork = inquiry?.artworkInterested || inquiry?.artwork;
  if (!artwork || typeof artwork !== "object") return "";
  return artwork.images?.[0]?.url || "";
};

const getArtworkId = (inquiry) => {
  const artwork = inquiry?.artworkInterested || inquiry?.artwork;
  if (!artwork) return "";
  return typeof artwork === "object" ? artwork._id : artwork;
};

const getReplySubject = (inquiry) => {
  const subject = getSubject(inquiry);
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
};

const mergeInquiry = (current, updated) => ({
  ...current,
  ...updated,
  artworkInterested: updated.artworkInterested || current.artworkInterested,
  artwork: updated.artwork || current.artwork,
});

const IconButton = ({ children, className = "", ...props }) => (
  <button
    type="button"
    className={`border border-gray-200 px-3 py-2 text-xs font-label uppercase tracking-widest text-slate/60 transition-colors hover:border-charcoal hover:bg-charcoal hover:text-white disabled:cursor-not-allowed disabled:opacity-30 ${className}`}
    {...props}
  >
    {children}
  </button>
);

const StatusBadge = ({ children, tone = "neutral" }) => (
  <span
    className={`inline-flex items-center border px-2.5 py-1 text-[10px] font-label uppercase tracking-widest ${
      tone === "gold"
        ? "border-gold/30 bg-gold/10 text-gold"
        : tone === "green"
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-gray-200 bg-gray-50 text-slate/55"
    }`}
  >
    {children}
  </span>
);

const InquiryListItem = ({ inquiry, selected, onOpen }) => {
  const subject = getSubject(inquiry);
  const preview = getPreview(inquiry.message);

  return (
    <button
      type="button"
      onClick={() => onOpen(inquiry)}
      className={`grid w-full grid-cols-[auto_1fr] gap-3 border-b border-gray-100 px-4 py-4 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset ${
        selected ? "bg-gold/10" : !inquiry.isRead ? "bg-white" : "bg-white"
      }`}
    >
      <div className="relative">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-charcoal text-xs font-label uppercase tracking-widest text-white">
          {getInitials(inquiry.name)}
        </div>
        {!inquiry.isRead && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-white" />
        )}
      </div>

      <div className="min-w-0">
        <div className="mb-1 flex items-start justify-between gap-3">
          <p className={`truncate text-sm ${inquiry.isRead ? "text-slate" : "font-medium text-charcoal"}`}>
            {inquiry.name}
          </p>
          <p className="shrink-0 text-[11px] text-slate/40">
            {formatDate(inquiry.createdAt, { year: undefined })}
          </p>
        </div>
        <p className={`truncate text-sm ${inquiry.isRead ? "text-slate/65" : "font-medium text-charcoal"}`}>
          {subject}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate/50">{preview}</p>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge tone={inquiry.artworkTitle ? "gold" : "neutral"}>
            {inquiry.artworkTitle ? "Artwork" : "General"}
          </StatusBadge>
          {inquiry.artworkTitle && (
            <span className="truncate text-[11px] text-slate/45">{inquiry.artworkTitle}</span>
          )}
        </div>
      </div>
    </button>
  );
};

const EmptyReader = () => (
  <div className="flex min-h-[520px] items-center justify-center bg-white px-8 text-center">
    <div>
      <p className="font-display text-3xl font-light text-charcoal">Select an inquiry</p>
      <p className="mt-3 max-w-sm text-sm leading-6 text-slate/50">
        Choose a message from the inbox to read details, reply, or manage its status.
      </p>
    </div>
  </div>
);

const InquiryReader = ({
  inquiry,
  inquiries,
  onClose,
  onBack,
  onToggleRead,
  onDelete,
  onNavigate,
  mobile = false,
}) => {
  if (!inquiry) return <EmptyReader />;

  const currentIndex = inquiries.findIndex((item) => item._id === inquiry._id);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < inquiries.length - 1;
  const subject = getSubject(inquiry);
  const artworkImage = getArtworkImage(inquiry);
  const artworkId = getArtworkId(inquiry);
  const mailto = `mailto:${inquiry.email}?subject=${encodeURIComponent(getReplySubject(inquiry))}`;

  return (
    <article className="flex min-h-full flex-col bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {mobile && (
            <IconButton onClick={onBack} className="lg:hidden">
              Back
            </IconButton>
          )}
          <IconButton onClick={() => onToggleRead(inquiry)}>
            {inquiry.isRead ? "Mark unread" : "Mark read"}
          </IconButton>
          <IconButton onClick={() => onDelete(inquiry._id)} className="text-red-500 hover:border-red-600 hover:bg-red-600 hover:text-white">
            Delete
          </IconButton>
        </div>

        <div className="flex items-center gap-2">
          <IconButton onClick={() => onNavigate(-1)} disabled={!hasPrevious}>
            Previous
          </IconButton>
          <IconButton onClick={() => onNavigate(1)} disabled={!hasNext}>
            Next
          </IconButton>
          {!mobile && (
            <IconButton onClick={onClose}>
              Close
            </IconButton>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 px-5 py-6 md:px-8 lg:px-10">
        <header className="border-b border-gray-100 pb-6">
          <div className="mb-4 flex flex-wrap gap-2">
            <StatusBadge tone={inquiry.isRead ? "neutral" : "green"}>
              {inquiry.isRead ? "Read" : "Unread"}
            </StatusBadge>
            <StatusBadge tone={inquiry.artworkTitle ? "gold" : "neutral"}>
              {inquiry.artworkTitle ? "Artwork" : "General"}
            </StatusBadge>
          </div>

          <h2 className="font-display text-3xl font-light leading-tight text-charcoal md:text-4xl">
            {subject}
          </h2>

          <div className="mt-5 grid gap-2 text-sm text-slate/60 sm:grid-cols-2">
            <p>
              <span className="text-slate/40">From </span>
              <span className="text-charcoal">{inquiry.name}</span>
            </p>
            <p className="sm:text-right">
              <span className="text-slate/40">Received </span>
              <span className="text-charcoal">{formatDate(inquiry.createdAt)}</span>
            </p>
            <p className="break-all">
              <span className="text-slate/40">Email </span>
              <a href={`mailto:${inquiry.email}`} className="text-gold hover:underline">
                {inquiry.email}
              </a>
            </p>
            {inquiry.phone && (
              <p className="sm:text-right">
                <span className="text-slate/40">Phone </span>
                <a href={`tel:${inquiry.phone}`} className="text-charcoal hover:text-gold">
                  {inquiry.phone}
                </a>
              </p>
            )}
          </div>
        </header>

        <section className="flex flex-col gap-4 border-b border-gray-100 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-charcoal text-sm font-label uppercase tracking-widest text-white">
              {getInitials(inquiry.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-charcoal">{inquiry.name}</p>
              <p className="truncate text-sm text-slate/55">{inquiry.email}</p>
              <p className="mt-0.5 text-xs text-slate/40">to Artist Portfolio</p>
            </div>
          </div>
          <a href={mailto} className="btn-secondary shrink-0 text-center">
            Reply
          </a>
        </section>

        {inquiry.artworkTitle && (
          <section className="border-b border-gray-100 py-6">
            <p className="mb-3 text-xs font-label uppercase tracking-widest text-slate/40">Interested in</p>
            <div className="flex flex-col gap-4 border border-gray-100 p-4 sm:flex-row sm:items-center">
              {artworkImage ? (
                <img
                  src={artworkImage}
                  alt={inquiry.artworkTitle}
                  className="h-24 w-24 shrink-0 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 shrink-0 items-center justify-center bg-gray-50 text-xs text-slate/35">
                  No image
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-display text-2xl font-light text-charcoal">{inquiry.artworkTitle}</p>
                {artworkId && (
                  <a
                    href={`/artwork/${artworkId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm text-gold hover:underline"
                  >
                    Open artwork
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        <section className="py-8">
          <div className="max-w-4xl whitespace-pre-wrap break-words text-[15px] leading-8 text-charcoal md:text-base">
            {inquiry.message}
          </div>
        </section>

        <section className="mt-4 border-t border-gray-100 py-6">
          <div className="flex flex-col gap-4 border border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-xl font-light text-charcoal">Reply to this inquiry</p>
              <p className="mt-1 text-sm text-slate/50">
                Open your email client with the recipient and subject already filled in.
              </p>
            </div>
            <a href={mailto} className="btn-primary shrink-0 text-center">
              Reply by Email
            </a>
          </div>
        </section>
      </div>
    </article>
  );
};

const InquiriesPage = () => {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchInquiries = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (search) params.search = search;
      if (filter === "unread") params.isRead = "false";
      if (filter === "read") params.isRead = "true";

      const res = await inquiryAPI.getAll(params);
      const items = res.data.inquiries || [];
      setInquiries(items);
      setUnreadCount(res.data.unreadCount || 0);
      setSelected((current) => {
        if (!current) return null;
        return items.find((item) => item._id === current._id) || null;
      });
    } catch {
      toast.error("Failed to load inquiries");
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  const updateInquiry = (updated) => {
    setInquiries((prev) => prev.map((item) => (item._id === updated._id ? mergeInquiry(item, updated) : item)));
    setSelected((current) => (current?._id === updated._id ? mergeInquiry(current, updated) : current));
  };

  const openDetail = async (inquiry) => {
    setSelected(inquiry);

    if (!inquiry.isRead) {
      try {
        const res = await inquiryAPI.toggleRead(inquiry._id);
        const updated = res.data.inquiry;
        updateInquiry(updated);
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        toast.error("Failed to mark inquiry as read");
      }
    }
  };

  const handleToggleRead = async (inquiry) => {
    try {
      const res = await inquiryAPI.toggleRead(inquiry._id);
      const updated = res.data.inquiry;
      updateInquiry(updated);
      setUnreadCount((count) => (updated.isRead ? Math.max(0, count - 1) : count + 1));
    } catch {
      toast.error("Failed to update inquiry");
    }
  };

  const selectRelative = useCallback((direction) => {
    if (!selected || inquiries.length === 0) return;
    const currentIndex = inquiries.findIndex((item) => item._id === selected._id);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= inquiries.length) return;
    openDetail(inquiries[nextIndex]);
  }, [inquiries, selected]);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this inquiry? This cannot be undone.")) return;

    const currentIndex = inquiries.findIndex((item) => item._id === id);
    try {
      await inquiryAPI.delete(id);
      const remaining = inquiries.filter((item) => item._id !== id);
      const nextSelection = remaining[currentIndex] || remaining[currentIndex - 1] || null;
      setInquiries(remaining);
      setSelected(nextSelection);
      setUnreadCount((count) => {
        const deleted = inquiries.find((item) => item._id === id);
        return deleted && !deleted.isRead ? Math.max(0, count - 1) : count;
      });
      if (nextSelection) openDetail(nextSelection);
      toast.success("Inquiry deleted");
    } catch {
      toast.error("Failed to delete inquiry");
    }
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tagName)) return;

      if (event.key === "Escape" && selected) {
        setSelected(null);
      }

      if (event.key === "ArrowUp" && selected) {
        event.preventDefault();
        selectRelative(-1);
      }

      if (event.key === "ArrowDown" && selected) {
        event.preventDefault();
        selectRelative(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectRelative, selected]);

  const closeReader = () => setSelected(null);

  return (
    <AdminLayout>
      <div className="min-h-full bg-gray-50 p-4 md:p-6 lg:p-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-label uppercase tracking-widest text-slate/50">Manage</p>
            <h1 className="flex items-center gap-3 font-display text-3xl font-light text-charcoal">
              Inquiries
              {unreadCount > 0 && (
                <span className="bg-gold px-2 py-0.5 text-xs font-label text-white">
                  {unreadCount} new
                </span>
              )}
            </h1>
          </div>
        </div>

        <div className="grid min-h-[calc(100vh-13rem)] overflow-hidden border border-gray-100 bg-white lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
          <aside className={`${selected ? "hidden lg:flex" : "flex"} min-h-[calc(100vh-13rem)] flex-col border-r border-gray-100 bg-white`}>
            <div className="border-b border-gray-100 p-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by name, email, artwork..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="input-field pl-9"
                />
                <svg
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              <div className="mt-3 flex gap-1 border border-gray-200 p-0.5">
                {[
                  { key: "all", label: "All" },
                  { key: "unread", label: "Unread" },
                  { key: "read", label: "Read" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`flex-1 px-3 py-1.5 text-xs font-label uppercase tracking-widest transition-colors ${
                      filter === key ? "bg-charcoal text-white" : "text-slate/60 hover:text-charcoal"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex min-h-[360px] items-center justify-center">
                  <LoadingSpinner size="lg" />
                </div>
              ) : inquiries.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="font-display text-2xl font-light text-charcoal">
                    {filter === "unread" ? "No unread inquiries" : "No inquiries yet"}
                  </p>
                  <p className="mt-2 text-sm text-slate/50">
                    {filter !== "all" ? "Try switching to All." : "Visitor inquiries will appear here."}
                  </p>
                </div>
              ) : (
                <div>
                  {inquiries.map((inquiry) => (
                    <InquiryListItem
                      key={inquiry._id}
                      inquiry={inquiry}
                      selected={selected?._id === inquiry._id}
                      onOpen={openDetail}
                    />
                  ))}
                </div>
              )}
            </div>
          </aside>

          <main className="hidden min-w-0 overflow-y-auto bg-white lg:block">
            {selected ? (
              <InquiryReader
                inquiry={selected}
                inquiries={inquiries}
                onClose={closeReader}
                onToggleRead={handleToggleRead}
                onDelete={handleDelete}
                onNavigate={selectRelative}
              />
            ) : (
              <EmptyReader />
            )}
          </main>
        </div>

        {selected && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-white lg:hidden">
            <InquiryReader
              inquiry={selected}
              inquiries={inquiries}
              onBack={closeReader}
              onClose={closeReader}
              onToggleRead={handleToggleRead}
              onDelete={handleDelete}
              onNavigate={selectRelative}
              mobile
            />
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default InquiriesPage;
