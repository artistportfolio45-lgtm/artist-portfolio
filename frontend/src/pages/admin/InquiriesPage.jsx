import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { inquiryAPI } from "../../services/api";
import {
  emptyInquirySelection,
  deselectInquiryPage,
  inquiryIsSelected,
  inquirySelectionCount,
  inquirySelectionRequest,
  selectAllFilteredInquiries,
  selectInquiryPage,
  toggleInquirySelection,
} from "../../utils/inquirySelection";
import toast from "react-hot-toast";

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { inquiryType: "all", isRead: "all", isResolved: "all", dateFrom: "", dateTo: "", view: "inbox" };

const formatDate = (iso, options = {}) => !iso ? "" : new Intl.DateTimeFormat("en-IN", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", ...options,
}).format(new Date(iso));
const subjectOf = (inquiry) => inquiry?.subject?.trim() || "General Enquiry";
const inquiryKind = (inquiry) => inquiry?.inquiryType === "artwork" || inquiry?.artworkTitle ? "Artwork" : "General contact";
const artworkOf = (inquiry) => inquiry?.artworkInterested || inquiry?.artwork;
const artworkIdOf = (inquiry) => typeof artworkOf(inquiry) === "object" ? artworkOf(inquiry)?._id : artworkOf(inquiry);
const artworkImageOf = (inquiry) => typeof artworkOf(inquiry) === "object" ? artworkOf(inquiry)?.images?.[0]?.url : "";

const Button = forwardRef(({ children, className = "", ...props }, ref) => (
  <button ref={ref} type="button" className={`min-h-10 border border-gray-200 px-3 py-2 text-[10px] font-label uppercase tracking-widest transition-colors hover:border-charcoal hover:bg-charcoal hover:text-white disabled:cursor-not-allowed disabled:opacity-40 ${className}`} {...props}>
    {children}
  </button>
));
Button.displayName = "Button";

const Badge = ({ children, tone = "neutral" }) => (
  <span className={`inline-flex border px-2 py-1 text-[9px] font-label uppercase tracking-widest ${
    tone === "gold" ? "border-gold/30 bg-gold/10 text-gold" :
      tone === "green" ? "border-green-200 bg-green-50 text-green-700" :
        tone === "red" ? "border-red-200 bg-red-50 text-red-700" : "border-gray-200 bg-gray-50 text-slate/60"
  }`}>{children}</span>
);

const ConfirmationModal = ({ state, busy, onClose, onConfirm }) => {
  const [confirmation, setConfirmation] = useState("");
  const cancelRef = useRef(null);
  useEffect(() => {
    if (!state) return undefined;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    const escape = (event) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = priorOverflow; document.removeEventListener("keydown", escape); };
  }, [busy, onClose, state]);
  useEffect(() => setConfirmation(""), [state]);
  if (!state) return null;

  const inquiry = state.inquiry;
  const permanent = state.action === "permanent" || state.action === "empty";
  const actionLabel = state.action === "trash" ? "Move to Trash" : state.action === "restore" ? "Restore" : state.action === "empty" ? "Empty Trash" : "Delete permanently";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="inquiry-confirm-title" className="w-full max-w-lg bg-white p-5 shadow-2xl sm:p-7">
        <p className="text-xs font-label uppercase tracking-[0.25em] text-red-600">Confirm action</p>
        <h2 id="inquiry-confirm-title" className="mt-2 font-display text-3xl font-light text-charcoal">{actionLabel}</h2>
        <p className="mt-4 text-sm font-medium text-charcoal">
          {permanent ? "Delete this inquiry? This action cannot be undone." : state.action === "trash" ? "Move this inquiry to Trash? You can restore it later." : "Restore this inquiry to the inbox?"}
        </p>
        {state.count > 1 && <p className="mt-2 text-sm text-slate/60">This action applies to {state.count} selected inquiries.</p>}
        {inquiry && (
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-y border-gray-100 py-4 text-sm">
            <dt className="text-slate/45">Sender</dt><dd className="min-w-0 break-words text-charcoal">{inquiry.name}</dd>
            <dt className="text-slate/45">Email</dt><dd className="min-w-0 break-all text-charcoal">{inquiry.email}</dd>
            <dt className="text-slate/45">Type</dt><dd className="text-charcoal">{inquiryKind(inquiry)}</dd>
            {inquiry.artworkTitle && <><dt className="text-slate/45">Artwork</dt><dd className="min-w-0 break-words text-charcoal">{inquiry.artworkTitle}</dd></>}
            <dt className="text-slate/45">Submitted</dt><dd className="text-charcoal">{formatDate(inquiry.createdAt)}</dd>
          </dl>
        )}
        {state.action === "empty" && (
          <label className="mt-5 block text-xs font-label uppercase tracking-widest text-slate/60">
            Type DELETE to permanently remove every inquiry in Trash
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="input-field mt-2" placeholder="DELETE" />
          </label>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onConfirm(confirmation)} disabled={busy || (state.action === "empty" && confirmation !== "DELETE")} className={permanent ? "border-red-600 bg-red-600 text-white hover:bg-red-700" : "border-gold bg-gold text-white hover:bg-gold-dark"}>
            {busy ? "Working..." : actionLabel}
          </Button>
        </div>
      </section>
    </div>
  );
};

