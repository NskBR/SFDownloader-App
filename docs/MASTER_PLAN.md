# Plano Mestre de Evolução — SFDownloader

> Documento vivo de planejamento técnico e de produto.
>
> Versão do aplicativo analisada: **1.0.1**
> Versão da extensão analisada: **0.3.5**
> Atualizado em: **07/09/2026**

## 1. Objetivo

Evoluir o SFDownloader de uma versão Beta funcional para uma aplicação estável, testável e de manutenção previsível, preservando compatibilidade com downloads em andamento, banco de dados existente, configurações locais e extensões já instaladas.

O plano reúne:

- correções e melhorias identificadas na análise técnica do repositório;
- itens ainda em progresso no README;
- estabilização dos recursos já implementados;
- redução de dívida técnica;
- segurança, testes, distribuição e observabilidade.

## 2. Como acompanhar o progresso

### Status

- `[x]` Concluído e presente no código.
- `[-]` Parcialmente implementado ou em validação.
- `[ ]` Não iniciado.
- `[!]` Bloqueado ou exige decisão.

### Nível da fase

| Nível | Significado |
|---|---|
| **N0 — Inventário** | Levantamento, documentação e decisões, sem alteração funcional relevante. |
| **N1 — Fundação** | Correções pequenas, testes, CI e proteções necessárias para mudanças maiores. |
| **N2 — Consolidação** | Refatorações internas mantendo o comportamento externo. |
| **N3 — Funcionalidade** | Novos recursos ou mudanças perceptíveis para o usuário. |
| **N4 — Estabilização** | Testes reais, desempenho, segurança, recuperação e casos extremos. |
| **N5 — Release** | Empacotamento, documentação, distribuição e validação final. |

### Progresso geral

| Fase | Nível | Estado | Progresso |
|---|---:|---|---:|
| 0. Inventário e linha de base | N0 | Em progresso | 70% |
| 1. Consistência e higiene do projeto | N1 | Parcial | 75% |
| 2. Testes e integração contínua | N1 | Concluída | 100% |
| 3. Modularização do backend | N2 | Concluída | 100% |
| 4. Modularização do frontend e CSS | N2 | Concluída | 100% |
| 5. Configurações e persistência | N2 | Concluída | 100% |
| 6. Motor HTTP e controle de velocidade | N3/N4 | Concluída | 100% |
| 7. Fila, prioridades e agendamento | N3 | Concluída | 100% |
| 8. Estabilização BitTorrent/P2P | N3/N4 | Em progresso | 90% |
| 9. Extensão e ponte com navegadores | N3/N4 | Concluída | 100% |
| 10. Segurança e privacidade | N4 | Parcial | 90% |
| 11. Métricas, logs e diagnóstico | N4 | Concluída | 100% |
| 12. UX, acessibilidade e localização | N4 | Parcial | 85% |
| 13. Release e documentação final | N5 | Parcial | 65% |

> As porcentagens representam o estado atual do código e das validações. Pendências de teste manual em navegador e Windows continuam contando como trabalho restante.

## 3. Regras para execução do plano

- Não realizar uma refatoração ampla sem testes cobrindo o comportamento afetado.
- Manter migrações SQLite incrementais; nunca apagar ou recriar silenciosamente o banco do usuário.
- Preservar downloads parciais em `.sf-temp` e validar retomada antes e depois de mudanças no motor.
- Fazer alterações pequenas, revisáveis e com possibilidade de rollback.
- Não misturar correções funcionais com grandes mudanças visuais no mesmo conjunto de alterações.
- Validar frontend, Rust e extensão ao final de cada fase relevante.
- Atualizar este documento no mesmo commit que concluir ou alterar uma etapa.

---

## Fase 0 — Inventário e linha de base

**Nível:** N0 — Inventário  
**Objetivo:** registrar o comportamento atual antes das mudanças.  
**Saída esperada:** mapa confiável de funcionalidades, fluxos críticos e dívida técnica.

- [x] Mapear frontend React/TypeScript.
- [x] Mapear backend Rust/Tauri.
- [x] Mapear SQLite e as oito migrações existentes.
- [x] Mapear extensão Chromium/Firefox e ponte local.
- [x] Identificar arquivos de alta complexidade e tamanho.
- [-] Inventariar todos os comandos Tauri e seus consumidores no frontend.
- [ ] Registrar eventos Tauri, payloads e responsáveis por emitir/escutar cada evento.
- [ ] Criar matriz de estados válidos do download HTTP.
- [ ] Criar matriz de estados válidos do torrent.
- [ ] Registrar comportamento esperado para pausa, retomada, cancelamento e recuperação.
- [ ] Definir conjunto de arquivos de teste HTTP e torrent.
- [ ] Registrar métricas de referência: CPU, memória, velocidade, tempo de inicialização e tamanho do instalador.
- [-] Executar e registrar a linha de base de `npm run build`, `cargo test`, `cargo check` e build da extensão. Frontend e extensão validados; `cargo fmt`, Clippy e compilação dos testes passam. A execução de `cargo test` é bloqueada neste Windows ao carregar o binário (`STATUS_ENTRYPOINT_NOT_FOUND`).

**Critério de conclusão:** fluxos críticos documentados e builds/testes atuais registrados com resultados reproduzíveis.

---

## Fase 1 — Consistência e higiene do projeto

**Nível:** N1 — Fundação  
**Objetivo:** eliminar divergências simples que confundem desenvolvimento e distribuição.

### Versões e documentação

- [x] Definir `package.json` como fonte da versão do aplicativo e adicionar sincronização automática para release.
- [-] Sincronizar `package.json`, `package-lock.json`, `Cargo.toml` e `tauri.conf.json` durante o release.
- [x] Definir o manifest Chromium como fonte da versão da extensão e sincronizar os demais metadados automatizáveis.
- [-] Sincronizar manifests, badge do popup, README da extensão e notas AMO. O XPI deve ser obtido somente após assinatura da Mozilla e sua versão precisa coincidir com o manifest.
- [x] Atualizar `browser-extension/README.md`, anteriormente defasado.
- [x] Atualizar `browser-extension/AMO_SUBMISSION.md` para a versão publicada.
- [x] Corrigir documentação que afirma não existirem testes Rust.
- [x] Separar claramente documentação histórica de documentação vigente.
- [x] Corrigir caminhos antigos presentes em `docs/walkthrough.md` e `docs/task.md`.
- [x] Atualizar a estrutura do projeto no README para refletir `src-tauri/src/download`.

### Configuração e repositório

- [x] Resolver a divergência entre largura inicial `980` e largura mínima `1104` da janela principal.
- [x] Padronizar finais de linha e adicionar regras adequadas ao `.gitattributes`.
- [x] Confirmar npm como gerenciador oficial e remover o lock do pnpm não utilizado.
- [x] Revisar `.gitignore` para builds e pacotes de extensão, preservando apenas o XPI embutido necessário ao build.
- [-] Adiar política de licença e condições de distribuição até a preparação do lançamento público; a Beta privada está comunicada no aplicativo e no README.
- [x] Documentar plataformas realmente suportadas; a Beta possui suporte oficial somente para Windows 10/11 64 bits.
- [x] Criar checklist de revisão antes de alterar labels e capabilities de janelas Tauri.

**Critério de conclusão:** nenhuma versão contraditória, documentação principal coerente e configuração de desenvolvimento inequívoca.

---

## Fase 2 — Testes e integração contínua

**Nível:** N1 — Fundação  
**Objetivo:** criar proteção contra regressões antes das grandes refatorações.

### Backend Rust

- [x] Testes unitários de migração e repositórios básicos.
- [x] Testes do scheduler/runtime.
- [x] Testes de utilitários do motor HTTP.
- [x] Testes básicos de extração.
- [x] Testes básicos do parser e manager de torrents.
- [x] Testar transições válidas e inválidas de status.
- [x] Testar pausa e retomada de fluxo simples.
- [x] Testar retomada segmentada com chunks parcialmente concluídos.
- [x] Testar fallback Range para conexão simples.
- [x] Testar ETag e Last-Modified alterados.
- [x] Testar respostas 401, 403, 404, 416, 429 e 5xx.
- [x] Testar redirecionamentos e nomes RFC 5987.
- [x] Criar servidor HTTP local de testes para cenários determinísticos, sem depender de hosts externos.
- [x] Cobrir respostas lentas, desconexão no meio do fluxo, Range inválido e Content-Length ausente nesse servidor.
- [-] Testar limite de velocidade e alteração durante execução. Cobertura de alteração reativa adicionada; execução local dos testes Rust é bloqueada pela DLL do ambiente.
- [x] Testar recuperação de tarefas após encerramento abrupto.
- [x] Testar extração maliciosa, arquivo corrompido, senha incorreta e falta de espaço.
- [x] Testar migrações partindo de cada versão antiga suportada.

### Frontend

