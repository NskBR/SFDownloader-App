# Temas personalizados da comunidade

Wallpapers e temas podem ser criados pela comunidade. Para aparecerem no catálogo da **build oficial do repositório NskBR/SFDownloader-App**, faça um **fork**, implemente e teste o tema e abra um **pull request** pedindo sua inclusão. Um fork, issue ou arquivo enviado não entra automaticamente no aplicativo: a proposta precisa ser revisada, aceita e incluída em uma release oficial.

## Preparar o wallpaper

- Use uma imagem própria ou com autorização de distribuição. Informe autor, origem e licença/permissão no pull request; não inclua dados pessoais, links de pastas locais, conteúdo ofensivo ou arquivos executáveis.
- Prefira composição horizontal 16:9, com áreas livres para textos. Teste também cortes em janelas pequenas. Uma imagem bonita isoladamente pode prejudicar a leitura da interface.
- Renomeie o arquivo com um identificador estável, em minúsculas e com hífens: `meu-tema.png`. Evite espaços, acentos e nomes temporários.
- O importador aceita PNG ou GIF, até 20 MiB. PNG: lado máximo de 8192 px e até 32 milhões de pixels. GIF: até 8 milhões de pixels. Para um tema integrado, prefira PNG estático para reduzir consumo.

## Arquivos de um tema integrado

O aplicativo inclui apenas a miniatura; as imagens de fundo ficam em `themes/wallpapers/` no GitHub e são baixadas ao aplicar o tema.

| Arquivo | Uso |
| --- | --- |
| `themes/wallpapers/meu-tema.png` | Wallpaper principal |
| `themes/wallpapers/meu-tema-medium.png` | Até 1280 × 800, mantendo proporção |
| `themes/wallpapers/meu-tema-compact.png` | Até 720 × 420, mantendo proporção |
| `src/assets/themes/meu-tema-preview.jpg` | Até 360 × 204, JPEG qualidade 80 |

Exemplo para gerar as variantes com Python e Pillow (`python -m pip install Pillow`):

```python
from pathlib import Path
from PIL import Image
import hashlib

source = Path("themes/wallpapers/meu-tema.png")
for suffix, size in [("-medium", (1280, 800)), ("-compact", (720, 420))]:
    image = Image.open(source).convert("RGB")
    image.thumbnail(size, Image.Resampling.LANCZOS)
    image.save(source.with_name(f"meu-tema{suffix}.png"), optimize=True)
image = Image.open(source).convert("RGB")
image.thumbnail((360, 204), Image.Resampling.LANCZOS)
image.save("src/assets/themes/meu-tema-preview.jpg", quality=80, optimize=True)
for file in source.parent.glob("meu-tema*.png"):
    data = file.read_bytes()
    print(file.name, len(data), hashlib.sha256(data).hexdigest())
```

Acrescente três entradas em `themes/manifest.json`, com IDs `meu-tema`, `meu-tema-medium` e `meu-tema-compact`. Cada entrada tem `id`, `file`, `bytes` e `sha256`. O aplicativo verifica os hashes antes de usar os arquivos e mantém as imagens no cache local para uso offline. Não altere os arquivos depois de calcular os hashes.

Para trocar um wallpaper publicado, use **novos nomes de arquivo** e atualize o manifesto. Preserve as URLs antigas: releases anteriores ainda podem depender dos hashes e nomes antigos.

## Implementar a aparência

