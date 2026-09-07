# Histórico de Tarefas Concluídas

> Registro histórico de uma sessão anterior. Os caminhos e nomes de componentes podem estar defasados; consulte `AGENTS.md` e `MASTER_PLAN.md` para o estado atual.

> As referências abaixo a `redesign.css` são históricas: esse CSS foi removido durante a consolidação e não deve ser restaurado.

Abaixo estão todas as tarefas executadas nesta sessão:

- `[x]` **Alternador de Temas (TitleBar)**
  - `[x]` Limitar ciclo de temas a Claro/Escuro em [TitleBar.tsx](../src/components/layout/TitleBar.tsx)

- `[x]` **Sidebar Footer & Status**
  - `[x]` Reduzir dimensões de botões e ícones em [redesign.css](../src/styles/redesign.css)
  - `[x]` Simplificar texto de status para `• extensão` em [AppShell.tsx](../src/components/layout/AppShell.tsx)
  - `[x]` Adicionar versão do aplicativo `v{appVersion}` no rodapé

- `[x]` **Página de Configurações (Estilo Windows)**
  - `[x]` Reformular HTML para lista limpa sem cards em [SettingsPage.tsx](../src/pages/SettingsPage.tsx)
  - `[x]` Estilizar elementos planos, link azul e botão azul Windows em [redesign.css](../src/styles/redesign.css)
  - `[x]` Reduzir espaçamento superior para colar o conteúdo ao rodapé da TitleBar e remover espaços vazios

- `[x]` **Tema Claro & Contraste**
  - `[x]` Corrigir a especificidade das variáveis CSS no Tema Claro (`:root[data-theme="light"]`) para corrigir textos ilegíveis
  - `[x]` Melhorar o contraste de textos, botões e status badges no Tema Claro
  - `[x]` Limpar contornos de foco nativos nos botões de navegação

- `[x]` **Integração & Desconexão da Extensão**
  - `[x]` Desativar sincronização no background e enviar requisição de `/disconnect` quando a chavinha for desligada
  - `[x]` Exibir bolinha cinza (desconectado) no app e na extensão imediatamente
  - `[x]` Adicionar versão da extensão no popup da extensão
  - `[x]` Atualizar versão da extensão para 0.2.1 no Firefox e Chromium

- `[x]` **Tabela de Downloads (Colunas, Divisória & Drag & Drop)**
  - `[x]` Centralizar textos e cabeçalhos de Data, Tamanho e Status
  - `[x]` Adicionar borda vertical divisória à esquerda da coluna de Tamanho
  - `[x]` Implementar reordenação de colunas por arraste (Drag-and-Drop) com persistência em localStorage (v4)
  - `[x]` Mapear Nome como coluna flexível `1fr` e remapear Data para ser redimensionável

- `[x]` **Correção do Menu de Contexto Cortado (Tauri Native Menu)**
  - `[x]` Remover menu HTML customizado sujeito a cortes do webview
  - `[x]` Implementar menu de contexto nativo com a API de menus do Tauri (`tauri::menu` em Rust)
  - `[x]` Escutar ações do menu no frontend para Pausar, Retomar, Novo Link, Limite, Cancelar, Excluir, Abrir pasta e Abrir arquivo

- `[x]` **Ajuste de Altura e Remoção de Espaço Vazio na Tela de Conclusão**
  - `[x]` Reduzir dimensões padrão da janela de conclusão de `300px` para `195px` em [transfer.rs](../src-tauri/src/commands/transfer.rs)
  - `[x]` Ajustar flex e padding do conteúdo em [download-windows.css](../src/styles/download-windows.css) para que não estique
  - `[x]` Corrigir altura dos botões inferiores para evitar cortes

- `[x]` **Comportamento Inteligente no Duplo Clique**
  - `[x]` Encaminhar o usuário para a tela de conclusão correta (`CompletePage`) quando o item estiver com status "completed"
  - `[x]` Abrir a janela de progresso correspondente para os demais estados

- `[x]` **Descompressão ZIP e 7z Automática (Codex)**
  - `[x]` Suporte a extração segura de arquivos ZIP/7z (inclusive protegidos por senha)
  - `[x]` Salvamento seguro de senhas em memória

- `[x]` **Categorias Personalizadas (Codex)**
  - `[x]` Cadastro de categorias em Configurações > Categorias
  - `[x]` Validação de caminhos e caracteres especiais no Rust/React

