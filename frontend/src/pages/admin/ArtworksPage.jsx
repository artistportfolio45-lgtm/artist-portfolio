// pages/admin/ArtworksPage.jsx
// List all artworks with search, sort, pagination, edit/delete, and add new button.

import { useMemo, useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout";
import { artworkAPI, publicSnapshotAPI } from "../../services/api";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import toast from "react-hot-toast";

const PAGE_SIZE = 10;
const DELETE_SESSION_KEY = "artworkDeleteSession.v1";
const readDeleteSession = () => {
  try { return new Set(JSON.parse(localStorage.getItem(DELETE_SESSION_KEY) || "[]")); } catch { return new Set(); }
};

const ArtworksPage = () => {
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState({ key: "createdAt", direction: "desc" });
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(null);
  const [selectedIds, setSelectedIds] = useState(readDeleteSession);
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteState, setBulkDeleteState] = useState("idle");
  const [deleteProgress, setDeleteProgress] = useState(null);
  const [deleteSummary, setDeleteSummary] = useState(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const selectAllRef = useRef(null);
  const bulkDeleteLockRef = useRef(false);
  const deleteControlRef = useRef({ pause: false, stop: false });

  useEffect(() => {
    if (selectedIds.size) localStorage.setItem(DELETE_SESSION_KEY, JSON.stringify([...selectedIds]));
    else localStorage.removeItem(DELETE_SESSION_KEY);
  }, [selectedIds]);

  const fetchArtworks = async () => {
    setLoading(true);
    try {
      const firstPage = await artworkAPI.getAll({ page: 1, limit: 200 });
      const allArtworks = [...(firstPage.data.artworks || [])];
      const pages = firstPage.data.pagination?.pages || 1;
      for (let currentPage = 2; currentPage <= pages; currentPage += 1) {
        const res = await artworkAPI.getAll({ page: currentPage, limit: 200 });
        allArtworks.push(...(res.data.artworks || []));
      }
      setArtworks(allArtworks);
    } catch {
      toast.error("Failed to load artworks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtworks();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, availability, sort]);

  const filteredArtworks = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = artworks.filter((artwork) => {
      const matchesSearch = !term || [artwork.title, artwork.category, artwork.medium]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
      const matchesAvailability =
        availability === "all" ||
        (availability === "available" && artwork.isAvailable) ||
        (availability === "not-available" && !artwork.isAvailable);

      return matchesSearch && matchesAvailability;
    });

    return [...filtered].sort((a, b) => {
      const direction = sort.direction === "asc" ? 1 : -1;
      const first = a[sort.key];
      const second = b[sort.key];

      if (sort.key === "price") {
        const firstMissing = first === null || first === undefined || first === "";
        const secondMissing = second === null || second === undefined || second === "";
        if (firstMissing !== secondMissing) return firstMissing ? 1 : -1;
        if (firstMissing) return 0;
        return (Number(first) - Number(second)) * direction;
      }
      if (sort.key === "isAvailable") return (Number(Boolean(first)) - Number(Boolean(second))) * direction;
      if (sort.key === "createdAt") return (new Date(first) - new Date(second)) * direction;

      return String(first || "").localeCompare(String(second || "")) * direction;
    });
  }, [artworks, search, availability, sort]);

  const pages = Math.max(1, Math.ceil(filteredArtworks.length / PAGE_SIZE));
  const visibleArtworks = filteredArtworks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const visibleIds = useMemo(() => visibleArtworks.map((artwork) => artwork._id), [visibleArtworks]);
  const selectedCount = selectedIds.size;
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, pages));
  }, [pages]);

  const handleSort = (key) => {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  useEffect(() => {
    setSelectedIds((current) => {
      const artworkIds = new Set(artworks.map((artwork) => artwork._id));
      const next = new Set([...current].filter((id) => artworkIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [artworks]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [allVisibleSelected, someVisibleSelected]);

  const toggleArtworkSelection = (id) => {
    if (!selectionMode || bulkDeleting) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (!selectionMode || bulkDeleting) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await artworkAPI.delete(id);
      setArtworks((prev) => prev.filter((a) => a._id !== id));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      toast.success("Artwork deleted");
    } catch {
      toast.error("Failed to delete artwork");
    } finally {
      setDeleting(null);
    }
  };

  const runBulkDelete = async (ids) => {
    if (!ids.length || bulkDeleteLockRef.current) return;
    bulkDeleteLockRef.current = true;
    setBulkDeleting(true);
    setBulkDeleteState("running");
    deleteControlRef.current = { pause: false, stop: false };
    setDeleteSummary(null);
    setConfirmBulkDelete(false);
    let deleted = 0;
    const failedIds = new Set();

    for (let index = 0; index < ids.length; index += 1) {
      if (deleteControlRef.current.pause || deleteControlRef.current.stop) break;
      const id = ids[index];
      setDeleteProgress({ current: index + 1, total: ids.length, completed: deleted, failed: failedIds.size, pending: ids.length - index, stopped: 0 });
      try {
        await artworkAPI.delete(id, { params: { deferRebuild: true } });
        deleted += 1;
        setArtworks((prev) => prev.filter((artwork) => artwork._id !== id));
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      } catch (error) {
        failedIds.add(id);
        console.error("Bulk artwork deletion item failed:", error);
      }
    }

    const interrupted = deleteControlRef.current.pause || deleteControlRef.current.stop;
    const pending = ids.length - deleted - failedIds.size;
    if (interrupted) {
      setDeleteProgress({
        current: deleted + failedIds.size,
        total: ids.length,
        completed: deleted,
        failed: failedIds.size,
        pending,
        stopped: deleteControlRef.current.stop ? pending : 0,
      });
    }
    try {
      if (deleted > 0) await publicSnapshotAPI.rebuild("artwork-bulk-deleted");
    } catch (error) {
      console.error("Bulk artwork static rebuild failed:", error);
      toast("Artworks deleted, but public gallery rebuild could not be scheduled.");
    }
    await fetchArtworks();
    if (!interrupted) setDeleteProgress(null);
    setDeleteSummary({ deleted, failed: failedIds.size });
    setBulkDeleting(interrupted);
    setBulkDeleteState(interrupted ? (deleteControlRef.current.stop ? "stopped" : "paused") : "idle");
    bulkDeleteLockRef.current = false;
    if (interrupted) {
      toast(`Delete ${deleteControlRef.current.stop ? "stopped" : "paused"}: ${deleted} completed, ${failedIds.size} failed, ${pending} pending.`, { icon: "⏸" });
    } else if (failedIds.size) {
      toast.error(`${deleted} deleted, ${failedIds.size} failed. Failed artworks remain selected.`);
    } else {
      setSelectionMode(false);
      setSelectedIds(new Set());
      toast.success(`${deleted} ${deleted === 1 ? "artwork" : "artworks"} deleted successfully.`);
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length || bulkDeleteLockRef.current) return;
    setConfirmBulkDelete(false);
    runBulkDelete(ids);
  };
  const pauseBulkDelete = () => { deleteControlRef.current.pause = true; setBulkDeleteState("pausing"); };
  const stopBulkDelete = () => {
    if (bulkDeleteState === "paused") {
      setBulkDeleteState("stopped");
      setDeleteSummary({
        deleted: deleteProgress?.completed || 0,
        failed: deleteProgress?.failed || 0,
      });
      return;
    }
    deleteControlRef.current.stop = true;
    deleteControlRef.current.pause = false;
    setBulkDeleteState("stopping");
  };
  const resumeBulkDelete = () => runBulkDelete([...selectedIds]);

  const clearSelection = () => {
    if (bulkDeleting) return;
    setSelectedIds(new Set());
  };

  const cancelSelectionMode = () => {
    if (bulkDeleting) return;
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const formatPrice = (price) => {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) return "No price";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(numericPrice);
  };

  const sortMark = (key) => {
    if (sort.key !== key) return "";
    return sort.direction === "asc" ? " ↑" : " ↓";
  };

  return (
    <AdminLayout>
      <div className="p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-label tracking-widest uppercase text-slate/50 mb-1">Manage</p>
            <h1 className="font-display text-4xl font-light text-charcoal">Artworks</h1>
            <p className="text-sm text-slate/55 mt-2">
              Search, sort, and manage the public collection.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {!selectionMode ? (
              <button type="button" onClick={() => setSelectionMode(true)} className="btn-secondary self-start">
                Bulk Actions
              </button>
            ) : (
              <button type="button" onClick={cancelSelectionMode} className="btn-secondary self-start" disabled={bulkDeleting}>
                Cancel Selection Mode
              </button>
            )}
            <Link to="/admin/artworks/bulk" className="btn-secondary self-start">Bulk upload</Link>
            <Link to="/admin/artworks/new" className="btn-primary self-start">+ Add Artwork</Link>
          </div>
        </div>

        <div className="bg-white p-4 shadow-sm ring-1 ring-black/5 mb-6">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px_auto]">
            <div className="relative">
              <input
                type="text"
                placeholder="Search title, category, medium..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-9"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <select
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
              className="input-field"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available for Enquiry</option>
              <option value="not-available">Not Available for Enquiry</option>
            </select>

            <button
              type="button"
              onClick={() => { setSearch(""); setAvailability("all"); }}
              className="btn-secondary"
              disabled={!search && availability === "all"}
            >
              Clear
            </button>
          </div>
          <p className="mt-3 text-xs text-slate/50">
            Showing {visibleArtworks.length} of {filteredArtworks.length} matching artworks.
          </p>
        </div>

        {selectionMode && (
          <div className="mb-6 flex flex-col gap-3 border border-red-100 bg-red-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-charcoal" aria-live="polite">
              {bulkDeleteState === "running" || bulkDeleteState === "pausing" || bulkDeleteState === "stopping"
                ? `Deleting ${deleteProgress?.current || 0} of ${deleteProgress?.total || selectedCount}`
                : `${selectedCount} ${selectedCount === 1 ? "artwork" : "artworks"} selected across current filters/pages`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="btn-secondary text-xs"
                disabled={bulkDeleting}
              >
                Clear Selection
              </button>
              <button type="button" onClick={toggleSelectAllVisible} className="btn-secondary text-xs" disabled={!visibleIds.length || bulkDeleting}>
                {allVisibleSelected ? "Clear Current Page" : "Select Current Page"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(true)}
                className="btn-danger font-label uppercase tracking-wider disabled:opacity-40"
                disabled={bulkDeleting || selectedCount === 0}
              >
                Delete Selected
              </button>
            </div>
          </div>
        )}

        {deleteProgress && <div className="mb-6 border border-red-100 bg-red-50/60 px-4 py-3 text-sm" role="status" aria-live="polite">
          <p>Deleting {deleteProgress.current} of {deleteProgress.total}</p>
          <p className="mt-1 text-xs text-slate/60">{deleteProgress.completed} completed · {deleteProgress.failed} failed · {deleteProgress.pending} pending</p>
          <div className="mt-2 h-2 bg-gray-100"><div className="h-2 bg-red-600 transition-all" style={{ width: `${(deleteProgress.completed / deleteProgress.total) * 100}%` }} /></div>
        </div>}

        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : filteredArtworks.length === 0 ? (
          <div className="text-center py-16 bg-white shadow-sm ring-1 ring-black/5">
            <p className="font-display text-2xl text-charcoal mb-3">No artworks found</p>
            <p className="text-slate/50 text-sm mb-6">Try adjusting search or status filters.</p>
            <button type="button" onClick={() => { setSearch(""); setAvailability("all"); }} className="btn-secondary">
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="border-b border-gray-100">
                    {selectionMode && <th className="w-28 px-4 py-3 text-left">
                      <label className="inline-flex items-center gap-2 text-xs font-label uppercase tracking-widest text-slate/50">
                        <input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} disabled={!visibleIds.length || bulkDeleting} aria-label="Select all artworks currently visible on this page" className="h-4 w-4 accent-red-600" />
                        <span>Select Page</span>
                      </label>
                    </th>}
                    <th className="text-left px-4 py-3 text-xs font-label tracking-widest uppercase text-slate/50">Image</th>
                    {[
                      { key: "title", label: "Title" },
                      { key: "category", label: "Category", className: "hidden md:table-cell" },
                      { key: "price", label: "Price", className: "hidden lg:table-cell" },
                      { key: "isAvailable", label: "Status" },
                    ].map((column) => (
                      <th
                        key={column.key}
                        className={`text-left px-4 py-3 text-xs font-label tracking-widest uppercase text-slate/50 ${column.className || ""}`}
                      >
                        <button type="button" onClick={() => handleSort(column.key)} className="hover:text-charcoal">
                          {column.label}{sortMark(column.key)}
                        </button>
                      </th>
                    ))}
                    <th className="text-right px-4 py-3 text-xs font-label tracking-widest uppercase text-slate/50">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleArtworks.map((artwork) => (
                    <tr key={artwork._id} className={selectedIds.has(artwork._id) ? "bg-red-50/40 hover:bg-red-50/60 transition-colors" : "hover:bg-gray-50 transition-colors"}>
                      {selectionMode && <td className="px-4 py-3 align-middle">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(artwork._id)}
                          onChange={() => toggleArtworkSelection(artwork._id)}
                          disabled={bulkDeleting}
                          aria-label={`Select ${artwork.title?.trim() || "Untitled artwork"}`}
                          className="h-4 w-4 accent-red-600"
                        />
                      </td>}
                      <td className="px-4 py-3">
                        {artwork.images?.[0]?.url ? (
                          <img src={artwork.images[0].url} alt={artwork.title || "Untitled"} className="w-12 h-12 object-cover" />
                        ) : (
                          <div className="w-12 h-12 bg-gray-100 flex items-center justify-center text-xs text-slate/35">None</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-charcoal">{artwork.title?.trim() || "Untitled"}</p>
                        {artwork.isFeatured && (
                          <span className="text-[10px] font-label tracking-widest uppercase text-gold">Featured</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-slate/60">{artwork.category?.trim() || "Uncategorized"}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-slate/60">
                        {artwork.price === null || artwork.price === undefined || artwork.price === "" ? "No price" : formatPrice(artwork.price)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 font-label tracking-widest uppercase ${
                            artwork.isAvailable ? "bg-sage/15 text-sage" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {artwork.isAvailable ? "Available for Enquiry" : "Not Available for Enquiry"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/admin/artworks/${artwork._id}/edit`}
                            className="text-xs px-3 py-1.5 border border-gray-200 text-charcoal hover:bg-charcoal hover:text-white transition-colors font-label"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(artwork._id, artwork.title)}
                            disabled={deleting === artwork._id || bulkDeleting}
                            className="text-xs px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-colors font-label disabled:opacity-40"
                          >
                            {deleting === artwork._id ? "..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate/50">
                Page {page} of {pages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary text-xs disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page === pages}
                  className="btn-secondary text-xs disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteProgress && bulkDeleting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-progress-title">
            <div className="w-full max-w-md bg-white p-6 shadow-xl ring-1 ring-black/10">
              <h2 id="bulk-delete-progress-title" className="font-display text-2xl font-light text-charcoal">
                {bulkDeleteState === "paused" ? `Paused after ${deleteProgress.current} of ${deleteProgress.total}`
                  : bulkDeleteState === "stopped" ? `Stopped. ${deleteProgress.completed} deleted, ${deleteProgress.pending} pending, ${deleteProgress.failed} failed.`
                    : `Deleting artwork ${Math.min(deleteProgress.current, deleteProgress.total)} of ${deleteProgress.total}`}
              </h2>
              <div className="mt-5 h-2 bg-gray-100"><div className="h-2 bg-red-600 transition-all" style={{ width: `${(deleteProgress.completed / deleteProgress.total) * 100}%` }} /></div>
              <p className="mt-3 text-sm text-slate/60">{deleteProgress.completed} completed · {deleteProgress.failed} failed · {deleteProgress.pending} pending</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {(bulkDeleteState === "running" || bulkDeleteState === "pausing") && <button type="button" onClick={pauseBulkDelete} className="btn-secondary" disabled={bulkDeleteState !== "running"}>Pause</button>}
                {(bulkDeleteState === "paused" || bulkDeleteState === "stopped") && <button type="button" onClick={resumeBulkDelete} className="btn-primary" disabled={!selectedCount}>Resume</button>}
                {(bulkDeleteState === "running" || bulkDeleteState === "pausing" || bulkDeleteState === "paused") && <button type="button" onClick={stopBulkDelete} className="btn-danger" disabled={bulkDeleteState === "pausing"}>Stop after current</button>}
              </div>
              {(bulkDeleteState === "pausing" || bulkDeleteState === "stopping") && <p className="mt-4 text-center text-xs text-slate/55">Finishing the current delete safely…</p>}
            </div>
          </div>
        )}

        {deleteSummary && !bulkDeleting && (
          <div className="fixed bottom-5 right-5 z-40 bg-charcoal px-5 py-3 text-sm text-white shadow-lg" role="status">
            {deleteSummary.deleted} deleted, {deleteSummary.failed} failed
          </div>
        )}

        {confirmBulkDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-title"
          >
            <div className="w-full max-w-md bg-white p-6 shadow-xl ring-1 ring-black/10">
              <h2 id="bulk-delete-title" className="font-display text-2xl font-light text-charcoal">
                Delete {selectedCount} {selectedCount === 1 ? "artwork" : "artworks"}?
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate/65">
                This action cannot be undone. The selected artworks and their associated images will be permanently deleted.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(false)}
                  className="btn-secondary"
                  disabled={bulkDeleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="btn-danger disabled:opacity-40"
                  disabled={bulkDeleting || selectedCount === 0}
                >
                  {bulkDeleting ? "Deleting..." : `Delete ${selectedCount} ${selectedCount === 1 ? "Artwork" : "Artworks"}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default ArtworksPage;
