# MKT Hub 2 — Análise, Arquitetura e MVP

Documento de produto. Escrito antes da implementação, conforme a metodologia definida no prompt do projeto.
Status: **aguardando aprovação para iniciar desenvolvimento.**

Princípio que governa todas as decisões abaixo:

> **Máxima clareza com o mínimo de complexidade.**

Ordem de prioridade em caso de conflito:
**Funcionalidade → Clareza → Simplicidade → Experiência → Escalabilidade → Estética.**

---

# ETAPA 1 — ANÁLISE

## 1.1 O problema real

Hoje a operação do time de marketing está espalhada em cinco lugares:

| Onde | O que vive lá |
|---|---|
| ClickUp | Tarefas — fonte de verdade do trabalho |
| MKT Hub (mktimer) | Rotinas, horas, daily, pontuação semanal, coins, ranking, cobrança por WhatsApp |
| Drive / planilhas | Briefings, arquivos, referências |
| WhatsApp | Captações, urgências, aprovações |
| Calendários avulsos | Agenda de gravação e publicação |

O custo disso:

1. **Duplo lançamento.** A mesma entrega existe como task no ClickUp, card de conteúdo numa planilha e mensagem no WhatsApp.
2. **Verdade fragmentada.** Responder *"o que está atrasado?"* exige abrir três sistemas e cruzar na cabeça.
3. **A régua de desempenho depende de terceiro.** A pontuação semanal é calculada lendo status do ClickUp — status em português, com e sem acento, variando por lista. Isso já é fonte conhecida de bug.
4. **Nenhuma resposta pronta para a pergunta que mais importa:** *"como está a produção de conteúdo da Carbone essa semana?"*
5. **Licença e curva de aprendizado** de uma ferramenta da qual o time usa talvez 10%.

**O que o produto novo resolve:** um lugar só onde o trabalho acontece, é medido e é reconhecido.

Não é um ClickUp mais bonito. É um sistema desenhado para uma operação específica: agência interna, quatro empresas, produção de conteúdo em volume, equipe pequena, celular no campo.

## 1.2 Público

Time de aproximadamente 7 pessoas atendendo SeuBoné, Onevo, Carbone Educação e Weevo.
Funções: social media, design, copy, tráfego, audiovisual, gestão.

## 1.3 Personas

**1. Executor de mesa** — social media, designer, copywriter.
Desktop o dia inteiro. Muitas entregas pequenas, alternando entre empresas.
Precisa: fila do dia, criar rápido, anexar, comentar, concluir.
Dor: perder tempo operando a ferramenta em vez de produzir.

**2. Executor de campo** — videomaker, fotógrafo.
Celular, na rua, às vezes sem tempo de abrir nada.
Precisa: próxima captação com local, horário, briefing e referência; marcar como captado; subir arquivo.
Dor: informação de gravação espalhada em quatro conversas de WhatsApp.

**3. Gestor.**
Precisa que o sistema responda em segundos: como está o time, o que atrasou, quem está sobrecarregado, que meta está em risco, onde está o gargalo.
Dor: montar relatório na mão toda semana.

**4. Admin / Master.**
Configura empresas, metas, regras de pontuação e valida o fechamento da semana.

**5. Observador** — sócio ou cliente interno.
Só quer ver progresso. Não opera nada.

> Decisão de produto: personas 1 e 2 são a maioria e são as que abandonam sistema.
> **A régua de sucesso do MVP é o executor abrir o sistema e resolver o dia em menos de dois minutos.**

## 1.4 Fluxos principais

Seis fluxos. Estes precisam ser perfeitos; o resto pode ser apenas bom.

1. Abrir o sistema, ver o dia, começar (com timer), concluir.
2. Criar uma tarefa em menos de dez segundos, de qualquer tela.
3. Rodar a grade de publicação da semana de uma empresa.
4. Levar uma peça do briefing ao publicado.
5. Solicitar, agendar, captar e entregar uma gravação.
6. Gestor: revisar o time e fechar a semana.

## 1.5 Essencial x secundário

**Essencial:** tarefas, criação rápida, lista e quadro, painel de hoje, prazos, comentários, anexos, histórico, empresas e projetos, permissões, controle de horas, rotinas, metas simples.

**Secundário:** timeline, dashboard personalizável, relatórios avançados, status customizados, biblioteca global de arquivos, busca avançada, IA.

