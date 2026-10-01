# Auditoria de dependências

Última execução: **1 de outubro de 2026**, preparação da versão 1.0.6.

## Escopo e comandos

- Runtime web: `npm audit --omit=dev`.
- Árvore npm completa: `npm audit`.
- Backend Rust: `cargo audit --json`, executado em `src-tauri` com cargo-audit 0.22.2.
- Testes: `npm test`, `npm run extension:test` e `scripts/test-backend.ps1`.
- Compilação local dos instaladores Windows NSIS/MSI e verificação dos hashes das ferramentas de mídia.

## Resultado npm

O runtime de produção retornou **zero vulnerabilidades conhecidas**.

A árvore completa retornou **8 ocorrências: 5 altas e 3 moderadas**, restritas às ferramentas de desenvolvimento. As cadeias envolvem `web-ext`/`addons-linter` (`adm-zip`, `image-size`, `brace-expansion` e `fast-uri`) e Vitest/`@vitest/mocker`. Essas bibliotecas não são distribuídas no runtime do aplicativo nem executam a extração dos downloads. O empacotamento da extensão processa apenas os arquivos do próprio projeto. A correção indicada para Vitest exige mudança de versão principal; atualizações das ferramentas permanecem pendentes e devem ser validadas separadamente. Imagens, ZIPs e servidores de teste não confiáveis não devem entrar nesse fluxo.

## Resultado Cargo

A primeira consulta encontrou `RUSTSEC-2026-0285` em `rustls 0.23.41`, usado por HTTPS. Foi atualizado para **0.23.45**, junto com `rustls-webpki 0.103.15`; o aviso TLS deixou de aparecer na nova auditoria.

Permanece **RUSTSEC-2026-0293** em `ringbuf 0.4.8`, transitivo de `librqbit-utp 0.7.0`. O defeito depende de um elemento cujo destrutor (`Drop`) entre em panic durante `Consumer::skip`/`clear`, permitindo descartar o mesmo elemento novamente. A implementação de uTP nesta versão usa `SharedRb<Heap<u8>>` em `stream_tx.rs`: bytes não possuem esse destrutor. Portanto, a condição descrita no aviso não é alcançável nesse uso atual. O aviso não foi ocultado nem considerado corrigido; a atualização para ringbuf 0.5.2+ depende da compatibilidade/upstream do motor torrent. Reavaliar se essa dependência ou o tipo armazenado mudar.

Permanecem **7 avisos de manutenção e 2 de solidez** em dependências transitivas. Eles devem ser reavaliados em upgrades do Tauri e antes de oferecer outros alvos. Ausência de vulnerabilidade alcançável identificada não constitui garantia geral de segurança.

## Ferramentas de mídia

yt-dlp, Deno, FFmpeg e ffprobe são executáveis externos e não fazem parte das árvores npm/Cargo. Seus pacotes e binários são fixados por SHA-256 em `scripts/media-tools.lock.json` e verificados no preparo local e no carregamento pelo aplicativo. FFmpeg usa a distribuição LGPL compartilhada, sem `--enable-gpl` ou `--enable-nonfree`.

O pacote inclui os avisos obtidos dos fornecedores, os fontes exatos do FFmpeg e suas receitas de build. A conferência completa dos avisos/fontes das bibliotecas externas continua pendente antes da distribuição pública de mídia; essa verificação é distinta de `cargo audit` e `npm audit`. Veja [Downloads de mídia](media-downloads.md).

## Política de acompanhamento

- Executar as auditorias antes de cada release e registrar os resultados, inclusive avisos aceitos com justificativa.
- Bloquear publicação se houver vulnerabilidade conhecida alcançável no runtime Windows.
- Reavaliar ringbuf ao atualizar `librqbit`/uTP ou alterar os tipos utilizados.
- Atualizar e testar as ferramentas de desenvolvimento e de mídia separadamente.

## Testes locais no Windows

`scripts/test-backend.ps1` incorpora a dependência de Common Controls 6 ao binário de testes, resolvendo o erro anterior de carregamento de `TaskDialogIndirect`, e propaga falhas do Cargo ao processo chamador. Na preparação 1.0.6, a suíte completa executou **112 testes com sucesso e 1 teste de rede ignorado**, incluindo a compatibilidade do XPI Firefox. Frontend e extensão passaram em **79 e 29 testes**, respectivamente. A build local não substitui validação em Windows limpo e em outras escalas de tela.
