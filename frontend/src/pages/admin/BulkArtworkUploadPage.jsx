import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import AdminLayout from "../../components/admin/AdminLayout";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { artworkAPI } from "../../services/api";

const MAX_ARTWORKS = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

const formatBytes = (size) => {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const createItem = (file) => ({
  id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  file,
  preview: URL.createObjectURL(file),
  status: "pending",
  error: "",
});

const BulkArtworkUploadPage = () => {
  const [items, setItems] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const inputRef = useRef(null);
  const itemsRef = useRef([]);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);

  const addFiles = (fileList) => {
    const picked = Array.from(fileList || []);
    if (!picked.length || uploading) return;
    if (items.length + picked.length > MAX_ARTWORKS) {
      toast.error(`You can select up to ${MAX_ARTWORKS} images per batch. No images were added.`);
      return;
    }

    const invalid = picked.find((file) => !ACCEPTED_TYPES.has(file.type) || file.size > MAX_FILE_SIZE);
    if (invalid) {
      const reason = invalid.size > MAX_FILE_SIZE
        ? "Each image must be 10 MB or smaller"
        : "Only JPG, PNG, WebP, and AVIF images are supported";
      toast.error(`${invalid.name}: ${reason}. No images were added.`);
      return;
    }
    setItems((current) => [...current, ...picked.map(createItem)]);
  };

  const removeItem = (id) => {
    if (uploading) return;
    setItems((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return current.filter((entry) => entry.id !== id);
    });
  };

  const clearAll = () => {
    if (uploading) return;
    items.forEach((item) => URL.revokeObjectURL(item.preview));
    setItems([]);
  };

  const uploadItems = async (selectedItems) => {
    if (!selectedItems.length || uploading) return;
    setUploading(true);
    setUploadPercent(0);
    const selectedIds = new Set(selectedItems.map((item) => item.id));
    setItems((current) => current.map((item) => selectedIds.has(item.id)
      ? { ...item, status: "uploading", error: "" }
      : item));

    const data = new FormData();
    selectedItems.forEach((item) => {
      data.append("images", item.file);
      data.append("clientIds", item.id);
    });

    try {
      const response = await artworkAPI.bulkUpload(data, {
        onUploadProgress: (event) => {
          if (event.total) {
            // The first half is browser-to-server transfer; Cloudinary processing
            // completes before the final response marks individual items done.
            setUploadPercent(Math.round((event.loaded / event.total) * 50));
          }
        },
      });
      const resultById = new Map(response.data.results.map((result) => [result.clientId, result]));
      setItems((current) => current.map((item) => {
        const result = resultById.get(item.id);
        if (!result) return item;
        return {
          ...item,
          status: result.status,
          error: result.error || "",
        };
      }));
      const { successful, failed } = response.data;
      setUploadPercent(100);
      toast.success(`${successful} artwork${successful === 1 ? "" : "s"} uploaded${failed ? `; ${failed} failed` : ""}.`);
    } catch (error) {
      const message = error.response?.data?.message || "Upload failed. Please retry the affected images.";
      setItems((current) => current.map((item) => selectedIds.has(item.id)
        ? { ...item, status: "failed", error: message }
        : item));
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const pending = items.filter((item) => item.status === "pending");
  const failed = items.filter((item) => item.status === "failed");
  const complete = items.filter((item) => item.status === "successful").length;
  const progress = uploading ? uploadPercent : items.length ? Math.round((complete / items.length) * 100) : 0;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl p-6 md:p-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link to="/admin/artworks" className="text-sm text-slate/55 hover:text-charcoal">← Artworks</Link>
            <h1 className="mt-3 font-display text-3xl font-light text-charcoal">Bulk upload artworks</h1>
            <p className="mt-2 text-sm text-slate/60">Add 1–50 images. Each image becomes an artwork with a clean title based on its filename; you can edit details later.</p>
          </div>
          <Link to="/admin/artworks/new" className="btn-secondary self-start">Single artwork upload</Link>
        </div>

        <input ref={inputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
        <div
          className={`border-2 border-dashed p-8 text-center transition-colors ${dragging ? "border-gold bg-gold/5" : "border-charcoal/20 bg-white"}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
        >
          <p className="font-display text-2xl text-charcoal">Drop artwork images here</p>
          <p className="mt-2 text-sm text-slate/60">JPG, PNG, WebP, or AVIF · up to 10 MB each · maximum {MAX_ARTWORKS} images</p>
          <button type="button" className="btn-primary mt-5" onClick={() => inputRef.current?.click()} disabled={uploading}>Choose images</button>
        </div>

        {items.length > 0 && <>
          <div className="mt-6 flex flex-col gap-4 border-y border-gray-100 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate/65"><strong className="text-charcoal">{items.length}</strong> of {MAX_ARTWORKS} selected · {complete} uploaded{failed.length ? ` · ${failed.length} failed` : ""}</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-secondary" onClick={clearAll} disabled={uploading}>Clear all</button>
              {failed.length > 0 && <button type="button" className="btn-secondary" onClick={() => uploadItems(failed)} disabled={uploading}>Retry failed ({failed.length})</button>}
              <button type="button" className="btn-primary flex items-center gap-2" onClick={() => uploadItems(pending)} disabled={uploading || !pending.length}>
                {uploading && <LoadingSpinner size="sm" light />}{uploading ? "Uploading…" : `Upload all${pending.length ? ` (${pending.length})` : ""}`}
              </button>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden bg-gray-100" aria-label={`${progress}% uploaded`}><div className="h-full bg-gold transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-2 text-xs text-slate/50" aria-live="polite">{uploading ? `Uploading batch: ${progress}%` : `${progress}% complete`}</p>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => <article key={item.id} className="flex gap-3 border border-gray-100 bg-white p-3">
              <img src={item.preview} alt="" className="h-20 w-20 flex-none object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-charcoal" title={item.file.name}>{item.file.name}</p>
                <p className="mt-1 text-xs text-slate/50">{formatBytes(item.file.size)}</p>
                <p className={`mt-2 text-xs font-label uppercase tracking-wider ${item.status === "failed" ? "text-red-600" : item.status === "successful" ? "text-green-700" : item.status === "uploading" ? "text-gold" : "text-slate/50"}`}>{item.status}</p>
                {item.error && <p className="mt-1 text-xs text-red-600">{item.error}</p>}
              </div>
              {item.status !== "uploading" && <button type="button" onClick={() => removeItem(item.id)} disabled={uploading} className="self-start text-xs text-red-600 hover:underline">Remove</button>}
            </article>)}
          </div>
        </>}
      </div>
    </AdminLayout>
  );
};

export default BulkArtworkUploadPage;
