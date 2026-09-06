# Inventário de estilos

Atualizado em 30/08/2026 para orientar a Fase 4 sem alterar o visual existente.

## Ponto de entrada

`src/main.tsx` importa apenas `src/styles/app.css`. Esse arquivo é o ponto único de importação e concentra os estilos globais e de janela.

## Estrutura atual

- `app.css`: agregador único, reset, shell, downloads, histórico e estilos compartilhados.
- `tokens.css`: paletas, tokens semânticos e variações de tema.
- `settings.css`: configurações e personalização.
- `http-windows.css`: confirmação, progresso e conclusão HTTP.
- `torrent-windows.css`: confirmação e progresso de torrents.

Em 30/08/2026, a busca em todo o repositório confirmou que 11 folhas históricas não tinham importador estático nem dinâmico. Foram removidas: `confirmation-redesign.css`, `confirmation-xdm.css`, `flux-redesign.css`, `global.css`, `history-compact.css`, `redesign.css`, `responsive.css`, `scroll-fix.css`, `settings-scale.css`, `settings-standalone.css` e `xdm-windows.css`.

## Áreas de `app.css`

| Intervalo aproximado | Responsabilidade |
|---|---|
| 1–1.200 | tokens, reset, shell, sidebar, downloads e métricas |
| 1.200–2.300 | confirmação, progresso, conclusão, histórico e integração |
| 2.400–3.200 | janela unificada de download e correções de janela Windows |
| 3.300–5.200 | temas, personalização e telas de configurações |
| 5.200–6.200 | confirmação e progresso de torrents, update e seletores |

## Estratégia de separação

`app.css` permanece o agregador. Os blocos de tokens, configurações, janelas HTTP e torrents já foram movidos para arquivos dedicados. Em 30/08/2026, o harness local renderizou Configurações e Downloads em 80%, 100%, 125% e 150%, além de uma Confirmação HTTP com nome, URL e caminho longos; todas as medições ficaram sem overflow horizontal ou vertical.