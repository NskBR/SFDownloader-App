# Temas test (experimental)

Em Configurações → Personalização → Temas test, o aplicativo aceita CSS visual limitado e imagens PNG/GIF locais. A função começa desativada. Os motores HTTP, torrent e mídia não são modificados por temas.

## Temas de jogos

A seção **Temas de jogos** aparece em Personalização, imediatamente abaixo de **Tema do aplicativo**. CS2 e Cyberpunk são aplicados por clique, sem passar pelo editor CSS. As escolhas ficam persistidas separadamente do CSS personalizado.

- **Cyberpunk:** imagem fornecida pelo usuário, vidro fosco, detalhes amarelos e Rajdhani incluída.
- **CS2:** imagem em alta definição fornecida pelo usuário, vidro fosco, detalhes laranja e tipografia Segoe UI.
- **Desativar tema de jogo** restaura o visual base sem apagar o código personalizado salvo.
- Escolher um tema base do aplicativo desativa o tema de jogo. Ativar o CSS personalizado também desativa o tema de jogo.
- A escolha anterior de fonte volta a valer ao desativar o tema pronto.

Fundo, paleta e tipografia são compartilhados pelas janelas internas: principal, confirmação HTTP/torrent/mídia, progresso/conclusão, seleção de arquivos de torrent, integração e diagnóstico. Cada janela preserva seu layout e seus comandos. O CSS escrito pelo usuário continua restrito à janela principal; as auxiliares recebem apenas a aparência compartilhada, sem executar seletores personalizados.

As imagens dos temas prontos ainda estão incluídas localmente nesta implementação. O download sob demanda de assets do GitHub foi discutido, mas não foi implementado nem publicado.

## Editor CSS experimental

1. Em **Temas test**, importe um PNG ou GIF; o aplicativo guarda uma cópia local.
2. Escolha a imagem de fundo e ajuste escurecimento, posição e opacidade dos cartões.
3. Escreva o CSS no editor e clique em **Aplicar CSS e ativar**.
4. Desative a chave ou use **Restaurar visual padrão** para remover o tema personalizado.

Os motores HTTP, torrent e mídia não são modificados por temas. As áreas de configuração permanecem protegidas contra seletores personalizados.

## CSS aceito

Seletores exatos (também podem ser agrupados por vírgula): `.window-frame`, `.sidebar`, `.download-card`, `.download-card:hover`, `.download-card.selected`, `.titlebar`, `.flux-header`, `.flux-footer`, `.navigation__item`, `.navigation__item--active`, `.navigation__icon`, `.navigation__item--active .navigation__icon`, `.counter-badge`.

Propriedades: cor de texto, fundos (imagem, cor, posição, tamanho, repetição e respectivas propriedades visuais), cor das bordas, arredondamento e sombra. As formas expandidas dessas propriedades também são aceitas pelo parser do navegador.

Variáveis existentes: `--ember`, `--ember-solid`, `--ember-soft`, `--text`, `--text-2`, `--surface`, `--surface-2`, `--line`, `--bg`.

Exemplo sem mudar o layout:

```css
.sidebar {
  background-color: rgba(8, 12, 20, 0.8);
}
.download-card {
  border-color: var(--ember-solid);
  border-radius: 10px;
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.2);
}
```

Para usar uma imagem dentro de uma regra, abra **Imagens disponíveis no CSS** e clique em **Inserir fundo no CSS**. A referência `url("theme:ID")` só resolve arquivos previamente importados; não use caminhos Windows ou URLs da internet.

O fundo e o escurecimento são compartilhados pela janela inteira, sem uma segunda imagem/tinta na sidebar. As categorias e os botões de ação usam vidro fosco sem bordas visíveis; os três ícones do rodapé permanecem transparentes dentro do contêiner de vidro. Amostras de cor e chaves de ativação mantêm seus estados próprios; o foco por teclado continua visível.

Regras de layout (como `display`, `position`, dimensões, `z-index`, `overflow`, `pointer-events`), seletores globais, pseudo-elementos, scripts, `@import`, `@font-face`, `@media` e recursos externos são recusados. Não se trata de um editor de CSS irrestrito: a contenção é intencional.

## Limites e persistência

- Até 20 MB por arquivo; PNG até 32 megapixels e GIF até 8 megapixels, com largura/altura máximas de 8192 px.
- Até 8 referências diferentes por tema; o conjunto de imagens resolvidas tem limite total de 32 MiB em base64.
- CSS até 20.000 caracteres.
- GIFs ficam estáticos quando as animações da interface estão desligadas ou o sistema solicita movimento reduzido ao aplicar o tema.
- CSS e referências entram no backup de configurações. O tema integrado funciona também em outro PC; imagens importadas pelo usuário precisam ser importadas novamente.
- Falha na leitura/validação deixa o visual padrão acessível. Restaurar não apaga os downloads ou suas configurações.

Temas não executam JavaScript, não carregam recursos externos e não alteram as áreas protegidas de configuração. Ainda é possível escolher cores pouco legíveis; restaure o visual padrão se necessário.

## Cores de status

As bordas e a marca lateral dos cartões acompanham o estado do download, mesmo quando o CSS decorativo escolhe outra cor: falha/cancelamento usam vermelho, pausa usa âmbar, conclusão usa verde e transferência usa a cor de destaque. O preset não substitui essas informações por amarelo.

## Fonte incluída

Rajdhani (400, 500, 600 e 700), obtida do repositório oficial Google Fonts, com revisão e hashes em `src/assets/fonts/rajdhani/source.json`. A licença SIL OFL acompanha os fontes e a distribuição em `licenses/Rajdhani-OFL.txt`. Os arquivos são carregados localmente, sem solicitação ao Google durante o uso.


## Wallpapers sob demanda
Os temas de jogos baixam as imagens de `themes/wallpapers` no GitHub, usando o manifesto fixo `themes/manifest.json`. Apenas miniaturas são embutidas. O cache fica em AppData/com.sfdownloader.app/theme-images, com verificação SHA-256 e uso offline.
