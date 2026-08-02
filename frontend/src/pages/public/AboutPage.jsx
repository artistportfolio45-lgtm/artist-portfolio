import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PublicLayout from "../../components/public/PublicLayout";
import { publicDataAPI } from "../../services/publicData";
import { PageLoader } from "../../components/shared/LoadingSpinner";
import { cloudinaryThumbnailUrl, isCloudinaryDeliveryUrl } from "../../utils/imageDelivery";
import { aboutAdminAPI } from "../../services/api";

const FALLBACK_ABOUT = {
  hero: { eyebrow: "Indian Visual Artist", name: "Dr. Gurugovind Namdev Ambe", roles: "Painter · Sculptor · Muralist · Illustrator · Art Educator", introduction: "A multi-disciplinary Indian artist working across painting, sculpture, murals, illustration, socially engaged cartoons and arts education.", showCollectionButton: true, visible: true },
  artistStatement: { statement: "His work explores Indian culture, history, spirituality, public life, social awareness and the breadth of human experience.", visible: true },
  biography: { heading: "A life shaped through art", body: "Dr. Gurugovind Namdev Ambe is a painter, sculptor, muralist, illustrator, cartoonist, art educator and fine-arts curator. His practice moves between drawing and painting and the shared civic space of murals, memorial work and public sculpture.\n\nHe achieved first position at the Pune centre in G.D. Art and ninth position in the Maharashtra merit list. His works “Anpadh Ki Dasha” and “Buddha Ka Shodhan Ke Liye Rajya Tyag” received national recognition.", archiveNote: "Earlier archive and media material may refer to the artist as G. N. Ambe or Raju Ambe.", visible: true },
  practices: [
    { _id: "painting", title: "Painting & Drawing", description: "Paintings and sketches shaped by Indian culture, history, spirituality and lived experience." },
    { _id: "sculpture", title: "Sculpture & Ceramics", description: "Sculptural, ceramic and terracotta works that bring material, memory and form into dialogue." },
    { _id: "murals", title: "Murals & Public Art", description: "Memorial works, murals and public projects conceived for shared spaces and collective remembrance." },
    { _id: "illustration", title: "Illustration & Social Cartoons", description: "Illustration and socially engaged cartoons addressing public life, awareness and human dignity." },
  ],
  timeline: [
    { _id: "gd-art", title: "G.D. Art recognition", description: "First position at the Pune centre and ninth position in the Maharashtra merit list.", category: "Education" },
    { _id: "public-art", title: "Public and memorial art practice", description: "A significant body of murals, memorial-site work, sculpture and installations created for public contexts.", category: "Public Artwork" },
    { _id: "anpadh", title: "National recognition for “Anpadh Ki Dasha”", description: "The work received national recognition for its socially engaged artistic vision.", category: "Award" },
    { _id: "buddha", title: "National painting recognition", description: "“Buddha Ka Shodhan Ke Liye Rajya Tyag” received national painting recognition.", category: "Award" },
  ],
  publicWorks: [], awards: [
    { _id: "anpadh-award", awardTitle: "National recognition", artworkTitle: "Anpadh Ki Dasha", description: "National recognition for a socially engaged work." },
    { _id: "buddha-award", awardTitle: "National painting recognition", artworkTitle: "Buddha Ka Shodhan Ke Liye Rajya Tyag", description: "National recognition for the painting." },
  ], pressArchive: [],
  closingCta: { eyebrow: "The work continues", heading: "Art as memory, witness and shared experience", message: "Across disciplines and public spaces, the artist’s practice remains rooted in culture, social awareness and the enduring human impulse to make meaning.", showCollectionButton: true, showContactButton: true, visible: true },
  seo: { title: "Dr. Gurugovind Namdev Ambe — Indian Visual Artist" },
};

const imageUrl = (image, width = 1200) => image?.url ? cloudinaryThumbnailUrl(image.url, width) : "";
const Media = ({ image, width = 1200, className = "", eager = false }) => image?.url ? <img src={imageUrl(image, width)} srcSet={isCloudinaryDeliveryUrl(image.url) ? [...new Set([480, 960, width])].sort((a, b) => a - b).map((size) => `${imageUrl(image, size)} ${size}w`).join(", ") : undefined} sizes="(max-width: 768px) 100vw, 70vw" alt={image.alt || image.caption || "Artwork from the artist archive"} className={className} loading={eager ? "eager" : "lazy"} width={image.width || undefined} height={image.height || undefined} /> : null;
const paragraphs = (text) => String(text || "").split(/\n\s*\n/).filter(Boolean);