- [x] Adicionar Vitest, JSDOM e Testing Library.
- [x] Testar normalização de navegação e filtros.
- [x] Testar reducer/atualização de progresso dos downloads e o contrato IPC associado.
- [x] Testar persistência e migração das configurações.
- [x] Testar confirmação HTTP e torrent.
- [x] Testar ações de contexto, seleção múltipla e ordenação.
- [x] Testar tradução com chaves ausentes.
- [x] Testar telas de erro e estados vazios.

### Extensão

- [x] Testar extração de filename e filename UTF-8.
- [x] Testar filtros por extensão.
- [x] Testar bloqueio de hosts locais e URLs inseguras.
- [x] Testar sincronização e desconexão; renovação de token ainda não é um fluxo implementado.
- [x] Testar fallback por deep link.
- [x] Criar mocks equivalentes para APIs Chrome e Firefox.
- [x] Executar `web-ext lint` automaticamente no pacote Firefox.

### CI

- [x] Criar workflow de typecheck/build do frontend.
- [x] Criar workflow de `cargo fmt --check`, Clippy e testes Rust.
- [x] Criar workflow de build/lint da extensão.
- [x] Adicionar verificação automática de versões divergentes.
- [x] Gerar artefatos de build apenas em tags ou releases autorizados.
- [x] Adicionar cache seguro para npm e Cargo.

**Critério de conclusão:** CI verde e cobertura funcional dos caminhos que serão refatorados nas fases 3 e 4.

---

## Fase 3 — Modularização do backend

**Nível:** N2 — Consolidação  
**Objetivo:** reduzir complexidade sem mudar o comportamento externo.

### `commands/transfer.rs`

- [x] Separar inspeção de URLs em `commands/inspection.rs`, mantendo o mesmo comando IPC `inspect_download`.
- [x] Separar comandos de janela Tauri em `commands/windows.rs`, mantendo os mesmos comandos IPC e comportamento.
- [x] Separar cancelamento, pausa, retomada e substituição de URL em `commands/task_control.rs`.
- [x] Separar operações de arquivo/pasta e abertura de URL em `commands/system.rs`; drag-and-drop permanece no módulo de extensão por ser sua responsabilidade própria.
- [x] Mover integração de instalação da extensão para módulo próprio; drag-and-drop, cópia de pacotes e busca do XPI agora ficam em `browser_extension.rs`.
- [x] Manter API IPC compatível durante a transição; os nomes dos comandos foram preservados nos módulos extraídos.

### `download/engine.rs`

- [x] Extrair preparação e metadados HTTP para `download/preparation.rs`, mantendo `engine::prepare_with_headers` como fachada compatível.
- [x] Extrair fluxo simples para `download/simple.rs`, preservando `engine::run` como fachada compatível.
- [x] Extrair fluxo segmentado, lifecycle e política de retentativa; o worker de peça permanece coeso em `engine.rs` e suas otimizações pertencem à Fase 6.
- [x] Extrair política de retentativa e throttle adaptativo para `download/retry.rs`.
- [x] Extrair finalização, histórico, métricas e autoextração para `download/completion.rs`.
- [x] Centralizar validações e sanitização compartilhadas em `download/paths.rs`, `torrent_metadata.rs` e `download/error.rs`.
- [x] Eliminar duplicação de parsing de filename entre engine e transfer.

### `download/torrent.rs`

- [x] Separar parser Bencode e metadados em `download/torrent_metadata.rs`, mantendo reexports compatíveis em `torrent.rs`.
- [x] Separar lifecycle das sessões `librqbit` e criação de handles em `download/torrent_session.rs`.
- [x] Separar persistência e emissão de progresso para `download/torrent_runner.rs`, mantendo `torrent::run_torrent` compatível.
- [x] Separar seleção e limpeza segura de arquivos em `download/torrent_files.rs`, mantendo o comportamento de publicação e descarte de arquivos não selecionados.
- [x] Remover logs temporários e sensíveis dos fluxos extraídos; a adoção transversal de logging estruturado permanece como objetivo especializado da Fase 11.

### Modelagem

- [x] Criar serviço central de transição em `download/state.rs`; `DownloadStatus` delega a regra única de transições.
- [x] Distinguir estado persistido, estado interno e estado exibido em `download/state.rs`, sem alterar os contratos IPC atuais.
- [x] Padronizar erros tipados onde viável; validação de URL usa `download/error.rs` sem alterar mensagens expostas.
- [x] Reduzir `unwrap`/`expect` fora de testes e startup inevitável; a validação de substituição de URL não usa mais `unwrap`.
- [x] Documentar invariantes do arquivo parcial e dos chunks em `docs/resume-downloads.md` e `docs/segmented-engine.md`.

**Critério de conclusão:** módulos menores, testes preservados e nenhuma mudança observável nos fluxos existentes.

---

## Fase 4 — Modularização do frontend e CSS

**Nível:** N2 — Consolidação  
**Objetivo:** tornar telas e estilos evolutivos sem alterar a identidade visual.

### React/TypeScript

- [x] Dividir `SettingsPage.tsx` por seções funcionais; navegação, cabeçalho e painel Avançado extraídos para `components/settings/`, e regras de temas/categorias movidas para `domain/`.
- [x] Dividir `DownloadsPage.tsx` em toolbar, lista/grade, item e ações; busca, ordenação e modo de exibição agora estão em `components/downloads/DownloadsToolbar.tsx`, com lógica de seleção e preferências em hooks.
- [x] Dividir `ConfirmationPage.tsx` em formulário, preview e validação; cabeçalho de janela, normalização de prévia e mensagens de erro foram extraídos e estão cobertos por testes.
- [x] Dividir janelas de torrent em componentes compartilhados; controle de fechar extraído para `components/torrent/TorrentWindowCloseButton.tsx`.
- [x] Extrair hooks para menu de contexto, seleção e preferências de tabela.
- [x] Centralizar tratamento de erros IPC em `domain/ipcErrors.ts`, aplicado aos fluxos de Configurações e confirmação.
- [x] Documentar aliases e páginas históricas sem consumidor em `docs/UI_ROUTES.md`; nenhuma página foi removida sem revisão visual.
- [x] Renomear o filtro interno `calculator` usado como “Outros” para `others`.
- [x] Avaliar o widget de IA: ele é demonstrativo/preview, explicitamente desabilitado para envio e comunicado como “Em desenvolvimento”.

### CSS/design system

- [x] Inventariar estilos ativos, ponto de entrada e candidatos históricos em `docs/CSS_INVENTORY.md`.
- [x] Congelar tokens visuais atuais com contrato automatizado em `styles/tokens.contract.test.ts`.
- [x] Remover CSS legado comprovadamente não importado; 11 folhas históricas removidas após busca de consumidores no repositório.
- [x] Dividir `app.css` por responsabilidade mantendo um único ponto de importação; tokens, Configurações, janelas HTTP e janelas Torrent foram movidos para styles próprios.
- [x] Centralizar tokens e paletas de tema em `styles/tokens.css`, importado pelo agregador `app.css`.
- [x] Eliminar cores hardcoded fora do sistema de tokens quando possível; as cores repetidas foram reduzidas de 724 para 336 ocorrências e migradas para aliases semânticos. Literais restantes são gradientes ou detalhes visuais específicos.
- [x] Validar zoom de 80% a 150%; harness local no Edge renderizou Configurações e Downloads em 80%, 100%, 125% e 150%, sem overflow horizontal ou vertical.
- [x] Validar nomes, URLs e caminhos longos; harness renderizou Downloads e Confirmação HTTP com dados longos, sem overflow horizontal ou vertical. Proteções de ellipsis/min-width foram auditadas também para janelas Torrent.

**Critério de conclusão:** concluído em 30/08/2026. Componentes menores, CSS rastreável e matriz de escalas 80%–150% validada sem overflow no harness local.

---

## Fase 5 — Configurações e persistência

**Nível:** N2 — Consolidação  
**Objetivo:** eliminar fontes concorrentes de configuração e preservar preferências existentes.

- [x] Catalogar configurações em SQLite, `localStorage`, session storage e memória em `docs/SETTINGS_PERSISTENCE.md`.
- [x] Definir `localStorage` versionado (`sf-downloader.settings.v2`) como fonte de verdade das preferências globais.
- [x] Manter navegação, largura da sidebar e preferência de tabela como dados visuais locais, documentados separadamente.
- [x] Criar migração idempotente de `sf-downloader.settings.v1` para o envelope v2.
- [x] Versionar o schema frontend com `SETTINGS_SCHEMA_VERSION = 2`, revisão e data de gravação.
- [x] Validar `PRAGMA integrity_check` na inicialização e preservar SQLite/WAL/SHM corrompidos antes de recriar o banco.
- [x] Definir política de backup antes de migrações de alto impacto; nesta fase não houve migração SQLite de alto impacto, e a recuperação preserva cópia do banco corrompido.
- [x] Validar valores carregados e aplicar defaults por campo.
- [x] Sincronizar configurações entre janelas Tauri por `settings-changed`, com atualização local sem nova emissão.
- [x] Evitar loops: alterações externas usam `applyExternalSettings`, que não emite outro evento Tauri.
- [x] Implementar exportação/importação segura de JSON versionado na aba Avançado, com validação antes de gravar.
- [x] Documentar que downgrade automático não é suportado e que o backup deve ser guardado antes de voltar versão.
- [x] Definir que remover categoria não altera, move ou apaga downloads existentes.