- `[x]` **Melhorias do Navegador (Codex)**
  - `[x]` Suporte a nomes codificados em UTF-8 (RFC 5987 / `filename*=`)

- `[x]` **Verificação e Compilação**
  - `[x]` Executar `npm run build` e `cargo check` com sucesso completo
  - `[x]` Compilar extensão com `node build.mjs` com sucesso completo

- `[x]` **Desempenho, tempo decorrido e extração ampliada (Codex)**
  - `[x]` Limitar eventos globais de progresso a um a cada 200 ms por download
  - `[x]` Reduzir persistência SQLite e eliminar o `SELECT` redundante após cada atualização
  - `[x]` Ativar WAL e sincronização normal no SQLite
  - `[x]` Exibir tempo decorrido na lista e na janela de conclusão
  - `[x]` Adicionar extração para RAR, TAR, TAR.GZ/TGZ e GZ, além de ZIP e 7z

- `[x]` **Meu Perfil e estatísticas de armazenamento**
  - `[x]` Total baixado em GB/TB e quantidade de downloads pelo histórico local
  - `[x]` Resumo por tipo de arquivo e dia com maior volume
  - `[x]` Bytes concluídos, bytes lidos na extração e bytes gravados no SSD
  - `[x]` Histórico diário persistente sem contabilizar novamente retomadas
  - `[x]` Separação de GB concluídos, falhados, cancelados e total geral

- `[x]` **Rodada de estabilidade, extensão e UI compacta (Codex)**
  - `[x]` Reduzir contenção no SQLite com timeout maior e persistência de chunks menos agressiva
  - `[x]` Ajustar recuperação gradual de conexões após limitação do provedor
  - `[x]` Serializar extração para não disputar todos os recursos com downloads ativos
  - `[x]` Atualizar extensão Chromium para 0.2.4 com content script de interceptação antecipada
  - `[x]` Adicionar domínio de origem e botão de copiar link na lista/janela de progresso
  - `[x]` Adicionar botão de fechar no alerta vermelho de erro da aba Downloads

- `[x]` **Correções de extração, tray e extensão 0.2.5 (Codex)**
  - `[x]` Extrair em pasta temporária `.sf-extracting-*` e publicar a pasta final apenas após sucesso
  - `[x]` Limpar pasta temporária com retries quando a extração falha
  - `[x]` Alterar padrão para iniciar o app normalmente, mantendo opção persistente de iniciar em tray
  - `[x]` Manter comportamento de esconder na bandeja ao apertar X
  - `[x]` Adicionar filtros por extensão no popup da extensão
  - `[x]` Documentar viabilidade de redesign total em fase futura

- `[x]` **Extensão Chromium estilo XDM e ícones por formato 0.2.6 (Codex)**
  - `[x]` Comparar lógica da extensão Chromium do Xtreme Download Manager
  - `[x]` Remover consulta ao storage no caminho crítico de `downloads.onDeterminingFilename`
  - `[x]` Manter estado de captura/filtros em memória para cancelamento imediato
  - `[x]` Atualizar pacotes Chromium/Firefox para 0.2.6
  - `[x]` Separar ícones e cores por formato: ZIP, RAR, 7Z, TAR, GZ, documentos, mídia e executáveis

- `[x]` **Correção AMO extensão 0.2.7 (Codex)**
  - `[x]` Remover nomes de ícone com hífen dentro do pacote da extensão
  - `[x]` Atualizar manifests e popup para `icons/icon32.png` e `icons/icon128.png`
  - `[x]` Gerar novo pacote Firefox para reenvio à validação da Mozilla

- `[x]` **Janela de Integração de Navegadores estilo XDM 0.2.8**
  - `[x]` Criar janela separada e borderless `browser-integration` acionada a partir de "Configurações"
  - `[x]` Implementar painel com guias interativas para Chrome, Edge, Firefox, Opera, Brave e Vivaldi
  - `[x]` Copiar os assets gerados da extensão para a pasta AppData do usuário
  - `[x]` Adicionar botões nativos para abrir a pasta local e copiar caminhos/links
  - `[-]` Firefox estável: disponibilizar somente o XPI 0.3.5 assinado e publicado pela Mozilla AMO; a instalação local direta foi removida
  - `[x]` Implementar suporte a arrastar-e-soltar nativo do ícone de quebra-cabeça para instalar nos navegadores Chromium (usando a crate `drag`)