const ArchiveModal = ({ item, onClose }) => {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll("button, a[href]") || [])];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handleKey); document.body.style.overflow = previousOverflow; };
  }, [onClose]);
  const image = item.image || item.images?.[0];
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 md:p-8" role="dialog" aria-modal="true" aria-labelledby="archive-modal-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div ref={dialogRef} className="relative grid max-h-full w-full max-w-6xl overflow-auto bg-[#f5f0e7] lg:grid-cols-[1.35fr_0.65fr]"><div className="flex min-h-[40vh] items-center justify-center bg-black p-3 md:p-6">{image?.url ? <Media image={image} width={1800} className="max-h-[82vh] w-full object-contain" eager /> : <div className="text-sm uppercase tracking-widest text-white/50">Archive image not yet added</div>}</div><div className="p-7 md:p-10"><p className="text-xs uppercase tracking-[0.25em] text-[#9b7730]">{item.publicationName || item.awardTitle || "Archive"}</p><h2 id="archive-modal-title" className="mt-4 text-3xl font-light text-charcoal">{item.headline || item.artworkTitle || item.title}</h2>{item.publicationDate && <p className="mt-3 text-sm text-slate/60">{item.publicationDate}{item.originalLanguage ? ` · ${item.originalLanguage}` : ""}</p>}<p className="mt-6 whitespace-pre-line leading-7 text-slate/80">{item.englishSummary || item.description}</p>{item.articleUrl && <a href={item.articleUrl} target="_blank" rel="noreferrer" className="mt-7 inline-block border-b border-gold pb-1 text-sm">Read source article</a>}</div><button ref={closeRef} type="button" onClick={onClose} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center bg-black text-xl text-white focus:outline-none focus:ring-2 focus:ring-gold" aria-label="Close archive viewer">×</button></div></div>;
};

