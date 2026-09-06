interface Props {
  title: string;
  subtitle: string;
  autoSavedLabel: string;
  saved: boolean;
}

export function SettingsHeader({ title, subtitle, autoSavedLabel, saved }: Props) {
  return (
    <header className="cfg-header">
      <div>
        <h1 className="cfg-title">{title}</h1>
        <p className="cfg-subtitle">{subtitle}</p>
      </div>
      {saved && <span className="cfg-autosave">{autoSavedLabel}</span>}
    </header>
  );
}