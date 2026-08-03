import { useEffect, useId, useRef, useState } from "react";
import { publicDataAPI } from "../../services/publicData";
import { subscribeToArtworkRefresh } from "../../services/artworkRefresh";

const artworkLabel = (artwork) => [
  artwork.title || "Untitled",
  artwork.catalogueNumber,
  artwork.year,
].filter(Boolean).join(" · ");

const ArtworkCombobox = ({ selected, onSelect }) => {
  const listId = useId();
  const requestId = useRef(0);
  const [query, setQuery] = useState(selected ? artworkLabel(selected) : "");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (selected) setQuery(artworkLabel(selected));
  }, [selected]);

  const load = () => {
    const id = ++requestId.current;
    setLoading(true);
    const params = { available: "true", limit: 20, sort: "title", order: "asc" };
    if (query.trim() && query !== artworkLabel(selected || {})) params.search = query.trim();
    publicDataAPI.getArtworks(params, {
      onLiveData: (result) => {
        if (id !== requestId.current) return;
        setItems(result.items || []);
        setStale(false);
      },
    }).then((result) => {
      if (id !== requestId.current) return;
      setItems(result.items || []);
      setStale(Boolean(result.isStale));
    }).catch(() => {
      if (id === requestId.current) setItems([]);
    }).finally(() => {
      if (id === requestId.current) setLoading(false);
    });
  };

  useEffect(() => {
    const timer = window.setTimeout(load, 300);
    return () => {
      window.clearTimeout(timer);
      requestId.current += 1;
    };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => subscribeToArtworkRefresh(load), [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (artwork) => {
    onSelect(artwork);
    setQuery(artwork ? artworkLabel(artwork) : "");
    setOpen(false);
  };

  return (
    <div className="relative">
      <input type="hidden" name="artworkId" value={selected?._id || ""} />
      <input
        id="contact-artwork"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && items[active] ? `${listId}-${items[active]._id}` : undefined}
        autoComplete="off"
        value={query}
        placeholder="Search by title, year, medium or catalogue number"
        className="input-field"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
          if (selected) onSelect(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((value) => Math.min(value + 1, items.length - 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
          if (event.key === "Enter" && open && items[active]) { event.preventDefault(); choose(items[active]); }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <div id={listId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto border border-charcoal/15 bg-white shadow-xl">
          <button type="button" role="option" aria-selected={!selected} className="min-h-11 w-full px-3 text-left text-sm hover:bg-ivory" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(null)}>General enquiry</button>
          {items.map((artwork, index) => (
            <button
              id={`${listId}-${artwork._id}`}
              key={artwork._id}
              type="button"
              role="option"
              aria-selected={selected?._id === artwork._id}
              className={`min-h-11 w-full border-t border-charcoal/5 px-3 py-2 text-left text-sm ${active === index ? "bg-gold/10" : "hover:bg-ivory"}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(artwork)}
            >
              {artworkLabel(artwork)}
            </button>
          ))}
          {!loading && items.length === 0 && <p className="px-3 py-4 text-sm text-slate/60">No matching available artworks.</p>}
          {loading && <p role="status" className="px-3 py-4 text-sm text-slate/60">Searching live collection…</p>}
          {stale && <p role="status" className="border-t border-gold/20 bg-gold/5 px-3 py-3 text-xs text-slate/70">Showing saved results while reconnecting.</p>}
        </div>
      )}
    </div>
  );
};

export default ArtworkCombobox;
