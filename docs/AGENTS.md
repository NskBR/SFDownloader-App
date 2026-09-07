# AGENTS.md — SF Downloader

Gerenciador de downloads desktop (Tauri 2 + React 18 + TypeScript + Rust).

## Comandos

- Instalar: `npm install` (use **npm**; o repositório não usa lock do pnpm).
- App completo (Rust + UI, janela nativa): `npm run tauri dev`
- Apenas a UI (Vite dev server em `http://127.0.0.1:1420`): `npm run build && npm run dev`
- Build de produção: `npm run build` (roda `tsc && vite build`, sem emitir arquivos — `noEmit:true`).
- Extensão de navegador: `npm run extension:build`, `npm run extension:test` e `npm run extension:lint`. Os diretórios em `browser-extension/dist/` são gerados antes de qualquer build/dev Tauri.
- Testes frontend: `npm test`.
- Testes Rust: `scripts/test-backend.ps1` ou `cargo test` em `src-tauri/` quando o ambiente estiver configurado. A verificação manual via `npm run tauri dev` continua necessária para fluxos visuais e nativos.

## Arquitetura multi-janela (fato central)

É um SPA único (`index.html` → `src/main.tsx`) que renderiza uma "página" diferente conforme a **label da janela Tauri** (`getCurrentWindow().label`). O roteamento por label está em `src/main.tsx`, não em um router.

| Label | Página | Arquivo |
|-------|--------|---------|
| `main` | App principal (sidebar + telas) | `src/app/App.tsx` |
| `main` | App principal (sidebar + telas) | `src/app/App.tsx` |
| `download-confirm-{token}` | Confirmação de novo download (janela à parte, pré-início) | `src/pages/ConfirmationPage.tsx` |
| `download-{id}` | Janela unificada de download: progresso **e** concluído (morph por `status`) | `src/pages/DownloadWindow.tsx` |
| `browser-integration` | Popup de integração | `src/pages/BrowserIntegrationPage.tsx` |
| `debug-logs` | Logs e diagnóstico | `src/pages/DebugLogsWindow.tsx` |
| `download-torrent-confirm-{token}` | Confirmação de torrent | `src/pages/TorrentConfirmationPage.tsx` |
| `torrent-progress-{id}` | Progresso de torrent | `src/pages/TorrentProgressWindow.tsx` |

- As janelas são criadas no Rust em `src-tauri/src/commands/windows.rs` via `WebviewWindowBuilder`. Mude tamanho e ciclo de vida nesse módulo, não em `tauri.conf.json`.
- **Janelas são borderless** → barras de título são custom e usam `data-tauri-drag-region`. Não remover esse atributo de elementos arrastáveis.
- A janela unificada `download-{id}` cobre progresso e conclusão: ao concluir, o backend chama `open_complete_window` que **foca a janela `download-{id}` já existente** (morph) em vez de abrir janela nova. Se a janela de progresso foi fechada, cria uma nova `download-{id}` mostrando o estado concluído.
- Janelas filhas (`download-{id}`, `download-confirm-*`) são reveladas pelo backend via comando `show_ready_window` (chamado pelo frontend em `src/main.tsx` após `document.fonts.ready`, com fallback de 2s). Não use `show()` direto nelas — deixe o mecanismo `show_ready_window` cuidar da exibição, senão a janela pode aparecer em branco/antes do CSS.
- Ao adicionar uma nova label de janela, registre-a em `src-tauri/capabilities/default.json` (`windows` e `permissions`), senão a janela abre sem permissões.

## Fluxo de dados de download

