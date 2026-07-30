import { useEffect, useRef, useState } from "react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const ArtworkPreviewModal = ({ artwork, initialIndex = 0, onClose, onIndexChange }) => {
  const images = artwork?.images || [];
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0, distance: 0, scale: 1 });

  const resetZoom = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const goTo = (nextIndex) => {
    const resolved = (nextIndex + images.length) % images.length;
    setIndex(resolved);
    onIndexChange?.(resolved);
    resetZoom();
  };

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && images.length > 1) goTo(index - 1);
      if (event.key === "ArrowRight" && images.length > 1) goTo(index + 1);
      if (event.key === "Tab") {
        const focusable = [...dialogRef.current.querySelectorAll("button:not([disabled])")];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [images.length, index, onClose]);

  if (!artwork || !images.length) return null;
  const image = images[index];

  const updateZoom = (nextScale) => {
    const resolved = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
    setScale(resolved);
    if (resolved === 1) setOffset({ x: 0, y: 0 });
  };

  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
      distance: points.length === 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0,
      scale,
    };
  };

  const handlePointerMove = (event) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];

    if (points.length === 2) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (gesture.current.distance) updateZoom(gesture.current.scale * (distance / gesture.current.distance));
    } else if (scale > 1) {
      setOffset({
        x: gesture.current.offsetX + event.clientX - gesture.current.x,
        y: gesture.current.offsetY + event.clientY - gesture.current.y,
      });
    }
  };

  const handlePointerUp = (event) => {
    const startX = gesture.current.x;
    pointers.current.delete(event.pointerId);
    if (scale === 1 && images.length > 1 && Math.abs(event.clientX - startX) > 70) {
      goTo(event.clientX < startX ? index + 1 : index - 1);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${artwork.title || "Artwork"} full-screen preview`}
      className="fixed inset-0 z-[100] flex touch-none items-center justify-center overflow-hidden bg-black/95"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute left-3 right-3 top-3 z-20 flex items-center justify-between gap-3 text-white">
        <span className="rounded-full bg-black/55 px-3 py-2 text-xs font-label tracking-widest">
          {index + 1} / {images.length}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={() => updateZoom(scale - 0.5)} disabled={scale <= 1} className="h-10 min-w-10 rounded-full bg-white/12 px-3 text-xl hover:bg-white/25 disabled:opacity-35" aria-label="Zoom out">−</button>
          <button type="button" onClick={resetZoom} className="h-10 rounded-full bg-white/12 px-4 text-xs font-label uppercase tracking-wider hover:bg-white/25" aria-label="Reset zoom">Reset</button>
          <button type="button" onClick={() => updateZoom(scale + 0.5)} disabled={scale >= MAX_ZOOM} className="h-10 min-w-10 rounded-full bg-white/12 px-3 text-xl hover:bg-white/25 disabled:opacity-35" aria-label="Zoom in">+</button>
          <button ref={closeRef} type="button" onClick={onClose} className="h-10 min-w-10 rounded-full bg-white text-2xl leading-none text-black hover:bg-gold hover:text-white" aria-label="Close full-screen preview">×</button>
        </div>
      </div>

      {images.length > 1 && (
        <>
          <button type="button" onClick={() => goTo(index - 1)} className="absolute left-3 top-1/2 z-20 h-12 w-12 -translate-y-1/2 rounded-full bg-black/55 text-3xl text-white hover:bg-black/80" aria-label="Previous image">‹</button>
          <button type="button" onClick={() => goTo(index + 1)} className="absolute right-3 top-1/2 z-20 h-12 w-12 -translate-y-1/2 rounded-full bg-black/55 text-3xl text-white hover:bg-black/80" aria-label="Next image">›</button>
        </>
      )}

      <div
        className={`flex h-full w-full items-center justify-center ${scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
        onClick={(event) => {
          const moved = Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y);
          if (event.target === event.currentTarget && scale === 1 && moved < 6) onClose();
        }}
        onWheel={(event) => {
          event.preventDefault();
          updateZoom(scale + (event.deltaY < 0 ? 0.25 : -0.25));
        }}
        onDoubleClick={() => updateZoom(scale === 1 ? 2 : 1)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          src={image.url}
          alt={`${artwork.title || "Untitled"} image ${index + 1}`}
          draggable="false"
          className="max-h-[100dvh] max-w-[100vw] select-none object-contain will-change-transform"
          style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}
          decoding="async"
        />
      </div>
    </div>
  );
};

export default ArtworkPreviewModal;
