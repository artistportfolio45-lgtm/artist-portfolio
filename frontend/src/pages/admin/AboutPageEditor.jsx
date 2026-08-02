import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import AdminLayout from "../../components/admin/AdminLayout";
import LoadingSpinner, { PageLoader } from "../../components/shared/LoadingSpinner";
import { aboutAdminAPI } from "../../services/api";
import { cloudinaryThumbnailUrl } from "../../utils/imageDelivery";

const TABS = [
  ["hero", "Hero"], ["artistStatement", "Artist Statement"], ["biography", "Biography"],
  ["practices", "Artistic Practice"], ["timeline", "Timeline"], ["publicWorks", "Public Works"],
  ["awards", "Awards & Honours"], ["pressArchive", "Press & Archive"],
  ["closingCta", "Closing CTA"], ["seo", "Page Settings"],
];

const REPEATABLE = {
  practices: {
    label: "practice", titleKey: "title", defaults: { title: "New practice", description: "", link: "", visible: true },
    fields: [["title", "Title"], ["description", "Short description", "textarea"], ["link", "Gallery or collection link"]], imageKey: "image", visibilityKey: "visible",
  },
  timeline: {
    label: "timeline item", titleKey: "title", defaults: { dateLabel: "", title: "New career milestone", description: "", category: "Career Milestone", sourceNote: "", published: false },
    fields: [["dateLabel", "Year or date range"], ["title", "Title"], ["description", "Description", "textarea"], ["category", "Category", "select", ["Education", "Award", "Exhibition", "Public Artwork", "Career Milestone"]], ["sourceNote", "Source note (admin only)", "textarea"]], imageKey: "image", visibilityKey: "published",
  },
  publicWorks: {
    label: "public work", titleKey: "title", defaults: { title: "New public work", year: "", location: "", medium: "", description: "", relatedArtworks: [], sourceNote: "", visible: false, images: [] },
    fields: [["title", "Project title"], ["year", "Year"], ["location", "Location"], ["medium", "Medium"], ["description", "Story / description", "textarea"], ["relatedArtworks", "Related artwork IDs (comma-separated)", "array"], ["sourceNote", "Source note (admin only)", "textarea"]], gallery: true, visibilityKey: "visible",
  },
  awards: {
    label: "award", titleKey: "awardTitle", defaults: { awardTitle: "New honour", artworkTitle: "", year: "", organiser: "", location: "", description: "", sourceNote: "", visible: false },
    fields: [["awardTitle", "Award title"], ["artworkTitle", "Artwork title"], ["year", "Year"], ["organiser", "Organiser"], ["location", "Location"], ["description", "Short description", "textarea"], ["sourceNote", "Source note (admin only)", "textarea"]], imageKey: "image", visibilityKey: "visible",
  },
  pressArchive: {
    label: "press item", titleKey: "headline", defaults: { publicationName: "", publicationDate: "", headline: "New archive entry", originalLanguage: "", englishSummary: "", articleUrl: "", sourceNote: "", published: false },
    fields: [["publicationName", "Publication name"], ["publicationDate", "Publication date"], ["headline", "Headline"], ["originalLanguage", "Original language"], ["englishSummary", "Short English summary", "textarea"], ["articleUrl", "Article URL"], ["sourceNote", "Source note (admin only)", "textarea"]], imageKey: "image", visibilityKey: "published",
  },
};

const itemKey = (item) => item._id || item._key;
const clone = (value) => structuredClone(value);

const Field = ({ label, value, onChange, type = "text", options = [] }) => type === "toggle" ? <Toggle label={label} checked={value} onChange={onChange} /> : <label className="block text-xs font-label uppercase tracking-wider text-slate/60">{label}{type === "textarea" ? <textarea className="textarea-field mt-1 normal-case tracking-normal" rows={4} value={value || ""} onChange={(event) => onChange(event.target.value)} /> : type === "select" ? <select className="input-field mt-1 normal-case tracking-normal" value={value || options[0]} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select> : <input className="input-field mt-1 normal-case tracking-normal" type={type === "array" ? "text" : type} value={Array.isArray(value) ? value.join(", ") : value || ""} onChange={(event) => onChange(type === "array" ? event.target.value.split(",").map((entry) => entry.trim()).filter(Boolean) : event.target.value)} />}</label>;