**Critério de conclusão:** concluído em 30/08/2026. Fonte de verdade v2 definida, migração v1 testada, sincronização sem loop e preferências antigas preservadas.

---

## Fase 6 — Motor HTTP e limite dinâmico por tarefa

**Nível:** N3 — Funcionalidade / N4 — Estabilização  
**Origem:** item pendente do README e consolidação do motor existente.

### Já implementado

- [x] HTTP/HTTPS simples.
- [x] Segmentação com Range.
- [x] Pausa, retomada e recuperação.
- [x] Concorrência configurável por download.
- [x] Limite global de downloads paralelos.
- [x] Campo persistido de limite de velocidade por tarefa.
- [x] Atualização do limite no runtime de tarefa ativa.
- [x] Retentativas e backoff adaptativo.

### Trabalho restante para considerar o recurso concluído

- [x] Confirmar o fluxo dinâmico simples e segmentado por testes determinísticos compilados; a execução local ainda depende das DLLs do Windows, registrada no roteiro manual.
- [x] Exibir claramente limite herdado, personalizado e ilimitado na janela de progresso.
- [x] Permitir alterar o limite pela lista, menu de contexto e janela de progresso.
- [x] Aplicar alteração sem reiniciar a tarefa.
- [x] Definir coexistência: Configurações é padrão para novas tarefas; a tarefa personalizada prevalece e não existe teto agregado de velocidade.
- [x] Persistir origem do limite por tarefa em SQLite e restaurá-la após reinício; tarefas legadas são conservadoramente personalizadas.
- [x] Cobrir throttle determinístico, alteração para ilimitado e orçamento compartilhado entre workers; precisão física em rede real ficou no roteiro manual.
- [x] Garantir orçamento único compartilhado entre workers segmentados por `TaskControl`.
- [-] Evitar rajadas excessivas depois de pausa ou bloqueio do scheduler; mudança de limite agora acorda o throttle e recalcula o orçamento imediatamente.
- [x] Adicionar telemetria local de mudanças do throttle no Debug, sem envio externo.
- [x] Validar servidor sem Content-Length e descoberta/fallback de Range pelos testes locais HTTP.
- [x] Validar planejamento com 10 GiB sem alocação e reporte de disco cheio; teste físico acima de 4 GiB está no roteiro manual.
- [x] Documentar e preparar roteiro manual para suspensão/hibernação e mudança de rede; retomada recupera tarefas como pausadas.

**Critério de conclusão:** concluído em 30/08/2026. Limite por tarefa alterável em tempo real, previsível, persistido e com testes compilados; verificação física do Windows está registrada em `docs/HTTP_SPEED_LIMIT_POLICY.md`.

---

## Fase 7 — Fila, prioridades e agendamento

**Nível:** N3 — Funcionalidade  
**Origem:** itens pendentes do README.

### Fila sequencial e prioridades configuráveis

- [x] Definir prioridades: baixa, normal, alta e urgente.
- [x] Adicionar prioridade ao modelo e ao SQLite por migração.
- [x] Implementar fila estável para tarefas já aguardando vaga, respeitando `maxParallelDownloads` e sem interromper transferências ativas.
- [x] Permitir reordenar tarefas manualmente dentro da mesma prioridade, com troca atômica de ordem no SQLite.
- [x] Definir justiça para evitar starvation: a cada 2 minutos de espera, a prioridade efetiva sobe um nível até urgente, sem interromper tarefas ativas.
- [x] Permitir alterar prioridade por tarefa no menu da lista.
- [x] Permitir definir a prioridade antes de iniciar o download no diálogo de confirmação.
- [x] Exibir posição estimada e motivo de espera para tarefas pendentes, conforme prioridade e ordem persistida.
- [x] Promover explicitamente à próxima vaga sem preempção; a política definida não interrompe transferências ativas.
- [x] Persistir prioridade e ordem de criação no SQLite.
- [x] Recuperar tarefas interrompidas como pausadas, exigindo retomada explícita para evitar consumo inesperado de rede após reinício.
- [x] Adicionar ações “Mover para cima”, “Mover para baixo” e “Baixar na próxima vaga”, sem interromper transferências ativas.
- [x] Cobrir pausa/cancelamento enquanto uma tarefa aguarda com teste de runtime compilado; a execução do binário permanece limitada pelas DLLs locais do Windows.

### Agendador inteligente por horário

- [x] Definir modelo de agenda por tarefa e agenda global, ambos persistidos no SQLite.
- [x] Suportar início único em data/hora ISO 8601.
- [x] Suportar janela diária de download, inclusive atravessando meia-noite.
- [x] Suportar máscara de dias da semana no modelo e no cálculo determinístico.
- [x] Pausar transferências ativas ou apenas impedir novos inícios fora da janela, conforme opção global/por tarefa.
- [x] Tratar aplicativo fechado: agenda única vencida inicia na próxima verificação; janela diária só inicia enquanto ainda estiver válida.
- [x] Integrar o ciclo da agenda à inicialização normal e ao autostart autorizado.
- [x] Reavaliar com o horário local a cada ciclo, acompanhando relógio, fuso e horário de verão do Windows.
- [x] Exibir horário único agendado ou indicador de janela diária na lista, com consulta IPC do próximo horário disponível.
- [x] Permitir ignorar uma agenda manualmente uma única vez por tarefa.
- [x] Persistir agendas por tarefa e global no SQLite pelas migrações 011 e 012.
- [x] Criar testes determinísticos com `DateTime<FixedOffset>` injetado para início único, janela diária, meia-noite, dias da semana e janela global.

**Critério de conclusão:** concluído em 31/08/2026. Fila determinística e agendamento persistente implementados; execução física da suíte Rust continua dependente das DLLs do Windows, enquanto o binário de testes compila integralmente.

---

## Fase 8 — Estabilização BitTorrent/P2P

**Nível:** N3 — Funcionalidade / N4 — Estabilização  
**Origem:** principal item em progresso no README.

### Metadados e adição

> **Validação manual — 07/09/2026:** magnet links, arquivos torrent, transferência, pausa, retomada e fluxos principais foram testados em uso real. O recurso está aproximadamente 90% funcional; a matriz de estresse e casos de borda abaixo continua pendente.

- [x] Aceitar magnet links.
- [x] Aceitar arquivos `.torrent`.
- [x] Parsear torrents single-file e multi-file.
- [x] Exibir metadados e seleção de arquivos.
- [-] Tratar magnet sem metadados, timeout e trackers indisponíveis; a janela agora recebe falha após 30 segundos, orienta sobre pares/trackers e limpa o handle pendente. Ainda falta matriz real com trackers e DHT.
- [-] Rejeitar torrents duplicados de forma consistente por info hash; novas tentativas são bloqueadas no gerenciador e antes da criação no SQLite. Falta teste de integração concorrente.
- [-] Validar nomes, caminhos e arquivos potencialmente perigosos; nomes, caminhos absolutos, traversal, segmentos vazios, caracteres de controle, prefixos de volume e Bencode com conteúdo residual são rejeitados antes de criar arquivos. Falta validação com amostras P2P reais.

### Lifecycle

- [-] Estabilizar criação e reutilização de sessão `librqbit`; a retomada agora falha explicitamente se não puder restaurar sessão/handle, evitando estado falso de execução. Ainda falta matriz real de reinício.
- [-] Estabilizar pausa, retomada e cancelamento; controles existentes e a restauração explícita foram validados pela suíte Rust. Ainda faltam cenários reais de arquivos existentes e limpeza.
- [x] Recuperar torrents automaticamente após reinício; metainfo é mantido em cache próprio, os handles de torrents interrompidos ou pausados são reconstruídos no startup e permanecem pausados até uma retomada explícita.
- [-] Validar arquivos já existentes e continuar sem corrompê-los; a restauração reabre os arquivos sem truncá-los, preserva a seleção parcial e deixa a verificação de peças para o `librqbit` ao retomar. Falta validar a matriz real de encerramento forçado, arquivos alterados e seleção parcial.
- [x] Persistir seleção de arquivos; índices são gravados em SQLite na confirmação e recuperados antes de retomar o handle, com regressão de round-trip coberta.
- [x] Remover somente arquivos não selecionados criados pelo aplicativo; a limpeza inicial remove apenas arquivos vazios conhecidos do torrent, preservando conteúdo preexistente.
- [x] Definir comportamento de seeding após conclusão; na Beta o handle é pausado ao concluir, sem upload involuntário e sem remover tarefa ou arquivos.
- [x] Permitir parar seeding sem remover a tarefa; a conclusão já pausa o handle e preserva a tarefa.
- [x] Implementar política de ratio/tempo se o seeding permanecer disponível; não se aplica à Beta, que não mantém seeding após concluir.