## 1.6 Achados — redundâncias e riscos de UX

Esta é a parte que a especificação pediu explicitamente. Cada achado traz a proposta.

### A1 — Quatro módulos para uma coisa só

**Problema.** Tarefas, Conteúdo, Captações e Rotinas aparecem como módulos separados. No modelo de dados, são a mesma entidade: um trabalho com responsável, prazo, estágio e histórico. Quatro módulos significam quatro telas de criação, quatro caixas de entrada, quatro lugares onde algo pode estar atrasado — e duplicação garantida (a edição de um vídeo vira task *e* card de conteúdo).

**Proposta.** Uma entidade única `work_item` com um campo `type` (`task`, `content`, `capture`) e um pipeline configurável por tipo. Rotina deixa de ser entidade paralela e passa a ser um **gerador** que cria work_items recorrentes.

**Benefício.** Uma caixa de entrada, um histórico, um cálculo de atraso, um mecanismo de pontuação. O usuário continua vendo "Produção" e "Captações" como áreas próprias — a unificação é interna.

**Impacto técnico.** Uma tabela central em vez de quatro. Campos específicos de cada tipo em `meta` (JSONB); campos que entram em cálculo (data, responsável, estágio) permanecem colunas reais e indexadas.

### A2 — Dezessete itens de menu contradizem o princípio central

**Problema.** A arquitetura sugerida lista 17 módulos. Progresso, Coins, Calendário, Arquivos, Minhas tarefas e Relatórios não são módulos — são propriedades, visualizações ou filtros.

**Proposta.** Oito itens de navegação (detalhados na Etapa 2). "Minhas tarefas" é o filtro padrão de Trabalho e já é o corpo do painel Hoje. Calendário é uma visualização. Arquivos é uma aba dentro de Empresa e Projeto. Relatórios é a exportação do painel do Time.

### A3 — Ranking público pode desmotivar

**Problema.** Com sete pessoas, "7º lugar" é exposição, não motivação. E funções diferentes (mesa x campo, meta por pontos x meta por rotina) não são comparáveis entre si.

**Proposta.** O ranking mostra top 3, a sua posição e a sua evolução — não a lista completa exposta. Comparação sempre dentro do mesmo grupo de regra.

### A4 — Gamificação por volume gera gaming

**Problema.** "Coins por tarefa concluída" ensina o time a fatiar trabalho em tarefas artificiais.

**Proposta.** Manter o modelo que já funciona hoje: coins derivam de percentual de meta atingido mais posição, com teto semanal e ledger append-only protegido por índice único. Nunca por volume. Toda regra nova de pontuação passa pelo teste: *"como eu burlaria isso em cinco minutos?"*

### A5 — Timer esquecido ligado

**Problema.** Todo controle de horas gera, cedo ou tarde, um registro de nove horas em cima de uma tarefa de vinte minutos.

**Proposta.** Auto-pausa por inatividade, corte automático no fim do expediente e uma correção de um clique no dia seguinte: *"você registrou 6h em X — confirma?"*

### A6 — Status customizados desde o MVP viram bagunça

**Proposta.** MVP com status fixos por tipo. Customização entra na V2 e no nível da **empresa**, nunca do projeto — senão cada projeto inventa o seu e nenhum relatório fecha.

### A7 — Criação por linguagem natural cedo demais

**Problema.** É a funcionalidade mais sedutora da especificação e a menos necessária. Um formulário rápido bem feito resolve o mesmo problema.

**Proposta.** Fora do MVP. Entra na V2 como uma camada fina sobre o mesmo endpoint de criação — custo baixo depois, custo alto agora.

### A8 — Dashboard personalizável por perfil

**Proposta.** Dois dashboards fixos e bem desenhados (Colaborador e Gestor). Personalização só se alguém pedir de verdade. Com sete pessoas, configurar dashboard é trabalho que ninguém vai fazer.

### A9 — Notificação demais

**Problema.** Já existe cobrança automática por WhatsApp duas vezes ao dia. Cada notificação nova compete com a paciência do time.

**Proposta.** Regra dura: só notifica o que muda o que a pessoa vai fazer nos próximos minutos. Isso é: atribuição, menção, prazo de hoje, captação nova, aprovação pendente. Todo o resto vira contador dentro do app.

### A10 — Timeline / Gantt

**Proposta.** Fora do MVP. Alto custo de construção, uso raro em produção de conteúdo semanal. O calendário cobre a maior parte do caso.

