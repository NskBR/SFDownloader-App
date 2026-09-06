# Rotas e aliases da interface

A aplicação principal resolve páginas em `src/app/App.tsx`.

| Identificador | Destino atual | Motivo |
|---|---|---|
| `home` | `downloads` | Alias histórico mantido para hashes salvos. |
| `organization` | `settings` | Alias histórico mantido para hashes salvos. |
| `active` | `downloads` com filtro ativo | Filtro de lista. |
| `completed` | `downloads` com filtro concluído | Filtro de lista. |
| `documents`, `music`, `videos`, `archives`, `applications`, `torrents`, `others` | `downloads` com filtro de categoria | Filtros de lista. |
| `profile`, `metrics`, `settings` | páginas próprias | Telas principais. |

As páginas auxiliares de janela (`ConfirmationPage`, `DownloadWindow`, `TorrentConfirmationPage`, `TorrentProgressWindow`, `BrowserIntegrationPage` e `DebugLogsWindow`) são abertas por labels Tauri em `src/main.tsx`, não pelo roteamento principal.

`EmptyPage`, `HomePage`, `HistoryPage` e `OrganizationPage` são históricos e não são importados pelo roteador principal. Permanecem no repositório até a remoção ser decidida em uma revisão visual específica.