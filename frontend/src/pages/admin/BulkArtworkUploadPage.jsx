import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import AdminLayout from "../../components/admin/AdminLayout";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { artworkAPI, publicSnapshotAPI } from "../../services/api";
import { notifyArtworksChanged } from "../../services/artworkRefresh";

const SESSION_KEY = "artworkUploadSession.v1";
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const delay = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const UPLOAD_CONCURRENCY = 5;
const fileHash = async (file) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())))
  .map((byte) => byte.toString(16).padStart(2, "0")).join("");

const optimizeImage = async (file) => {
  if (!file.type.startsWith("image/") || file.size < 2 * 1024 * 1024 || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 3000;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
};

const newItem = (file, uploadBatchId) => ({
  id: crypto.randomUUID(),
  clientUploadId: crypto.randomUUID(),
  uploadBatchId,
  file,
  fileName: file.name,
  fileSize: file.size,
  preview: URL.createObjectURL(file),
  status: "waiting",
  artworkId: "",
  error: "",
  contentHash: "",
});

const readSession = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!saved?.items?.length) return [];
    return saved.items.map((item) => ({
      ...item,
      id: item.clientUploadId,
      file: null,
      preview: "",
      status: item.status === "success" ? "success" : item.status === "stopped" ? "stopped" : "checking",
      error: item.status === "success" ? "" : "Checking whether this artwork reached the server…",
    }));
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return [];
  }
};

const persistedItem = ({ clientUploadId, uploadBatchId, fileName, fileSize, status, artworkId, error }) => ({
  clientUploadId,
  uploadBatchId,
  fileName,
  fileSize,
  status,
  artworkId,
  error,
});

const formatBytes = (size) => size < 1024 * 1024
  ? `${Math.max(1, Math.round(size / 1024))} KB`
  : `${(size / (1024 * 1024)).toFixed(1)} MB`;