1. Registre o ID em `gameThemeIds`, em `src/domain/settings.ts`. O nome interno histórico continua sendo `gameTheme`, embora a categoria visível seja “Temas personalizados”.
2. Importe a miniatura e registre o tema em `gameThemePresets` e `builtinThemePreviews`, em `src/domain/testThemePresets.ts`. Crie a configuração correspondente em `createGameTheme` ou `additionalThemes`, com `imageId: "builtin:meu-tema"`.
3. Defina `--game-surface` e `--game-raised` na paleta; use tokens para texto, destaque e estados. Confira `game-theme-surfaces.css`, `theme-fonts.css` e `naruto-theme.css` como exemplos. Estilos de temas integrados devem ser limitados a `html[data-test-theme="true"][data-test-preset="meu-tema"]`.
4. Defina formas e detalhes sem alterar o comportamento de componentes. Ornamentos precisam de `pointer-events: none`. Preserve seleção simples/múltipla, Ctrl+A, foco de teclado e cores de falha, pausa e conclusão.
5. Mantenha recortes pequenos, longe de fechar/minimizar/maximizar. A janela maximizada deve continuar retangular. Não aplique `clip-path` a `html`, `body` ou `#root`: recorte apenas o frame pintado.
6. Use os wallpapers menores e o contraste reforçado nas janelas auxiliares. Evite efeitos de desfoque por card do catálogo, animações permanentes pesadas e mudanças de layout global.
7. Se adicionar fontes, inclua licença de redistribuição, origem, revisão e hashes em `src/assets/fonts/`, além do aviso em `public/licenses/`. Não dependa de uma fonte instalada no computador do usuário.

O CSS livre importado pelo usuário é um fluxo separado, ativado em Avançado. Ele aceita apenas seletores e propriedades cosméticas permitidas por `src/services/testThemes.ts`; imagens locais importadas são referenciadas por `theme:<id>`. Não aceita scripts, imports remotos ou mudanças arbitrárias de posicionamento. Não enfraqueça a CSP para contornar essas restrições.

## Testar e pedir inclusão

### Variações de wallpaper

O catálogo atual organiza as imagens por pasta: `themes/wallpapers/<tema>/main.png`, `medium.png` e `compact.png`. Para variações, use `themes/wallpapers/<tema>/<variacao>/` com os mesmos três nomes. Os caminhos antigos permanecem disponíveis para compatibilidade com releases anteriores.

Registre cada variação em `src/domain/themeWallpapers.ts`, com ID estável (por exemplo, `cyberpunk--v-sunset`), nome e miniatura otimizada. Acrescente ao manifesto os IDs da variação e seus sufixos `-medium`/`-compact`, com os hashes correspondentes. Não acrescente cada wallpaper como um tema separado em `gameThemeIds`: as variações compartilham cores, fontes e formas do tema.

O card mostra setas apenas quando há mais de um wallpaper. Em um tema inativo, elas alteram a prévia; clicar no card baixa/aplica a escolha. No tema ativo, as setas baixam/aplicam a variação. A preferência `themeWallpapers` guarda a escolha por tema, e as janelas auxiliares usam a versão reduzida correspondente. Cada wallpaper é baixado sob demanda; a preparação inicial mantém apenas as miniaturas e o wallpaper ativo na memória.

### Visual completo por variação

Uma variação pode trocar também cores, fonte e geometria. Veja `src/domain/themeCollections/naruto.ts`: a coleção **Naruto** contém Bárion e Hinata, cada um com seu `appearance`. O card continua único; as setas selecionam o conjunto completo.

```ts
{
  id: "id-estavel-do-wallpaper",
  name: "Nome da variação",
  image: miniaturaImportada,
  appearance: {
    preset: "cyberpunk", // Perfil base de detalhes/ornamentos, não cria outro card.
    palette: { surface: "#281b2b", raised: "#402338", accent: "#ff416b", strong: "#ff7191" },
    font: '"SFRajdhani","Segoe UI",sans-serif',
    geometry: { window: "inset(0 round 12px)", cardRadius: "4px 16px", navigationRadius: "4px 12px" },
    darkness: 40,
    panelOpacity: 80,
    position: "center",
    // css: "..." // Opcional: apenas as regras cosméticas permitidas pelo compilador.
  }
}
```

O perfil base determina os detalhes próprios (como circuitos ou o símbolo da Folha); a configuração da variação pode sobrescrever a paleta e as formas. Os tokens da paleta e a fonte repercutem nas janelas auxiliares. A geometria externa respeita a maximização; as cores funcionais de falha/pausa/conclusão continuam independentes. Sem `appearance`, a variação herda todo o visual do tema, quando apenas o wallpaper muda.