const Toggle = ({ label, checked, onChange }) => <label className="inline-flex min-h-11 items-center gap-3 text-sm text-slate/70"><input type="checkbox" checked={checked !== false} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[#a07a28]" />{label}</label>;

const MediaField = ({ label, value = {}, onChange }) => {
  const [uploading, setUploading] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.append("image", file);
      const response = await aboutAdminAPI.uploadMedia(data);
      onChange({ ...response.data.image, alt: value.alt || "", caption: value.caption || "" });
      toast.success("Image uploaded to Cloudinary");
    } catch (error) {
      toast.error(error.response?.data?.message || "Image upload failed");
    } finally { setUploading(false); }
  };
  return <div className="border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-label uppercase tracking-wider text-slate/60">{label}</p>{value?.url && <img src={cloudinaryThumbnailUrl(value.url, 720)} alt={value.alt || "Preview"} className="mt-3 max-h-64 w-full bg-gray-100 object-contain" />}<div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Alt text" value={value.alt} onChange={(alt) => onChange({ ...value, alt })} /><Field label="Caption" value={value.caption} onChange={(caption) => onChange({ ...value, caption })} /></div><div className="mt-3 flex flex-wrap gap-2"><label className="btn-secondary cursor-pointer text-xs">{uploading ? "Uploading…" : value?.url ? "Replace image" : "Upload image"}<input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/avif,image/tiff" disabled={uploading} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ""; }} /></label>{value?.url && <button type="button" onClick={() => onChange({})} className="px-3 text-xs text-red-600">Remove reference</button>}{uploading && <LoadingSpinner size="sm" />}</div></div>;
};

const GalleryField = ({ images = [], onChange }) => <div><div className="space-y-3">{images.map((image, index) => <div key={image.publicId || index} className="relative"><MediaField label={`Project image ${index + 1}`} value={image} onChange={(next) => { const updated = [...images]; updated[index] = next; onChange(updated.filter((entry) => entry.url)); }} /><button type="button" onClick={() => onChange(images.filter((_, imageIndex) => imageIndex !== index))} className="absolute right-3 top-3 bg-white px-2 py-1 text-xs text-red-600 shadow">Remove</button></div>)}</div>{images.length < 10 && <MediaField label={images.length ? "Add another project image" : "Featured project image"} value={{}} onChange={(image) => image.url && onChange([...images, image])} />}<p className="mt-2 text-xs text-slate/50">Up to 10 Cloudinary images. Drag horizontally on the public mobile gallery.</p></div>;

const RepeatableEditor = ({ section, items, onChange }) => {
  const config = REPEATABLE[section];
  const [open, setOpen] = useState(null);
  const dragged = useRef(null);
  const update = (key, changes) => onChange(items.map((item) => itemKey(item) === key ? { ...item, ...changes } : item));
  const move = (fromKey, toKey) => {
    const from = items.findIndex((item) => itemKey(item) === fromKey);
    const to = items.findIndex((item) => itemKey(item) === toKey);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...items];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry);
    onChange(next.map((item, order) => ({ ...item, order })));
  };
  const add = () => {
    const entry = { ...clone(config.defaults), _key: crypto.randomUUID(), order: items.length };
    onChange([...items, entry]);
    setOpen(entry._key);
  };
  const duplicate = (item) => {
    const copy = { ...clone(item), _id: undefined, _key: crypto.randomUUID(), order: items.length };
    onChange([...items, copy]);
    setOpen(copy._key);
  };
  return <div><div className="mb-5 flex items-center justify-between"><div><h2 className="font-display text-2xl font-light text-charcoal">{TABS.find(([key]) => key === section)?.[1]}</h2><p className="mt-1 text-sm text-slate/55">Add, edit, duplicate, publish and reorder each {config.label}.</p></div><button type="button" className="btn-primary" onClick={add}>Add {config.label}</button></div><div className="space-y-3">{items.map((item, index) => { const key = itemKey(item); const expanded = open === key; return <article key={key} draggable onDragStart={() => { dragged.current = key; }} onDragOver={(event) => event.preventDefault()} onDrop={() => move(dragged.current, key)} className="border border-gray-200 bg-white"><div className="flex min-h-16 items-center gap-3 p-4"><span className="cursor-grab text-lg text-slate/30" title="Drag to reorder">⋮⋮</span><span className="w-7 text-xs text-slate/40">{String(index + 1).padStart(2, "0")}</span><button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(expanded ? null : key)}><strong className="block truncate text-sm text-charcoal">{item[config.titleKey] || `Untitled ${config.label}`}</strong><span className="text-xs text-slate/45">{item[config.visibilityKey] === false ? "Hidden / draft" : "Visible when published"}</span></button><button type="button" className="px-2 text-xs" disabled={index === 0} onClick={() => move(key, itemKey(items[index - 1]))}>↑</button><button type="button" className="px-2 text-xs" disabled={index === items.length - 1} onClick={() => move(key, itemKey(items[index + 1]))}>↓</button><button type="button" className="px-2 text-xs text-gold-dark" onClick={() => duplicate(item)}>Duplicate</button><button type="button" className="px-2 text-xs text-red-600" onClick={() => window.confirm(`Delete this ${config.label}?`) && onChange(items.filter((entry) => itemKey(entry) !== key))}>Delete</button></div>{expanded && <div className="border-t border-gray-100 bg-gray-50 p-5"><div className="grid gap-4 md:grid-cols-2">{config.fields.map(([fieldKey, label, type, options]) => <div key={fieldKey} className={type === "textarea" ? "md:col-span-2" : ""}><Field label={label} value={item[fieldKey]} type={type} options={options} onChange={(value) => update(key, { [fieldKey]: value })} /></div>)}</div><div className="mt-4"><Toggle label={section === "timeline" || section === "pressArchive" ? "Published" : "Visible"} checked={item[config.visibilityKey]} onChange={(value) => update(key, { [config.visibilityKey]: value })} /></div>{config.imageKey && <div className="mt-4"><MediaField label="Featured / archive image" value={item[config.imageKey]} onChange={(image) => update(key, { [config.imageKey]: image })} /></div>}{config.gallery && <div className="mt-4"><GalleryField images={item.images || []} onChange={(images) => update(key, { images })} /></div>}</div>}</article>; })}</div></div>;
};