const BulkArtworkUploadPage = () => {
  const [items, setItems] = useState(readSession);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadState, setUploadState] = useState("idle");
  const [activeNumber, setActiveNumber] = useState(0);
  const [duplicateScan, setDuplicateScan] = useState(null);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [duplicateScanProgress, setDuplicateScanProgress] = useState(0);
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState([]);
  const [scanStopped, setScanStopped] = useState(false);
  const inputRef = useRef(null);
  const resumeInputRef = useRef(null);
  const itemsRef = useRef(items);
  const restoredRef = useRef(items.some((item) => !item.file));
  const uploadControlRef = useRef({ pause: false, stop: false });
  const uploadSelectionRef = useRef([]);
  const duplicateScanControlRef = useRef({ stop: false, offset: 0, unavailable: 0 });

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => itemsRef.current.forEach((item) => item.preview && URL.revokeObjectURL(item.preview)), []);
  useEffect(() => {
    const incomplete = items.some((item) => item.status !== "success");
    if (!items.length || !incomplete) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      uploadBatchId: items[0]?.uploadBatchId,
      timestamp: new Date().toISOString(),
      items: items.map(persistedItem),
    }));
  }, [items]);

  const updateItem = (id, changes) => {
    setItems((current) => {
      const next = current.map((item) => item.id === id || item.clientUploadId === id ? { ...item, ...changes } : item);
      itemsRef.current = next;
      return next;
    });
  };

  const serverStatus = async (item) => {
    const response = await artworkAPI.uploadStatus(item.clientUploadId);
    return response.data.exists ? response.data.artwork : null;
  };

  const markFromServer = async (item, missingStatus = "failed") => {
    try {
      const artwork = await serverStatus(item);
      if (artwork) {
        updateItem(item.id, { status: "success", artworkId: artwork._id, error: "" });
        return "success";
      }
      updateItem(item.id, {
        status: missingStatus,
        error: missingStatus === "failed"
          ? "The server confirmed this artwork was not created."
          : "Select this file again to continue.",
      });
      return "missing";
    } catch {
      updateItem(item.id, { status: "checking", error: "Server status is not available yet." });
      return "unknown";
    }
  };

  const verifyUncertainUpload = async (item) => {
    updateItem(item.id, { status: "checking", error: "Checking whether the server completed this upload…" });
    if (!navigator.onLine) {
      await new Promise((resolve) => window.addEventListener("online", resolve, { once: true }));
    }
    for (const wait of [1200, 2500, 5000]) {
      await delay(wait);
      const outcome = await markFromServer(item, "checking");
      if (outcome === "success") return;
      if (outcome === "unknown") continue;
    }
    await markFromServer(item, "failed");
  };

  const uploadOne = async (item, preflight = false) => {
    if (!item.file) {
      updateItem(item.id, { status: "waiting", error: "Select this file again to continue." });
      return;
    }
    if (preflight) {
      const result = await markFromServer(item, "waiting");
      if (result === "success" || result === "unknown") return;
    }

    updateItem(item.id, { status: "uploading", error: "" });
    const position = itemsRef.current.findIndex((entry) => entry.clientUploadId === item.clientUploadId);
    setActiveNumber(position + 1);
    const data = new FormData();
    data.append("clientIds", item.clientUploadId);
    data.append("uploadBatchId", item.uploadBatchId);
    data.append("batchSize", String(itemsRef.current.length));
    data.append("images", await optimizeImage(item.file));

    try {
      const response = await artworkAPI.bulkUpload(data, { params: { deferPublicSync: true } });
      const result = response.data.results?.[0];
      if (result?.status === "successful") {
        updateItem(item.id, { status: "success", artworkId: result.artwork?._id || "", error: "" });
        notifyArtworksChanged();
      } else if (result?.status === "duplicate") {
        updateItem(item.id, { status: "duplicate", artworkId: result.duplicateOf?._id || "", error: result.message || "Duplicate skipped." });
      } else {
        updateItem(item.id, { status: "checking", error: "Verifying the server result…" });
        await markFromServer(item, "failed");
      }
    } catch (error) {
      await verifyUncertainUpload(item);
      if (error.response?.status === 401) throw error;
    }
  };

  const uploadItems = async (selected, preflight = false) => {
    if (!selected.length || uploading) return;
    uploadControlRef.current = { pause: false, stop: false };
    uploadSelectionRef.current = selected;
    setUploading(true);
    setUploadState("running");
    try {
      let cursor = 0;
      const worker = async () => {
        while (cursor < selected.length) {
          if (uploadControlRef.current.pause || uploadControlRef.current.stop) return;
          const item = selected[cursor++];
          await uploadOne(item, preflight);
        }
      };
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, selected.length) }, worker));
      const latest = itemsRef.current;
      const interrupted = uploadControlRef.current.pause || uploadControlRef.current.stop;
      if (interrupted) {
        if (uploadControlRef.current.stop) {
          const selectedIds = new Set(selected.map((item) => item.clientUploadId));
          setItems((current) => current.map((item) => selectedIds.has(item.clientUploadId) && item.status === "waiting"
            ? { ...item, status: "stopped", error: "Stopped before upload started." } : item));
          setUploadState("stopped");
        } else setUploadState("paused");
        if (uploadControlRef.current.stop && latest.some((item) => item.status === "success")) {
          try { await publicSnapshotAPI.sync("bulk-upload-stopped"); } catch { toast.error("Artwork changes were saved, but public Gallery synchronization failed."); }
        }
        return;
      }
      const summaryBatchId = latest[0]?.uploadBatchId;
      if (summaryBatchId) {
        try {
          await artworkAPI.updateBatchSummary(summaryBatchId, {
            selected: latest.length,
            successful: latest.filter((item) => item.status === "success").length,
            failed: latest.filter((item) => item.status === "failed").length,
          });
        } catch {
          toast.error("Artworks finished, but the batch summary could not be refreshed.");
        }
      }
      if (latest.some((item) => item.status === "success")) {
        try {
          await publicSnapshotAPI.sync("bulk-upload-completed");
        } catch {
          toast.error("Artwork changes were saved, but public Gallery synchronization failed.");
        }
      }
      toast.success("Upload processing complete.");
    } catch {
      toast.error("Upload session paused. Sign in again to continue safely.");
    } finally {
      setUploading(false);
      setActiveNumber(0);
      if (!uploadControlRef.current.pause && !uploadControlRef.current.stop) uploadSelectionRef.current = [];
      if (uploadControlRef.current.pause && !uploadControlRef.current.stop) setUploadState("paused");
    }
  };

  const pauseUploads = () => { uploadControlRef.current.pause = true; setUploadState("pausing"); };
  const stopUploads = () => {
    uploadControlRef.current.stop = true;
    uploadControlRef.current.pause = false;
    if (!uploading) {
      const selectedIds = new Set(uploadSelectionRef.current.map((item) => item.clientUploadId));
      setItems((current) => current.map((item) => selectedIds.has(item.clientUploadId) && item.status === "waiting"
        ? { ...item, status: "stopped", error: "Stopped before upload started." } : item));
      setUploadState("stopped");
    } else setUploadState("stopping");
  };
  const resumeUploads = () => {
    const resumable = itemsRef.current.filter((item) => (item.status === "waiting" || item.status === "stopped") && item.file);
    if (!resumable.length) return;
    setItems((current) => current.map((item) => item.status === "stopped" ? { ...item, status: "waiting", error: "" } : item));
    uploadItems(resumable);
  };

  useEffect(() => {
    if (!restoredRef.current) return;
    restoredRef.current = false;
    const reconcile = async () => {
      for (const item of itemsRef.current.filter((entry) => entry.status !== "success")) {
        await markFromServer(item, "waiting");
      }
    };
    reconcile();
  }, []);

  const validateFiles = (fileList) => {
    const picked = Array.from(fileList || []);
    const invalid = picked.find((file) => !ACCEPTED_TYPES.has(file.type));
    if (invalid) {
      toast.error(`${invalid.name}: use JPG, PNG, WebP, or AVIF.`);
      return [];
    }
    return picked;
  };

  const addFiles = (fileList) => {
    if (uploading) return;
    const picked = validateFiles(fileList);
    if (!picked.length) return;
    const currentBatch = itemsRef.current[0]?.uploadBatchId;
    const uploadBatchId = currentBatch || crypto.randomUUID();
    Promise.all(picked.map(async (file) => ({ file, hash: await fileHash(file) }))).then((hashed) => {
      setItems((current) => {
        const known = new Set(current.map((item) => item.contentHash).filter(Boolean));
        return [...current, ...hashed.map(({ file, hash }) => {
          const item = newItem(file, uploadBatchId);
          item.contentHash = hash;
          if (known.has(hash)) {
            item.status = "duplicate";
            item.error = "Duplicate in this selection; it will not be uploaded.";
          } else known.add(hash);
          return item;
        })];
      });
    }).catch(() => toast.error("One or more selected files could not be checked."));
  };

  const attachRemainingFiles = (fileList) => {
    const picked = validateFiles(fileList);
    if (!picked.length) return;
    let matched = 0;
    setItems((current) => current.map((item) => {
      if (item.status === "success" || item.file) return item;
      const index = picked.findIndex((file) => file.name === item.fileName && file.size === item.fileSize);
      if (index < 0) return item;
      const [file] = picked.splice(index, 1);
      matched += 1;
      return { ...item, file, preview: URL.createObjectURL(file), status: "waiting", error: "" };
    }));
    window.setTimeout(() => toast.success(`${matched} remaining file${matched === 1 ? "" : "s"} matched.`), 0);
  };

  const clearAll = () => {
    if (uploading) return;
    items.forEach((item) => item.preview && URL.revokeObjectURL(item.preview));
    setItems([]);
  };
  const removeItem = (id) => {
    if (uploading) return;
    setItems((current) => {
      const item = current.find((entry) => entry.id === id || entry.clientUploadId === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return current.filter((entry) => entry !== item);
    });
  };

  const waitingItems = items.filter((item) => item.status === "waiting" && item.file);
  const stoppedItems = items.filter((item) => item.status === "stopped" && item.file);
  const incompleteWithoutFiles = items.filter((item) => item.status !== "success" && !item.file);
  const failedItems = items.filter((item) => item.status === "failed" && item.file);
  const checkingItems = items.filter((item) => item.status === "checking");
  const successCount = items.filter((item) => item.status === "success").length;
  const duplicateCount = items.filter((item) => item.status === "duplicate").length;
  const uniqueSelectionCount = items.length - duplicateCount;
  const checkingCount = items.filter((item) => item.status === "checking").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const stoppedCount = items.filter((item) => item.status === "stopped").length;
  const remainingCount = items.filter((item) => item.status === "waiting").length;
  const finishedCount = successCount + duplicateCount + failedCount;
  const progress = items.length ? Math.round((finishedCount / items.length) * 100) : 0;

  const scanExistingDuplicates = async () => {
    duplicateScanControlRef.current.stop = false;
    setScanningDuplicates(true);
    setScanStopped(false);
    if (!duplicateScanControlRef.current.offset) setDuplicateScanProgress(0);
    try {
      let offset = duplicateScanControlRef.current.offset;
      let unavailable = duplicateScanControlRef.current.unavailable;
      let result;
      do {
        const response = await artworkAPI.scanDuplicates(offset, 25);
        result = response.data;
        unavailable += result.unavailable || 0;
        offset = result.nextOffset;
        duplicateScanControlRef.current = { stop: duplicateScanControlRef.current.stop, offset, unavailable };
        setDuplicateScanProgress(result.total ? Math.round((offset / result.total) * 100) : 100);
      } while (!result.complete && !duplicateScanControlRef.current.stop);
      if (duplicateScanControlRef.current.stop && !result.complete) {
        setScanStopped(true);
        toast.success(`Scan stopped safely at ${offset} of ${result.total} artworks.`);
        return;
      }
      result.unavailable = unavailable;
      setDuplicateScan(result);
      setSelectedDuplicateIds(result.duplicateGroups.flatMap((group) => group.duplicates.map((artwork) => String(artwork._id))));
      duplicateScanControlRef.current = { stop: false, offset: 0, unavailable: 0 };
      toast.success(result.duplicateCount ? `${result.duplicateCount} duplicates found.` : "No duplicates found.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Duplicate scan failed.");
    } finally { setScanningDuplicates(false); }
  };

  const stopDuplicateScan = () => { duplicateScanControlRef.current.stop = true; };

  const removeExistingDuplicates = async (ids = selectedDuplicateIds) => {
    if (!ids.length) return;
    if (!window.confirm(`Remove ${ids.length} selected duplicate artwork${ids.length === 1 ? "" : "s"}? Protected originals will be kept.`)) return;
    setScanningDuplicates(true);
    try {
      const response = await artworkAPI.removeDuplicates(ids);
      toast.success(response.data.message || "Duplicates removed.");
      notifyArtworksChanged();
      setDuplicateScan(null);
      setDuplicateScanProgress(0);
    } catch (error) {
      toast.error(error.response?.data?.message || "Duplicates could not be removed.");
    } finally { setScanningDuplicates(false); }
  };

  const allDuplicateIds = duplicateScan?.duplicateGroups?.flatMap((group) => group.duplicates.map((artwork) => String(artwork._id))) || [];
  const toggleDuplicate = (id) => setSelectedDuplicateIds((current) => current.includes(id)
    ? current.filter((value) => value !== id)
    : [...current, id]);
  const formatArtworkDate = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Date unavailable";
  const duplicateReview = duplicateScan?.duplicateGroups?.length > 0 && <section className="mb-8 space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-display text-2xl text-charcoal">Duplicate artwork groups</h2><p className="mt-1 text-sm text-slate/60">Review confirmed matches. Originals are protected and cannot be selected.</p></div><div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={() => setSelectedDuplicateIds(selectedDuplicateIds.length === allDuplicateIds.length ? [] : allDuplicateIds)}>{selectedDuplicateIds.length === allDuplicateIds.length ? "Clear selection" : "Select all duplicates"}</button><button type="button" className="btn-danger" disabled={!selectedDuplicateIds.length || scanningDuplicates} onClick={() => removeExistingDuplicates(selectedDuplicateIds)}>Remove selected ({selectedDuplicateIds.length})</button></div></div>{duplicateScan.duplicateGroups.map((group, groupIndex) => <article key={String(group.keep._id)} className="border border-gray-200 bg-white p-4"><p className="mb-3 text-xs font-label uppercase tracking-wider text-slate/55">Group {groupIndex + 1} · {group.reason}</p><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"><div className="flex gap-3 border border-green-200 bg-green-50 p-3"><img src={group.keep.images?.[0]?.url} alt="" className="h-20 w-20 flex-none object-cover" /><div className="min-w-0"><span className="text-xs font-label uppercase tracking-wider text-green-700">Keep original</span><p className="mt-1 truncate font-medium text-charcoal">{group.keep.title}</p><p className="text-xs text-slate/55">{group.keep.originalFilename || "Original filename unavailable"}</p><p className="text-xs text-slate/55">{formatArtworkDate(group.keep.createdAt)}</p><Link className="mt-2 inline-block text-xs text-blue-600 hover:underline" to={`/admin/artworks/${group.keep._id}/edit`}>View artwork</Link></div></div>{group.duplicates.map((artwork) => { const id = String(artwork._id); return <label key={id} className="flex cursor-pointer gap-3 border border-amber-200 bg-amber-50 p-3"><input type="checkbox" className="mt-1" checked={selectedDuplicateIds.includes(id)} onChange={() => toggleDuplicate(id)} /><img src={artwork.images?.[0]?.url} alt="" className="h-20 w-20 flex-none object-cover" /><div className="min-w-0"><span className="text-xs font-label uppercase tracking-wider text-amber-700">Duplicate</span><p className="mt-1 truncate font-medium text-charcoal">{artwork.title}</p><p className="truncate text-xs text-slate/55">{artwork.originalFilename || "Original filename unavailable"}</p><p className="text-xs text-slate/55">{formatArtworkDate(artwork.createdAt)}</p><Link className="mt-2 inline-block text-xs text-blue-600 hover:underline" to={`/admin/artworks/${artwork._id}/edit`} onClick={(event) => event.stopPropagation()}>View artwork</Link></div></label>; })}</div></article>)}</section>;

  return <AdminLayout><div className="mx-auto max-w-6xl p-6 md:p-8">
    {(scanningDuplicates || scanStopped) && <div className="mb-4 flex items-center justify-between border border-amber-200 bg-amber-50 p-3"><p className="text-sm text-charcoal">{scanningDuplicates ? `Scanning existing artworks… ${duplicateScanProgress}%` : `Scan stopped at ${duplicateScanProgress}%. Resume when ready.`}</p>{scanningDuplicates ? <button type="button" className="btn-danger" onClick={stopDuplicateScan}>Stop scan</button> : <button type="button" className="btn-primary" onClick={scanExistingDuplicates}>Resume scan</button>}</div>}
    {duplicateReview}
    {allDuplicateIds.length > 0 && <div className="mb-6 flex justify-end"><button type="button" className="btn-danger" disabled={scanningDuplicates} onClick={() => removeExistingDuplicates(allDuplicateIds)}>Remove all {allDuplicateIds.length} duplicates</button></div>}
    {items.length > 0 && <div className="mb-4 grid grid-cols-2 gap-3"><div className="border border-green-200 bg-green-50 p-3"><p className="text-xs font-label uppercase tracking-wider text-green-700">Unique / ready</p><p className="mt-1 text-2xl text-charcoal">{uniqueSelectionCount}</p></div><div className="border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-label uppercase tracking-wider text-amber-700">Duplicates</p><p className="mt-1 text-2xl text-charcoal">{duplicateCount}</p></div></div>}
    <section className="mb-6 border border-gray-100 bg-white p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-medium text-charcoal">Automatic duplicate protection</h2><p className="mt-1 text-sm text-slate/60">New duplicates are skipped automatically. Scan the existing library to find older duplicates and keep the oldest original.</p></div><div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={scanningDuplicates || uploading} onClick={scanExistingDuplicates}>{scanningDuplicates ? "Checking…" : "Scan existing artworks"}</button>{duplicateScan?.duplicateCount > 0 && <button type="button" className="btn-danger" disabled={scanningDuplicates || uploading} onClick={removeExistingDuplicates}>Remove {duplicateScan.duplicateCount} duplicates</button>}</div></div>{duplicateScan && <p className="mt-3 text-sm text-slate/65">Checked {duplicateScan.scanned} artworks · {duplicateScan.duplicateCount} duplicates in {duplicateScan.duplicateGroups.length} groups{duplicateScan.unavailable ? ` · ${duplicateScan.unavailable} images could not be checked` : ""}</p>}</section>
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><Link to="/admin/artworks" className="text-sm text-slate/55 hover:text-charcoal">← Artworks</Link><h1 className="mt-3 font-display text-3xl font-light text-charcoal">Bulk upload artworks</h1><p className="mt-2 text-sm text-slate/60">Choose any number of images. They upload strictly one at a time.</p></div><Link to="/admin/artworks/new" className="btn-secondary self-start">Single artwork upload</Link></div>
    {incompleteWithoutFiles.length > 0 && <div className="mb-6 border border-amber-200 bg-amber-50 p-4"><h2 className="font-medium text-charcoal">Interrupted upload session</h2><p className="mt-1 text-sm text-slate/65">Server records were checked. Your browser cannot retain local files after a refresh, so select the remaining files to continue.</p><input ref={resumeInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => { attachRemainingFiles(event.target.files); event.target.value = ""; }} /><button type="button" className="btn-secondary mt-3" onClick={() => resumeInputRef.current?.click()}>Select remaining files to continue</button></div>}
    <input ref={inputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
    <div className={`border-2 border-dashed p-8 text-center ${dragging ? "border-gold bg-gold/5" : "border-charcoal/20 bg-white"}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}><p className="font-display text-2xl text-charcoal">Drop artwork images here</p><p className="mt-2 text-sm text-slate/60">JPG, PNG, WebP, or AVIF · no file-count limit</p><button type="button" className="btn-primary mt-5" onClick={() => inputRef.current?.click()} disabled={uploading}>Choose images</button></div>
    {items.length > 0 && <><div className="mt-6 flex flex-col gap-4 border-y border-gray-100 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-slate/65"><strong className="text-charcoal">{uploading ? "Uploading artworks" : uploadState === "paused" ? "Upload paused" : uploadState === "stopped" ? "Upload stopped" : "Artwork upload batch"}</strong></p><p className="mt-1 text-xs text-slate/60">{uploading && activeNumber ? `Uploading ${activeNumber} of ${items.length} · ` : ""}{successCount} completed · {failedCount} failed · {remainingCount} pending · {stoppedCount} stopped</p></div><div className="flex flex-wrap gap-3"><button type="button" className="btn-secondary" onClick={clearAll} disabled={uploading || uploadState === "paused" || uploadState === "stopping"}>Clear all</button>{uploading && uploadState === "running" && <><button type="button" className="btn-secondary" onClick={pauseUploads}>Pause</button><button type="button" className="btn-danger" onClick={stopUploads}>Stop</button></>}{uploadState === "paused" && <><button type="button" className="btn-primary" onClick={resumeUploads}>Resume</button><button type="button" className="btn-danger" onClick={stopUploads}>Stop</button></>}{uploadState === "stopped" && stoppedItems.length > 0 && <button type="button" className="btn-primary" onClick={resumeUploads}>Resume stopped</button>}{failedItems.length > 0 && <button type="button" className="btn-secondary" onClick={() => uploadItems(failedItems, true)} disabled={uploading}>Retry failed uploads ({failedItems.length})</button>}<button type="button" className="btn-primary flex items-center gap-2" onClick={() => uploadItems(waitingItems)} disabled={uploading || !waitingItems.length}>{uploading && <LoadingSpinner size="sm" light />}{uploading ? "Uploading…" : `Upload all${waitingItems.length ? ` (${waitingItems.length})` : ""}`}</button></div></div><div className="mt-4 h-2 overflow-hidden bg-gray-100"><div className="h-full bg-gold transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-slate/50" aria-live="polite">{items.length === successCount ? `${successCount} artworks uploaded successfully.` : `${progress}% confirmed complete`}</p><div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <article key={item.clientUploadId} className="flex gap-3 border border-gray-100 bg-white p-3">{item.preview ? <img src={item.preview} alt="" className="h-20 w-20 flex-none object-cover" /> : <div className="flex h-20 w-20 flex-none items-center justify-center bg-gray-100 text-xs text-slate/40">File needed</div>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-charcoal" title={item.fileName}>{item.fileName}</p><p className="mt-1 text-xs text-slate/50">{formatBytes(item.fileSize)}</p><p className={`mt-2 text-xs font-label uppercase tracking-wider ${item.status === "failed" ? "text-red-600" : item.status === "success" ? "text-green-700" : item.status === "checking" ? "text-amber-600" : item.status === "uploading" ? "text-gold" : item.status === "stopped" ? "text-red-500" : "text-slate/50"}`}>{item.status}</p>{item.error && <p className="mt-1 text-xs text-red-600">{item.error}</p>}</div>{!uploading && <button type="button" onClick={() => removeItem(item.clientUploadId)} className="self-start text-xs text-red-600 hover:underline">Remove</button>}</article>)}</div></>}
  </div></AdminLayout>;
};

export default BulkArtworkUploadPage;
