// pages/admin/ArtworksPage.jsx
// List all artworks with search, sort, pagination, edit/delete, and add new button.

import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout";
import { artworkAPI } from "../../services/api";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import toast from "react-hot-toast";

const PAGE_SIZE = 10;

const ArtworksPage = () => {
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState({ key: "createdAt", direction: "desc" });
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(null);

  const fetchArtworks = async () => {
    setLoading(true);
    try {
      const res = await artworkAPI.getAll({ limit: 200 });
      setArtworks(res.data.artworks || []);
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

  const handleSort = (key) => {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await artworkAPI.delete(id);
      setArtworks((prev) => prev.filter((a) => a._id !== id));
      toast.success("Artwork deleted");
    } catch {
      toast.error("Failed to delete artwork");
    } finally {
      setDeleting(null);
    }
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
                    <tr key={artwork._id} className="hover:bg-gray-50 transition-colors">
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
                            disabled={deleting === artwork._id}
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
      </div>
    </AdminLayout>
  );
};

export default ArtworksPage;