### A11 — A ruptura com o ClickUp e o MKT Hub atual (crítico)

**Problema — e este não está em nenhum dos dois documentos.** O MKT Hub atual calcula a pontuação semanal lendo as tasks do ClickUp. No dia em que as tarefas migrarem para o sistema novo, a pontuação, o snapshot da semana e os coins param de bater — no meio de uma semana, com gente real dependendo do resultado.

**Duas saídas:**

1. **Big bang.** O MVP já nasce com pontos, coins e snapshot dentro. MVP grande, prazo longo, risco alto.
2. **Ponte (recomendado).** O sistema novo expõe um endpoint de leitura no mesmo formato que o MKT Hub já consome do ClickUp hoje. Trocar a origem no MKT Hub é um adaptador pequeno. O ritual semanal continua funcionando sem interrupção e a gamificação migra depois, sem pressa e sem semana quebrada.

## 1.7 O que falta na especificação e vale muito

Cinco funcionalidades que não estão nos documentos e que, na operação de vocês, valem mais que metade do que está:

1. **Fila de aprovação.** A maior fonte de atraso em agência é conteúdo parado esperando aprovação. Uma tela "aguardando você", com aprovar ou pedir ajuste em um clique.
2. **Capacidade da semana.** Antes de atribuir, o gestor vê quantas horas estimadas cada pessoa já tem. Responde *"quem está sobrecarregado"* antes do problema acontecer, não depois.
3. **Vínculo captação para conteúdo.** Marcar uma captação como captada gera automaticamente o item de edição, já com os arquivos anexados. Elimina retrabalho manual e perda de gravação.
4. **Template de projeto.** "Campanha de lançamento" cria doze tarefas padrão com responsáveis e prazos relativos. Em agência, isso economiza mais tempo que qualquer outra funcionalidade da lista.
5. **Modo campo.** Tela única no celular para o videomaker: próxima captação, endereço, briefing, botão de upload. Nada mais.

---

# ETAPA 2 — ARQUITETURA

## 2.1 Navegação — de 17 itens para 8

```
Hoje         painel pessoal: o que fazer agora
Trabalho     todos os itens — lista / quadro / calendário + filtros salvos
Produção     esteira de conteúdo e captações
Rotinas      grade de publicação por empresa
Desempenho   metas, coins, ranking
Time         só gestão: carga, atrasos, gargalos, fechamento da semana
Empresas     empresas, projetos, equipe, arquivos
Ajustes
```

Atalhos globais: `Ctrl/Cmd + K` busca, `C` cria, `G` seguido de `H` volta para Hoje.

## 2.2 Modelo de dados

Hierarquia:

```
Organization
  └── Company
        └── Company (sub-marca)
              └── Project
                    └── WorkItem
                          └── WorkItem (subitem)
```

**Sub-marca é empresa, não entidade nova.** O levantamento do board antigo (24/08/2026) mostrou
nove empresas onde o plano previa quatro. Elas não são nove pares: são quatro empresas com
sub-marcas dentro.

| Empresa | Sub-marcas |
|---|---|
| SeuBoné | Box Corporativo |
| Onevo | Onevo Energia · Onevo Investimentos · Cássio Maia P2P |
| Carbone Educação | Carbone Club · Pedro Galvão P2P |
| Weevo | — |

Resolvido com uma coluna `parent_id` na própria tabela `companies`, em vez de uma tabela de
marcas. Três consequências, todas desejadas: a tarefa aponta sempre para a empresa mais
específica que existir; quem tem acesso à mãe alcança as filhas; e a lista mostra quatro linhas,
não nove — a hierarquia aparece, a poluição não.

Tabelas:

| Tabela | Papel |
|---|---|
| `organizations` | Uma só por enquanto. A coluna existe desde o início: barata agora, cara depois. |
| `users` | Pessoas, papel, grupo de meta, avatar |
| `user_company_access` | Quem enxerga qual empresa |
| `companies` | SeuBoné, Onevo, Carbone, Weevo |
| `projects` | Campanhas, frentes, contratos |
| `work_items` | Entidade central — tarefa, conteúdo ou captação |
| `work_item_stages` | Estágios por tipo e por empresa |
| `checklist_items` | Checklist dentro do item |
| `comments` | Comentários e menções |
| `attachments` | Arquivos, sempre presos a um contexto |
| `activity_log` | Histórico de tudo |
| `routines` | Regra de recorrência de publicação |
| `routine_occurrences` | Ocorrência gerada — o que deveria sair naquele dia |
| `goals` / `goal_progress` | Metas e evolução |
| `time_entries` | Registro de horas |
| `coin_ledger` | Append-only, com índice único por semana |
| `week_snapshots` | Fechamento validado da semana |
| `notifications` | Fila de notificação |
| `saved_views` | Filtros salvos por usuário |

