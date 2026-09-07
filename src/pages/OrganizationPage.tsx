import { Folder, FolderOpen } from "lucide-react";
import { downloadCategories } from "../domain/categories";
import type { AppSettings } from "../domain/settings";

export function OrganizationPage({ settings }: { settings: AppSettings }) {
  const categories = [
    ...downloadCategories,
    ...settings.customCategories.map((category) => ({
      name: category.name,
      extensions: category.extensions,
      icon: Folder,
      color: "#f59e0b",
    })),
  ];
  return (
    <section className="page">
      <header className="content-header">
        <div>
          <span className="eyebrow">Biblioteca</span>
          <h1>Organização</h1>
          <p>As pastas são criadas apenas quando um download daquela categoria é iniciado.</p>
        </div>
      </header>
      {!settings.rootDownloadFolder && (
        <div className="notice">
          <FolderOpen size={20} />
          <div>
            <strong>Escolha uma pasta principal</strong>
            <span>
              Configure o destino em Configurações antes de criar a estrutura.
            </span>
          </div>
        </div>
      )}
      <div className="category-grid">
        {categories.map(({ name, extensions, icon: Icon, color }) => (
          <article className="category-card" key={name}>
            <div
              className="category-icon"
              style={{ color, backgroundColor: `${color}18` }}
            >
              <Icon size={22} />
            </div>
            <div>
              <h2>{name}</h2>
              <p>
                {extensions.length
                  ? extensions.map((item) => `.${item}`).join(", ")
                  : "Sem extensões automáticas"}
              </p>
              <span>
                {settings.rootDownloadFolder
                  ? `${settings.rootDownloadFolder}\\${name}`
                  : `Pasta raiz\\${name}`}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
