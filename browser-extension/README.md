# SF Downloader Integration

Versão atual: **0.3.4**.

Integração Manifest V3 para Chromium (Chrome, Edge, Brave e Opera) e Firefox.

## Funcionamento

- Sincroniza com o aplicativo em `http://127.0.0.1:17831`.
- Intercepta cliques de download antecipadamente com content script e usa `downloads.onDeterminingFilename` como fallback.
- Permite ativar/desativar a captura por extensão no popup, por exemplo deixar `.TXT`, `.MP4` ou `.MP3` com o navegador.
- No Chromium, o caminho crítico de captura segue o modelo do XDM: estado em memória e cancelamento imediato em `downloads.onDeterminingFilename`, sem consultar storage antes de cancelar.
- Cancela e remove o registro nativo do navegador antes de encaminhar ao app.
- Envia URL final, nome, tamanho, MIME, referer e headers necessários.
- Cookies e headers ficam somente na memória do núcleo Rust; não são gravados em SQLite ou `localStorage`.
- Usa `sfdownloader://` apenas como fallback quando a ponte local não está disponível.

O endpoint local exige um token aleatório criado a cada execução do aplicativo. A extensão obtém esse token pelo endpoint de sincronização.

## Build

```powershell
npm run extension:build
```

Carregue como extensão descompactada:

- Chromium: `browser-extension/dist/chromium`
- Firefox: `browser-extension/dist/firefox`

Após reconstruir, recarregue a extensão na página de extensões do navegador.

As justificativas completas de permissões e uso de dados para publicação estão em [`STORE_SUBMISSION.md`](STORE_SUBMISSION.md).
A política de privacidade está em [`PRIVACY.md`](PRIVACY.md).