**`work_items` — colunas principais:**
`id`, `org_id`, `company_id`, `project_id`, `parent_id`, `type`, `title`, `description`, `stage_id`, `priority`, `assignee_id`, `created_by`, `due_date`, `start_date`, `estimate_minutes`, `progress`, `source_occurrence_id`, `source_item_id`, `position`, `completed_at`, `created_at`, `updated_at`, `meta` (JSONB).

**Por que JSONB em `meta`:** captação tem local, horário, quantidade de vídeos e referências; conteúdo tem plataforma, formato e data de publicação. São campos que variam por tipo e não entram em cálculo crítico. Tudo que entra em cálculo — data, responsável, estágio, tempo — é coluna de verdade, indexada.

## 2.3 Estágios — de 12 para 6

O board antigo tinha doze status para todo tipo de trabalho. Nem todos eram estado: `banco de
criativos` era um arquivo de peças prontas ocupando uma coluna do fluxo, e `revisão solicitada`
estava vazio. Quatro colunas diferentes significavam "esperando alguém olhar".

Cada tipo passa a ter o seu pipeline, e nenhum estágio existe só para guardar coisa parada.

**`task` — demanda de trabalho** (arte, copy, tráfego, landing page, apresentação)

`Solicitado` → `Pendente` → `Em andamento` → `Ajustar` → `Aprovação` → `Concluído`

**`content` — peça de conteúdo**

`Briefing` → `Roteiro` → `Gravação` → `Edição` → `Aprovação` → `Publicado`

**`capture` — captação**

`Solicitado` → `Agendado` → `Captado` → `Enviado` → `Finalizado`

### De onde veio cada um

| Board antigo | Agora | Por quê |
|---|---|---|
| solicitado form | `Solicitado` | Entrada do formulário, ainda não triada |
| pendente | `Pendente` | — |
| em progresso | `Em andamento` | — |
| alterar · revisão solicitada | `Ajustar` | Os dois querem dizer "refaz". Um só bastava |
| pré revisão · revisão ia · aprovar · aprovação líder | `Aprovação` | Quatro colunas para "esperando alguém olhar". Quem aprova é atributo do item, não coluna do quadro |
| publicar | `Publicado`, no pipeline de conteúdo | Publicar é etapa de conteúdo, não de demanda genérica |
| banco de criativos | marca `is_asset` no item concluído | Era arquivo, não etapa. Como coluna, a peça ficava "em andamento" para sempre |
| completo | `Concluído` | — |

`Ajustar` foi mantido como estágio, e não como marcador no item, por um motivo prático: é assim
que o time já trabalha. Trocar o modelo de dados e o hábito da equipe ao mesmo tempo são dois
riscos; um de cada vez.

## 2.4 Permissões

Quatro papéis, mais uma flag:

| Papel | Alcance |
|---|---|
| Administrador | Tudo. Flag `is_master` adicional para validar fechamento de semana |
| Gestor | Gerencia equipe, projetos, tarefas e metas das empresas às quais tem acesso |
| Colaborador | Vê e executa as suas atividades |
| Observador | Só leitura |

Regra: **o papel define o teto, o acesso por empresa define o alcance.** Validação sempre no servidor — esconder item de menu no front é experiência, não segurança. Permissão granular por funcionalidade fica para a V2; com sete pessoas, papel mais empresa cobre todos os casos reais.

## 2.5 Stack — confirmações e divergências

Confirmo o documento técnico: **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + PostgreSQL + Zod + Vercel.**

Quatro divergências, todas na direção de menos peça:

**Drizzle em vez de Prisma.** Mais leve em serverless, SQL explícito, migration legível. E vocês já leem SQL cru no sistema atual.

**Redis e WebSocket ficam fora do MVP.** Com sete usuários simultâneos, a revalidação do Next resolve. Redis entra quando existir fila de verdade — cobrança por WhatsApp, geração de rotina em lote. Cron da Vercel cobre o MVP inteiro.

