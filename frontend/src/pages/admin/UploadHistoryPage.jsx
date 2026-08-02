import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import AdminLayout from "../../components/admin/AdminLayout";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { artworkAPI } from "../../services/api";

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

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [history, batchResponse] = await Promise.all([
          artworkAPI.uploadHistory({ ...filters, page, limit: 20 }),
          artworkAPI.uploadBatches(),
        ]);
        if (active) {
          setData(history.data);
          setBatches(batchResponse.data.batches || []);
        }
      } catch {
        if (active) toast.error("Failed to load upload history");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [page, filters]);

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

  return <AdminLayout><div className="p-6 md:p-8">
    <div className="mb-8"><p className="text-xs font-label uppercase tracking-widest text-slate/50">Admin</p><h1 className="mt-1 font-display text-4xl font-light text-charcoal">Upload History</h1><p className="mt-2 text-sm text-slate/55">Review artwork uploads, batches, and confirmed statuses in India time.</p></div>

    {batches.length > 0 && <section className="mb-7"><h2 className="mb-3 font-display text-2xl font-light text-charcoal">Recent batches</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{batches.slice(0, 9).map((batch) => <article key={batch.uploadBatchId} className="bg-white p-4 shadow-sm ring-1 ring-black/5"><p className="font-medium text-charcoal">Batch: {dateFormat(batch.uploadedAt)}</p><p className="mt-2 text-sm text-slate/60">{batch.total} artworks selected</p><p className="mt-1 text-sm"><span className="text-green-700">{batch.successful} successful</span><span className="mx-2 text-slate/30">·</span><span className={batch.failed ? "text-red-600" : "text-slate/55"}>{batch.failed} failed</span></p><button type="button" className="mt-3 text-sm text-gold hover:underline" onClick={() => setFilter("batchId", batch.uploadBatchId)}>View batch</button></article>)}</div></section>}

    <div className="mb-6 space-y-3 bg-white p-4 shadow-sm ring-1 ring-black/5"><div className="grid gap-3 md:grid-cols-[1fr_180px_240px]"><input className="input-field" placeholder="Search by artwork title" value={filters.search} onChange={(event) => setFilter("search", event.target.value)} /><select className="input-field" value={filters.status} onChange={(event) => setFilter("status", event.target.value)}><option value="">All statuses</option><option value="success">Success</option><option value="failed">Failed</option></select><select className="input-field" value={filters.batchId} onChange={(event) => setFilter("batchId", event.target.value)}><option value="">All upload batches</option>{batches.map((batch) => <option key={batch.uploadBatchId} value={batch.uploadBatchId}>{dateFormat(batch.uploadedAt)} · {batch.total} selected</option>)}</select></div><div className="flex flex-wrap items-end gap-2"><button type="button" className="btn-secondary" onClick={() => choosePreset("today")}>Today</button><button type="button" className="btn-secondary" onClick={() => choosePreset("week")}>Last 7 days</button><button type="button" className="btn-secondary" onClick={() => choosePreset("month")}>This month</button><label className="text-xs text-slate/55">From<input type="date" className="input-field mt-1 block" value={filters.startDate} onChange={(event) => setFilter("startDate", event.target.value)} /></label><label className="text-xs text-slate/55">To<input type="date" className="input-field mt-1 block" value={filters.endDate} onChange={(event) => setFilter("endDate", event.target.value)} /></label>{(filters.startDate || filters.endDate || filters.batchId) && <button type="button" className="px-3 py-2 text-sm text-red-600 hover:underline" onClick={() => { setPage(1); setFilters((current) => ({ ...current, batchId: "", startDate: "", endDate: "" })); }}>Clear range/batch</button>}</div></div>

    {loading ? <div className="flex justify-center p-12"><LoadingSpinner size="lg" /></div> : <>{data.artworks.length === 0 ? <div className="bg-white p-10 text-center text-sm text-slate/55">No uploads match these filters.</div> : <><div className="hidden overflow-x-auto bg-white shadow-sm ring-1 ring-black/5 md:block"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wider text-slate/50"><tr><th className="p-4">Thumbnail</th><th className="p-4">Artwork title</th><th className="p-4">Category</th><th className="p-4">Uploaded on</th><th className="p-4">Upload batch</th><th className="p-4">Status</th><th className="p-4">Action</th></tr></thead><tbody>{data.artworks.map((artwork) => <tr key={artwork._id} className="border-t border-gray-100"><td className="p-4">{imageOf(artwork) ? <img src={imageOf(artwork)} alt="" className="h-12 w-12 object-cover" /> : <div className="h-12 w-12 bg-gray-100" />}</td><td className="p-4 font-medium text-charcoal">{artwork.title}</td><td className="p-4 text-slate/65">{artwork.category || "Uncategorized"}</td><td className="whitespace-nowrap p-4 text-slate/65">{dateFormat(artwork.createdAt)}</td><td className="p-4 text-xs text-slate/60">{artwork.uploadBatchId ? artwork.uploadBatchId.slice(0, 8) : "Older upload"}</td><td className="p-4"><span className={artwork.uploadStatus === "failed" ? "text-red-600" : "text-green-700"}>{artwork.uploadStatus || "success"}</span></td><td className="p-4"><Link className="whitespace-nowrap text-gold hover:underline" to={`/artwork/${artwork._id}`}>View Artwork</Link></td></tr>)}</tbody></table></div><div className="space-y-3 md:hidden">{data.artworks.map((artwork) => <article key={artwork._id} className="flex gap-4 bg-white p-4 shadow-sm">{imageOf(artwork) ? <img src={imageOf(artwork)} alt="" className="h-20 w-20 object-cover" /> : <div className="h-20 w-20 flex-none bg-gray-100" />}<div className="min-w-0 flex-1"><h2 className="font-medium text-charcoal">{artwork.title}</h2><p className="text-sm text-slate/60">{artwork.category || "Uncategorized"}</p><p className="mt-1 text-xs text-slate/55">{dateFormat(artwork.createdAt)}</p><p className="mt-1 text-xs text-slate/55">{artwork.uploadBatchId ? `Batch ${artwork.uploadBatchId.slice(0, 8)}` : "Older upload"}</p><p className={artwork.uploadStatus === "failed" ? "mt-2 text-xs text-red-600" : "mt-2 text-xs text-green-700"}>{artwork.uploadStatus || "success"}</p><Link className="mt-2 inline-block text-sm text-gold" to={`/artwork/${artwork._id}`}>View Artwork</Link></div></article>)}</div></>}<div className="mt-6 flex items-center justify-between text-sm text-slate/60"><span>{data.pagination.total || 0} uploads · Page {page} of {data.pagination.pages || 1}</span><div className="flex gap-2"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button className="btn-secondary" disabled={page >= (data.pagination.pages || 1)} onClick={() => setPage((current) => current + 1)}>Next</button></div></div></>}
  </div></AdminLayout>;
};

export default UploadHistoryPage;