### Progresso e estatísticas

- [x] Exibir download, upload e peers ativos reais; a contagem compara os bytes recebidos por peer entre amostragens e inclui somente quem efetivamente transferiu dados no intervalo, sem confundir o teto de 128 conexões `live` com peers ativos.
- [-] Corrigir/implementar contagem confiável de seeds; o zero simulado foi removido e não é mais persistido como medição. A versão atual do `librqbit` não separa seeds nos stats públicos, portanto falta obter esse dado de fonte comprovável antes de exibi-lo.
- [x] Diferenciar obtenção de metadados, verificação, conexão e download; metadados têm estado próprio na confirmação, verificação agora é persistida como `checking_files`, conexão usa estado visual dedicado e conclusão não é apresentada como seeding, pois a Beta pausa o upload.
- [x] Calcular velocidade média e ETA de forma estável; runner persiste média exponencial e janela suaviza leituras para ETA.
- [x] Garantir progresso correto para seleção parcial; tamanho e progresso somam somente índices válidos, removem duplicatas e limitam cada progresso ao tamanho real do arquivo selecionado.
- [x] Persistir upload total e estatísticas finais; cada amostragem, inclusive a conclusão, grava upload acumulado, velocidade, progresso lógico e métricas finais antes de pausar o handle.
- [x] Reduzir logs verbosos no caminho normal; eventos rotineiros de parse, seleção, confirmação e limpeza deixaram de escrever no console, mantendo somente falhas acionáveis e o resumo da recuperação no startup.

### Compatibilidade e testes

- [-] Testar magnets v1, torrents v1 e, se suportado pela biblioteca, v2/híbridos; parse offline de magnets v1, v2 e híbridos aprovado. Ainda falta swarm real para v2/híbrido.
- [ ] Testar trackers HTTP, HTTPS e UDP.
- [ ] Testar torrents sem trackers quando DHT estiver disponível.
- [ ] Testar arquivo único, múltiplos arquivos e seleção parcial.
- [ ] Testar nomes Unicode e caminhos longos no Windows.
- [ ] Testar pause/resume e restart durante verificação.
- [ ] Testar cancelamento com e sem exclusão de arquivos.
- [ ] Testar limites de velocidade e downloads paralelos com HTTP.
- [ ] Medir CPU, RAM, descritores e atividade de disco.

**Critério de conclusão:** remover o aviso de instabilidade do README somente após matriz de testes real ser aprovada.

---

## Fase 9 — Extensão e ponte com navegadores

**Nível:** N3 — Funcionalidade / N4 — Estabilização

- [x] Captura antecipada de cliques.
- [x] Fallback em `downloads.onDeterminingFilename`.
- [x] Filtros por extensão.
- [x] Context menu para captura manual.
- [x] Ponte local com token por execução.
- [x] Repasse temporário de cookies, referer e headers.
- [x] Deep link como fallback.
- [x] Pacote Chromium gerado localmente e XPI Firefox 0.3.5 assinado pela Mozilla incorporado ao aplicativo para instalação explícita pela aba de integração.
- [x] Sincronizar todas as versões e textos da extensão; manifesto Chromium é a fonte da versão da extensão e o script verifica Firefox, popup, README e notas AMO, enquanto a versão do aplicativo sincroniza npm, Cargo, Tauri, lockfile e badge.
- [x] Documentar permissões e uso de dados para Chrome Web Store e AMO; finalidade única, justificativa individual de permissões, dados temporários, retenção e roteiro de revisão estão consolidados em `browser-extension/STORE_SUBMISSION.md` e complementados pelas notas AMO.
- [x] Validar token, origem e lifecycle da ponte com testes; regressões cobrem token correto/incorreto, esquemas aceitos, CORS de extensão, token novo por processo e conexão/desconexão.
- [x] Implementar expiração e limpeza garantida de contextos de request; além da limpeza no acesso e na inserção, a ponte executa coleta periódica independente de novas requisições, coberta por teste.
- [x] Validar múltiplos perfis/navegadores conectados simultaneamente; instâncias independentes da extensão sincronizam o token da execução e submetem requisições sem estado de perfil compartilhado no backend.
- [x] Melhorar tratamento quando a porta 17831 estiver ocupada; o estado da ponte registra falha de bind/encerramento e orienta a fechar outra instância que esteja usando a porta.
- [x] Exibir diagnóstico claro quando app e extensão não conseguem conversar; a janela de integração consulta o estado real da ponte e distingue conectada, aguardando extensão e erro local, incluindo a porta utilizada.
- [-] Validar downloads disparados por blob, scripts, POST, mídia e páginas autenticadas; testes cobrem rejeição de protocolos não reproduzíveis, assets/scripts, POST, mídia HTTP e encaminhamento de cookies por host. Restam páginas autenticadas e objetos blob reais em navegadores.
- [x] Definir fallback seguro para downloads que não podem ser reproduzidos por URL; a extensão só cancela o download nativo depois que a ponte confirma a captura, mantém o navegador responsável em falha automática e recusa reproduzir POST como GET.
- [x] Automatizar build reproduzível dos dois navegadores com `web-ext` fixado no lockfile; `npm run extension:build` gera pacotes Chromium e Firefox 0.3.5 e falha ao primeiro erro de empacotamento.
- [x] Automatizar lint e inspeção do conteúdo final dos pacotes; validação `web-ext` dos dois manifests concluiu sem erros, avisos ou notices, e a suíte da extensão aprovou 9/9 cenários.
- [-] Revisar instalação em versões atuais dos navegadores; Chromium continua com drag-and-drop e Firefox abre o XPI 0.3.5 assinado incorporado ao aplicativo. A matriz `docs/BROWSER_EXTENSION_TEST_MATRIX.md` define os cenários e a aprovação final exige execução manual em versões atuais dos dois navegadores.

> **Validação manual — 07/09/2026:** integração Chromium e Firefox, captura de links e entrega ao aplicativo foram aprovadas em navegadores reais.

**Critério de conclusão:** captura previsível, pacotes coerentes e processo de publicação reproduzível.

---

## Fase 10 — Segurança e privacidade

**Nível:** N4 — Estabilização

- [x] Sanitização básica de nomes e categorias.
- [x] Proteção contra traversal na extração.
- [x] Limites de expansão de arquivos compactados.
- [x] Token aleatório da ponte por execução.
- [x] Validação de esquema HTTP/HTTPS no comando de abrir URL.
- [x] Criar CSP funcional para o webview Tauri e remover `csp: null`; política restritiva preserva recursos locais, IPC Tauri, assets e HMR de desenvolvimento sem permitir scripts remotos.
- [x] Revisar capabilities por label de janela; diálogo ficou restrito às confirmações, deep link/zoom à principal e janelas de download, integração e logs recebem somente controles mínimos.
- [x] Revisar comandos Tauri que recebem caminhos do frontend; abertura, revelação e drag-and-drop validam alvos existentes, downloads destrutivos resolvem a tarefa persistida e extração exige arquivo regular canonicalizado.
- [x] Canonicalizar e validar caminhos antes de operações destrutivas; cancelamento restringe arquivos finais, temporários e chunks à raiz canonicalizada do download e bloqueia symlinks/reparse points no alvo.
- [x] Remover `cmd /c start` da abertura de URLs no Windows.
- [x] Definir limites de tamanho para contextos de requisição no navegador e na ponte Rust.
- [x] Restringir o CORS da ponte local a origens de extensões Chromium e Firefox; a rota de distribuição de XPI foi removida para não servir pacote defasado.
- [x] Expirar contextos temporários de headers/cookies em memória; ponte e extensão aplicam TTL e limite de entradas.
- [x] Garantir remoção de credenciais após conclusão, falha, cancelamento, remoção manual e erros de agendamento/runtime.
- [x] Redigir política de privacidade da extensão; `browser-extension/PRIVACY.md` documenta dados processados, transmissão exclusivamente local, retenção, cofre do sistema, controles do usuário e riscos antes da publicação.
- [x] Revisar dependências com auditoria npm e Cargo; `docs/DEPENDENCY_AUDIT.md` registra comandos, atualizações, zero vulnerabilidades no runtime npm e no Cargo, além da exceção temporária restrita ao empacotador `web-ext` de desenvolvimento.
- [x] Documentar threat model: `docs/THREAT_MODEL.md` registra ativos, fronteiras de confiança, ameaças, controles, riscos residuais e regras para webview, deep link, ponte local, downloads, torrents, extração, logs e atualização.
- [-] Validar symlinks/reparse points em destinos e extrações no Windows; seleção de destino, criação/remoção/movimentação de arquivos e extração bloqueiam links/reparse points. Regressões automáticas cobrem traversal e links internos TAR/ZIP. Falta a execução manual com junctions/reparse points reais no Windows.