Os antigos temas separados `naruto-baryon` e `hinata` são migrados para a coleção `naruto`, preservando o wallpaper escolhido e os IDs do cache. Os arquivos atuais ficam em `themes/wallpapers/naruto/baryon/` e `themes/wallpapers/naruto/hinata/`.

Execute `npm test`, `npm run build` e `cargo check --manifest-path src-tauri/Cargo.toml`. Faça também uma revisão com `npm run tauri dev`: consulta, confirmação, progresso, erro, torrent, integração, “Sobre”, expansão do catálogo, troca rápida, exclusão/re-download, reinicialização e uso offline. Teste textos longos, português/inglês, escala do Windows e monitores diferentes.

No pull request, inclua capturas do tema, autor/origem/permissão do wallpaper e fontes, arquivos alterados e os testes executados. Os mantenedores revisam legibilidade, desempenho, segurança e compatibilidade. A publicação das imagens deve ser coordenada antes da distribuição da build que depende delas. As builds do aplicativo são feitas localmente; propor um tema não autoriza criar uma release ou configurar builds no GitHub Actions.


## Importação local por ZIP

Em **Configurações → Personalização → Temas locais**, use **Adicionar tema local**.
Selecione o ZIP, confira o card importado e clique nele para aplicar. As setas trocam
as variações e seus perfis visuais. O tema local não depende da opção experimental de CSS.

O arquivo `theme.json` fica na raiz do ZIP; os demais arquivos são imagens PNG/GIF.
Nenhum script, executável, caminho absoluto ou recurso de rede é aceito. Limites:
80 MB para o ZIP e para o conteúdo descompactado, 100 arquivos, 20 variações e
20 MB por imagem. PNG: até 8192 px por lado e 32 milhões de pixels; GIF: 8 milhões.
As imagens são exibidas preenchendo a janela, com recorte conforme `position`.
Não é necessário completar a imagem original artificialmente.

```json
{
  "schemaVersion": 1,
  "name": "Meu tema",
  "author": "Seu nome",
  "variants": [{
    "name": "Original",
    "image": "images/main.png",
    "preview": "images/preview.png",
    "medium": "images/medium.png",
    "compact": "images/compact.png",
    "preset": "custom",
    "appearance": {
      "palette": {
        "surface": "#201d28", "raised": "#342d44",
        "accent": "#c3a5ed", "strong": "#eadbff"
      },
      "geometry": {
        "window": "inset(0 round 14px)",
        "cardRadius": "14px 6px",
        "navigationRadius": "12px 6px"
      },
      "font": "Segoe UI, sans-serif"
    },
    "darkness": 50,
    "panelOpacity": 86,
    "position": "center"
  }]
}
```

`preset` aceita `custom` (perfil neutro) e `botanical` (detalhes florais, cantos
assimétricos e títulos serifados). `appearance` aceita apenas tokens de cores,
fonte e geometria; não é CSS executável. Use cores hexadecimais de seis dígitos,
fontes instaladas, raios CSS numéricos e formas `inset(...)` ou `polygon(...)`.
O intervalo de `darkness` é 30–85 e de `panelOpacity` é 60–100.
`medium` e `compact` são opcionais, mas recomendados para janelas menores.
Miniatura recomendada: 360 × 204; medium: até 1280 × 800; compact: até 720 × 420,
preservando a proporção. Não amplie imagens pequenas só para atingir esses limites.

Os metadados ficam em `%APPDATA%/com.sfdownloader.app/local-themes` e as imagens,
identificadas por SHA-256, em `theme-images`. A lixeira remove o registro local;
imagens compartilhadas no cache são preservadas para não afetar outros temas ou CSS.
Pacotes locais não são enviados ao GitHub nem incluídos automaticamente no catálogo oficial.
Temas particulares podem ser distribuídos separadamente como ZIP local.
