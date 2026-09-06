# Política de limite de velocidade HTTP

## Escopo

`speedLimitDownloadMbps` nas Configurações é o **limite padrão para novos downloads**. Ele não é um teto agregado para toda a aplicação: cada tarefa recebe esse valor ao ser criada. O limite de downloads simultâneos continua sendo controlado separadamente por `maxParallelDownloads`.

Cada tarefa persiste:

- `speed_limit_download`: bytes por segundo; `0` significa sem limite;
- `speed_limit_inherited`: `true` quando o valor veio do padrão das Configurações e `false` quando foi editado na própria tarefa.

Alterar o padrão não altera tarefas já criadas. Alterar a tarefa pela lista, menu de contexto ou janela de progresso torna o valor personalizado, inclusive quando o valor escolhido é `0` (sem limite). Tarefas antigas, criadas antes dessa marca existir, são tratadas como personalizadas para não terem seu comportamento modificado pela atualização.

## Runtime e segmentação

A alteração é persistida primeiro e, quando a tarefa está ativa, o `TaskControl` recebe o novo valor sem reiniciar a transferência. A janela de orçamento é reiniciada e os workers bloqueados são acordados; isso evita que um orçamento anterior crie uma espera excessiva após a alteração.

Downloads segmentados compartilham o mesmo `TaskControl`, portanto todos os workers consomem um único orçamento por tarefa — o limite informado não é multiplicado pelo número de conexões.

O painel de Debug mantém uma telemetria local das alterações manuais do throttle, incluindo limite anterior, limite novo e se a tarefa estava ativa. Não há envio de telemetria para serviços externos.

## Cobertura e limites operacionais

Os testes locais do motor já cobrem metadados sem `Content-Length`, descoberta de `Range` sem o cabeçalho `Accept-Ranges`, recusa de Range com fallback, retomada com `ETag` e corpo interrompido. O plano adaptativo usa contadores de 64 bits e há teste de planejamento para 10 GiB, sem alocar o arquivo.

Antes de uma versão pública, permanece necessária a validação manual em Windows de: gravação real acima de 4 GiB, disco quase cheio, suspensão/hibernação e troca de rede. Esses cenários dependem do sistema de arquivos e da pilha de rede reais; o aplicativo preserva os dados parciais e recupera tarefas interrompidas como pausadas.