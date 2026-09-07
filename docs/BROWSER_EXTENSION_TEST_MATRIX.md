# Matriz manual — integração com navegadores

Use esta matriz na fase de correção e testes. Execute cada cenário no Chrome/Edge e no Firefox com uma instalação limpa da extensão.

| Cenário | Chromium | Firefox | Resultado esperado |
|---|---:|---:|---|
| Instalação descompactada/drag-and-drop | Pendente | N/A | O navegador aceita a pasta `dist/chromium` e exibe o ícone. |
| Instalação do XPI assinado | N/A | Pendente | O XPI 0.3.5 publicado pela AMO abre o fluxo de instalação sem erro de assinatura; o aplicativo não deve distribuir XPI de versão diferente. |
| Download HTTP público | Pendente | Pendente | A janela de confirmação abre e o download nativo só é cancelado após aceite da ponte. |
| Download autenticado por cookie | Pendente | Pendente | O arquivo é recebido; somente cookies do host do arquivo são encaminhados e as credenciais não permanecem após o encerramento da tarefa. |
| Link temporário com redirecionamento | Pendente | Pendente | URL final, nome e tamanho chegam corretamente ao aplicativo. |
| Download iniciado por formulário POST | Pendente | Pendente | O navegador mantém o download; a extensão não o reproduz incorretamente como GET. |
| URL `blob:` gerada por script | Pendente | Pendente | O navegador mantém o download sem perda nem abertura duplicada. |
| Mídia MP4/MKV direta | Pendente | Pendente | A captura respeita a lista de extensões e o estado ativado/desativado. |
| Asset JS/CSS/fonte/imagem de página | Pendente | Pendente | Nenhuma janela de download do aplicativo é aberta. |
| Aplicativo fechado | Pendente | Pendente | O download automático permanece no navegador; ação manual pode oferecer o deep link. |
| Porta 17831 ocupada | Pendente | Pendente | A janela de integração mostra o diagnóstico e não afirma estar conectada. |
| Dois perfis simultâneos | Pendente | Pendente | Ambos conectam e enviam downloads sem misturar contexto/cookies. |
| Desativar captura durante uso | Pendente | Pendente | O ícone muda para desconectado e novos downloads ficam no navegador. |

Registre navegador/versão, endereço de teste sem credenciais, resultado e qualquer log relevante. Não anexe cookies, tokens ou URLs privadas aos relatórios.
