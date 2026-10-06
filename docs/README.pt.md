# Modo de planeamento para o Pi

> 🌐 Disponível em: [English](../README.md) | [Español](README.es.md) | [Français](README.fr.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md).

Extensão TypeScript que adiciona planeamento conversacional ao Pi-agent v1 or later: explorar um projeto, clarificar decisões, sugerir melhorias úteis e apresentar um plano antes da implementação. Pacote: `pi-plan-claude-codex`, versão `0.1.2`.

O fluxo de trabalho inspira-se no [planeamento do Codex](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex) e na [revisão e aprovação de planos do Claude Code](https://code.claude.com/docs/en/permission-modes#review-and-approve-a-plan). A implementação destina-se às APIs públicas de extensões do Pi-agent v1 or later. Pi **1.0.4** é a versão de referência testada; isto não certifica todas as versões anteriores ou futuras.

## Instalar e usar

Instale o pacote uma vez:

```sh
pi install npm:pi-plan-claude-codex
```

Depois inicie o Pi como habitualmente, a partir de qualquer projeto:

```sh
pi
```

Ative o modo na conversa:

```text
/plan
```

Na TUI, o atalho fixo **Ctrl+Alt+P** (**Ctrl+Option+P** no macOS) também alterna o modo, tal como `/plan` sem argumentos. Preserva o rascunho do editor e a proposta atual, não envia pedidos ao modelo e **nunca aprova nem executa um plano**. Ao desativar, repõe as ferramentas anteriores. Durante um turno ativo, apenas mostra um aviso: não interrompe o trabalho nem agenda uma mudança posterior.

No macOS, configure o terminal para transmitir Option como Alt/Meta, se necessário. Os diálogos nativos do Pi mantêm o foco do teclado; este não é um atalho global. Se o terminal, o sistema operativo ou outro atalho intercetar a combinação, use `/plan` como alternativa.

Agora descreva o seu objetivo numa mensagem normal, por exemplo: “Quero adicionar pesquisa ao catálogo; investigue como funciona e sugira melhorias antes de decidir.”

A instalação regista o pacote na configuração pessoal do Pi. É carregado automaticamente nos arranques seguintes, tornando o `/plan` disponível. Ative o modo com esse comando ou com o atalho de teclado; não são necessários caminhos nem flags no arranque. `/plan <pedido>` também é suportado como atalho.

Para instalar uma cópia local, incluindo antes da primeira publicação no npm, execute:

```sh
pi install /absolute/path/to/pi-plan-claude-codex
```

Depois use o mesmo fluxo `pi` → `/plan`.

Requer Pi-agent v1 or later e Node.js `>=22.19.0`. O Pi carrega TypeScript diretamente sem uma etapa prévia de compilação e fornece as dependências declaradas em `peerDependencies`.

## Fluxo de trabalho

1. **Investigar.** Leia as instruções do projeto e explore a implementação. Procure primeiro os factos que o agente consegue descobrir por si próprio.
2. **Discutir.** Clarifique o objetivo, o âmbito, as restrições e os critérios de sucesso. Sugira melhorias úteis de UX, simplicidade ou comportamento, explique os seus compromissos e pergunte se devem ser incluídas.
3. **Fechar decisões.** Defina interfaces, abordagem, erros, compatibilidade e validação. A entrevista adapta-se à tarefa: normalmente uma decisão por pergunta, até três perguntas relacionadas, sem número mínimo de rondas nem perguntas de preenchimento.
4. **Rever.** Apresente um plano Markdown completo com as decisões aceites, passos verificáveis, testes e pressupostos. O utilizador escolhe o que fazer.

As perguntas podem oferecer opções com compromissos e recomendação, além de resposta livre. Cancelar deixa a decisão sem resposta e interrompe o turno. O modelo tem instruções para preservar as decisões anteriores e não alargar o âmbito sem aprovação. A qualidade da entrevista e a completude do plano também dependem do modelo selecionado.

Quando o plano é apresentado, estas ações ficam disponíveis:

- **Continuar a planear:** mantém a proposta pendente e as restrições de só leitura.
- **Refinar o plano:** pede comentários e gera uma nova revisão.
- **Executar nesta conversa:** repõe as ferramentas anteriores e inicia a implementação com o plano aprovado.
- **Executar numa sessão limpa:** cria uma sessão sem o histórico da entrevista e passa o plano completo, a sua proveniência, o modelo, o nível de raciocínio e as ferramentas anteriores.

Cancelar a revisão mantém o modo ativo. Uma aprovação só vale para essa proposta e essa sessão. Nova informação invalida a proposta anterior; uma resposta tardia a um diálogo já invalidado não pode iniciar a execução. Se a criação de uma sessão limpa for cancelada, volta-se ao planeamento.

## Comandos

| Comando | Resultado |
| --- | --- |
| `/plan` | Alterna o modo de plano. |
| Ctrl+Alt+P (macOS: Ctrl+Option+P) | Alterna como `/plan`, na TUI. |
| `/plan <pedido>` | Ativa o modo e começa a planear esse pedido. |
| `/plan on` | Ativa sem enviar um pedido ao modelo. |
| `/plan off` | Desativa o modo e repõe as ferramentas anteriores. |
| `/plan status` | Mostra o modo, a revisão, o estado e o ficheiro Markdown. |
| `/plan review` | Volta a mostrar a proposta e o seletor; repete uma exportação falhada. |
| `/plan execute` | Abre o mesmo seletor de revisão; é preciso escolher uma ação. |
| `/plan refine [comentários]` | Refina a proposta com comentários ou abre um prompt para os escrever. |
| `--plan` | Inicia em modo de plano se o ramo não tiver estado guardado. |

As mudanças de modo acontecem com o agente em repouso. Escrever “implementa o plano” como mensagem ordinária mantém o agente em modo de planeamento: a transição faz-se pelos comandos ou pela escolha explícita de execução. `/plan off` termina as restrições do modo sem iniciar automaticamente uma implementação.

## Exploração permitida

Enquanto ativo, `read`, `grep`, `find`, `ls` e três ferramentas integradas ficam ativados:

| Ferramenta | Função |
| --- | --- |
| `plan_ask` | Fazer perguntas com opções ou resposta livre. |
| `plan_submit` | Guarda e apresenta uma proposta; não aprova a sua execução. |
| `plan_inspect` | Consultas Git fixas: `status`, `diff`, `log` e `show`. |

Ferramentas externas previamente ativas podem continuar disponíveis se declararem `readOnlyHint: true` e não declararem `destructiveHint: true`. Ferramentas desconhecidas ou mutantes são bloqueadas, incluindo chamadas aninhadas, bem como `bash`, `powershell`, `codemode`, `write`, `edit` e os comandos do utilizador `!`/`!!`.

`plan_inspect` usa argumentos diretos, sem shell, com operações fixas, referências validadas, opções que desativam diffs externos e textconv, limite de dez segundos e saída limitada. Testes, builds, scripts e instalações têm de aguardar a execução aprovada. Se o plano precisar de evidência que dependa dessas operações, tem de reconhecer essa limitação.

Isto é uma política dentro do Pi, não uma sandbox do sistema operativo. As anotações em ferramentas externas são declarações dos seus autores; outras extensões executam código com as permissões do Pi. As escritas próprias do modo limitam-se a snapshots de sessão e exportações de propostas.

## Estado e ficheiros

O estado e a última proposta são guardados como entradas personalizadas no **ramo atual da sessão**. São restaurados ao retomar, recarregar, mudar de sessão ou navegar na árvore. Um ramo novo herda apenas os snapshots presentes nos seus antecessores.

Cada proposta cria um ficheiro independente `.pi/plans/<uuid>.md` no projeto, sem sobrescrever revisões anteriores. A sessão é a fonte de verdade; editar o Markdown exportado não modifica nem aprova automaticamente a proposta. Use `/plan refine` para incorporar alterações. `.pi/plans/` está excluído do Git neste repositório.

Se a exportação falhar, a proposta permanece na sessão, o seletor de execução não é aberto e `/plan review` permite repetir. Os diretórios `.pi` e `plans` não podem ser links simbólicos. Os ficheiros são criados em exclusivo com permissões `0600` nos sistemas suportados. `--no-session` mantém o estado apenas durante o processo, enquanto os ficheiros Markdown permanecem no disco.

## TUI, RPC, print e JSON

A TUI usa diálogos nativos e um indicador de modo. `regular` e `fullscreen`, Unicode e redimensionamento para terminal estreito foram testados.

O RPC usa pedidos nativos `extension_ui_request` (`select` e `input`), widgets de texto e notificações. O cliente tem de mostrar a proposta e responder aos diálogos com `extension_ui_response`, ou cancelá-los. Respostas e aprovações nunca são inferidas a partir de um timeout. A implementação começa depois de terminado o turno de planeamento.

Print/texto e JSON mantêm as restrições sem diálogos nem execução automática. Perguntas pendentes são incluídas na resposta final; quando o plano está completo, é exportado e o modelo tem de incluir o seu Markdown na resposta final. JSON/RPC mantêm o stdout reservado ao protocolo.

```sh
pi --plan -p 'Plan a catalog search'
pi --plan --mode json -p 'Plan a catalog search'
pi --mode rpc
```

## Desenvolvimento e verificação

Para testar a cópia de trabalho sem a publicar, instale o seu caminho com `pi install /absolute/path/to/pi-plan-claude-codex`; depois use `pi` e `/plan` como com o pacote npm. Para o carregar apenas durante uma invocação de desenvolvimento, use `pi -e /absolute/path/to/pi-plan-claude-codex`.

```sh
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

O verificador reutiliza as dependências da instalação do Pi. Os testes de distribuição empacotam esta extensão, servem o tarball a partir de um registo npm local e executam `pi install npm:pi-plan-claude-codex` num perfil temporário. Depois arrancam `pi` sem argumentos e ativam `/plan` num terminal real. Não modificam a configuração pessoal do utilizador nem descarregam dependências de terceiros.

`check` precisa de `tsc` no PATH. Pode especificar `PI_PLAN_HOST_ROOT` (a raiz do pacote Pi) e `PI_PLAN_TSC` (o executável do verificador). Os testes usam a remoção nativa de tipos do Node e foram verificados com Node `24.18.0`. Os testes de terminal Unix precisam de Python 3; são omitidos no Windows.

A suite verifica instalação e carregamento automático, política de ferramentas, snapshots de ramos, exportações, erros e cancelamento, aprovação em ambas as sessões, preservação de modelo/raciocínio, invalidação de diálogos, refinamento, reload, isolamento do histórico, chamadas aninhadas, modos sem UI e terminal real. Utiliza o runtime instalado do Pi com um provider determinístico, sem chamadas a modelos nem credenciais reais. As fixtures não estão incluídas no pacote distribuível.

Estes testes verificam mecanismos e comportamento do protocolo. Não constituem uma avaliação conversacional com um modelo real nem uma validação de clientes RPC específicos.
