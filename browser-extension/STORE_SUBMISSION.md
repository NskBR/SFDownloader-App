# SF Downloader Integration — informações para publicação

Este documento reúne as justificativas de permissões e o uso de dados para Chrome Web Store, navegadores Chromium e Mozilla AMO.

## Finalidade única

A extensão detecta downloads iniciados pelo usuário e os encaminha ao SF Downloader instalado na mesma máquina. Ela não oferece anúncios, analytics, telemetria, execução de código remoto nem comunicação com servidores do desenvolvedor.

## Justificativa das permissões

- `activeTab`: identifica a página na qual o usuário iniciou uma captura manual.
- `contextMenus`: oferece a ação explícita de baixar um link com o SF Downloader.
- `storage`: mantém apenas preferências locais, como captura ativada e extensões excluídas.
- `downloads`: cancela o download nativo depois que o aplicativo confirma que assumiu a transferência e fornece o fallback de detecção do navegador.
- `cookies`: encaminha temporariamente somente cookies pertencentes ao host do arquivo quando eles são necessários para um download autenticado.
- `alarms`: realiza manutenção e reconexão do service worker sem manter atividade contínua.
- `webRequest`: observa respostas de download, URL final e headers necessários para reproduzir a requisição no aplicativo.
- `<all_urls>`: downloads podem partir de qualquer domínio escolhido pelo usuário; o acesso é usado somente durante a detecção ou captura.
- `http://127.0.0.1:17831/*`: comunica-se exclusivamente com a ponte local do aplicativo desktop.

## Coleta, transmissão e retenção de dados

A URL, o nome do arquivo, MIME, tamanho, referer e headers/cookies estritamente necessários podem sair do navegador para `127.0.0.1`, apenas quando o usuário inicia um download. Esses dados não deixam o computador, não são vendidos nem utilizados para publicidade ou perfil comportamental.

Credenciais de requisição ficam somente em memória, possuem expiração e são removidas após conclusão, falha ou cancelamento. Preferências da extensão permanecem no armazenamento local do navegador. Nenhum cookie ou header de autenticação é armazenado em SQLite ou `localStorage` pelo aplicativo.

## Verificação para revisão

1. Inicie o SF Downloader e carregue `browser-extension/dist/chromium` ou `browser-extension/dist/firefox`.
2. Abra o popup e confira o estado conectado.
3. Inicie um download HTTP/HTTPS e confirme a abertura da janela do aplicativo.
4. Desative a captura ou exclua uma extensão de arquivo e confirme que o navegador volta a cuidar do download.
5. Encerre o aplicativo e confirme que a extensão usa o fallback seguro, sem descartar silenciosamente o download.

O código submetido é uma cópia direta de `browser-extension/src`, sem minificação ou código remoto. Os pacotes são produzidos por `npm run extension:build`.
