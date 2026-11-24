export function WindowSkeleton({ label }: { label: string }) {
  return <div className="window-skeleton" role="status" aria-busy="true" aria-label={label}>
    <div aria-hidden="true">
      <div className="window-skeleton-heading"><span className="window-skeleton-thumb"/><div><span/><span/></div></div>
      <div className="window-skeleton-fields"><span/><span/><span/></div>
    </div>
    <span className="window-skeleton-label">{label}</span>
  </div>;
}
