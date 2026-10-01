# SF Downloader Integration

Versão atual: **0.3.6**.

Integração Manifest V3 para Chromium (Chrome, Edge, Brave e Opera) e Firefox.

## Funcionamento

- Sincroniza com o aplicativo em `http://127.0.0.1:17831`.
- Intercepta cliques de download antecipadamente com content script e usa `downloads.onDeterminingFilename` como fallback.
- Permite ativar/desativar a captura por extensão no popup, por exemplo deixar `.TXT`, `.MP4` ou `.MP3` com o navegador.
- No Chromium, o caminho crítico de captura segue o modelo do XDM: estado em memória e cancelamento imediato em `downloads.onDeterminingFilename`, sem consultar storage antes de cancelar.
- Cancela e remove o registro nativo do navegador antes de encaminhar ao app.
- Envia URL final, nome, tamanho, MIME, referer e headers necessários.
- Cookies são consultados somente para a URL do download. Headers e cookies não são gravados em SQLite ou `localStorage`; quando uma retomada autenticada exige retenção, ficam no cofre de credenciais do sistema e são removidos ao encerrar a tarefa.
- Usa `sfdownloader://` apenas como fallback quando a ponte local não está disponível.
- Exibe a logo do SFDownloader e o botão **Baixar** antes dos controles de interação do YouTube. O clique abre a confirmação independente de MP4/MP3 no aplicativo; envia somente a URL do vídeo ou playlist, sem cookies ou headers do navegador. Links com `list=` abrem a seleção da playlist, e também há um botão no cabeçalho de playlists. Mixes preservam o vídeo de origem no link e abrem uma seleção de até 50 faixas retornadas na consulta.
- Acompanha a troca de vídeos sem recarregar a página, restaura o botão quando a barra é reconstruída e respeita a opção de desativar a captura. Também há pontos de inserção para Shorts e o player do YouTube Music.

O botão de mídia exige o aplicativo com o novo fluxo YouTube (1.0.6 ou desenvolvimento/teste). A versão 0.3.6 é distribuída fora da Chrome Web Store. O XPI Firefox 0.3.6 fornecido pelo mantenedor está incluído no aplicativo; o build não submete nem assina extensões automaticamente.

O endpoint local exige um token aleatório criado a cada execução do aplicativo. A extensão obtém esse token pelo endpoint de sincronização.

## Build

```powershell
npm run extension:build
```

Carregue como extensão descompactada:

- Chromium: `browser-extension/dist/chromium`
- Firefox de desenvolvimento: `browser-extension/dist/firefox` em uma instalação que permita extensões temporárias. Para Firefox estável, use somente o XPI da mesma versão publicado e assinado pela Mozilla AMO.

Após reconstruir, recarregue a extensão na página de extensões do navegador.

As justificativas completas de permissões e uso de dados para publicação estão em [`STORE_SUBMISSION.md`](STORE_SUBMISSION.md).
A política de privacidade está em [`PRIVACY.md`](PRIVACY.md).
