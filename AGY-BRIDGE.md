# Histórias pelo AGY Bridge

Este fork adiciona `/fables model agy`. O Claude continua trabalhando na tarefa principal, mas as cenas passam a ser escritas pelo modelo do Antigravity CLI através do AGY Bridge. A versão atual do bridge usa `gemini-3.8-flash-high`.

As legendas e os títulos das histórias são escritos em português brasileiro, inclusive quando a atividade ou as cenas anteriores estão em inglês. Código, nomes de arquivos e funções e comandos mantêm seus nomes originais. Essa regra também vale para os narradores Sonnet e Haiku.

Na versão **0.2.2**, a animação preserva o conteúdo de outros mods na faixa acima da caixa de mensagem. Com **Kadenai's Style**, a cena aparece em cima e os indicadores compactos logo abaixo, nas duas ordens de carregamento. Desligar o Fables não oculta os indicadores; os controles nativos com `hasSurvey` continuam tendo prioridade.

## Como testar no Claude Code Desktop

A animação agora usa **128 px de altura** por padrão (antes: 192 px). Para reduzir mais, execute `/fables size 96` ou `/fables tamanho 96`. `/fables size` mostra a altura atual; `/fables size 192` restaura o tamanho original. A escolha é salva para as próximas sessões. Você também pode configurar a opção **Altura da animação (px)** no menu do plugin. São aceitas alturas de 64 a 256 pixels.

1. Instale e autentique o Antigravity CLI e habilite o plugin **AGY Bridge no Claude Code**. Ter o bridge conectado no Codex não o conecta automaticamente ao Claude Code. Abra `/mcp` no Claude Code e confirme que o bridge está disponível.
2. Clone este fork para uma pasta permanente:

   ```powershell
   git clone https://github.com/Kadenai/Claude-Fables.git C:\code\Claude-Fables
   ```

3. Adicione o caminho ao bloco `env` de `%USERPROFILE%\.claude\settings.json`, preservando as opções que já existem:

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "C:\\code\\Claude-Fables"
     }
   }
   ```

   Se já houver outros mods nessa variável, acrescente o caminho separado por `;` no Windows. Use somente uma cópia do Fables por sessão.
4. Reinicie o Claude Code Desktop e, na aba **Code**, execute antes de pedir uma tarefa:

   ```text
   /fables model agy
   /fables on
   ```

5. Peça uma tarefa normal. `/fables model` deve mostrar **AGY Bridge writes the story**. A escolha é salva para as próximas sessões. Sonnet continua sendo o padrão até você selecionar AGY; também é possível escolher `agy` na opção **Scene model** do menu de configuração do plugin.

O terminal pode carregar o mod com `claude --plugin-dir C:\code\Claude-Fables`, mas a animação só aparece no Desktop.

## Conexão e comportamento

- **AGY Bridge MCP server** tem o padrão `auto`: reconhece o servidor independente e o servidor com prefixo de plugin. Se você registrou o bridge com outro nome, informe nessa opção o nome exato que aparece em `/mcp`.
- Cada cena usa `start_task` com a pasta absoluta da sessão, `access: "read"`, `scope: "ordinary"` e `isolated: false`. O prompt pede somente JSON, sem ferramentas, comandos, navegação ou edição de arquivos. Nenhum código do AGY Bridge é copiado ou alterado por este fork.
- O mod consulta `task_status` uma vez por segundo, com no máximo uma consulta simultânea. O `Director` continua limitando a uma cena sendo escrita por vez; o limite global de processos do bridge também continua valendo.
- São enviados o pedido resumido, as últimas atividades e as cenas anteriores, como no narrador original. Esse contexto passa ao modelo do AGY.
- Somente uma tarefa com status `success` e uma resposta não vazia chega ao validador original de cenas. JSON inválido é descartado.
- Falhas não chamam Sonnet ou Haiku. O mod registra um aviso e aplica a espera progressiva original. Se o bridge não aparecer, verifique `/mcp`; para diagnosticar erros, use `claude --debug`.
- A tarefa é cancelada após 120 segundos, ao desligar o Fables, ao trocar o narrador ou ao encerrar a sessão. Respostas de um turno anterior continuam sendo descartadas pelas regras originais, preservando as cenas de encerramento.
- Inicializar o AGY e aguardar sua fila pode demorar mais que uma chamada direta ao Haiku. A cena atual permanece visível enquanto a próxima é escrita.

Para voltar ao narrador original, use `/fables model sonnet` ou `/fables model haiku`.

## Verificação

```powershell
claude plugin validate --strict .
claude plugin test .
```

Os testes cobrem a geração por MCP com servidor simulado, seleção e persistência, fila, timeout, cancelamento, falhas sem fallback ao Claude e os testes originais da animação. A experiência completa no Claude Code Desktop com seu AGY autenticado deve ser validada manualmente.
