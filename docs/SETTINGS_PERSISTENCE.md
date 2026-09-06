# Configurações e persistência

Atualizado em 30/08/2026 durante a Fase 5.

## Fonte de verdade

A fonte de verdade das preferências globais da interface é `localStorage` na chave `sf-downloader.settings.v2`. O valor é um envelope versionado (`version`, `revision`, `savedAt`, `settings`) e é normalizado por campo antes de ser usado.

A chave histórica `sf-downloader.settings.v1` é somente entrada de migração: na primeira leitura válida ela é convertida para v2 de modo idempotente e removida depois da gravação bem-sucedida. Não há duas fontes de verdade concorrentes.

A tabela SQLite `app_settings` existe por compatibilidade com bancos antigos, mas não possui consumidores no runtime atual; não deve receber novas preferências de interface até que exista uma migração completa e um repositório dedicado.

## Inventário de armazenamento

| Local | Conteúdo | Política |
|---|---|---|
| `localStorage` v2 | Preferências globais `AppSettings` | Fonte de verdade versionada. |
| `localStorage` v1 | Preferências de versões anteriores | Migração única; removida após sucesso. |
| `localStorage` de navegação/tabela/sidebar | Página recente, largura da sidebar, ordenação e modo de exibição | Preferências estritamente visuais e locais. |
| `localStorage` de confirmação | Payload temporário de janelas de confirmação | Consumido/removido pela janela correspondente. |
| `sessionStorage` | Links deep-link já processados | Efêmero, apenas para a sessão. |
| SQLite | Downloads, chunks, histórico, métricas e dados de runtime | Não armazena preferências de interface. |
| Memória React | Rascunho da tela e estado transitório | Nunca é a fonte persistida. |

## Sincronização e integridade

`saveSettings` grava o envelope, dispara um evento DOM local e emite uma vez `settings-changed` pelo Tauri. Ao receber o evento em outra janela, `applyExternalSettings` atualiza a cópia local sem reemitir, impedindo loops.

Na abertura do SQLite, `PRAGMA integrity_check` é executado antes das migrações. Se falhar, o arquivo e seus sidecars WAL/SHM são preservados com o sufixo `.corrupt-<timestamp>` e um banco novo é criado. O aplicativo não apaga silenciosamente o banco corrompido.

## Backup e compatibilidade

A aba Avançado permite exportar e importar preferências em JSON. O arquivo tem `kind: "sf-downloader-settings"` e versão explícita; importações incompatíveis são rejeitadas antes de qualquer gravação. O downgrade automático não é suportado: mantenha o backup exportado antes de voltar para uma versão antiga.

Categorias personalizadas afetam somente sugestões e organização de novos downloads. A remoção de uma categoria não altera, move ou apaga downloads já existentes.
