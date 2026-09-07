<div align="center">

# SFDownloader

**Gerenciador de downloads moderno para Windows, construído com Tauri, React e Rust.**

[![Release](https://img.shields.io/github/v/release/NskBR/SFDownloader-App?display_name=tag&style=for-the-badge)](https://github.com/NskBR/SFDownloader-App/releases)
[![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)

[Baixar](https://github.com/NskBR/SFDownloader-App/releases) · [Reportar problema](https://github.com/NskBR/SFDownloader-App/issues) · [Planejamento](docs/MASTER_PLAN.md)

</div>

> [!IMPORTANT]
> O SFDownloader inicia sua distribuição oficial na versão **1.0.0**. Por enquanto, é uma **beta privada para Windows 10/11 64 bits**. Licença e termos de distribuição pública serão definidos antes da publicação geral.

## Visão geral

O SFDownloader reúne downloads HTTP/HTTPS, retomada segura, organização de arquivos, extração de compactados, integração com navegadores, métricas e suporte BitTorrent em uma interface nativa e leve.

O aplicativo não atualiza silenciosamente: o usuário escolhe baixar uma atualização e, ao fim do download, escolhe quando abrir o instalador manualmente.

## Capturas de tela

| Downloads | Janelas de progresso |
| --- | --- |
| ![Lista principal](screenshots/aplicativo.png) | ![Janelas de download](screenshots/janelas-download.png) |

| BitTorrent | Personalização |
| --- | --- |
| ![Download torrent](screenshots/torrent.png) | ![Temas](screenshots/temas.png) |

| Métricas | Integração com navegador |
| --- | --- |
| ![Métricas](screenshots/estatisticas.png) | ![Integração](screenshots/extensao.png) |

## Recursos

- Downloads HTTP/HTTPS segmentados, com pausa, retomada e recuperação após reinicialização.
- Validação de ETag e Last-Modified para evitar retomadas em arquivos alterados.
- Fila, prioridades, limite de velocidade e agendamento diário.
- Organização automática por categoria e pasta de destino configurável.
- Extração opcional de ZIP, RAR, 7Z e TAR.
- Confirmação prévia com metadados, tamanho, nome e destino.
- Reposição de links temporários expirados, com validação antes de retomar.
- BitTorrent e magnet links com seleção de arquivos, verificação e peers reais.
- Integração com Chromium (Chrome, Edge, Brave, Opera e Vivaldi) e Firefox por ponte exclusivamente local em `127.0.0.1`.
- Temas, gradientes, escala de interface e idiomas Português (Brasil) e Inglês.
- Métricas, logs de diagnóstico sanitizados e exportação técnica.
- Atualização manual por GitHub Releases com barra de progresso.

> [!WARNING]
> O motor BitTorrent/P2P continua em estabilização. Para arquivos importantes, valide o resultado baixado e prefira HTTP/HTTPS quando houver uma fonte direta confiável.

## Instalação e atualização

1. Abra [Releases](https://github.com/NskBR/SFDownloader-App/releases) e baixe o instalador Windows `.exe`.
2. Execute o instalador e siga as etapas exibidas pelo Windows.
3. Quando uma atualização estiver disponível, clique em **Atualizar aplicativo** na titlebar.
4. Após o download, clique em **Instalar atualização**. O app fecha e abre o instalador; nenhuma instalação ocorre sem sua ação.

O app ainda não possui assinatura de código pública. Antes de prosseguir diante de um alerta do SmartScreen, confira que o arquivo veio deste repositório oficial.

Instalações beta anteriores que consultavam o repositório histórico precisam instalar a primeira versão `1.0.0` manualmente. A partir dela, as consultas passam a usar este repositório.

## Extensão do navegador

Abra **Configurações → Integração com navegador** no aplicativo.

- Em Chromium, carregue a pasta indicada pelo app em `chrome://extensions` ou `edge://extensions`, com o Modo do desenvolvedor ativado.
- No Firefox estável, a aba de integração fornece o XPI 0.3.5 assinado pela Mozilla; o aplicativo o copia localmente e abre o Firefox para a confirmação explícita da instalação.
- A extensão comunica-se somente com `http://127.0.0.1:17831` e mantém compatibilidade com versões anteriores.

Se ela ficar desconectada, confirme que o app está aberto e recarregue a extensão na página do navegador.

## Desenvolvimento

### Pré-requisitos

- Node.js 20+ e npm
- Rust estável via [rustup](https://rustup.rs/)
- Dependências do [Tauri 2 para Windows](https://v2.tauri.app/start/prerequisites/)

```bash
npm ci
npm run tauri dev
```

### Testes

```bash
npm test -- --run
npm run build
npm run versions:check
npm run extension:lint
npm run extension:test
npm run extension:build
```

Para preparar os testes backend no Windows:

```powershell
.\scripts\test-backend.ps1
```

### Build de release

```bash
npm run release
```

Confira que tag e instalador usam a mesma versão (`1.0.0`, `1.0.1` etc.). O atualizador só aceita assets `.exe` de releases oficiais de `NskBR/SFDownloader-App`.

## Estrutura

```text
src/                 Interface React e TypeScript
src-tauri/           Aplicativo Tauri e motor Rust
browser-extension/   Extensões Chromium e Firefox
docs/                Planejamento, segurança e guias técnicos
scripts/             Automação de versão, release e testes
screenshots/         Imagens deste README
```

## Privacidade e segurança

- A ponte do navegador usa loopback e não fica exposta à rede.
- Cookies e headers recebidos da extensão têm validade e tamanho limitados.
- Logs removem URLs completas, tokens, cookies e headers sensíveis antes da exportação.
- O atualizador restringe downloads a assets de releases oficiais e exige ação explícita para instalar.

Leia [a política da extensão](browser-extension/PRIVACY.md) e o [modelo de ameaças](docs/THREAT_MODEL.md).

## Status e contribuição

Use as [Issues](https://github.com/NskBR/SFDownloader-App/issues) para relatar bugs, com passos de reprodução e logs sanitizados quando possível. O [plano mestre](docs/MASTER_PLAN.md) registra fases e testes pendentes.

<div align="center">

Feito com Rust e React por [NskBR](https://github.com/NskBR).

</div>
