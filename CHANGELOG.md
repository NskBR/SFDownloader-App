# Changelog

Todas as alterações relevantes do SFDownloader são registradas neste arquivo.

## 1.0.4 — 13/09/2026

### Atualização do aplicativo

- O botão de atualização agora baixa, verifica o SHA-256, pausa downloads com segurança e inicia a instalação silenciosa automaticamente.
- Nova janela de atualização com progresso real de download, logo animada e reabertura do aplicativo ao concluir.
- A instalação preserva configurações, histórico e arquivos parciais; operações de montagem e extração impedem a atualização até terminarem.
- Reforçada a validação para aceitar somente instaladores do release oficial do SFDownloader.

## 1.0.3 — 12/09/2026

### Interface e janelas

- Corrigida a permissão de minimizar nas janelas de download e progresso.
- A logo da sidebar deixou de aceitar arraste ou interação.
- Cartões de configuração receberam tipografia e espaçamento mais compactos em áreas estreitas.

### Distribuição

- Release gerada localmente e preparada para publicação manual no GitHub Releases.
- Workflow de build no GitHub removido; builds e instaladores são produzidos somente no ambiente local.

## 1.0.1 — 07/09/2026

### Atualização e distribuição

- Publicação automatizada de instaladores Windows pelo GitHub Actions ao enviar uma tag `v*`.
- Release `v1.0.1` publicada com instalador NSIS (`.exe`) e MSI.
- Fluxo manual de atualização de `1.0.0` para `1.0.1` validado: detecção, download explícito, abertura do instalador e preservação de dados locais.
- CI Rust transferido para Linux após incompatibilidade do binário de testes Tauri com o carregador do Windows no runner.

## 1.0.0 — 07/09/2026

### Aplicativo

- Primeira release beta privada para Windows 10/11 64 bits.
- Downloads HTTP/HTTPS com pausa, retomada, fila, prioridades, limite de velocidade e agendamento.
- Organização opcional por categoria, extração de arquivos compactados e janelas de progresso.
- BitTorrent e magnet links, com seleção de arquivos e pausa de seeding ao concluir.
- Temas, idiomas Português (Brasil) e Inglês, métricas e logs sanitizados.

### Navegadores e segurança

- Integração para navegadores Chromium e Firefox por ponte local.
- XPI Firefox 0.3.5 assinado pela Mozilla incluído para instalação explícita.
- Atualizador manual que baixa apenas instaladores `.exe` de GitHub Releases oficiais e exige ação do usuário para executar a instalação.
