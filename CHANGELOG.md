# Changelog

Todas as alterações relevantes do SFDownloader são registradas neste arquivo.

## 1.0.6 — 01/10/2026

- Extensão local 0.3.6 com botão explícito no YouTube, navegação sem duplicação e abertura da confirmação de mídia usando somente a URL do vídeo.
- XPI Firefox 0.3.6 atualizado e incorporado ao aplicativo, com verificação de compatibilidade com os scripts da extensão.
- Confirmação e progresso de mídia redesenhados com painéis compactos, seletor de qualidade em largura total e os tokens de fundo e destaque personalizados do aplicativo.
- Corrigida a extração do pacote de extensão pelo aplicativo para incluir os novos scripts e a logo, validando as dependências do manifesto.
- Fluxo independente para vídeos, Shorts e YouTube Music, com janelas próprias de confirmação e progresso que seguem o tema do aplicativo.
- MP4 nas resoluções disponíveis e MP3 em 128, 192, 256 ou 320 kbps, com capa e metadados.
- Nomes com sufixo `-sfd`, organização por categoria e integração à fila, prioridade, limites, histórico, pausa e retomada.
- Ferramentas yt-dlp, Deno, FFmpeg LGPL e ffprobe incluídas no pacote local, com versões e hashes fixados.
- Validação do arquivo final antes da conclusão. Playlists públicas com seleção de faixas, pasta com nome da playlist e fila por música; links com `list=` reconhecidos como playlist. Mixes permitem selecionar até 50 faixas da consulta atual, preservando o vídeo de origem. Lives e autenticação ficam fora desta versão.
- Consultas de mídia espaçadas em 5 segundos, cache breve e fila compartilhada entre janelas e workers. Limites de requisição do YouTube aplicam espera crescente de 60/120/240/300 segundos, com contagem regressiva e bloqueio de tentativas na confirmação.
- Confirmação de playlist/Mix em duas colunas: informações, formato e destino à esquerda; filtro e lista à direita, com duração, seleção por atalhos e rolagem própria. O tema personalizado é preservado.
- Atualizada a biblioteca TLS para rustls 0.23.45, corrigindo RUSTSEC-2026-0285.
- Empacotamento local por versão, preservando releases anteriores e incluindo ZIP portátil completo com ferramentas de mídia e checksums SHA-256.
- Avisos de terceiros incorporados aos instaladores, inventário de fontes com hashes e pacote separado com os fontes das ferramentas e dependências na mesma release.

## 1.0.5 — 26/09/2026

### Downloads e interface

- Som discreto ao concluir downloads em segundo plano, com opção para desativar e botão para testar o som.
- Removidos o assistente flutuante, sua opção nas configurações e referências relacionadas.

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
