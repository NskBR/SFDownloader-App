# Auditoria de dependências

Última execução: 5 de setembro de 2026.

## Escopo e comandos

- Runtime web: `npm audit --omit=dev`
- Árvore npm completa: `npm audit`
- Backend Rust: `cargo audit`, executado em `src-tauri`
- Compilação após atualizações: `cargo check`, Clippy e testes Rust

## Resultado npm

O runtime de produção está sem vulnerabilidades conhecidas: `npm audit --omit=dev` retornou zero ocorrências.

A árvore completa ainda informa três ocorrências de severidade alta referentes à mesma cadeia exclusivamente de desenvolvimento: `web-ext -> addons-linter -> image-size@2.0.2`. Os avisos GHSA-w3rx-r6r6-pgpr e GHSA-5p2g-fcmc-qvqq descrevem negação de serviço nos parsers ICNS, JXL e HEIF do `image-size`.

O projeto já usa `web-ext@10.6.0`, versão mais recente disponível durante a auditoria, e ainda não existe uma versão corrigida de `image-size`. O reparo automático sugerido pelo npm faria downgrade para `web-ext@5.5.0`, por isso foi rejeitado.

Risco aceito temporariamente: o `web-ext` só é usado localmente para validar e empacotar os manifests e ícones versionados do próprio repositório. Ele não é distribuído com o aplicativo e não processa imagens fornecidas por downloads ou pela extensão em runtime. Até existir correção upstream, arquivos de imagem não confiáveis não devem ser inseridos no fluxo de empacotamento.

## Resultado Cargo

As vulnerabilidades encontradas inicialmente foram eliminadas:

- `h2` foi atualizado de 0.4.15 para 0.4.16;
- `plist` foi atualizado para 1.10.0, levando `quick-xml` de 0.39.4 para 0.41.0;
- `librqbit` foi atualizado de 8.1.1 para 9.0.1, eliminando o `quick-xml` 0.37.5 transitivo e mantendo a inicialização DHT persistente compatível com a nova API.

Após as correções, `cargo audit` retornou zero vulnerabilidades. Permanecem avisos de manutenção/solidez em dependências transitivas de plataformas que não são compiladas no alvo Windows atual, sobretudo GTK3/GLib, e em `event-listener` vindo da implementação Unix de `tauri-plugin-single-instance`. Esses componentes devem ser reavaliados em upgrades do Tauri e antes de oferecer builds Linux/macOS.

## Política de acompanhamento

- Executar ambas as auditorias antes de cada release.
- Bloquear release se houver vulnerabilidade conhecida alcançável no runtime Windows.
- Revisar mensalmente a correção upstream de `image-size`/`addons-linter`.
- Reexecutar `cargo audit` sempre que Tauri, plugins ou `librqbit` forem atualizados.

## Limite atual de validação local

O executável de testes Rust compila normalmente (`cargo test --lib --no-run`), mas sua execução neste computador ainda falha antes de qualquer teste com `STATUS_ENTRYPOINT_NOT_FOUND` para `TaskDialogIndirect`. Trata-se da incompatibilidade de DLL/runtime Windows já identificada no ambiente de desenvolvimento, não de uma falha de compilação ou das regressões adicionadas. Os testes de caminho e extração devem ser executados em uma instalação Windows cujo runtime Tauri carregue as DLLs corretas.