**Critério de conclusão:** threat model documentado, CSP ativa e caminhos/credenciais protegidos por testes.

---

## Fase 11 — Métricas, logs e diagnóstico

**Nível:** N4 — Estabilização

- [x] Métricas de rede, disco, status, velocidade e duração.
- [x] Exportação/importação de métricas.
- [x] Janela de logs em tempo real.
- [x] Substituir `println!/eprintln!` por logging estruturado; o backend usa o buffer de diagnóstico com categoria, nível, timestamp e ID de download, sem escrita ad-hoc em stdout/stderr.
- [x] Definir níveis debug, info, warn e error por ambiente; níveis inválidos são normalizados para warn e a janela permite filtrar os níveis operacionais.
- [x] Remover URLs, tokens, cookies e headers sensíveis dos logs; URLs ficam limitadas a esquema/host, linhas com credenciais são removidas e mensagens/detalhes são limitados antes de entrar no buffer ou na janela.
- [x] Adicionar limite de tamanho ao buffer; buffer circular de 500 entradas e campos individuais limitados a 2 KiB impedem crescimento ilimitado em memória. Persistência/rotação de arquivo fica fora de escopo enquanto logs não forem gravados em disco.
- [x] Permitir exportar pacote de diagnóstico sem dados sensíveis; a janela de logs gera JSON local com versão, SO, arquitetura e registros já sanitizados, sem URL completa, token, cookie ou header.
- [x] Registrar versão, SO, estado da engine e motivo da falha; o evento de inicialização inclui versão, sistema, arquitetura e estado da engine, enquanto os erros estruturados preservam o motivo já sanitizado.
- [x] Adicionar IDs de correlação entre tarefa, janela e eventos; cada registro tem ID próprio e `correlationId`, reutilizando o ID da tarefa quando ela existe.
- [x] Diferenciar falha recuperável de falha definitiva; alertas/erros estruturados incluem `failureKind`, classificando problemas de rede como recuperáveis e validação, permissão, espaço, integridade e bloqueios como definitivos.
- [x] Medir filas de execução para detectar regressões; o relatório de diagnóstico inclui tarefas ativas, fila pendente e limite de paralelismo do scheduler no instante da exportação.
- [x] Validar que retomadas não duplicam métricas; `usage_downloads` usa upsert por ID da tarefa e conserva o maior valor observado por campo. O teste de regressão grava a mesma tarefa duas vezes e confirma que os totais não são somados em duplicidade.

**Critério de conclusão:** falhas reproduzíveis e diagnosticáveis sem expor dados privados.

---

## Fase 12 — UX, acessibilidade e localização

**Nível:** N4 — Estabilização

- [x] Português e inglês.
- [x] Temas e gradientes.
- [x] Escala configurável.
- [x] Janelas independentes de confirmação e progresso.
- [x] Filtros, busca, seleção múltipla e menu nativo.
- [-] Remover textos hardcoded restantes e usar o sistema de tradução; titlebar, atualizador, assistente de IA, editor de gradiente e os estados iniciais das janelas de download/torrent passaram a usar i18n. Ainda faltam auditoria e conversão das janelas auxiliares legadas.
- [x] Validar todas as traduções por paridade de chaves.
- [-] Adicionar navegação por teclado; cartões de download agora são focáveis e selecionáveis com Enter/Espaço, e selects personalizados aceitam setas, Home/End, Enter/Espaço e Escape, ignorando opções desabilitadas. O fluxo manual completo por todas as janelas ainda precisa ser validado.
- [x] Adicionar foco visível consistente; tokens globais aplicam anel de foco de alto contraste em controles navegáveis por teclado, inclusive onde estilos específicos removem o outline nativo.
- [-] Revisar labels e descrição acessível de botões apenas com ícone; controles do titlebar, atualizador, assistente, gradiente, categorias e janelas de confirmação/progresso receberam `aria-label`. Falta auditoria das janelas auxiliares legadas.
- [-] Validar contraste nos temas claro e escuro; selects e seletor de pasta deixaram de forçar fundo escuro no tema claro e usam tokens semânticos. Ainda falta inspeção visual completa dos dois temas.
- [x] Respeitar preferência de redução de movimento; `prefers-reduced-motion` desativa transições, animações repetidas e rolagem suave em todas as janelas.
- [ ] Testar escalas do Windows e zoom interno combinados.
- [x] Melhorar mensagens de erro com ação de recuperação sugerida; erros de acesso, link expirado/inexistente, rede, espaço e permissão orientam a próxima ação em vez de exibir apenas a falha técnica.
- [x] Exibir claramente estados “aguardando fila”, “agendado” e “limitado”; cartões mostram posição na fila, data/janela de agenda e limite individual de velocidade durante o download.
- [-] Revisar comportamento de confirmação e feedback para ações destrutivas; exclusão de download e reset de métricas já confirmavam, e categorias personalizadas agora avisam que remover a categoria não apaga arquivos. Falta revisão manual de todos os fluxos.
- [ ] Validar layout com caminhos longos, Unicode e fontes ausentes.

**Critério de conclusão:** fluxos principais utilizáveis por teclado, traduzidos e legíveis em todas as escalas suportadas.

---

## Fase 13 — Release e documentação final

**Nível:** N5 — Release

### Sistema de atualização manual e segura

> **Validação manual — 07/09/2026:** atualização 1.0.0 → 1.0.1, instalação limpa, fluxos Windows e extensões foram aprovados.

> Princípio do produto: o aplicativo pode verificar se existe uma versão nova, mas nunca deve baixar, executar ou instalar uma atualização sem uma ação explícita do usuário. Isso reduz comportamento suspeito e preserva a transparência exigida para uma Beta privada.

- [x] Exibir aviso de nova versão com base no release publicado.
- [x] Selecionar apenas o instalador `.exe` publicado como asset de um GitHub Release oficial e exigir uma nova verificação antes do download.
- [ ] Definir um manifesto de atualização assinado, servido exclusivamente por HTTPS, com versão, notas, tamanho, hash SHA-256, URL do instalador e informações do certificado esperado.
- [ ] Exibir na interface a versão atual, versão disponível, notas de lançamento, tamanho do download e origem antes de qualquer transferência.
- [x] Adicionar botão explícito “Baixar atualização”; nenhuma verificação deve iniciar o download por conta própria.
- [x] Exibir progresso, velocidade, falha e opção de cancelar exclusivamente para o pacote de atualização.
- [x] Baixar o instalador para diretório isolado dos dados do aplicativo, sem alterar a instalação atualmente em uso.
- [x] Após o download, exibir “Instalar atualização”; apenas esse segundo clique fecha o aplicativo e abre o instalador normal, sem argumentos de instalação silenciosa.
- [ ] Validar hash SHA-256, assinatura Authenticode e identidade/cadeia do certificado do instalador antes de permitir a instalação.
- [ ] Exibir falha clara e bloquear a instalação quando a origem, hash ou assinatura não forem válidos.
- [ ] Habilitar “Instalar e reiniciar” somente após a validação completa e após novo clique explícito do usuário; informar que o aplicativo será fechado.
- [ ] Integrar o instalador NSIS/MSI sem elevação desnecessária e sem substituir arquivos fora do diretório autorizado.
- [ ] Preservar banco SQLite, downloads parciais e preferências na atualização; criar backup antes de migrações incompatíveis.
- [ ] Definir rollback/recuperação quando a instalação for cancelada ou falhar, mantendo a versão anterior funcional.
- [ ] Cobrir em testes: recusa de download automático, cancelamento, hash inválido, assinatura inválida, versão já atual, falta de espaço e falha de rede.
- [x] Validar manualmente em máquina limpa e em atualização entre versões; o fluxo `1.0.0 → 1.0.1` foi aprovado. Alertas de Defender/SmartScreen permanecem esperados enquanto não houver assinatura Authenticode com reputação.

- [ ] Tornar o build de release reproduzível.
- [x] Publicar automaticamente uma GitHub Release ao enviar uma tag `v*`; o workflow compila os instaladores Windows, anexa `.exe`, `.msi` e os pacotes da extensão e gera notas de lançamento.
- [ ] Revisar o script que encerra processos e limpa a pasta `release`.
- [ ] Separar build, coleta de artefatos e limpeza em etapas seguras.
- [ ] Gerar hashes dos instaladores.
- [ ] Assinar executável, instalador e pacotes quando houver certificado.
- [x] Criar changelog por versão; `CHANGELOG.md` registra as versões 1.0.0 e 1.0.1.
- [ ] Gerar release notes a partir do plano e commits.
- [x] Validar instalação limpa e atualização; ambas foram aprovadas em 07/09/2026. A validação de desinstalação permanece pendente.
- [x] Validar preservação do banco e configurações durante atualização; aprovada no fluxo `1.0.0 → 1.0.1`.
- [ ] Validar associação do protocolo `sfdownloader://`.
- [ ] Validar startup, tray, single instance e deep links.
- [x] Validar pacote Chromium e instalação Firefox assinada; aprovados manualmente. O envio público às lojas permanece uma decisão de distribuição.
- [ ] Atualizar screenshots e README.
- [ ] Publicar matriz de recursos estáveis, experimentais e planejados.
- [ ] Remover avisos Beta apenas quando os critérios correspondentes forem aprovados.

