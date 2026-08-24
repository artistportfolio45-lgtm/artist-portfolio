import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import AdminLayout from "../../components/admin/AdminLayout";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { artworkAPI } from "../../services/api";
import { notifyArtworksChanged } from "../../services/artworkRefresh";

const PAGE_SIZE = 20;
const BATCH_LOOKUP_SIZE = 100;
const ACTIVE_DELETE_JOB_KEY = "uploadHistoryDeletionJob.v1";
const DELETE_SELECTION_KEY = "uploadHistoryDeleteSelection.v1";
const TERMINAL_JOB_STATES = new Set(["stopped", "completed", "completed_with_errors"]);
const readStoredSelection = () => {
  try { return new Set(JSON.parse(localStorage.getItem(DELETE_SELECTION_KEY) || "[]")); }
  catch { return new Set(); }
};

const dateFormat = (value) => value
  ? new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value)).replace(/\b(am|pm)\b/i, (period) => period.toUpperCase())
  : "—";

const indiaDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const imageOf = (artwork) => artwork.images?.[0]?.url || artwork.image || "";

const UploadHistoryPage = () => {
  const [data, setData] = useState({ artworks: [], pagination: {} });
  const [batches, setBatches] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "", batchId: "", startDate: "", endDate: "" });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState(readStoredSelection);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(null);
  const [deleteSummary, setDeleteSummary] = useState(null);
  const [activeDeleteJobId, setActiveDeleteJobId] = useState(() => localStorage.getItem(ACTIVE_DELETE_JOB_KEY) || "");
  const [selectingBatchId, setSelectingBatchId] = useState("");
  const [deleteBatchHistoryWithArtworks, setDeleteBatchHistoryWithArtworks] = useState(false);
  const [historyBatchToDelete, setHistoryBatchToDelete] = useState(null);
  const [deletingBatchHistory, setDeletingBatchHistory] = useState(false);
  const selectPageRef = useRef(null);

  useEffect(() => {
    if (selectedIds.size) localStorage.setItem(DELETE_SELECTION_KEY, JSON.stringify([...selectedIds]));
    else localStorage.removeItem(DELETE_SELECTION_KEY);
  }, [selectedIds]);

  useEffect(() => {
    if (activeDeleteJobId) localStorage.setItem(ACTIVE_DELETE_JOB_KEY, activeDeleteJobId);
    else localStorage.removeItem(ACTIVE_DELETE_JOB_KEY);
  }, [activeDeleteJobId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [history, batchResponse] = await Promise.all([
          artworkAPI.uploadHistory({ ...filters, page, limit: PAGE_SIZE }),
          artworkAPI.uploadBatches(),
        ]);
        if (!active) return;
        const nextData = history.data;
        const totalPages = Math.max(1, Number(nextData.pagination?.pages) || 1);
        if (page > totalPages) {
          setPage(totalPages);
          return;
        }
        setData(nextData);
        setBatches(batchResponse.data.batches || []);
      } catch {
        if (active) toast.error("Failed to load upload history");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [page, filters, refreshKey]);

  useEffect(() => {
    if (!activeDeleteJobId) return undefined;
    let active = true;
    let timer = null;
    let controller = null;
    setDeleting(true);
    setConfirmDelete(true);

    const finish = (job) => {
      const completedIds = new Set(job.items
        .filter((item) => item.status === "deleted" || item.status === "missing")
        .map((item) => item.id));
      setSelectedIds((current) => new Set([...current].filter((id) => !completedIds.has(id))));
      setDeleteSummary(job);
      setDeleting(false);
      setDeleteBatchHistoryWithArtworks(false);
      setActiveDeleteJobId("");
      setRefreshKey((current) => current + 1);
      notifyArtworksChanged();

      if (job.state === "stopped") {
        toast(`Deletion stopped. ${job.deleted} artworks were deleted, ${job.failed} failed and ${job.cancelled} were not deleted.`);
      } else if (job.failed) {
        toast.error(`${job.deleted} deleted, ${job.failed} failed. Failed artworks remain selected for retry.`);
      } else if (job.publicSync?.status !== "failed") {
        toast.success(`${job.deleted} ${job.deleted === 1 ? "artwork" : "artworks"} permanently deleted.`);
      }
      if (job.missing) toast(`${job.missing} selected ${job.missing === 1 ? "artwork was" : "artworks were"} already missing.`);
      if (job.publicSync?.status === "failed") toast.error(job.publicSync.message || "Artwork changes were saved, but public Gallery synchronization failed.");
      if (job.historyCleanup?.status === "deleted") toast.success("Associated batch history was deleted.");
      if (job.historyCleanup?.status === "kept") toast("Batch history was kept because artwork from that batch still remains on the website.");
      if (job.historyCleanup?.status === "failed") toast.error(job.historyCleanup.message || "Artworks were processed, but batch history could not be deleted.");
    };

    const poll = async () => {
      controller = new AbortController();
      try {
        const response = await artworkAPI.getDeletionJob(activeDeleteJobId, { signal: controller.signal });
        if (!active) return;
        const job = response.data.job;
        setDeleteProgress(job);
        if (TERMINAL_JOB_STATES.has(job.state)) {
          finish(job);
          return;
        }
        timer = window.setTimeout(poll, 350);
      } catch (error) {
        if (!active || error.code === "ERR_CANCELED") return;
        if (error.response?.status === 404) {
          setDeleting(false);
          setActiveDeleteJobId("");
          toast.error("The deletion job is no longer available. Undeleted selections were kept so they can be verified and retried.");
          return;
        }
        timer = window.setTimeout(poll, 1200);
      }
    };
    poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [activeDeleteJobId]);

  const pageIds = useMemo(() => data.artworks.map((artwork) => artwork._id), [data.artworks]);
  const selectedCount = selectedIds.size;
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  useEffect(() => {
    if (selectPageRef.current) selectPageRef.current.indeterminate = somePageSelected && !allPageSelected;
  }, [allPageSelected, somePageSelected]);

  const setFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const setDateRange = (startDate, endDate) => {
    setPage(1);
    setFilters((current) => ({ ...current, startDate, endDate }));
  };
  const choosePreset = (preset) => {
    const now = new Date();
    const end = indiaDate(now);
    if (preset === "today") return setDateRange(end, end);
    if (preset === "week") {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return setDateRange(indiaDate(start), end);
    }
    const [year, month] = end.split("-");
    return setDateRange(`${year}-${month}-01`, end);
  };

  const toggleSelection = (id) => {
    if (deleting) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCurrentPage = () => {
    if (deleting) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectEntireBatch = async (batch) => {
    if (!batch?.uploadBatchId || deleting || selectingBatchId) return;
    setSelectingBatchId(batch.uploadBatchId);
    try {
      const first = await artworkAPI.uploadHistory({ batchId: batch.uploadBatchId, page: 1, limit: BATCH_LOOKUP_SIZE });
      const ids = (first.data.artworks || []).map((artwork) => artwork._id);
      const pages = Math.max(1, Number(first.data.pagination?.pages) || 1);
      for (let batchPage = 2; batchPage <= pages; batchPage += 1) {
        const response = await artworkAPI.uploadHistory({ batchId: batch.uploadBatchId, page: batchPage, limit: BATCH_LOOKUP_SIZE });
        ids.push(...(response.data.artworks || []).map((artwork) => artwork._id));
      }
      const uniqueIds = [...new Set(ids)];
      setSelectedIds((current) => new Set([...current, ...uniqueIds]));
      setPage(1);
      setFilters((current) => ({ ...current, batchId: batch.uploadBatchId }));
      if (uniqueIds.length) toast.success(`${uniqueIds.length} stored ${uniqueIds.length === 1 ? "artwork" : "artworks"} selected from this batch.`);
      else toast("This upload batch has no stored artworks to delete.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to select the upload batch");
    } finally {
      setSelectingBatchId("");
    }
  };

  const deleteSelected = async () => {
    const ids = [...selectedIds];
    if (!ids.length || deleting) return;
    setDeleting(true);
    setDeleteSummary(null);
    setDeleteProgress(null);
    try {
      const response = await artworkAPI.startDeletionJob(ids, { deleteBatchHistory: deleteBatchHistoryWithArtworks });
      setDeleteProgress(response.data.job);
      setActiveDeleteJobId(response.data.job.id);
    } catch (error) {
      setDeleting(false);
      toast.error(error.response?.data?.message || "Deletion could not be started");
    }
  };

  const stopDeletion = async () => {
    if (!activeDeleteJobId || deleteProgress?.state === "stopping") return;
    setDeleteProgress((current) => current ? { ...current, state: "stopping" } : current);
    try {
      const response = await artworkAPI.cancelDeletionJob(activeDeleteJobId);
      setDeleteProgress(response.data.job);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not stop the deletion job");
    }
  };

  const deleteBatchHistoryOnly = async () => {
    if (!historyBatchToDelete?.uploadBatchId || deletingBatchHistory) return;
    if (!historyBatchToDelete.canDeleteHistory) {
      toast.error("Delete every artwork from this batch before deleting its history.");
      setHistoryBatchToDelete(null);
      return;
    }
    setDeletingBatchHistory(true);
    try {
      const response = await artworkAPI.deleteBatchHistory(historyBatchToDelete.uploadBatchId);
      setHistoryBatchToDelete(null);
      setSelectedIds(new Set());
      setFilters((current) => current.batchId === historyBatchToDelete.uploadBatchId
        ? { ...current, batchId: "" }
        : current);
      setRefreshKey((current) => current + 1);
      toast.success(response.data.message || "Batch history deleted. Artworks were kept.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Batch history could not be deleted");
    } finally {
      setDeletingBatchHistory(false);
    }
  };

  return (
    <AdminLayout>
      <div className="min-w-0 overflow-x-hidden p-4 sm:p-6 md:p-8">
        <div className="mb-8">
          <p className="text-xs font-label uppercase tracking-widest text-slate/50">Admin</p>
          <h1 className="mt-1 font-display text-4xl font-light text-charcoal">Upload History</h1>
          <p className="mt-2 text-sm text-slate/55">Review artwork uploads, batches, and confirmed statuses in India time.</p>
        </div>

        {batches.length > 0 && (
          <section className="mb-7">
            <h2 className="mb-3 font-display text-2xl font-light text-charcoal">Recent batches</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {batches.slice(0, 9).map((batch) => (
                <article key={batch.uploadBatchId} className="min-w-0 bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <p className="font-medium text-charcoal">Batch: {dateFormat(batch.uploadedAt)}</p>
                  <p className="mt-2 text-sm text-slate/60">{batch.total} artworks selected</p>
                  <p className="mt-1 text-sm">
                    <span className="text-green-700">{batch.successful} successful</span>
                    <span className="mx-2 text-slate/30">·</span>
                    <span className={batch.failed ? "text-red-600" : "text-slate/55"}>{batch.failed} failed</span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button type="button" className="text-sm text-gold hover:underline" onClick={() => setFilter("batchId", batch.uploadBatchId)}>View batch</button>
                    <button
                      type="button"
                      className="text-sm text-red-600 hover:underline disabled:opacity-40"
                      onClick={() => selectEntireBatch(batch)}
                      disabled={deleting || Boolean(selectingBatchId)}
                    >
                      {selectingBatchId === batch.uploadBatchId ? "Selecting..." : "Select batch for deletion"}
                    </button>
                    <button
                      type="button"
                      className="text-sm text-red-600 hover:underline disabled:opacity-40"
                      onClick={() => setHistoryBatchToDelete(batch)}
                      disabled={deleting || deletingBatchHistory || !batch.canDeleteHistory}
                      title={batch.canDeleteHistory ? "Delete batch history" : `${batch.remainingArtworkCount} batch artworks still remain`}
                    >
                      {batch.canDeleteHistory ? "Delete history" : "History kept while artworks remain"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="mb-6 space-y-3 bg-white p-4 shadow-sm ring-1 ring-black/5" aria-label="Upload history filters">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_240px]">
            <input className="input-field" placeholder="Search by artwork title" value={filters.search} onChange={(event) => setFilter("search", event.target.value)} />
            <select className="input-field" value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>
              <option value="">All statuses</option><option value="success">Success</option><option value="failed">Failed</option>
            </select>
            <select className="input-field" value={filters.batchId} onChange={(event) => setFilter("batchId", event.target.value)}>
              <option value="">All upload batches</option>
              {batches.map((batch) => <option key={batch.uploadBatchId} value={batch.uploadBatchId}>{dateFormat(batch.uploadedAt)} · {batch.total} selected</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => choosePreset("today")}>Today</button>
            <button type="button" className="btn-secondary" onClick={() => choosePreset("week")}>Last 7 days</button>
            <button type="button" className="btn-secondary" onClick={() => choosePreset("month")}>This month</button>
            <label className="text-xs text-slate/55">From<input type="date" className="input-field mt-1 block" value={filters.startDate} onChange={(event) => setFilter("startDate", event.target.value)} /></label>
            <label className="text-xs text-slate/55">To<input type="date" className="input-field mt-1 block" value={filters.endDate} onChange={(event) => setFilter("endDate", event.target.value)} /></label>
            {filters.batchId && (() => { const selectedBatch = batches.find((batch) => batch.uploadBatchId === filters.batchId); return <button type="button" className="btn-danger text-xs" onClick={() => setHistoryBatchToDelete(selectedBatch)} disabled={deleting || deletingBatchHistory || !selectedBatch?.canDeleteHistory} title={selectedBatch?.canDeleteHistory ? "Delete batch history" : "Delete all artworks from this batch first"}>{selectedBatch?.canDeleteHistory ? "Delete selected batch history" : "History kept while artworks remain"}</button>; })()}
            {(filters.startDate || filters.endDate || filters.batchId) && <button type="button" className="px-3 py-2 text-sm text-red-600 hover:underline" onClick={() => { setPage(1); setFilters((current) => ({ ...current, batchId: "", startDate: "", endDate: "" })); }}>Clear range/batch</button>}
          </div>
        </section>

        <section className="sticky top-0 z-20 mb-5 flex flex-wrap items-center gap-2 border border-red-100 bg-white p-3 shadow-sm" aria-label="Upload history batch actions">
          <strong className="mr-auto text-sm text-charcoal" aria-live="polite">{selectedCount} selected</strong>
          <button type="button" className="btn-secondary text-xs" onClick={toggleCurrentPage} disabled={!pageIds.length || deleting}>{allPageSelected ? "Clear current page" : "Select current page"}</button>
          <button type="button" className="btn-secondary text-xs" onClick={() => setSelectedIds(new Set())} disabled={!selectedCount || deleting}>Clear selection</button>
          <button type="button" className="btn-danger text-xs disabled:opacity-40" onClick={() => { setDeleteBatchHistoryWithArtworks(false); setConfirmDelete(true); }} disabled={!selectedCount || deleting}>Delete selected</button>
        </section>

        {loading ? (
          <div className="flex justify-center p-12"><LoadingSpinner size="lg" /></div>
        ) : data.artworks.length === 0 ? (
          <div className="bg-white p-10 text-center text-sm text-slate/55">No uploads match these filters.</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto bg-white shadow-sm ring-1 ring-black/5 md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-slate/50">
                  <tr>
                    <th className="w-12 p-4"><input ref={selectPageRef} type="checkbox" checked={allPageSelected} onChange={toggleCurrentPage} disabled={deleting} aria-label="Select all artworks on this page" className="h-4 w-4 accent-red-600" /></th>
                    <th className="p-4">Thumbnail</th><th className="p-4">Artwork title</th><th className="p-4">Category</th><th className="p-4">Uploaded on</th><th className="p-4">Upload batch</th><th className="p-4">Status</th><th className="p-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.artworks.map((artwork) => (
                    <tr key={artwork._id} className={`border-t border-gray-100 ${selectedIds.has(artwork._id) ? "bg-red-50/50" : ""}`}>
                      <td className="p-4"><input type="checkbox" checked={selectedIds.has(artwork._id)} onChange={() => toggleSelection(artwork._id)} disabled={deleting} aria-label={`Select ${artwork.title || "artwork"}`} className="h-4 w-4 accent-red-600" /></td>
                      <td className="p-4">{imageOf(artwork) ? <img src={imageOf(artwork)} alt="" className="h-12 w-12 object-cover" /> : <div className="h-12 w-12 bg-gray-100" />}</td>
                      <td className="p-4 font-medium text-charcoal">{artwork.title}</td>
                      <td className="p-4 text-slate/65">{artwork.category || "Uncategorized"}</td>
                      <td className="whitespace-nowrap p-4 text-slate/65">{dateFormat(artwork.createdAt)}</td>
                      <td className="p-4 text-xs text-slate/60">{artwork.uploadBatchId ? artwork.uploadBatchId.slice(0, 8) : "Older upload"}</td>
                      <td className="p-4"><span className={artwork.uploadStatus === "failed" ? "text-red-600" : "text-green-700"}>{artwork.uploadStatus || "success"}</span></td>
                      <td className="p-4"><Link className="whitespace-nowrap text-gold hover:underline" to={`/artwork/${artwork._id}`}>View Artwork</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {data.artworks.map((artwork) => (
                <article key={artwork._id} className={`flex min-w-0 gap-3 bg-white p-4 shadow-sm ${selectedIds.has(artwork._id) ? "ring-2 ring-red-200" : ""}`}>
                  <input type="checkbox" checked={selectedIds.has(artwork._id)} onChange={() => toggleSelection(artwork._id)} disabled={deleting} aria-label={`Select ${artwork.title || "artwork"}`} className="mt-1 h-4 w-4 shrink-0 accent-red-600" />
                  {imageOf(artwork) ? <img src={imageOf(artwork)} alt="" className="h-20 w-20 shrink-0 object-cover" /> : <div className="h-20 w-20 shrink-0 bg-gray-100" />}
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words font-medium text-charcoal">{artwork.title}</h2>
                    <p className="text-sm text-slate/60">{artwork.category || "Uncategorized"}</p>
                    <p className="mt-1 text-xs text-slate/55">{dateFormat(artwork.createdAt)}</p>
                    <p className="mt-1 break-all text-xs text-slate/55">{artwork.uploadBatchId ? `Batch ${artwork.uploadBatchId.slice(0, 8)}` : "Older upload"}</p>
                    <p className={artwork.uploadStatus === "failed" ? "mt-2 text-xs text-red-600" : "mt-2 text-xs text-green-700"}>{artwork.uploadStatus || "success"}</p>
                    <Link className="mt-2 inline-block text-sm text-gold" to={`/artwork/${artwork._id}`}>View Artwork</Link>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        <nav className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate/60" aria-label="Upload history pagination">
          <span>{data.pagination.total || 0} uploads · Page {page} of {Math.max(1, data.pagination.pages || 1)}</span>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={page <= 1 || loading || deleting} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <button className="btn-secondary" disabled={page >= (data.pagination.pages || 1) || loading || deleting} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </nav>

        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setConfirmDelete(false); }}>
            <section className="w-full max-w-md bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="upload-history-delete-title">
              <p className="text-xs font-label uppercase tracking-widest text-red-600">Permanent deletion</p>
              <h2 id="upload-history-delete-title" className="mt-2 font-display text-3xl font-light text-charcoal">Delete {selectedCount} {selectedCount === 1 ? "artwork" : "artworks"}?</h2>
              <p className="mt-4 text-sm leading-6 text-slate/65">This action cannot be undone. The selected artwork records and all associated Cloudinary images will be permanently deleted from the website.</p>
              <p className="mt-3 text-xs text-red-600">Upload History is showing real artworks—not disposable log entries.</p>
              {!deleting && (
                <fieldset className="mt-5 space-y-3 border border-gray-200 p-4">
                  <legend className="px-1 text-sm font-medium text-charcoal">What should happen to batch history?</legend>
                  <label className="flex cursor-pointer items-start gap-3 text-sm text-slate/70">
                    <input type="radio" name="batch-history-choice" checked={!deleteBatchHistoryWithArtworks} onChange={() => setDeleteBatchHistoryWithArtworks(false)} className="mt-1 accent-charcoal" />
                    <span><strong className="block text-charcoal">Keep batch history</strong>Only the selected artworks and their images are deleted.</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 text-sm text-slate/70">
                    <input type="radio" name="batch-history-choice" checked={deleteBatchHistoryWithArtworks} onChange={() => setDeleteBatchHistoryWithArtworks(true)} className="mt-1 accent-red-600" />
                    <span><strong className="block text-red-600">Delete history for emptied batches</strong>History is removed only when every artwork from an affected batch has been deleted. Partially deleted batch history is always kept.</span>
                  </label>
                </fieldset>
              )}
              {deleting && !deleteProgress && <p className="mt-5 text-sm font-medium text-charcoal" role="status">Starting deletion job…</p>}
              {deleteProgress && (
                <div className="mt-5" role="status" aria-live="polite">
                  <p className="font-medium text-charcoal">
                    {deleteProgress.state === "stopping" ? "Stopping deletion…"
                      : deleteProgress.state === "stopped" ? "Deletion stopped"
                        : deleteProgress.state === "finalizing" ? "Finalizing deletion and gallery refresh…"
                          : TERMINAL_JOB_STATES.has(deleteProgress.state) ? "Deletion finished"
                            : `Deleting ${deleteProgress.current} of ${deleteProgress.total}`}
                  </p>
                  <div className="mt-3 h-2 bg-gray-100"><div className="h-2 bg-red-600 transition-all" style={{ width: `${deleteProgress.percentage}%` }} /></div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate/60 sm:grid-cols-3">
                    <span>Total: {deleteProgress.total}</span><span>Deleted: {deleteProgress.deleted}</span><span>Deleting: {deleteProgress.deleting}</span>
                    <span>Failed: {deleteProgress.failed}</span><span>Remaining: {deleteProgress.remaining}</span><span>Cancelled: {deleteProgress.cancelled}</span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-charcoal">{deleteProgress.percentage}% completed</p>
                  <ul className="mt-3 max-h-36 overflow-y-auto border border-gray-100 text-xs" aria-label="Individual deletion statuses">
                    {deleteProgress.items.map((item) => <li key={item.id} className="flex justify-between gap-3 border-b border-gray-50 px-3 py-2 last:border-0"><span className="truncate">{item.id}</span><span className="capitalize">{item.status === "missing" ? "Already missing" : item.status}</span></li>)}
                  </ul>
                </div>
              )}
              {deleteSummary && !deleting && <p className="mt-4 text-sm text-charcoal">{deleteSummary.state === "stopped" ? `Deletion stopped. ${deleteSummary.deleted} artworks were deleted, ${deleteSummary.failed} failed and ${deleteSummary.cancelled} were not deleted.` : `Deletion finished. ${deleteSummary.deleted} deleted, ${deleteSummary.failed} failed and ${deleteSummary.cancelled} cancelled.`}</p>}
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" className="btn-secondary" onClick={() => { setDeleteBatchHistoryWithArtworks(false); setConfirmDelete(false); }} disabled={deleting}>Cancel</button>
                {deleting
                  ? <button type="button" className="btn-danger disabled:opacity-40" onClick={stopDeletion} disabled={!activeDeleteJobId || deleteProgress?.state === "stopping" || deleteProgress?.state === "finalizing"}>{!activeDeleteJobId ? "Starting…" : deleteProgress?.state === "stopping" ? "Stopping…" : deleteProgress?.state === "finalizing" ? "Finalizing…" : "Stop Now"}</button>
                  : <button type="button" className="btn-danger disabled:opacity-40" onClick={deleteSelected} disabled={!selectedCount}>{deleteSummary && selectedCount ? `Retry ${selectedCount} remaining` : `Delete ${selectedCount} permanently`}</button>}
              </div>
            </section>
          </div>
        )}
        {historyBatchToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingBatchHistory) setHistoryBatchToDelete(null); }}>
            <section className="w-full max-w-md bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="delete-batch-history-title">
              <p className="text-xs font-label uppercase tracking-widest text-red-600">History only</p>
              <h2 id="delete-batch-history-title" className="mt-2 font-display text-3xl font-light text-charcoal">Delete this batch history?</h2>
              <p className="mt-4 text-sm leading-6 text-slate/65">The batch card and its Upload History entries will be permanently removed.</p>
              <p className="mt-3 border-l-2 border-green-600 pl-3 text-sm font-medium leading-6 text-green-700">All artwork records, Gallery entries, and Cloudinary images will be kept.</p>
              <p className="mt-3 text-xs text-slate/55">Batch: {dateFormat(historyBatchToDelete.uploadedAt)} · {historyBatchToDelete.total} selected</p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" className="btn-secondary" onClick={() => setHistoryBatchToDelete(null)} disabled={deletingBatchHistory}>Cancel</button>
                <button type="button" className="btn-danger disabled:opacity-40" onClick={deleteBatchHistoryOnly} disabled={deletingBatchHistory}>{deletingBatchHistory ? "Deleting history…" : "Delete history only"}</button>
              </div>
            </section>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default UploadHistoryPage;
