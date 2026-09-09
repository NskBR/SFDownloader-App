# Changelog

Todas as alterações relevantes do SFDownloader são registradas neste arquivo.

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