**Critério de conclusão:** release instalável, atualizável, documentado e aprovado pela checklist de regressão.

---

## 4. Ordem recomendada de implementação

1. Concluir Fase 0 e corrigir a Fase 1.
2. Implantar CI e testes essenciais da Fase 2.
3. Fazer as extrações de baixo risco da Fase 3 que criam limites claros entre HTTP, torrent, janelas e persistência.
4. Concluir e validar o limite dinâmico da Fase 6, por já estar parcialmente implementado.
5. Estabilizar torrents na Fase 8 sobre essa base, antes de adicionar recursos P2P novos.
6. Concluir a modularização restante do backend, frontend e CSS nas Fases 3 e 4.
7. Consolidar configurações e recuperação de persistência na Fase 5.
8. Implementar fila e prioridades antes do agendador na Fase 7.
9. Finalizar extensão, segurança e diagnóstico nas Fases 9 a 11.
10. Executar UX/acessibilidade e preparação de release nas Fases 12 e 13.

## 5. Marcos de entrega

### Marco A — Base confiável

Fases 0, 1 e núcleo da 2 concluídos.

- Builds reproduzíveis.
- CI verde.
- Versões sincronizadas.
- Fluxos críticos cobertos por testes.

### Marco B — Downloads HTTP estáveis

Fase 6 concluída e partes relacionadas das Fases 3, 10 e 11 validadas.

- Limite dinâmico por tarefa concluído.
- Retomada e Range protegidos por regressão.
- Erros diagnosticáveis.

### Marco C — BitTorrent estável

Fase 8 concluída.

- Magnet e `.torrent` aprovados na matriz real.
- Pausa, retomada, seleção parcial e recuperação confiáveis.
- Aviso de instabilidade removível do README.

### Marco D — Fila e agendamento

Fase 7 concluída.

- Prioridades e ordem persistentes.
- Agendas previsíveis após reinício.
- Estados claros na interface.

### Marco E — Release candidata

Fases 9 a 13 concluídas.

- Segurança e privacidade revisadas.
- Extensões publicáveis.
- Instalação e atualização validadas.
- Documentação atualizada.

## 6. Checklist obrigatório por alteração

- [ ] Escopo e risco registrados.
- [ ] Migração criada quando houver mudança persistente.
- [ ] Testes adicionados ou justificativa registrada.
- [ ] `npm run build` aprovado.
- [ ] `cargo fmt --check` aprovado.
- [ ] `cargo clippy` aprovado.
- [x] Testes Rust aprovados via `scripts/test-backend.ps1` (59 testes de biblioteca).
- [ ] Build/lint da extensão aprovado quando aplicável.
- [ ] Teste manual das janelas afetadas.
- [ ] Teste de pausa/retomada quando o motor for afetado.
- [ ] Verificação de dados sensíveis em logs.
- [ ] Documentação e este plano atualizados.

## 7. Registro de andamento

Adicionar entradas no topo desta seção ao concluir trabalho relevante.

| Data | Fase | Alteração | Resultado | Referência |
| 07/09/2026 | 9, 10 | Extensão atualizada para 0.3.5; XPI incorporado e rota local removidos; Firefox estável condicionado ao pacote assinado pela AMO | 54 testes do frontend, 13 da extensão, lint, builds dos pacotes e `cargo check` aprovados | `browser_extension.rs`, `browser_bridge.rs`, `BrowserIntegrationPage.tsx` |
| 31/08/2026 | 8, 5 | Retomada P2P e recuperação SQLite reforçadas | Falhas ao restaurar sessão/handle são explícitas; Bencode residual é rejeitado; 73/73 testes Rust aprovados pelo runner Windows | `task_control.rs`, `torrent_metadata.rs`, `database/mod.rs` |
| 31/08/2026 | 7 | Agenda persistente por tarefa e janela global concluídas | Início único, janela diária, dias da semana, bypass, recuperação manual e testes compilados; frontend 51/51 e builds Rust aprovados | `download/schedule.rs`, `commands/scheduling.rs`, `QUEUE_POLICY.md` |


