const AboutPageEditor = () => {
  const [content, setContent] = useState(null);
  const [meta, setMeta] = useState({ isPublished: false });
  const [activeTab, setActiveTab] = useState("hero");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewWidth, setPreviewWidth] = useState("100%");
  const [previewVersion, setPreviewVersion] = useState(0);
  const originalRef = useRef("");

  useEffect(() => {
    aboutAdminAPI.get().then((response) => {
      const draft = response.data.aboutPage.draft;
      setContent(draft);
      setMeta(response.data.aboutPage);
      originalRef.current = JSON.stringify(draft);
      setPreviewVersion((version) => version + 1);
    }).catch(() => toast.error("Failed to load the About Page editor")).finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(() => content && JSON.stringify(content) !== originalRef.current, [content]);
  useEffect(() => {
    const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const updateBlock = (block, changes) => setContent((current) => ({ ...current, [block]: { ...current[block], ...changes } }));
  const saveDraft = async () => {
    setSaving(true);
    try {
      const response = await aboutAdminAPI.save(content);
      const draft = response.data.aboutPage.draft;
      setContent(draft);
      setMeta(response.data.aboutPage);
      originalRef.current = JSON.stringify(draft);
      toast.success("About page draft saved");
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Draft could not be saved");
      return false;
    } finally { setSaving(false); }
  };
  const publish = async () => {
    if (!(await saveDraft())) return;
    try { const response = await aboutAdminAPI.publish(true); setMeta(response.data.aboutPage); toast.success("About page published"); }
    catch { toast.error("Draft saved, but publishing failed"); }
  };
  const unpublish = async () => {
    if (!window.confirm("Unpublish the public About page? The draft will be retained.")) return;
    try { const response = await aboutAdminAPI.publish(false); setMeta(response.data.aboutPage); toast.success("About page unpublished"); }
    catch { toast.error("Could not unpublish the page"); }
  };
  const reset = () => {
    if (!dirty || window.confirm("Discard all unsaved About page changes?")) setContent(JSON.parse(originalRef.current));
  };

  if (loading || !content) return <AdminLayout><PageLoader /></AdminLayout>;
  const singleton = (block, title, fields, mediaFields = []) => <div><div className="mb-5"><h2 className="font-display text-2xl font-light">{title}</h2><p className="mt-1 text-sm text-slate/55">This content is saved as a draft until you publish it.</p></div><div className="grid gap-4 md:grid-cols-2">{fields.map(([key, label, type]) => <div key={key} className={type === "textarea" ? "md:col-span-2" : ""}><Field label={label} value={content[block]?.[key]} type={type} onChange={(value) => updateBlock(block, { [key]: value })} /></div>)}</div>{block !== "seo" && <div className="mt-4"><Toggle label="Show this section" checked={content[block]?.visible} onChange={(visible) => updateBlock(block, { visible })} /></div>}{mediaFields.map(([key, label]) => <div className="mt-5" key={key}><MediaField label={label} value={content[block]?.[key]} onChange={(image) => updateBlock(block, { [key]: image })} /></div>)}</div>;

  return <AdminLayout><div className="mx-auto max-w-[1500px] p-4 md:p-8"><div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-xs uppercase tracking-[0.22em] text-slate/45">Admin · Content</p><h1 className="mt-1 font-display text-4xl font-light">About Page</h1><p className="mt-2 text-sm text-slate/55">Museum-style biography, public works, honours and archive. <span className={meta.isPublished ? "text-green-700" : "text-amber-700"}>{meta.isPublished ? "Published" : "Not published"}</span>{dirty && <span className="ml-2 text-amber-700">· Unsaved changes</span>}</p></div><div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={() => toast.dismiss()}>Clear notices</button><button type="button" className="btn-secondary" disabled={!dirty || saving} onClick={reset}>Reset unsaved</button><button type="button" className="btn-secondary" disabled={saving} onClick={saveDraft}>{saving ? "Saving…" : "Save Draft"}</button><button type="button" className="btn-primary" disabled={saving} onClick={publish}>Publish changes</button>{meta.isPublished && <button type="button" className="px-4 py-2 text-xs uppercase tracking-wider text-red-600" onClick={unpublish}>Unpublish</button>}</div></div>

    <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]"><aside className="bg-white p-2 shadow-sm xl:sticky xl:top-4 xl:self-start">{TABS.map(([key, label], index) => <button type="button" key={key} onClick={() => setActiveTab(key)} className={`flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm ${activeTab === key ? "bg-charcoal text-white" : "text-slate/65 hover:bg-gray-50"}`}><span className="w-5 text-xs opacity-50">{String(index + 1).padStart(2, "0")}</span>{label}</button>)}</aside><div className="min-w-0 space-y-6"><section className="bg-white p-5 shadow-sm md:p-7">{activeTab === "hero" && singleton("hero", "Hero", [["eyebrow", "Eyebrow"], ["name", "Public artist name"], ["roles", "Role line"], ["introduction", "Short introduction", "textarea"], ["showCollectionButton", "Show Explore the Collection button", "toggle"]], [["backgroundImage", "Cinematic hero portrait or artwork"]])}{activeTab === "artistStatement" && singleton("artistStatement", "Artist Statement", [["quote", "Artist quote"], ["statement", "Supporting statement", "textarea"], ["signatureText", "Signature text"]], [["supportingImage", "Portrait or artwork"], ["signatureImage", "Signature image"]])}{activeTab === "biography" && singleton("biography", "Biography", [["heading", "Heading"], ["body", "Professional biography", "textarea"], ["archiveNote", "Public archive note", "textarea"]], [["image", "Biography portrait or artwork"]])}{REPEATABLE[activeTab] && <RepeatableEditor section={activeTab} items={content[activeTab] || []} onChange={(items) => setContent((current) => ({ ...current, [activeTab]: items }))} />}{activeTab === "closingCta" && singleton("closingCta", "Closing CTA", [["eyebrow", "Eyebrow"], ["heading", "Heading"], ["message", "Final message", "textarea"], ["showCollectionButton", "Show collection button", "toggle"], ["showContactButton", "Show contact button", "toggle"]], [["backgroundImage", "Closing artwork or portrait"]])}{activeTab === "seo" && <div><h2 className="font-display text-2xl font-light">Page Settings</h2><p className="mt-1 text-sm text-slate/55">Search metadata and draft preview. Contact details stay in Profile settings.</p><div className="mt-5 grid gap-4"><Field label="SEO title" value={content.seo?.title} onChange={(title) => updateBlock("seo", { title })} /><Field label="SEO description" type="textarea" value={content.seo?.description} onChange={(description) => updateBlock("seo", { description })} /><MediaField label="Social sharing image" value={content.seo?.socialImage} onChange={(socialImage) => updateBlock("seo", { socialImage })} /></div></div>}</section>

      <section className="bg-white p-5 shadow-sm md:p-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-display text-2xl font-light">Draft preview</h2><p className="text-xs text-slate/50">Save the draft to refresh this protected preview.</p></div><div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => setPreviewWidth("390px")}>Mobile</button><button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => setPreviewWidth("768px")}>Tablet</button><button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => setPreviewWidth("100%")}>Desktop</button><a href="/about?preview=draft" target="_blank" rel="noreferrer" className="btn-secondary px-3 py-2 text-xs">Open preview</a></div></div><div className="mt-5 overflow-auto bg-gray-100 p-2"><iframe key={`${previewWidth}-${previewVersion}`} title="About page draft preview" src="/about?preview=draft" className="mx-auto block h-[720px] max-w-full border-0 bg-white shadow" style={{ width: previewWidth }} /></div></section></div></div>
  </div></AdminLayout>;
};

export default AboutPageEditor;
