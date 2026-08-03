const CachedDataNotice = ({ visible, onRetry, busy = false }) => {
  if (!visible) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border border-gold/25 bg-gold/5 px-4 py-3 text-xs text-slate/70"
    >
      <span>Showing a saved copy while the live collection reconnects.</span>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="min-h-11 px-2 font-label uppercase tracking-wider text-charcoal underline decoration-gold underline-offset-4 disabled:opacity-50"
      >
        {busy ? "Checking…" : "Retry now"}
      </button>
    </div>
  );
};

export default CachedDataNotice;
