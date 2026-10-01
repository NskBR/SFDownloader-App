# Downloads de mídia

O fluxo YouTube é independente dos workers e das janelas HTTP/torrent. O código usa `media-confirm-{videoId}` e `media-progress-{taskId}`, os tokens de tema existentes e permissões próprias. Os comandos Rust consultam metadados, validam opções e iniciam tarefas `media`.

## Preparo e build local

Execute `npm run media:prepare` antes de testes Rust de mídia. `npm run tauri dev` e `npm run tauri build` já executam o preparo automaticamente. O script baixa ferramentas com versões fixadas em `scripts/media-tools.lock.json`, valida os SHA-256 dos pacotes e arquivos extraídos e prepara `src-tauri/resources/media-tools/`. Esse diretório é ignorado pelo Git e incorporado ao instalador Tauri.

O pacote inclui yt-dlp oficial com EJS, Deno, FFmpeg LGPL compartilhado, ffprobe, avisos de terceiros, fontes da revisão exata do FFmpeg e receitas de build. Não exige Python, FFmpeg ou Deno instalados no sistema. A build FFmpeg fixada usa o snapshot mensal de setembro, preservado por mais tempo pelo distribuidor. As ferramentas são atualizadas junto das releases do SFDownloader; não há atualização independente durante o uso.

Para preparar um instalador de teste separado da instalação normal, use `npm run tauri -- build --bundles nsis --config scripts/media-test.tauri.conf.json`. Ele tem nome e armazenamento próprios, não registra a associação `.torrent` e usa um protocolo separado. Guarde o pacote gerado em `release/media-test/`, ignorado pelo Git. Essa configuração não altera a versão da release pública nem publica arquivos no GitHub.

## Transferência e retomada

- URLs são normalizadas por domínio exato e identificação validada. Um `list=` em páginas de vídeo ou playlist seleciona a playlist; sem esse parâmetro, o link permanece individual. URLs assinadas dos formatos não são persistidas.
- As opções de formato, qualidade e vídeo ficam na tabela `media_downloads`; fila, limites e prioridade usam o runtime existente.
- Os parciais ficam em `<destino>/.sf-temp/media-<uuid>/`. Pausa encerra toda a árvore de processos e preserva esses arquivos. Retomada consulta novamente o vídeo e reutiliza os parciais do yt-dlp.
- Na conversão, pausa é bloqueada no frontend e no backend. Cancelamento continua disponível e permite preservar ou excluir os parciais.
- `ffprobe` verifica áudio, vídeo ou capa conforme o formato. O nome final preserva `-sfd`, inclusive quando há duplicatas. Falhas preservam o trabalho para uma nova tentativa.
- Processos são ocultos, usam argumentos separados e caminhos fixos. Configurações e plugins externos do yt-dlp são desativados. Um Job Object do Windows encerra FFmpeg/Deno junto com o worker.

## Validação

Testes automatizados cobrem domínios falsos, normalização de URLs, resoluções reais, lives, nomes duplicados, finalização versus pausa, quatro bitrates MP3 com capa e rejeição de arquivo inválido. Use `npm test` e `scripts/test-backend.ps1`.

Na preparação 1.0.6 em 01/10/2026, passaram 79 testes frontend, 29 da extensão e 112 Rust; 1 teste de transferência real permaneceu ignorado na execução padrão. O XPI Firefox 0.3.6 fornecido pelo mantenedor está incorporado ao aplicativo, com teste de compatibilidade de versão e dos scripts.

Validação inicial do fluxo individual: 61 testes frontend e 98 testes Rust passaram. O teste de rede separado baixou MP3 com capa, pausou a transferência, confirmou a reutilização do parcial na retomada e baixou MP4 com áudio. Para repeti-lo, execute `scripts/test-backend.ps1 real_transfer_preserves_partials --ignored --nocapture`. A consulta e os processos usam somente as ferramentas empacotadas. As prévias da interface foram conferidas em 620 × 480 e 440 × 312, incluindo título longo, tema personalizado e cancelamento durante conversão.

Os testes de rede usam um vídeo público curto. A matriz de validação em Windows limpo ainda inclui: instalação sem ferramentas globais, vídeos de diferentes resoluções incluindo 4K, escala de Windows/temas, pausa e retomada, reinicialização, cancelamento, disco cheio e falhas de conversão. Uma build local não comprova todos esses cenários em outros computadores; a distribuição 1.0.6 permanece beta.