const InquiryRow = ({ inquiry, checked, active, trashView, busy, onCheck, onOpen, onAction }) => (
  <article className={`grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-gray-100 px-3 py-3 ${active ? "bg-gold/10" : "bg-white hover:bg-gray-50"}`}>
    <label className="flex min-h-11 items-start pt-2">
      <input type="checkbox" checked={checked} onChange={() => onCheck(inquiry._id)} aria-label={`Select inquiry from ${inquiry.name}`} className="h-4 w-4 accent-charcoal" />
    </label>
    <div className="min-w-0">
      <button type="button" onClick={() => onOpen(inquiry)} className="block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
        <div className="flex items-start justify-between gap-3">
          <p className={`truncate text-sm ${inquiry.isRead ? "text-slate" : "font-semibold text-charcoal"}`}>{inquiry.name}</p>
          <time className="shrink-0 text-[10px] text-slate/40">{formatDate(inquiry.createdAt, { year: undefined })}</time>
        </div>
        <p className="mt-0.5 truncate text-sm text-charcoal/75">{subjectOf(inquiry)}</p>
        <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-slate/50">{String(inquiry.message || "").replace(/\s+/g, " ")}</p>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone={inquiryKind(inquiry) === "Artwork" ? "gold" : "neutral"}>{inquiryKind(inquiry)}</Badge>
        {!trashView && <Badge tone={inquiry.isResolved ? "green" : "neutral"}>{inquiry.isResolved ? "Resolved" : "Unresolved"}</Badge>}
        <button type="button" disabled={busy} onClick={() => onAction(trashView ? "restore" : "trash", inquiry)} className="ml-auto min-h-9 text-[10px] font-label uppercase tracking-widest text-slate/60 underline decoration-gold underline-offset-4 disabled:opacity-40">
          {trashView ? "Restore" : "Move to Trash"}
        </button>
        {trashView && <button type="button" disabled={busy} onClick={() => onAction("permanent", inquiry)} className="min-h-9 text-[10px] font-label uppercase tracking-widest text-red-600 underline underline-offset-4 disabled:opacity-40">Delete</button>}
      </div>
    </div>
  </article>
);

