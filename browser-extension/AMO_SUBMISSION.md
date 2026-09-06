# SF Downloader Integration 0.3.4 — notas para revisão AMO

## Alterações da versão 0.3.4

- Corrige a detecção incorreta de recursos que não são downloads: a interceptação em `onHeadersReceived` agora só atua em navegações do usuário (`main_frame`/`sub_frame`) ou em respostas com `Content-Disposition: attachment`. Isso evita que prefetches passivos — como as miniaturas de vídeo do YouTube exibidas ao passar o mouse — sejam erroneamente tratados como downloads.
- Mantém a captura antecipada: o download é transferido ao aplicativo desktop antes de o navegador nativo detectá-lo, sem registro no histórico e sem a janela de download nativa piscando.
- Inclui filtros por extensão, content script de clique e ícones `sf-small.png`/`sf-large.png`.

## Finalidade

A extensão intercepta somente downloads iniciados pelo usuário e os encaminha para o aplicativo desktop SF Downloader instalado na mesma máquina.

## Comunicação e dados

- A única comunicação da extensão é com `http://127.0.0.1:17831`, um servidor local iniciado pelo aplicativo desktop.
- Para executar o download, ela encaminha a URL final, nome, tamanho, MIME, referer e os headers/cookies necessários para acessar o arquivo solicitado.
- Esses dados não são enviados para servidores do desenvolvedor, serviços de analytics ou terceiros.
- A ponte local exige um token aleatório criado a cada execução do aplicativo.
- Cookies e headers ficam somente na memória do núcleo Rust e não são persistidos no SQLite ou no `localStorage`.
- A extensão não contém telemetria, anúncios, tracking ou código remoto.

As declarações `browsingActivity`, `websiteContent` e `websiteActivity` existem porque URLs, headers/cookies e a ação de download saem do contexto do navegador para o aplicativo local, conforme a taxonomia atual da Mozilla.

## Como testar

1. Instale e execute o SF Downloader desktop.
2. Carregue a extensão no Firefox 140 ou mais recente.
3. Abra o popup e confirme que o status informa conexão com o aplicativo.
4. Inicie o download de um arquivo HTTP/HTTPS.
5. Confirme que nenhum item de download aparece no gerenciador nativo e que a janela de confirmação do SF Downloader é aberta diretamente.
6. Desative um tipo de arquivo no popup, por exemplo `TXT`, e confirme que ele volta a ser tratado pelo Firefox.
7. Desative o monitoramento no popup e confirme que downloads voltam a ser tratados pelo Firefox.

## Build reproduzível

Ambiente utilizado: Windows 11, Node.js 24.16.0 e npm 11.

Não há transpilação, minificação, bundler ou dependências de runtime. Os arquivos JavaScript submetidos são cópias diretas de `browser-extension/src`.

Na raiz do projeto:

```powershell
npm run extension:build
npm run extension:lint
```

O diretório pronto para empacotamento é `browser-extension/dist/firefox`. O `manifest.json` deve ficar na raiz do ZIP.

## Identidade

O ID `integration@sfdownloader.local` é mantido para preservar a identidade e as atualizações da extensão Manifest V3.
