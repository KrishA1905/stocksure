export const inputCls =
  'h-12 w-full rounded-none border border-ink/70 bg-transparent px-3 text-lg font-semibold outline-none focus:border-ink placeholder:text-ink/60 disabled:opacity-50';

export const Field = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <span className="block text-sm font-bold uppercase tracking-wide">{label}</span>
    {children}
    {hint && <span className="block text-sm font-semibold uppercase text-ink/70">{hint}</span>}
  </label>
);

// Shown when a page's data could not be loaded from the API
export const LoadError = ({ error, onRetry }) => (
  <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-2 border-alert bg-alert/10 px-4 py-3 text-base font-bold uppercase text-alert">
    <span>Could not load data. {error}</span>
    {onRetry && (
      <button onClick={onRetry} className="border-[1.5px] border-alert px-3 py-1 font-bold hover:bg-alert hover:text-paper">
        Try again
      </button>
    )}
  </div>
);

// Shows the server's reason when a request is rejected
export const ErrorBox = ({ children }) => (
  <div role="alert" className="border-2 border-alert bg-alert/10 p-3 text-base font-bold uppercase leading-snug text-alert">
    {children}
  </div>
);