**Sem backend separado.** Server Actions e Route Handlers dentro do mesmo projeto Next. O documento sugere uma camada Node à parte; num monólito modular isso é a mesma coisa com um deploy a mais para manter.

**Testes onde dói.** Vitest apenas nos cálculos: pontuação, fronteira de semana, metas, coins. Playwright em três fluxos ponta a ponta. Sem perseguir cobertura.

**Banco: Supabase.** Postgres puro — o schema não muda nada em relação a qualquer outro Postgres —, região em São Paulo, e o storage S3-compatível que os anexos vão precisar já vem junto. Uma conta a menos para administrar depois. A aplicação fala com o transaction pooler (6543) e as migrations com o session pooler (5432).

---

# ETAPA 3 — MVP, V2 E FUTURO

O MVP recomendado pelo documento técnico tem seis fases. Seis fases não é MVP. Abaixo, o corte real.

## MVP — o que substitui o ClickUp

1. Autenticação, usuários, papéis, acesso por empresa
2. Empresas e projetos
3. Work items do tipo `task`: criação rápida, lista, quadro, detalhe, subitens, checklist, comentários, anexos, histórico
3b. **Formulário de solicitação.** Quem pede a demanda não é do time — no board antigo isso era o status `solicitado form` com cerca de cem campos de briefing. Sem formulário, quem solicita volta para o ClickUp e o MVP não substitui nada. Entrou no MVP por decisão de 24/08/2026.
4. Painel **Hoje**
5. Controle de horas — timer, lançamento manual, auto-pausa
6. Calendário como visualização
7. Busca global
8. **Ponte de leitura** para o MKT Hub atual continuar pontuando sem interrupção

Critério de pronto do MVP: o time trabalha um mês inteiro sem abrir o ClickUp.

## V1.5 — absorver o MKT Hub

O que permite desligar o sistema antigo: rotinas e geração de ocorrências, metas, motor de pontuação, coins, ranking, snapshot semanal com validação, daily, notificações.

## V2 — a operação de conteúdo

Esteira de conteúdo, captações e calendário de captação, fila de aprovação, capacidade da semana, templates de projeto, exportação de relatório, status customizados por empresa, biblioteca de arquivos.

## Futuro

IA (criação por linguagem natural, resumo de projeto, detecção de risco, sugestão de redistribuição), automações, tempo real, dashboard personalizável, timeline, aplicativo nativo.

**Por que esta ordem difere do documento técnico:** lá, gamificação é a fase 4 e conteúdo a fase 5. Aqui, a gamificação sai do caminho crítico porque ela já existe e já funciona em produção — a ponte a mantém viva. E a operação de conteúdo sobe de prioridade porque é onde a equipe perde mais tempo hoje sem ter sistema nenhum.

---

# ETAPA 4 — UX POR MÓDULO

## Hoje

**Problema:** a pessoa abre o sistema sem saber por onde começar.
**Quem usa:** todos, todo dia, primeira tela.
**Fluxo:** abre, lê três blocos, clica em um item, trabalha.
**Tela:** Atrasado (só aparece se existir), Hoje, Depois. À direita, uma faixa fina: meta da semana, horas de hoje, coins. Nada mais.
**Cliques:** iniciar timer e concluir direto da linha, sem abrir o item.
**Fora da tela:** gráfico, boas-vindas, contador de tarefas concluídas na vida.

## Trabalho

**Problema:** encontrar e organizar tudo que existe.
**Fluxo:** filtra, escolhe a visualização, age.
**Tela:** uma barra de filtros e uma lista densa. Quadro e calendário são a mesma coleção em outra forma — nunca dados diferentes.
**Cliques:** edição em linha para responsável, prazo, prioridade e estágio. Abrir o item é opcional, não obrigatório.
**Fora da tela:** colunas demais. Padrão: título, responsável, prazo, estágio. O resto é opcional.

## Produção

**Problema:** saber onde cada peça travou.
**Quem usa:** gestor e time de conteúdo.
**Tela:** esteira horizontal — Briefing, Roteiro, Gravação, Edição, Revisão, Aprovado, Publicado. Cada coluna mostra o contador e destaca o que está parado há mais tempo que o normal daquela etapa.
**Ganho real:** o gargalo aparece sozinho, sem ninguém precisar procurar.

## Rotinas