const AboutPage = () => {
  const [about, setAbout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalItem, setModalItem] = useState(null);
  const location = useLocation();
  const draftPreview = new URLSearchParams(location.search).get("preview") === "draft";

  useEffect(() => {
    const request = draftPreview
      ? aboutAdminAPI.get().then((response) => response.data.aboutPage?.draft)
      : publicDataAPI.getAbout({ onLiveData: setAbout });
    request
      .then((data) => setAbout(data || FALLBACK_ABOUT))
      .catch(() => setAbout(FALLBACK_ABOUT))
      .finally(() => setLoading(false));
  }, [draftPreview]);
  useEffect(() => {
    if (!about?.seo?.title) return;
    const previous = document.title;
    document.title = about.seo.title;
    return () => { document.title = previous; };
  }, [about]);

  if (loading) return <PublicLayout><PageLoader /></PublicLayout>;
  const page = about || FALLBACK_ABOUT;
  const heroImage = page.hero?.backgroundImage;
  const closingImage = page.closingCta?.backgroundImage;

  return <PublicLayout><main className="about-retrospective overflow-hidden bg-[#f5f0e7] text-charcoal">
    {page.hero?.visible !== false && <section className="relative flex min-h-[78vh] items-end bg-charcoal pt-32 md:min-h-[86vh] lg:pt-16">{heroImage?.url && <Media image={heroImage} width={2000} className="absolute inset-0 h-full w-full object-cover" eager />}<div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/20" /><div className="container-site relative z-10 pb-14 text-white md:pb-20 lg:pb-24"><p className="text-xs uppercase tracking-[0.32em] text-gold-light">{page.hero.eyebrow}</p><h1 className="mt-5 max-w-5xl text-5xl font-light leading-[0.94] sm:text-6xl md:text-8xl lg:text-[7rem]">{page.hero.name}</h1><p className="mt-7 text-sm uppercase tracking-[0.16em] text-white/75 md:text-base">{page.hero.roles}</p><p className="mt-6 max-w-2xl text-base font-light leading-7 text-white/80 md:text-lg">{page.hero.introduction}</p>{page.hero.showCollectionButton && <Link to="/gallery" className="mt-8 inline-block border border-white/60 px-6 py-3 text-xs uppercase tracking-[0.2em] transition hover:bg-white hover:text-black">Explore the Collection</Link>}</div></section>}

    {page.artistStatement?.visible !== false && <section className="px-5 py-20 sm:px-8 md:py-32"><div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_0.55fr] lg:items-center"> <div><p className="text-xs uppercase tracking-[0.28em] text-[#9b7730]">Artist statement</p>{page.artistStatement.quote && <blockquote className="mt-8 max-w-4xl text-4xl font-light leading-tight md:text-6xl">“{page.artistStatement.quote}”</blockquote>}<div className={`${page.artistStatement.quote ? "mt-10 max-w-2xl border-l border-gold pl-6" : "mt-8 max-w-4xl text-3xl md:text-5xl"} leading-relaxed text-slate/80`}>{page.artistStatement.statement}</div>{page.artistStatement.signatureImage?.url ? <Media image={page.artistStatement.signatureImage} width={400} className="mt-8 h-16 w-auto object-contain" /> : page.artistStatement.signatureText && <p className="mt-8 font-display text-3xl italic">{page.artistStatement.signatureText}</p>}</div>{page.artistStatement.supportingImage?.url && <Media image={page.artistStatement.supportingImage} width={900} className="aspect-[4/5] w-full object-cover" />}</div></section>}

    {page.biography?.visible !== false && <section className="bg-[#e9e1d5] px-5 py-20 sm:px-8 md:py-28"><div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-12">{page.biography.image?.url && <div className="lg:col-span-5"><Media image={page.biography.image} width={1000} className="aspect-[4/5] w-full object-cover" /></div>}<div className={page.biography.image?.url ? "lg:col-span-7 lg:pl-10" : "lg:col-span-9 lg:col-start-3"}><p className="text-xs uppercase tracking-[0.28em] text-[#9b7730]">Biography</p><h2 className="mt-5 text-4xl font-light md:text-6xl">{page.biography.heading}</h2><div className="mt-9 space-y-6 text-base leading-8 text-slate/80 md:text-lg">{paragraphs(page.biography.body).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>{page.biography.archiveNote && <p className="mt-10 border-t border-black/15 pt-5 text-sm italic leading-6 text-slate/60">Archive note: {page.biography.archiveNote}</p>}</div></div></section>}

    {page.practices?.length > 0 && <section className="bg-charcoal px-5 py-20 text-white sm:px-8 md:py-28"><div className="mx-auto max-w-7xl"><div className="mb-12 md:flex md:items-end md:justify-between"><div><p className="text-xs uppercase tracking-[0.28em] text-gold-light">The practice</p><h2 className="mt-4 text-4xl font-light md:text-6xl">Many disciplines.<br />One evolving language.</h2></div></div><div className="grid gap-px bg-white/15 md:grid-cols-2">{page.practices.map((practice, index) => <article key={practice._id || practice.title} className="group relative min-h-[28rem] overflow-hidden bg-[#222] p-7 md:p-10">{practice.image?.url && <Media image={practice.image} width={1100} className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-700 group-hover:scale-105 group-hover:opacity-70" />}<div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" /><div className="relative flex h-full flex-col justify-end"><span className="text-xs tracking-[0.25em] text-gold-light">0{index + 1}</span><h3 className="mt-3 text-3xl font-light md:text-4xl">{practice.title}</h3><p className="mt-4 max-w-md leading-7 text-white/70">{practice.description}</p>{practice.link && <Link to={practice.link} className="mt-6 w-fit border-b border-gold pb-1 text-xs uppercase tracking-widest">Explore</Link>}</div></article>)}</div></div></section>}

    {page.timeline?.length > 0 && <section className="px-5 py-20 sm:px-8 md:py-28"><div className="mx-auto max-w-5xl"><p className="text-xs uppercase tracking-[0.28em] text-[#9b7730]">Career timeline</p><h2 className="mt-4 text-4xl font-light md:text-6xl">A practice across time</h2><div className="relative mt-14 before:absolute before:bottom-0 before:left-[7px] before:top-0 before:w-px before:bg-black/20 md:before:left-[33%]">{page.timeline.map((item) => <article key={item._id || item.title} className="relative grid gap-4 pb-14 pl-10 md:grid-cols-[33%_1fr] md:gap-12 md:pl-0"><span className="absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-4 border-[#f5f0e7] bg-gold md:left-[calc(33%-7px)]" /><div className="text-sm"><p className="font-medium text-[#9b7730]">{item.dateLabel || item.category}</p>{item.dateLabel && <p className="mt-1 text-xs uppercase tracking-widest text-slate/45">{item.category}</p>}</div><div className="md:pl-5"><h3 className="text-2xl font-light md:text-3xl">{item.title}</h3><p className="mt-3 max-w-xl leading-7 text-slate/70">{item.description}</p>{item.image?.url && <Media image={item.image} width={900} className="mt-6 max-h-96 w-full object-cover" />}</div></article>)}</div></div></section>}

    {page.publicWorks?.length > 0 && <section className="bg-[#e9e1d5] px-5 py-20 sm:px-8 md:py-28"><div className="mx-auto max-w-7xl"><p className="text-xs uppercase tracking-[0.28em] text-[#9b7730]">Selected public works</p><h2 className="mt-4 max-w-3xl text-4xl font-light md:text-6xl">Art made for shared space</h2><div className="mt-12 space-y-16">{page.publicWorks.map((work, index) => <article key={work._id || work.title} className={`grid gap-8 lg:grid-cols-12 lg:items-center ${index % 2 ? "" : ""}`}><div className={`lg:col-span-7 ${index % 2 ? "lg:order-2" : ""}`}><div className="flex snap-x gap-3 overflow-x-auto">{work.images?.map((image, imageIndex) => <Media key={image.publicId || imageIndex} image={image} width={1300} className="aspect-[4/3] w-[88%] flex-none snap-center object-cover sm:w-full" />)}</div></div><div className="lg:col-span-5 lg:px-8"><p className="text-xs uppercase tracking-[0.2em] text-[#9b7730]">{[work.year, work.location].filter(Boolean).join(" · ") || `Project ${String(index + 1).padStart(2, "0")}`}</p><h3 className="mt-3 text-3xl font-light md:text-4xl">{work.title}</h3>{work.medium && <p className="mt-3 text-sm italic text-slate/55">{work.medium}</p>}<p className="mt-5 whitespace-pre-line leading-7 text-slate/75">{work.description}</p></div></article>)}</div></div></section>}

    {page.awards?.length > 0 && <section className="px-5 py-20 sm:px-8 md:py-28"><div className="mx-auto max-w-6xl"><p className="text-xs uppercase tracking-[0.28em] text-[#9b7730]">Awards & honours</p><h2 className="mt-4 text-4xl font-light md:text-6xl">Recognition</h2><div className="mt-12 border-t border-black/15">{page.awards.map((award, index) => <article key={award._id || award.awardTitle} className="grid gap-4 border-b border-black/15 py-8 md:grid-cols-[5rem_1fr_1fr_auto] md:items-center"><span className="text-xs text-[#9b7730]">{award.year || String(index + 1).padStart(2, "0")}</span><div><h3 className="text-2xl font-light">{award.awardTitle}</h3>{award.artworkTitle && <p className="mt-1 text-sm italic text-slate/60">{award.artworkTitle}</p>}</div><p className="max-w-md text-sm leading-6 text-slate/65">{award.description}</p>{award.image?.url && <button type="button" onClick={() => setModalItem(award)} className="min-h-11 border-b border-gold text-xs uppercase tracking-widest">View archive</button>}</article>)}</div></div></section>}

    {page.pressArchive?.length > 0 && <section className="bg-charcoal px-5 py-20 text-white sm:px-8 md:py-28"><div className="mx-auto max-w-7xl"><p className="text-xs uppercase tracking-[0.28em] text-gold-light">Press & archive</p><h2 className="mt-4 text-4xl font-light md:text-6xl">In the public record</h2><div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{page.pressArchive.map((press) => <button type="button" key={press._id || `${press.publicationName}-${press.headline}`} onClick={() => setModalItem(press)} className="group min-h-96 overflow-hidden bg-white text-left text-charcoal focus:outline-none focus:ring-2 focus:ring-gold">{press.image?.url ? <Media image={press.image} width={800} className="h-56 w-full object-cover object-top grayscale transition duration-500 group-hover:scale-105 group-hover:grayscale-0" /> : <div className="h-56 bg-[#e9e1d5]" />}<div className="p-6"><p className="text-xs uppercase tracking-[0.2em] text-[#9b7730]">{press.publicationName}</p><h3 className="mt-3 text-2xl font-light">{press.headline || "Archive coverage"}</h3><p className="mt-3 line-clamp-3 text-sm leading-6 text-slate/65">{press.englishSummary}</p><span className="mt-5 inline-block border-b border-gold pb-1 text-xs uppercase tracking-widest">Open archive</span></div></button>)}</div></div></section>}

    {page.closingCta?.visible !== false && <section className="relative flex min-h-[68vh] items-center justify-center bg-[#2a2722] px-5 py-20 text-center text-white">{closingImage?.url && <Media image={closingImage} width={2000} className="absolute inset-0 h-full w-full object-cover opacity-45" />}<div className="absolute inset-0 bg-black/45" /><div className="relative max-w-4xl"><p className="text-xs uppercase tracking-[0.3em] text-gold-light">{page.closingCta.eyebrow}</p><h2 className="mt-5 text-4xl font-light leading-tight md:text-7xl">{page.closingCta.heading}</h2><p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-white/75 md:text-lg">{page.closingCta.message}</p><div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">{page.closingCta.showCollectionButton && <Link to="/gallery" className="border border-white bg-white px-6 py-3 text-xs uppercase tracking-[0.18em] text-black">Explore the Collection</Link>}{page.closingCta.showContactButton && <Link to="/contact" className="border border-white/70 px-6 py-3 text-xs uppercase tracking-[0.18em] text-white">Contact the Artist</Link>}</div></div></section>}
  </main>{modalItem && <ArchiveModal item={modalItem} onClose={() => setModalItem(null)} />}</PublicLayout>;
};

export default AboutPage;