O pacote traz as fontes da revisão exata do FFmpeg, as receitas com patches e revisões das dependências, avisos de terceiros e o inventário `media-sources.lock.json`. A release inclui `SFDownloader_1.0.6_media-sources.zip` com 1.620 pacotes de fontes de projetos, submódulos e pacotes Cargo, verificados por SHA-256. O inventário também inclui dependências de build/teste e plataformas opcionais, sem afirmar que todas estejam no executável Windows. AMF inclui somente os headers públicos e avisos usados pela receita de build; SDKs de exemplos alheios foram excluídos. Os avisos reproduzem as licenças originais, incluindo textos de licença/exceção do runtime GCC. As ferramentas continuam com DLLs e executáveis independentes, sem restrição de modificação dos seus fontes. O fornecedor usa pacotes de sistema variáveis e atualiza um pacote de build (`cc`), portanto não se afirma reprodução bit a bit do binário. Para reempacotar o cache auditado, use `python scripts/package-media-sources.py`; o script bloqueia arquivos ausentes ou com hash divergente. Os fontes são distribuídos na mesma release que os binários.

Playlists públicas (até 1.000 entradas) são consultadas com `--flat-playlist`, listadas com caixas de seleção e MP3 por padrão. O backend valida os IDs escolhidos contra a consulta e reserva todas as tarefas em uma transação, em ordem da playlist. Cada faixa possui parciais, fila, pausa, retomada e contexto de playlist persistidos; elas são salvas em `<destino>/<categoria opcional>/<nome seguro da playlist>/Título-sfd.mp3`. Faixas repetidas são deduplicadas por ID, títulos repetidos recebem sufixos e não sobrescrevem arquivos. Entradas indisponíveis identificadas são informadas; falhas ao consultar/baixar uma faixa ficam visíveis sem impedir as demais. MP4 usa um teto de resolução e seleciona, por vídeo, a maior resolução nativa abaixo dele. Lives, autenticação e cookies não são suportados. MP3 em 320 kbps não melhora a qualidade da faixa de origem; MP4 mantém a resolução original e pode usar codecs modernos que exigem um player compatível.

A consulta local da playlist pública enviada para teste retornou 196 entradas em 01/10/2026. Testes de seleção cobrem envio apenas de faixas marcadas, seleção vazia, IDs desconhecidos/repetidos, atalhos, reserva de nomes, deduplicação na pasta e persistência após reabrir o banco. A consulta não equivale a baixar toda a playlist; o teste de transferência real permanece separado.

## Mixes e intervalo de consultas

A confirmação de playlists e Mixes usa uma janela de 1.020 × 590, limitada à tela disponível, com informações, formato, qualidade e destino à esquerda e lista de faixas à direita. A lista possui filtro por título, duração quando fornecida pela origem e rolagem independente. Ctrl+A, Ctrl+clique e Shift+clique operam nas faixas visíveis, sem remover seleções ocultas ao filtrar. O campo de busca mantém Ctrl+A para selecionar seu texto. Em alturas menores, as opções rolam e os botões de confirmação continuam acessíveis; em telas muito estreitas, as colunas se empilham. Vídeos individuais continuam em 620 × 480. Os controles de maximizar/restaurar, minimizar e fechar estão disponíveis na confirmação de playlist/Mix.

Mixes são listas dinâmicas: o aplicativo consulta até 50 entradas com `--playlist-end 50` e materializa a seleção atual. IDs `RD`/`UL`, incluindo `RDMM`, são aceitos; quando o link contém um vídeo de origem, ele é preservado em `watch?v=...&list=...`. A lista escolhida permanece fixa mesmo que o YouTube altere as recomendações. As faixas seguem o mesmo destino, reserva de nomes e fila das playlists salvas.

`media_query.rs` serializa as consultas de metadados da confirmação e dos workers. Após cada consulta, espera 5 segundos antes de iniciar outra. Consultas simultâneas da mesma origem reutilizam o resultado; o cache dura 120 segundos para vídeos/playlists salvas e 30 segundos para Mixes, limitado a 12 prévias em memória. Fechar a janela libera a fila e encerra a consulta, preservando o intervalo reservado. O yt-dlp também recebe `--sleep-requests 1` para espaçar suas requisições internas de extração.

Respostas reconhecidas como HTTP 429, excesso de requisições ou bloqueio anti-bot aplicam espera global crescente de 60, 120, 240 e no máximo 300 segundos. A confirmação recebe eventos `media-query-wait`, mostra a contagem regressiva e mantém a nova tentativa desabilitada enquanto a espera não termina. Não há repetição automática após um erro. Erros de vídeo privado e HTTP 403 isolado não são tratados como rate limit. O intervalo reduz consultas, mas não garante a liberação de um IP bloqueado pelo YouTube.

A consulta real de um Mix em 01/10/2026 retornou 50 faixas preservando o vídeo de origem. Testes automatizados cobrem cache, fila, cancelamento da consulta, espera crescente, contagem regressiva e envio apenas das faixas selecionadas. O bloqueio HTTP 429 foi simulado nos testes; não foi provocado contra o serviço real.
