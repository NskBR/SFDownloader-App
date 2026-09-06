# Política de fila e recuperação

A fila usa a prioridade persistida (baixa, normal, alta e urgente) e a ordem de criação/reordenação como desempate. A prioridade efetiva envelhece um nível a cada dois minutos de espera, até urgente; nenhuma transferência ativa é interrompida para abrir vaga.

“Baixar na próxima vaga” promove a tarefa à frente das demais de mesma prioridade e eleva sua prioridade para urgente quando necessário. Isso continua sem preempção: a vaga é ocupada somente quando uma tarefa ativa termina, falha, é pausada ou é cancelada.

Depois de reinício, tarefas que estavam em andamento são recuperadas como **pausadas**. O aplicativo não reinicia downloads automaticamente, evitando consumo de rede inesperado, links expiram ou arquivos alterados. A retomada é explícita pelo usuário ou, quando houver uma agenda configurada, pelo agendador na próxima execução permitida.
## Agenda persistente

Cada tarefa pode ter um início único em ISO 8601 ou uma janela diária, com máscara de dias da semana. A janela suporta intervalos que atravessam meia-noite; nesse caso, a madrugada pertence ao dia em que a janela começou. Uma tarefa diária é iniciada no máximo uma vez por janela/dia e o usuário pode ignorar a regra uma única vez.

A agenda global é uma janela adicional: ela restringe tarefas que já possuem agenda própria. Quando configurada para pausar fora do horário, também interrompe transferências ativas até a próxima janela. Sem essa opção, ela apenas impede novos inícios agendados. Os dois tipos de agenda usam o horário local atual em cada verificação, para acompanhar mudanças de relógio e de fuso/DST do Windows.

Ao abrir o aplicativo depois do horário, uma agenda única vencida inicia na próxima verificação; uma janela diária inicia somente se ainda estiver dentro da janela. Tarefas interrompidas em reinício permanecem pausadas até ação explícita ou até uma agenda permitida.