**Problema:** garantir que a grade de publicação de cada empresa saia.
**Tela:** grade semanal, uma linha por plataforma de cada empresa. Cada célula é um quadradinho: previsto, feito, atrasado.
**Cliques:** marcar como publicado direto na célula.
**Fora da tela:** configuração de recorrência — mora em Ajustes da empresa, não na tela de acompanhamento.

## Desempenho

**Problema:** saber como estou indo, sem virar competição tóxica.
**Tela:** sua meta e seu progresso em cima; top 3 e sua posição embaixo; sua evolução ao lado.
**Regra:** ninguém vê a lista completa com quem está por último.

## Time

**Problema:** as cinco perguntas do gestor.
**Tela:** cinco blocos, um por pergunta — carga por pessoa, atrasos, projetos em risco, metas em risco, gargalo da esteira. Cada bloco é clicável e leva para a lista filtrada correspondente.
**Regra:** bloco que não responde a uma pergunta real sai da tela.

## Empresas

**Problema:** contexto por cliente.
**Tela:** abas — Visão geral, Projetos, Equipe, Metas, Rotinas, Arquivos.

## Criação rápida

Atalho `C` de qualquer lugar. Um campo de título com foco automático. Responsável, prazo, empresa e prioridade em uma linha só, todos opcionais. `Enter` cria e mantém aberto para o próximo.
**Meta:** dez segundos, sem tirar a mão do teclado.

## Mobile

Não é o desktop encolhido. Cinco itens na barra inferior: Hoje, Trabalho, Criar, Agenda, Perfil. O videomaker abre direto em Agenda e vê o modo campo.

---

# DESIGN SYSTEM INICIAL

## Princípio

A cor codifica **camada do sistema**, não decoração:

- Superfícies de trabalho são neutras. O acento petróleo marca ação, foco e progresso.
- Semânticas (verde, âmbar, vermelho) são reservadas a estado — nunca decorativas.
- Âmbar é a cor do reconhecimento: coins, ranking, meta batida. Só aparece ali.

Isso mantém a interface calma no dia a dia e faz a conquista realmente se destacar quando acontece.

## Cor

| Token | Claro | Escuro |
|---|---|---|
| `--bg` | `#F7F8F7` | `#0F1413` |
| `--surface` | `#FFFFFF` | `#171D1C` |
| `--border` | `#E2E6E4` | `#2A3231` |
| `--text` | `#141918` | `#EDF1F0` |
| `--text-muted` | `#6B7472` | `#93A09D` |
| `--accent` | `#0D5C59` | `#4FBFB4` |
| `--success` | `#2E7D4F` | `#5CB77F` |
| `--warning` | `#B7791F` | `#E0A53F` |
| `--danger` | `#B3261E` | `#F0776C` |
| `--reward` | `#C98A2E` | `#E5B25C` |

Neutro com leve viés verde-grafite, para conversar com o acento petróleo em vez de brigar com ele.

## Tipografia

| Papel | Fonte |
|---|---|
| Display — títulos de página, números grandes | Bricolage Grotesque |
| Interface e texto | Instrument Sans |
| Dados e tempo | JetBrains Mono, com `tabular-nums` |

Escala: 12 / 13 / 14 / 16 / 20 / 26 / 34. A interface opera em 13 e 14.

## Layout e densidade

- Base de 4px. Linha de lista com 36px de altura — densa, mas respirando.
- Raio de 8px em controles, 10px em cartões.
- **Borda antes de sombra.** Sombra só em camadas flutuantes: modal, menu, popover.
- Largura máxima de texto corrido em torno de 65 caracteres.
- Movimento entre 120ms e 160ms, sempre respeitando `prefers-reduced-motion`.

## Componentes do MVP

Linha de item, quadro kanban, campo de busca com comando, seletor de responsável, seletor de data, chip de estágio, chip de prioridade, barra de progresso, avatar e grupo de avatares, painel lateral de detalhe, modal de criação rápida, estado vazio, estado de carregamento e estado de erro.

---

# DECISÕES PENDENTES

Três decisões travam o início da implementação:

1. **ClickUp** — ponte (recomendado), big bang, ou conviver com os dois indefinidamente.
2. **Ordem do MVP** — substituir o ClickUp primeiro (recomendado) ou absorver o MKT Hub primeiro.
3. **Entidade única** `work_item` (recomendado) ou os quatro módulos separados como na especificação original.

Nada é implementado antes dessas respostas.
