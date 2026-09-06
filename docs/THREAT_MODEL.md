# Threat model — SF Downloader

## Escopo e ativos

Os ativos protegidos são arquivos do usuário, credenciais temporárias de download, histórico local, configurações, integridade do aplicativo e disponibilidade da máquina. As fronteiras de confiança são o webview Tauri, deep links, ponte HTTP local, conteúdo remoto baixado, arquivos compactados/torrents e extensões de navegador.

## Atores e premissas

- Sites e arquivos remotos são não confiáveis.
- Páginas podem tentar enviar URLs, nomes, headers ou archives maliciosos.
- Outros processos locais podem tentar ocupar a porta da ponte ou enviar requisições diretamente.
- O frontend do aplicativo não é autoridade para escolher caminhos destrutivos arbitrários.
- Um invasor com controle completo da conta do Windows ou do banco local está fora da proteção absoluta, mas adulterações devem falhar de forma segura quando possível.

## Superfícies e controles

| Superfície | Ameaças principais | Controles existentes | Risco residual |
|---|---|---|---|
| Webview Tauri | XSS, IPC indevido, janela com permissões excessivas | CSP restritiva, capabilities por label, comandos tipados, scripts remotos bloqueados | Dependências de frontend e textos remotos ainda exigem revisão contínua |
| Deep link | Esquema abusivo, URL local/perigosa, duplicação | Validação de esquema, deduplicação e confirmação do usuário | URLs HTTP legítimas ainda podem apontar para conteúdo hostil |
| Ponte `127.0.0.1:17831` | CSRF local, roubo de token, DoS, payload excessivo | Origem de extensão obrigatória, token por execução, limites de payload/header, TTL e capacidade máxima | Extensão comprometida possui as permissões concedidas pelo usuário |
| Extensão | Captura indevida, vazamento de cookies, perda do download | Cookies filtrados por host, fallback que preserva o download nativo, filtros de assets/protocolos, sem telemetria | Fluxos `blob:` e páginas autenticadas precisam de matriz manual real |
| Downloads HTTP | Path traversal por nome, corrupção na retomada, link temporário alterado | Sanitização de nome, pasta `.sf-temp`, ETag/Content-Range/tamanho, validação por amostra na troca de URL | Servidores sem ETag exigem confirmação e testes mais amplos |
| BitTorrent | Caminhos maliciosos, metainfo trocado, escrita não selecionada | Validação de caminhos, comparação de info hash, seleção persistida, cache atômico, limpeza limitada a arquivos conhecidos | Compatibilidade real com swarms e metainfo v2/híbrido permanece em teste |
| Extração | Zip Slip, symlink/hardlink, zip bomb, overwrite | Caminhos enclausurados, limite de entradas/tamanho/ratio, diretório temporário e destino sem overwrite | Formatos nativos de terceiros precisam de auditoria contínua de links/reparse points |
| Operações de arquivo | Exclusão fora do download, junction/reparse point, TOCTOU | Alvos vêm do banco e arquivos conhecidos; operações perigosas devem validar raiz e reparse points | Windows permite mudanças concorrentes entre validação e operação |
| Logs/métricas | Vazamento de URL, token, cookie ou header | Contextos sensíveis fora do SQLite e limpeza de logs no fluxo torrent | Logging legado ainda será consolidado na Fase 11 |
| Atualizador | Execução de binário adulterado | Download somente por ação do usuário; publicação pública dependerá de assinatura/verificação | Assinatura foi deliberadamente adiada enquanto a Beta é privada |

## Regras de segurança

1. Nunca cancelar um download do navegador antes da ponte confirmar que o assumiu.
2. Nunca converter POST, `blob:`, `data:`, `file:` ou protocolo desconhecido em GET automático.
3. Nunca extrair caminho absoluto, traversal, symlink ou hardlink fornecido pelo arquivo.
4. Nunca excluir por caminho vindo diretamente do frontend; resolver a tarefa persistida e restringir à raiz esperada.
5. Nunca registrar tokens, cookies, headers de autenticação ou magnet completo.
6. Falhar preservando dados parciais quando identidade, espaço, permissão ou integridade forem incertos.

## Validação contínua

- `npm audit --omit=dev` para dependências distribuídas e registro separado de riscos exclusivos de ferramentas de build.
- `cargo audit` para o lockfile Rust.
- Testes de traversal, limites de archive, CORS/token, expiração, fallback e retomada.
- Matrizes manuais para navegadores, reparse points do Windows e downloads reais autenticados.
