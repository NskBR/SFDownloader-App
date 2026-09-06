# Checklist de janelas e capabilities Tauri

Use esta lista antes de criar, renomear ou alterar o escopo de uma janela Tauri.

- [ ] O `label` é estável, único e usa um padrão previsível para janelas dinâmicas.
- [ ] A entrada em `src-tauri/tauri.conf.json` possui dimensões mínimas, título e visibilidade inicial adequados.
- [ ] O padrão de `label` foi incluído em `src-tauri/capabilities/default.json` somente se a janela precisar acessar comandos protegidos.
- [ ] As permissões são mínimas: não adicionar `core:default` adicional nem permissões de plugins sem uma necessidade identificada.
- [ ] O frontend abre e fecha a janela pelo mesmo `label` configurado no backend.
- [ ] A página trata carregamento, erro e fechamento da janela sem deixar uma tarefa órfã.
- [ ] Textos novos existem em pt-BR e en-US e passam no teste de paridade.
- [ ] Verificar manualmente foco, redimensionamento, fechamento, teclado e tema claro/escuro.
- [ ] Atualizar testes, documentação e `docs/MASTER_PLAN.md` quando a alteração for funcional.

## Referências

- Configuração principal: `src-tauri/tauri.conf.json`.
- Capability padrão: `src-tauri/capabilities/default.json`.
- Registro de comandos: `src-tauri/src/lib.rs`.
- Janelas dinâmicas de download: `src-tauri/src/commands/transfer.rs`.
