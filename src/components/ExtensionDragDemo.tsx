import "../styles/extension-drag-demo.css";

/** Decorative illustration; pointer events belong to the real drag surface. */
export function ExtensionDragDemo() {
  return <svg className="extension-drag-demo" viewBox="0 0 320 100" aria-hidden="true" focusable="false">
    <rect className="drag-demo-source" x="26" y="25" width="56" height="48" rx="10"/>
    <path className="drag-demo-route" d="M100 50h55m-7-7 7 7-7 7"/>
    <rect className="drag-demo-browser" x="180" y="14" width="114" height="74" rx="9"/>
    <path className="drag-demo-line" d="M180 33h114"/>
    <circle className="drag-demo-dot" cx="191" cy="24" r="2"/><circle className="drag-demo-dot" cx="198" cy="24" r="2"/>
    <rect className="drag-demo-address" x="211" y="20" width="69" height="8" rx="3"/>
    <rect className="drag-demo-target" x="191" y="41" width="92" height="36" rx="6"/>
    <g className="drag-demo-success"><circle cx="237" cy="59" r="11"/><path d="m232 59 4 4 7-8"/></g>
    <g transform="translate(36 31)"><g className="drag-demo-package"><rect width="36" height="36" rx="8"/><path d="m18 7 10 6v12l-10 6-10-6V13l10-6Zm-10 6 10 6 10-6M18 19v12m-5-21 10 6"/></g></g>
    <g transform="translate(70 62)"><g className="drag-demo-cursor"><circle className="drag-demo-click" r="11"/><path d="M0 0v19l5-5 4 9 4-2-4-9h7Z"/></g></g>
  </svg>;
}