- Backend emite evento `download-progress` (`src-tauri/src/download/engine.rs`): `src/hooks/useDownloads.ts` e `src/pages/DownloadWindow.tsx` escutam.
- Tipos fonte da verdade: `src/domain/download.ts` → `DownloadTask` e `DownloadProgress`.
- `DownloadTask` já traz `speedAverage`, `supportsRange`, `etag`, etc. O `DownloadWindow` aproveita esses campos nas "Mais detalhes" em vez de criar estado novo.
- Abrir link externo: comando `open_url` em `src-tauri/src/commands/system.rs` (valida http/https e usa a associação de protocolo nativa). Exponha via `services/downloadService.ts` (`openUrl`) — não use `window.open`.
- Deep link: protocolo `sfdownloader://download?url=<https-url>` (registrado em `tauri.conf.json` → `plugins.deep-link`). Tratado em `src/app/App.tsx`.
- Links consumidos são marcados na sessão para impedir que `F5` duplique downloads ativos. Ao testar deep links, recarregar a janela não deve criar tarefa duplicada.

## Design system / tema

- O **único** CSS importado globalmente é `src/styles/app.css` (via `src/main.tsx`). Ele define o design "Slate & Ember": tokens em `:root` (`--bg`, `--panel`, `--surface`, `--line`, `--text`, `--text-2`, `--muted`, `--ember`=laranja, `--st-downloading/-paused/-completed/-failed/-cancelled`, `--radius`, `--shadow`). **Use sempre esses tokens** — não hardcode cores.
- `src/styles/app.css` é o agregador; ele importa `tokens.css`, `settings.css`, `http-windows.css` e `torrent-windows.css`. As folhas históricas foram removidas.
- As janelas de progresso/conclusão/confirmação reaproveitam classes de `app.css`: `.download-window`, `.download-window-title`, `.download-window-content`, `.progress-compact`, `.progress-stats`, `.info-row`, `.path-row`, `.btn-primary/secondary/ghost`, `.cancel-overlay/.cancel-dialog`.
- **Escala de UI:** `main.tsx` chama `getCurrentWebview().setZoom(settings.uiScale)`. Estilos em px podem desalinhar em escalas ≠100% — prefira `rem`/relativo onde fizer sentido, e `min-width:0` + `text-overflow:ellipsis` para texto longo não quebrar layout.
- Ícones: `lucide-react`. Ícones de arquivo por extensão: `src/components/downloads/FileIcon.tsx` (mapeia extensão→grupo com cor). Para novos tipos, adicione ao mapa `groups`.

## Convenções de código

- TypeScript `strict:true`; imports de ícones/componentes no topo. `tsc` não emite — build quebra em erro de tipo.
- Estado de download em tempo real vem de eventos Tauri, não de polling. Use `listen("download-progress", …)` e filtre por `payload.id`.
- `vite.config.ts`: dev server porta `1420`, `strictPort`, ignora `src-tauri/target`, `dist`, `target`.

## Pontos de atenção / armadilhas

- Janelas filhas têm labels dinâmicas; registre cada padrão no arquivo de capability correspondente antes de adicionar uma nova janela.
- `tauri.conf.json` define só a janela `main` (1104×611, `visible:false`). As outras janelas são criadas em runtime no Rust.
- Nunca abrir janelas filhas diretamente: `main.tsx` usa `show_ready_window` depois de CSS/fontes ficarem prontos.
- `esbuild` exige `onlyBuiltDependencies` (ver `pnpm-workspace.yaml`) — relevante só se migrar para pnpm.
- Arquivos temporários do download **não** ficam ao lado do destino: parciais vão para `<destino>/.sf-temp/<nome>.part`, fatias segmentadas são `<temp>.chunk-<i>`, e extração usa `.sf-extracting-<nome>-<uuid>`. Não hardcode caminhos — use os helpers de `src-tauri/src/download/engine.rs`.

## Documentação de referência

Para detalhes de arquitetura, leia `docs/` em vez de inferir pelo código:
- `docs/window-lifecycle.md`, `docs/download-windows.md` — criação/revelação de janelas e `show_ready_window`.
- `docs/download-engine.md`, `docs/segmented-engine.md`, `docs/resume-downloads.md` — motor HTTP, peças e retomada.
- `docs/database.md` — schema SQLite e repositórios.