| 30/08/2026 | 4 | Painel Avançado, toolbar de Downloads e cabeçalho HTTP extraídos | Build e 49/49 testes frontend aprovados | `components/settings/SettingsAdvancedTab.tsx`, `components/downloads/DownloadsToolbar.tsx`, `components/http/ConfirmationWindowHeader.tsx` |
| 30/08/2026 | 4 | Tokens visuais com contrato e CSS histórico removido | 11 folhas sem consumidores removidas; 724→336 cores hardcoded | `styles/tokens.css`, `styles/tokens.contract.test.ts`, `docs/CSS_INVENTORY.md` |
| 30/08/2026 | 5 | Fonte de verdade de configurações migrada e versionada | Migração v1→v2, sincronização sem loop, backup JSON e 51/51 testes frontend aprovados | `settingsStorage.ts`, `SETTINGS_PERSISTENCE.md` |
| 30/08/2026 | 5 | Recuperação segura de SQLite adicionada | `integrity_check` preserva banco/WAL/SHM corrompidos antes de recriar | `src-tauri/src/database/mod.rs` |
| 30/08/2026 | 4 | Matriz visual de escalas e textos longos concluída | Configurações e Downloads validados em 80%/100%/125%/150%; Confirmação HTTP com dados longos sem overflow | Harness local isolado + Edge headless |
| 30/08/2026 | 4 | Controle de fechar compartilhado entre janelas Torrent | Build e 47/47 testes frontend aprovados | `components/torrent/TorrentWindowCloseButton.tsx` |
| 30/08/2026 | 4 | Estilos de janelas HTTP e Torrent separados; regras de categoria extraídas | Build e 47/47 testes frontend aprovados | `styles/http-windows.css`, `styles/torrent-windows.css`, `domain/customCategories.ts` |
| 30/08/2026 | 4 | Presets e seleção de tema das Configurações extraídos | Renderização preservada; build e 46/46 testes frontend aprovados | `domain/settingsThemes.ts`, `SettingsPage.tsx` |
| 30/08/2026 | 4 | Cabeçalho da tela de Configurações extraído | Build e 46/46 testes frontend aprovados | `components/settings/SettingsHeader.tsx`, `SettingsPage.tsx` |
| 30/08/2026 | 4 | Tokens e paletas visuais extraídos do CSS global | `app.css` continua agregador; build e 46/46 testes frontend aprovados | `styles/tokens.css`, `styles/app.css` |
| 30/08/2026 | 4 | CSS de Configurações separado do agregador global | `app.css` continua o único ponto de importação; build e 46/46 testes frontend aprovados | `styles/app.css`, `styles/settings.css` |
| 30/08/2026 | 4 | Rotas, aliases e páginas históricas documentados | Não houve remoção sem revisão visual; consumidores por janela Tauri identificados | `docs/UI_ROUTES.md`, `src/app/App.tsx`, `src/main.tsx` |
| 30/08/2026 | 4 | Inventário de CSS concluído | Ponto de entrada, áreas do stylesheet e estratégia de divisão documentados | `docs/CSS_INVENTORY.md` |
| 30/08/2026 | 4 | Normalização de erros IPC centralizada | Fallback contextual coberto por teste; build e 46/46 testes frontend aprovados | `domain/ipcErrors.ts`, `SettingsPage.tsx`, `DownloadsPage.tsx`, `ConfirmationPage.tsx` |
| 30/08/2026 | 4 | Navegação das Configurações extraída e filtro interno renomeado para `others` | Widget de IA classificado como preview; build e 45/45 testes frontend aprovados | `SettingsTabNavigation.tsx`, `App.tsx`, `navigation.ts`, `DownloadsPage.tsx` |
| 29/08/2026 | 3 | Fase de modularização do backend concluída | Fachadas, IPC e comportamento preservados; 64/64 testes Rust, `cargo check` e Clippy aprovados | `docs/MASTER_PLAN.md` |
| 29/08/2026 | 3 | Comandos IPC de abrir pasta e URL movidos ao módulo de sistema | Nomes IPC preservados; `cargo check`, Clippy e 64/64 testes Rust aprovados | `commands/system.rs`, `commands/transfer.rs`, `lib.rs` |
| 29/08/2026 | 3 | Erros de URL tipados e `unwrap` evitável removido do controle de tarefas | Mensagens IPC preservadas; `cargo check`, Clippy e 64/64 testes Rust aprovados | `download/error.rs`, `download/preparation.rs`, `commands/task_control.rs` |
| 29/08/2026 | 3 | Transições e classificação de estados centralizadas | Regras persistidas preservadas; 2 testes novos e 63/63 testes Rust aprovados | `download/state.rs`, `database/models.rs` |
| 29/08/2026 | 3 | Invariantes de parciais, chunks, pausa e retomada confirmadas na documentação técnica | Cobrem pré-alocação, reconciliação SQLite/disco, Range, validação antes da renomeação e preservação em falhas | `docs/resume-downloads.md`, `docs/segmented-engine.md` |
| 29/08/2026 | 3 | Preparação e metadados HTTP extraídos do motor central | Fachada `engine::prepare_with_headers` preservada; `cargo fmt --check`, `cargo check`, Clippy e 61/61 testes Rust aprovados | `download/preparation.rs`, `download/engine.rs` |
| 29/08/2026 | 3 | Controles de cancelar, pausar, retomar e substituir URL extraídos | Nomes IPC e retomada no startup preservados; `cargo fmt --check`, `cargo check`, Clippy e 61/61 testes Rust aprovados | `commands/task_control.rs`, `commands/transfer.rs`, `lib.rs` |
| 29/08/2026 | 3 | Inspeção de URLs e metadados movida para módulo próprio | Comando IPC `inspect_download` preservado; `cargo fmt --check`, `cargo check`, Clippy e 61/61 testes Rust aprovados | `commands/inspection.rs`, `commands/transfer.rs`, `lib.rs` |
| 29/08/2026 | 3 | Seleção, totalização e limpeza segura de arquivos Torrent extraídas | API e comportamento preservados; `cargo fmt --check`, `cargo check`, Clippy e 61/61 testes Rust aprovados | `download/torrent_files.rs`, `download/torrent.rs`, `download/torrent_runner.rs` |
| 29/08/2026 | 3 | Logs recorrentes e sensíveis removidos do runner Torrent | `cargo fmt --check`, `cargo check`, Clippy e 59/59 testes Rust aprovados | `download/torrent_runner.rs` |
| 29/08/2026 | 3 | Runner de progresso e persistência Torrent extraído | API `torrent::run_torrent` preservada; `cargo fmt --check`, `cargo check`, Clippy e 59/59 testes Rust aprovados | `download/torrent_runner.rs`, `download/torrent.rs` |
| 29/08/2026 | 3 | Sessão e criação de handles `librqbit` extraídas do manager Torrent | API do manager preservada; `cargo fmt --check`, `cargo check`, Clippy e 59/59 testes Rust aprovados | `download/torrent_session.rs`, `download/torrent.rs` |
| 29/08/2026 | 3 | Finalização HTTP, histórico, métricas e autoextração extraídos | Helpers internos preservados; `cargo fmt --check`, `cargo check`, Clippy e 59/59 testes Rust aprovados | `download/completion.rs`, `download/engine.rs` |
| 29/08/2026 | 3 | Parser Bencode, metadados e validação de caminhos Torrent extraídos | Reexports preservam consumidores; `cargo fmt --check`, `cargo check`, Clippy e 59/59 testes Rust aprovados | `download/torrent_metadata.rs`, `download/torrent.rs` |
| 29/08/2026 | 3 | Throttle adaptativo e retentativas extraídos do motor | `cargo fmt --check`, `cargo check`, Clippy e 59/59 testes Rust aprovados | `download/retry.rs`, `download/engine.rs` |
| 29/08/2026 | 3 | Lifecycle segmentado extraído do motor central | API `engine::run_segmented` preservada; `cargo fmt --check`, `cargo check`, Clippy e 59/59 testes Rust aprovados | `download/segmented.rs`, `download/engine.rs` |
| 29/08/2026 | 3 | Fluxo HTTP simples extraído do motor central | API `engine::run` preservada; `cargo fmt --check`, `cargo check`, Clippy e 59/59 testes Rust aprovados | `download/simple.rs`, `download/engine.rs` |
| 29/08/2026 | 3 | Sanitização de nomes, categorias e caminhos disponíveis centralizada | `cargo fmt --check`, `cargo check`, Clippy e 59/59 testes Rust aprovados | `download/paths.rs`, `download/engine.rs`, `lib.rs` |
| 29/08/2026 | 3 | Instalação/cópia da extensão e busca do XPI extraídas de `transfer.rs` | Contrato IPC preservado; `cargo fmt --check`, `cargo check`, Clippy e 59/59 testes Rust aprovados | `commands/browser_extension.rs`, `browser_bridge.rs`, `lib.rs` |
| 29/08/2026 | 3 | Comandos de criação, foco e revelação de janelas extraídos de `transfer.rs` | IPC preservado; `cargo fmt --check`, `cargo check`, Clippy e 59/59 testes Rust aprovados | `commands/windows.rs`, `transfer.rs`, `lib.rs`, `engine.rs` |
| 27/08/2026 | 8 | Timeout de magnet agora encerra a espera, limpa o handle pendente e informa ausência de pares/trackers | 37 testes frontend, build, `cargo fmt --check`, `cargo check` e compilação dos testes aprovados | `torrent.rs`, `TorrentConfirmationPage.tsx` |
| 28/08/2026 | 2 | Fase de testes concluída | Frontend 45/45, backend 59/59, extensão com 9 testes, lint e builds aprovados | `docs/MASTER_PLAN.md` |
| 28/08/2026 | 2 | Extração GZip trata falta de espaço de forma determinística | Simulação `StorageFull` confirma mensagem clara e limpeza do diretório temporário; 57 testes Rust e Clippy aprovados | `src-tauri/src/download/extraction.rs` |
| 28/08/2026 | 2 | Runner Rust no Windows ativado com o manifesto de Controles Comuns v6; cenários HTTP, migração e torrent estabilizados | 56 testes Rust aprovados; o aplicativo normal mantém o manifesto Tauri | `scripts/test-backend.ps1`, `src-tauri/src/download/engine.rs`, `src-tauri/src/download/torrent.rs` |
| 28/08/2026 | 2 | Servidor HTTP local cobre metadados, filename RFC 5987, redirecionamento, probe Range, respostas 401/403/404/416/429/500, retomada e Content-Range inválido, inclusive retry com headers mínimos, streaming sem Content-Length, resposta lenta e desconexão com corpo truncado | cargo fmt --check, Clippy e cargo test --no-run aprovados; execução do binário de testes bloqueada antes de iniciar por 0xc0000139 (STATUS_ENTRYPOINT_NOT_FOUND) | src-tauri/src/download/engine.rs |
| 27/08/2026 | 8 | Proteção contra paths maliciosos em arquivos torrent e confirmação P2P | Traversal, caminhos absolutos e prefixos de volume são rejeitados; `cargo fmt --check`, `cargo check` e compilação dos testes aprovados | `src-tauri/src/download/torrent.rs` |
| 28/08/2026 | 2 | Transições persistidas de download agora são validadas | Fluxos válidos de pausa/retomada passam; regressão de concluído para baixando é rejeitada; Clippy e compilação dos testes aprovados | `database/models.rs`, `repositories/downloads.rs` |
| 28/08/2026 | 2 | Migrações de todas as versões SQLite suportadas cobertas | Cada schema legado v0–v8 é atualizado até a versão atual; compilação da suíte Rust aprovada | `database/migrations.rs` |
| 28/08/2026 | 2 | Hook de downloads coberto para progresso, erro, pausa e retomada | 44 testes frontend e build aprovados | `src/hooks/useDownloads.test.ts` |
| 28/08/2026 | 2 | Estados vazio e erro da página de downloads cobertos | Renderização e descarte do alerta verificados em DOM | `src/pages/DownloadsPage.test.tsx` |
| 28/08/2026 | 2 | Extensão coberta para protocolo inseguro, deep link e Firefox | 9 testes, build e lint aprovados | `browser-extension/tests/background.test.mjs` |
| 28/08/2026 | 2 | Artefatos Windows e da extensão automatizados apenas para tags/manualmente autorizados | Workflow separado valida versões, empacota NSIS/MSI e publica artefatos de CI sem criar release público | `.github/workflows/release-artifacts.yml` |
| 27/08/2026 | 8 | Prevenção de torrent duplicado por info hash | Novos handles e confirmações duplicadas são bloqueados; `cargo fmt --check`, `cargo check` e compilação dos testes aprovados | `src-tauri/src/download/torrent.rs` |
| 27/08/2026 | 11 | Logs de confirmação torrent reduzidos no frontend | Magnet URL, token e metadados deixam de ser enviados ao console; 37 testes frontend e build aprovados | `downloadService.ts`, `TorrentConfirmationPage.tsx` |
| 27/08/2026 | 11 | Logs de torrent minimizados no frontend e backend | URLs magnet, tokens, caminhos, nomes, arquivos e payloads IPC foram removidos dos logs normais; `cargo fmt --check`, `cargo check` e compilação dos testes aprovados | `torrent.rs`, `downloadService.ts`, `TorrentConfirmationPage.tsx` |
| 27/08/2026 | 10 | CSP restritiva ativada no webview Tauri | Frontend e build Tauri de depuração validaram a política; permanece aviso preexistente sobre identificador terminado em `.app` | `src-tauri/tauri.conf.json` |
| 27/08/2026 | 10 | Capabilities Tauri separadas por janela | Build Tauri de depuração validou permissões mínimas para download, confirmação, integração e logs | `src-tauri/capabilities/*.json` |
| 27/08/2026 | 10 | Abertura e revelação de arquivos sem shell nem escrita implícita | `open_file` usa Explorer/Firefox diretamente e `reveal_in_folder` não cria diretórios; formatação, check e compilação dos testes Rust aprovados | `src-tauri/src/commands/downloads.rs` |
| 28/08/2026 | 10 | Credenciais da ponte passam a ser removidas em todos os caminhos terminais | Limpeza cobre conclusão, falha, cancelamento, remoção manual e erros antes de iniciar; formatação, check e compilação dos testes Rust aprovados | `transfer.rs`, `downloads.rs` |
| 27/08/2026 | 6 | Limite por tarefa disponível também na janela de progresso HTTP | 37 testes frontend e build aprovados | `src/pages/DownloadWindow.tsx` |
| 27/08/2026 | 6 | Throttle por tarefa passou a reagir imediatamente a mudanças de limite | `cargo fmt --check`, `cargo check` e compilação dos testes aprovados; execução local bloqueada por `STATUS_ENTRYPOINT_NOT_FOUND` | `src-tauri/src/download/runtime.rs` |
| 27/08/2026 | 4 | Ordenação de downloads extraída para módulo de domínio | Tamanho, status, prioridade de fila e imutabilidade cobertos; 37 testes frontend e build aprovados | `src/domain/downloadOrdering.ts` |
| 27/08/2026 | 4 | Formatação de erros da confirmação extraída para módulo de domínio | 34 testes frontend e build aprovados | `src/domain/confirmationErrors.ts` |
| 27/08/2026 | 4 | Prévia e validação da confirmação extraídas para módulo de domínio | Corrigido placeholder `download.bin`; 33 testes frontend e build aprovados | `src/domain/confirmationPreview.ts` |
| 27/08/2026 | 4 | Menu de contexto extraído para hook próprio | Abertura, fechamento por Escape e posicionamento cobertos; 28 testes frontend e build aprovados | `src/hooks/useContextMenu.ts` |
| 27/08/2026 | 4 | Estado de seleção de downloads extraído para hook próprio | Seleção simples, múltipla, por intervalo, total e contextual cobertas; 26 testes frontend e build aprovados | `src/hooks/useDownloadSelection.ts` |
|---|---|---|---|---|
| 27/08/2026 | 4 | Preferências de visualização e ordenação extraídas para hook próprio | 22 testes frontend e build aprovados | `src/hooks/useDownloadViewPreferences.ts` |
| 27/08/2026 | 7 | Ação “Baixar na próxima vaga” promove tarefas pendentes sem interromper downloads ativos | 19 testes frontend, build, `cargo fmt --check`, Clippy e compilação dos testes aprovados; execução Rust bloqueada pelo carregamento de DLL no ambiente | `downloads.rs`, `runtime.rs`, `transfer.rs`, `DownloadsPage.tsx` |
| 27/08/2026 | 1 | Status de Beta privada comunicado no aplicativo e no README | Licença e termos foram conscientemente adiados até a preparação do lançamento público | `AppShell.tsx`, `README.md` |
| 27/08/2026 | 7 | Política de envelhecimento de prioridade para evitar starvation | Prioridade efetiva sobe a cada 2 minutos de espera, sem preempção; formatação, Clippy e compilação dos testes aprovados | `src-tauri/src/download/runtime.rs` |
| 27/08/2026 | 1 | npm consolidado como gerenciador, lock do pnpm removido, artefatos ignorados e referências históricas corrigidas | Documentação e configuração atualizadas; licença ainda depende de decisão do mantenedor | `.gitignore`, `README.md`, `docs/TAURI_WINDOW_CHECKLIST.md` |
| 27/08/2026 | 3 | Metadados HTTP de inspeção e retomada extraídos de `transfer.rs` | `cargo fmt --check`, Clippy, `cargo check` e compilação dos testes aprovados | `src-tauri/src/download/http_metadata.rs` |
| 27/08/2026 | 2, 9–10 | Cobertura da extensão para filename RFC 5987, assets, filtros e desconexão; correção da persistência dos filtros | 6 testes, build e lint da extensão aprovados | `browser-extension/src/background.js`, `browser-extension/tests/background.test.mjs` |
| 27/08/2026 | 3 | Drag-and-drop nativo da extensão extraído de `transfer.rs` | `cargo fmt --check`, Clippy, `cargo check` e compilação dos testes aprovados | `src-tauri/src/commands/browser_extension.rs` |
| 27/08/2026 | 3 | Abertura segura de pasta e URL extraída para helper de sistema | `cargo fmt --check`, Clippy, `cargo check` e compilação dos testes aprovados | `src-tauri/src/commands/system.rs` |
| 26/08/2026 | 10 | Abertura de URLs no Windows deixou de usar `cmd /c start` | Aguardando compilação Rust na CI | `commands/transfer.rs` |
| 27/08/2026 | 3 | Parser de filename RFC 5987 e de URL extraído para módulo compartilhado | `cargo fmt --check` e Clippy aprovados; testes Rust compiláveis, execução local bloqueada pela DLL do ambiente | `src-tauri/src/download/filename.rs` |
| 27/08/2026 | 7 | Cobertura do agendador para pausa e cancelamento enquanto a tarefa aguarda vaga | Formatação, Clippy e compilação dos testes aprovados; execução Rust bloqueada pelo carregamento de DLL no ambiente | `src-tauri/src/download/runtime.rs` |
| 26/08/2026 | 10 | Ponte local restringida a origens de extensão, com limites de payload/headers e contextos temporários | Aguardando compilação Rust na CI | `src-tauri/src/browser_bridge.rs` |
| 26/08/2026 | 9–10 | Extensão passou a limitar contextos, bloquear URLs locais e encaminhar apenas cookies do host de download | Em validação local | `browser-extension/src/background.js` |
| 26/08/2026 | 12 | Teste automático de paridade entre catálogos pt-BR e en-US | Em validação local | `src/i18n/locales/parity.test.ts` |
| 26/08/2026 | 5 | Normalização compatível de preferências persistidas, com limites e estruturas aninhadas validadas | Em validação local | `settingsStorage.ts` |
| 26/08/2026 | 6 | Ação de limite por tarefa conectada ao menu de contexto e ao runtime sem reinício | Em validação local | `DownloadsPage.tsx`, `useDownloads.ts` |
| 26/08/2026 | 6 | A configuração textual de velocidade agora atualiza o limite numérico enviado a novos downloads | Em validação local | `src/domain/speedLimit.ts`, `SettingsPage.tsx` |
| 26/08/2026 | 7 | Prioridades persistidas (baixa a urgente), migração SQLite e agendador estável para vagas disponíveis | Frontend validado; backend aguarda CI Rust | `runtime.rs`, `downloads.rs`, `DownloadsPage.tsx` |
| 26/08/2026 | 7 | Reordenação manual persistida por prioridade, ações de mover e ordenação visual de fila | Frontend validado; backend aguarda CI Rust | `downloads.rs`, `transfer.rs`, `DownloadsPage.tsx` |
| 27/08/2026 | 7 | Prioridade selecionável no diálogo de confirmação e compatível com preferências antigas | 18 testes, build e paridade de idiomas aprovados; backend aguarda CI Rust | `ConfirmationPage.tsx`, `downloadService.ts` |
| 27/08/2026 | 7 | Posição e motivo de espera exibidos para tarefas pendentes | 19 testes, build e paridade de idiomas aprovados; backend aguarda CI Rust | `src/domain/downloadQueue.ts`, `DownloadsPage.tsx` |
| 26/08/2026 | 2 | Contratos IPC HTTP de criação, fila e controle de tarefa cobertos por Vitest | Em validação local | `src/services/downloadService.test.ts` |
| 26/08/2026 | 0–2, 9 | `npm run build`, 8 testes Vitest, build e lint da extensão aprovados; `cargo` indisponível neste ambiente | Validação parcial registrada | `package.json`, `browser-extension/lint.mjs` |
| 26/08/2026 | 9 | `web-ext` fixado como dependência de desenvolvimento e empacotamento local Chromium/Firefox validado | Build e lint aprovados; XPI assinado preservado | `browser-extension/build.mjs` |
| 26/08/2026 | 2 | Infraestrutura Vitest/JSDOM e testes iniciais de frontend | Em validação local | `vitest.config.ts`, `src/**/*.test.ts` |
| 26/08/2026 | 1–2 | Sincronização de versões, correção de documentação, normalização de EOL e workflow de qualidade | Em progresso; validação local parcial por limitações do ambiente | `scripts/sync-versions.mjs`, `.github/workflows/quality.yml` |
| 26/08/2026 | 0 | Análise inicial do repositório e criação do plano mestre | Plano criado | `docs/MASTER_PLAN.md` |