const Reader = ({ inquiry, trashView, busy, onClose, onToggleRead, onToggleResolved, onAction }) => {
  if (!inquiry) return <div className="flex min-h-[520px] items-center justify-center px-8 text-center"><div><p className="font-display text-3xl font-light">Select an inquiry</p><p className="mt-3 text-sm text-slate/50">Choose a message to read its details and manage its status.</p></div></div>;
  const artworkId = artworkIdOf(inquiry);
  const artworkImage = artworkImageOf(inquiry);
  return (
    <article className="min-w-0 bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-gray-100 bg-white/95 p-3 backdrop-blur md:px-6">
        <Button onClick={onClose}>Back</Button>
        {!trashView && <Button onClick={() => onToggleRead(inquiry)} disabled={busy}>{inquiry.isRead ? "Mark unread" : "Mark read"}</Button>}
        {!trashView && <Button onClick={() => onToggleResolved(inquiry)} disabled={busy}>{inquiry.isResolved ? "Reopen" : "Resolve"}</Button>}
        <Button onClick={() => onAction(trashView ? "restore" : "trash", inquiry)} disabled={busy}>{trashView ? "Restore" : "Move to Trash"}</Button>
        {trashView && <Button onClick={() => onAction("permanent", inquiry)} disabled={busy} className="text-red-600">Delete permanently</Button>}
      </div>
      <div className="min-w-0 p-5 md:p-8 lg:p-10">
        <div className="flex flex-wrap gap-2"><Badge tone={inquiry.isRead ? "neutral" : "green"}>{inquiry.isRead ? "Read" : "Unread"}</Badge><Badge tone="gold">{inquiryKind(inquiry)}</Badge><Badge tone={inquiry.isResolved ? "green" : "neutral"}>{inquiry.isResolved ? "Resolved" : "Unresolved"}</Badge>{trashView && <Badge tone="red">Trash</Badge>}</div>
        <h2 className="mt-4 break-words font-display text-3xl font-light leading-tight text-charcoal md:text-4xl">{subjectOf(inquiry)}</h2>
        <dl className="mt-6 grid gap-3 border-y border-gray-100 py-5 text-sm sm:grid-cols-2">
          <div><dt className="text-slate/40">Sender</dt><dd className="break-words text-charcoal">{inquiry.name}</dd></div>
          <div><dt className="text-slate/40">Submitted</dt><dd className="text-charcoal">{formatDate(inquiry.createdAt)}</dd></div>
          <div><dt className="text-slate/40">Email</dt><dd><a className="break-all text-gold hover:underline" href={`mailto:${inquiry.email}`}>{inquiry.email}</a></dd></div>
          {inquiry.phone && <div><dt className="text-slate/40">Phone</dt><dd className="break-all text-charcoal">{inquiry.phone}</dd></div>}
        </dl>
        {inquiry.artworkTitle && <section className="mt-6 flex flex-col gap-4 border border-gray-100 p-4 sm:flex-row sm:items-center">{artworkImage && <img src={artworkImage} alt={inquiry.artworkTitle} className="h-24 w-24 shrink-0 object-cover" />}<div className="min-w-0"><p className="font-display text-2xl font-light">{inquiry.artworkTitle}</p>{artworkId && <a href={`/artwork/${artworkId}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-gold underline">Open artwork</a>}</div></section>}
        <section className="whitespace-pre-wrap break-words py-8 text-[15px] leading-8 text-charcoal">{inquiry.message}</section>
        <a href={`mailto:${inquiry.email}?subject=${encodeURIComponent(`Re: ${subjectOf(inquiry)}`)}`} className="btn-primary inline-block">Reply by Email</a>
      </div>
    </article>
  );
};

const InquiriesPage = () => {
  const [inquiries, setInquiries] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [counts, setCounts] = useState({ total: 0, unread: 0, resolved: 0, unresolved: 0, trash: 0 });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [selection, setSelection] = useState(emptyInquirySelection);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const requestIdRef = useRef(0);

  const trashView = filters.view === "trash";
  const activeFilters = useMemo(() => ({
    ...(search ? { search } : {}),
    ...(filters.inquiryType !== "all" ? { inquiryType: filters.inquiryType } : {}),
    ...(filters.isRead !== "all" ? { isRead: filters.isRead } : {}),
    ...(filters.isResolved !== "all" ? { isResolved: filters.isResolved } : {}),
    ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
    ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
  }), [filters.dateFrom, filters.dateTo, filters.inquiryType, filters.isRead, filters.isResolved, search]);
  const selectionScope = useMemo(() => JSON.stringify({ ...activeFilters, view: filters.view }), [activeFilters, filters.view]);
  const selectedCount = inquirySelectionCount(selection);

  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(searchInput.trim().slice(0, 120)); setPage(1); }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);
  useEffect(() => { setSelection(emptyInquirySelection()); setSelectedInquiry(null); }, [selectionScope]);

  const fetchInquiries = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const response = await inquiryAPI.getAll({ ...activeFilters, ...(trashView ? { view: "trash" } : {}), page, limit: PAGE_SIZE });
      if (requestId !== requestIdRef.current) return;
      const nextPagination = response.data.pagination || { total: 0, page, pages: 0 };
      const safePages = Math.max(1, Number(nextPagination.pages) || 1);
      setInquiries(response.data.inquiries || []);
      if (response.data.counts) setCounts(response.data.counts);
      setPagination({ ...nextPagination, pages: safePages });
      setSelectedInquiry((current) => current ? (response.data.inquiries || []).find((item) => item._id === current._id) || null : null);
      if (page > safePages) setPage(safePages);
    } catch {
      if (requestId === requestIdRef.current) toast.error("Failed to load inquiries");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [activeFilters, page, trashView]);
  useEffect(() => { fetchInquiries(); }, [fetchInquiries]);

  const changeFilter = (field, value) => { setFilters((current) => ({ ...current, [field]: value })); setPage(1); };
  const openInquiry = async (inquiry) => {
    setSelectedInquiry(inquiry);
    if (!trashView && !inquiry.isRead) {
      try {
        const response = await inquiryAPI.toggleRead(inquiry._id);
        setInquiries((items) => items.map((item) => item._id === inquiry._id ? { ...item, ...response.data.inquiry } : item));
        setSelectedInquiry((current) => current?._id === inquiry._id ? { ...current, ...response.data.inquiry } : current);
        if (response.data.counts) setCounts(response.data.counts);
      } catch { toast.error("Failed to mark inquiry as read"); }
    }
  };
  const updateStatus = async (inquiry, field) => {
    setBusy(true);
    try {
      const response = field === "read" ? await inquiryAPI.toggleRead(inquiry._id) : await inquiryAPI.toggleResolved(inquiry._id);
      const updated = response.data.inquiry;
      setInquiries((items) => items.map((item) => item._id === inquiry._id ? { ...item, ...updated } : item));
      setSelectedInquiry((current) => current?._id === inquiry._id ? { ...current, ...updated } : current);
      if (response.data.counts) setCounts(response.data.counts);
      toast.success(response.data.message);
    } catch { toast.error("Failed to update inquiry"); }
    finally { setBusy(false); }
  };

  const requestAction = (action, inquiry = null) => setModal({ action, inquiry, count: inquiry ? 1 : selectedCount });
  const runAction = async (confirmation) => {
    if (!modal) return;
    setBusy(true);
    try {
      let response;
      if (modal.action === "empty") {
        response = await inquiryAPI.emptyTrash(confirmation);
      } else if (modal.inquiry) {
        response = modal.action === "trash" ? await inquiryAPI.moveToTrash(modal.inquiry._id) : modal.action === "restore" ? await inquiryAPI.restore(modal.inquiry._id) : await inquiryAPI.permanentDelete(modal.inquiry._id);
      } else {
        const request = inquirySelectionRequest(selection, activeFilters);
        if (modal.action === "trash") response = request.filtered ? await inquiryAPI.filteredTrash(request.filters, request.excludedIds) : await inquiryAPI.bulkTrash(request.ids);
        if (modal.action === "restore") response = request.filtered ? await inquiryAPI.filteredRestore(request.filters, request.excludedIds) : await inquiryAPI.bulkRestore(request.ids);
        if (modal.action === "permanent") response = request.filtered ? await inquiryAPI.filteredPermanentDelete(request.filters, request.excludedIds) : await inquiryAPI.bulkPermanentDelete(request.ids);
      }
      const result = response?.data?.result || {};
      const resultDetails = [
        result.deleted ? `${result.deleted} deleted` : result.affected ? `${result.affected} changed` : "",
        result.alreadyMissing ? `${result.alreadyMissing} already missing` : "",
        result.unchanged ? `${result.unchanged} unchanged` : "",
        result.failed ? `${result.failed} failed` : "",
      ].filter(Boolean).join(" · ");
      const resultMessage = `${response?.data?.message || "Inquiry action completed"}${resultDetails ? `. ${resultDetails}.` : ""}`;
      if (result.failed) toast.error(resultMessage);
      else toast.success(resultMessage);
      setModal(null); setSelection(emptyInquirySelection()); setSelectedInquiry(null);
      if (response?.data?.counts) setCounts(response.data.counts);
      await fetchInquiries();
    } catch (error) { toast.error(error.response?.data?.message || "Inquiry action failed"); }
    finally { setBusy(false); }
  };

  const pageIds = inquiries.map((inquiry) => inquiry._id);
  const pageSelected = pageIds.length > 0 && pageIds.every((id) => inquiryIsSelected(selection, id));
  const totalPages = Math.max(1, Number(pagination.pages) || 1);

  return (
    <AdminLayout>
      <div className="min-h-full overflow-x-hidden bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-label uppercase tracking-widest text-slate/50">Manage</p><h1 className="font-display text-3xl font-light text-charcoal">Inquiries</h1><p className="mt-1 text-xs text-slate/50">{counts.unread} unread · {counts.unresolved} unresolved · {counts.trash} in Trash</p></div>
          {trashView && <Button onClick={() => setModal({ action: "empty", count: counts.trash })} disabled={busy || counts.trash === 0} className="border-red-200 text-red-600">Empty Trash</Button>}
        </header>

        <section className="mb-4 border border-gray-100 bg-white p-3 sm:p-4" aria-label="Inquiry filters">
          <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-7">
            <label className="col-span-2 lg:col-span-2"><span className="sr-only">Search inquiries</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="input-field" placeholder="Search sender, email, message..." maxLength={120} /></label>
            <label><span className="sr-only">Inquiry type</span><select value={filters.inquiryType} onChange={(event) => changeFilter("inquiryType", event.target.value)} className="input-field"><option value="all">All types</option><option value="contact">General contact</option><option value="artwork">Artwork enquiry</option></select></label>
            <label><span className="sr-only">Read status</span><select value={filters.isRead} onChange={(event) => changeFilter("isRead", event.target.value)} className="input-field"><option value="all">Read + unread</option><option value="false">Unread</option><option value="true">Read</option></select></label>
            <label><span className="sr-only">Resolution status</span><select value={filters.isResolved} onChange={(event) => changeFilter("isResolved", event.target.value)} className="input-field"><option value="all">All resolution</option><option value="false">Unresolved</option><option value="true">Resolved</option></select></label>
            <label><span className="sr-only">From date</span><input type="date" value={filters.dateFrom} onChange={(event) => changeFilter("dateFrom", event.target.value)} className="input-field" /></label>
            <label><span className="sr-only">To date</span><input type="date" value={filters.dateTo} onChange={(event) => changeFilter("dateTo", event.target.value)} className="input-field" /></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => changeFilter("view", "inbox")} className={!trashView ? "bg-charcoal text-white" : ""}>Inbox ({counts.total})</Button>
            <Button onClick={() => changeFilter("view", "trash")} className={trashView ? "bg-charcoal text-white" : ""}>Trash ({counts.trash})</Button>
            <Button onClick={() => { setFilters((current) => ({ ...EMPTY_FILTERS, view: current.view })); setSearchInput(""); setSearch(""); setPage(1); }} className="ml-auto">Clear filters</Button>
          </div>
        </section>

        <section className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 border border-gold/25 bg-white p-3 shadow-sm" aria-label="Inquiry selection toolbar">
          <strong className="mr-auto text-sm text-charcoal">{selectedCount} selected</strong>
          <Button onClick={() => setSelection((current) => selectInquiryPage(current, pageIds))} disabled={!pageIds.length || pageSelected}>Select current page</Button>
          <Button onClick={() => setSelection(selectAllFilteredInquiries(pagination.total))} disabled={!pagination.total || (selection.allFiltered && selection.excludedIds.size === 0)}>Select all {pagination.total} filtered</Button>
          <Button onClick={() => setSelection(emptyInquirySelection())} disabled={!selectedCount}>Clear selection</Button>
          {trashView ? <><Button onClick={() => requestAction("restore")} disabled={!selectedCount || busy} className="border-green-300 text-green-700">Restore selected</Button><Button onClick={() => requestAction("permanent")} disabled={!selectedCount || busy} className="border-red-300 text-red-600">Delete selected</Button></> : <Button onClick={() => requestAction("trash")} disabled={!selectedCount || busy} className="border-red-300 text-red-600">Move selected to Trash</Button>}
        </section>

        <div className="grid min-h-[620px] min-w-0 overflow-hidden border border-gray-100 bg-white lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
          <aside className={`${selectedInquiry ? "hidden lg:flex" : "flex"} min-w-0 flex-col border-r border-gray-100`}>
            <div className="flex min-h-12 items-center justify-between border-b border-gray-100 px-3 text-xs text-slate/50"><span>{loading ? "Loading..." : `${pagination.total} matching`}</span><label className="flex items-center gap-2"><input type="checkbox" checked={pageSelected} onChange={() => setSelection((current) => pageSelected ? deselectInquiryPage(current, pageIds) : selectInquiryPage(current, pageIds))} disabled={!pageIds.length} className="accent-charcoal" />Page</label></div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading && !inquiries.length ? <div className="flex min-h-[360px] items-center justify-center"><LoadingSpinner size="lg" /></div> : inquiries.length === 0 ? <div className="px-6 py-16 text-center"><p className="font-display text-2xl font-light">{trashView ? "Trash is empty" : "No inquiries found"}</p><p className="mt-2 text-sm text-slate/50">{trashView ? "Moved inquiries will remain here until restored or permanently deleted." : "Try changing the active filters."}</p></div> : inquiries.map((inquiry) => <InquiryRow key={inquiry._id} inquiry={inquiry} checked={inquiryIsSelected(selection, inquiry._id)} active={selectedInquiry?._id === inquiry._id} trashView={trashView} busy={busy} onCheck={(id) => setSelection((current) => toggleInquirySelection(current, id))} onOpen={openInquiry} onAction={requestAction} />)}
            </div>
            <nav className="flex items-center justify-between gap-2 border-t border-gray-100 p-3" aria-label="Inquiry pagination"><Button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading}>Previous</Button><span className="text-xs text-slate/50">Page {page} of {totalPages}</span><Button onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading}>Next</Button></nav>
          </aside>
          <main className="hidden min-w-0 overflow-y-auto lg:block"><Reader inquiry={selectedInquiry} trashView={trashView} busy={busy} onClose={() => setSelectedInquiry(null)} onToggleRead={(item) => updateStatus(item, "read")} onToggleResolved={(item) => updateStatus(item, "resolved")} onAction={requestAction} /></main>
        </div>

        {selectedInquiry && <div className="fixed inset-0 z-50 overflow-x-hidden overflow-y-auto bg-white lg:hidden"><Reader inquiry={selectedInquiry} trashView={trashView} busy={busy} onClose={() => setSelectedInquiry(null)} onToggleRead={(item) => updateStatus(item, "read")} onToggleResolved={(item) => updateStatus(item, "resolved")} onAction={requestAction} /></div>}
        <ConfirmationModal state={modal} busy={busy} onClose={() => !busy && setModal(null)} onConfirm={runAction} />
      </div>
    </AdminLayout>
  );
};

export default InquiriesPage;
