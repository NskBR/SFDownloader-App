# Política de privacidade — SF Downloader Integration

Última atualização: 4 de setembro de 2026.

## Resumo

A SF Downloader Integration existe somente para encaminhar downloads iniciados pelo usuário ao aplicativo SF Downloader instalado no mesmo computador. A extensão não vende dados, não exibe anúncios, não realiza tracking e não envia informações para servidores do desenvolvedor.

## Dados processados

Quando o usuário inicia um download, a extensão pode processar a URL final, nome, tamanho, tipo MIME, página de origem e os headers/cookies estritamente necessários para acessar aquele arquivo. Cookies são consultados somente para o endereço do download.

As informações são enviadas exclusivamente para a ponte local do SF Downloader em `127.0.0.1`. Elas não trafegam para infraestrutura do desenvolvedor. A ponte exige um token aleatório renovado sempre que o aplicativo é iniciado.

## Armazenamento e retenção

- Preferências como captura ativada e extensões ignoradas ficam no armazenamento local do navegador.
- Contextos de requisição e credenciais ficam temporariamente em memória e expiram automaticamente.
- Quando uma retomada autenticada exige retenção além da requisição inicial, os headers são protegidos pelo cofre de credenciais do sistema operacional e removidos após conclusão, falha, cancelamento ou exclusão da tarefa.
- Cookies e headers de autenticação não são gravados no SQLite, nos logs nem no `localStorage` do aplicativo.

## Compartilhamento

Nenhum dado é vendido ou compartilhado com anunciantes, serviços de analytics ou terceiros. O servidor que hospeda o arquivo continua recebendo as requisições normais necessárias para realizar o download.

## Controle do usuário

O usuário pode desativar completamente a captura no popup, escolher extensões que continuarão sob responsabilidade do navegador, remover a extensão ou desinstalar o aplicativo. Quando a captura automática não pode ser confirmada, o download permanece no navegador.

## Segurança

A comunicação aceita apenas origens de extensões Chromium/Firefox, limita tamanho e quantidade de headers, rejeita protocolos inseguros e usa credenciais efêmeras. Downloads POST ou URLs que não podem ser reproduzidas com segurança não são convertidos silenciosamente em outra requisição.

## Contato e alterações

Antes da publicação pública, o projeto deverá informar no material da loja um canal de contato mantido pelo desenvolvedor. Mudanças relevantes nesta política serão registradas junto a uma nova versão da extensão.
