# Estado do projeto

Onde o MKT Hub 2 está. Atualizado em **26/08/2026**.

Para o porquê de cada decisão, veja [01-analise-e-arquitetura.md](01-analise-e-arquitetura.md).
Para o board que estamos substituindo, [02-clickup-house-quatro5.md](02-clickup-house-quatro5.md).
Para o revisor de entregas, [04-revisor.md](04-revisor.md).

## Endereços

| | |
|---|---|
| Produção | https://mkt-hub-wheat.vercel.app |
| Código | `D:\mkt-hub` |
| Repositório | github.com/beatrizaraujow/mkt-hub (privado) |
| Banco de produção | Supabase `mkt-hub` (`tnfjjaxrmatuovwjiptz`) · sa-east-1 · org mktimer45 |
| Banco de desenvolvimento | Supabase `mkt-hub-dev` (`hqohquknxgiywpokmndp`) · sa-east-1 · mesma org |
| Deploy | push em `main` sobe sozinho; função roda em `gru1` |

## O que funciona

**Entrar e permissões.** Sessão de 12h em cookie httpOnly, senha com bcrypt. Quatro papéis; o
papel define o teto e o acesso por empresa define o alcance. Quem tem acesso a Onevo enxerga
Onevo Energia, Onevo Investimentos e Cássio Maia P2P automaticamente.

**Empresas e projetos.** As quatro empresas com as cinco sub-marcas aninhadas na lista, somando
os projetos das filhas.

**Tarefas.** Criação rápida com atalho `C` de qualquer tela, lista agrupada por etapa com grupos
recolhíveis, quadro com arrastar entre as **onze** etapas do fluxo de tarefa, e o detalhe em modal.
Sair de `APROVAÇÃO LÍDER` exige papel de gestor ou acima, validado no servidor.

**O popup de Nova tarefa**, desenhado a partir dos mockups: título em destaque, empresa, projeto,
responsável e prazo em duas colunas, `mais detalhes` abrindo Ponto MKT, tipo e formato, e
prioridade em segmentos. Fecha depois de criar — o rodapé Cancelar / Criar tarefa promete isso, e
`C` reabre numa tecla.

**O modal**, desenhado a partir dos mockups: cabeçalho com cronômetro ao vivo e Concluir, quatro
abas (Trabalho · Conversa · Tempo · Histórico) e trilho lateral com tempo, responsável, prazo,
prioridade, Ponto MKT, tipo, formato e **etapa** — esta última com o mesmo pill colorido da lista
e do quadro. A trilha horizontal de etapas saiu em 26/08/2026: com onze etapas ela mostrava que
existem muitas colunas, não onde a peça está.

Dentro dele: subtarefas com cronômetro próprio, checklist, arquivos e links, comentários, e o
histórico mostrando `de → para` em toda mudança.

**Os seletores são nossos**, não do sistema operacional: popover ancorado por `position: fixed`
para escapar do `overflow` do trilho, busca que ignora acento (`edicao` acha "Edição de vídeo"),
grupos, navegação por teclado e calendário com semana começando na segunda.

**Cronômetro.** Play direto na linha, widget na barra lateral com o relógio andando, lançamento
manual, e o corte automático na virada do dia com o aviso de confirmar, ajustar ou descartar no
dia seguinte.

**Time.** Quem administra convida; a pessoa define a própria senha pelo link. A conta nasce sem
senha — quem convida nunca escolhe a senha de ninguém. O banco guarda só o hash do token, que vale
7 dias e serve uma vez. Desativa em vez de apagar, porque apagar levaria junto o histórico.

O envio do link por e-mail não existe: exigiria serviço de envio, conta e chave. O link é copiado e
mandado pelo canal que o time já usa. `npm run invite -- --base <url>` faz o mesmo em lote.

**Anexos.** Link funciona. Arquivo está construído e espera as chaves do storage — enquanto não
chegam, o botão fica desabilitado em vez de aceitar o arquivo e recusar depois.

**Formulário de solicitação**, em `/solicitar`, sem login. Quem pede a demanda não é do time e não
tem conta; exigir login mandaria o pedido de volta para o WhatsApp. Uma página só para o grupo
inteiro: as quatro empresas com as sub-marcas agrupadas dentro de cada uma. Quem tem o link abre
pedido, não vê tarefa, não vê pessoa, não vê o que já foi pedido.

`/solicitar/<empresa>` continua valendo como atalho recortado numa empresa, e um link recortado
não vira porta para o grupo — ele só aceita aquela empresa e as filhas dela. O link geral está em
`/empresas`; o de cada empresa, na página dela.

Onde o board antigo tinha cerca de cem campos de briefing quase sempre vazios, aqui são no máximo
quatro por tipo de demanda. As respostas vão para `meta.briefing` e aparecem no detalhe da tarefa,
na ordem em que foram perguntadas, junto de quem pediu e como falar com a pessoa.

**Motivo obrigatório ao reprovar.** Sair de um estágio de revisão para qualquer coisa que não seja
concluído pede um texto — pela trilha de etapas e pelo arrastar no quadro. O motivo entra no
histórico e fica em destaque no topo da tarefa enquanto ela estiver de volta, sumindo sozinho
quando ela anda de novo.

**Calendário**, a terceira visualização de Trabalho, ao lado de Lista e Quadro. Mês em grade
começando na segunda, com os dias das pontas das semanas vizinhas, e o mês na URL (`?mes=`) para
sobreviver ao F5. Respeita os mesmos filtros. O dia de cada tarefa é calculado em BRT no servidor,
não no navegador. Tarefa sem prazo não cabe num calendário, então o rodapé diz quantas são — senão
ela some sem aviso.

**Busca global**, na barra lateral, aberta por `/` ou Ctrl+K de qualquer tela. Procura por título,
briefing e nome de quem pediu, e ignora acento dos dois lados — `aniversario` acha "aniversário".
Ao contrário das listas, inclui subtarefa e concluída: quem busca procura algo específico, e
esconder o que terminou é o jeito mais rápido de a busca parecer quebrada. Respeita o alcance de
empresa, com a mesma herança de sub-marca do resto.

Apagados na navegação, ainda não construídos: Produção, Rotinas, Desempenho e Time.

## Decisões que governam o resto

1. **Ponte, não big bang** — o sistema novo serve os dados para o MKT Hub atual continuar
   pontuando durante a migração.
2. **Tarefas primeiro** — o MVP substitui o ClickUp; rotinas, metas e coins ficam para a V1.5.
3. **Entidade única** — tarefa, conteúdo e captação são o mesmo `work_items`.
4. **Supabase**, não Neon.
5. **Quatro empresas com sub-marcas dentro**, não nove soltas.
6. **Doze estágios viraram seis** — quatro colunas de "esperando alguém olhar" viraram uma.
7. **Formulário de solicitação entra no MVP.**

## Armadilhas que já custaram tempo

**Autoria do commit.** A Vercel bloqueia deploy cujo autor ela não associa a uma conta do GitHub,
e o CLI não mostra isso — o deploy fica em `UNKNOWN`, parecendo travado. O estado real vem da API.

**Região da função.** Precisa ser `gru1`. Com a função nos Estados Unidos e o banco em São Paulo,
cada tela faz de oito a dez viagens transatlânticas.

**Consulta repetida no mesmo request.** `runningTimer` e `closeStaleTimers` usam `cache()` do
React porque são chamados no layout, na página e no painel.

**`revalidatePath` já atualiza a árvore.** Chamar `router.refresh()` depois dobra o trabalho.

**Linha de grid precisa ser `minmax(0,1fr)` para o filho rolar.** Com `auto` — o padrão — a linha
cresce junto com o conteúdo, o filho nunca ganha altura limitada, e o `overflow-y-auto` de dentro
não tem o que rolar. Vale o mesmo para item de flex, que precisa de `min-h-0`.

**Nunca apagar a tela durante uma ação.** Opacidade em modal deixa o fundo escuro atravessar e
parece defeito. O certo é retorno otimista mais uma barra fina de progresso.

**`next build` e `next dev` dividem o `.next`.** Rodar o build de produção e depois subir o dev
deixa rota devolvendo 404 sem erro nenhum no log — o `/login` some e parece bug de código. Apagar
`.next` resolve.

**Confirmar que a edição do schema pegou** antes de acreditar no `db:generate`. Sem diferença no
schema, ele não gera nada — e o silêncio parece bug da ferramenta.

**Contador que soma sobre o próprio valor** precisa de `setState` funcional. Lendo a prop, cinco
cliques rápidos no `+` viram um: cada clique lê o valor antes do React atualizar.

**Cron mais frequente que diário derruba o deploy inteiro.** No plano Hobby, a Vercel recusa
`vercel.json` com agenda tipo `*/10 * * * *` — e recusa **antes de criar o deploy**, então não
aparece como build falhado em lugar nenhum. O board fica servindo a versão antiga enquanto o
repositório anda. Foi o que deixou seis commits fora do ar entre 25 e 26/08/2026. O sintoma é
`vercel ls` mostrar o deploy mais novo com um dia de idade; `npx vercel --prod` mostra o motivo.

**A Vercel não roda migration no build.** Mudança de schema precisa de `npm run db:migrate`
apontado para produção **antes** do push — código novo com banco velho quebra a tela.

## Pendências

**Que dependem da usuária:**

- **Desativar a conta `teste@mkthub.test`.** É admin master com senha que circulou em chat, e o
  time real já está no sistema. Desativar corta o acesso na requisição seguinte — o `requireUser`
  filtra por `is_active` a cada requisição, o cookie de 12h não sobrevive. É o item mais sério
  desta lista inteira.
- **Decidir como o board do ClickUp atravessa.** Não existe importação, e não há nenhuma prevista:
  hoje toda tarefa nasce à mão. Ou se escreve um importador, ou se marca uma data de corte e o que
  está em andamento termina no ClickUp. Enquanto isso não for decidido, os dois sistemas divergem
  todo dia.
- **Rodar a Revisão IA em silencioso por uma semana** e ler a taxa de reversão em
  **Revisor → Medição**. É o número que decide se a ferramenta fica.
- **As 27 regras de pessoa e os três critérios difusos** da Carbone, na segunda leva
  (ver 04-revisor.md). As três de máquina e o checklist entraram em 26/08/2026.

**Conhecidas, do lado técnico:**

- ~~Produção e desenvolvimento dividem o mesmo banco.~~ Separados em 25/08/2026: o `.env.local`
  aponta para `mkt-hub-dev` e produção vive só nas variáveis da Vercel. Banco, anexos e bucket
  isolados. A trava do `npm run dev:setup` impede rodar o seed no lugar errado.
- Variáveis do escopo Preview não configuradas (o CLI da Vercel exige prompt)
- Não existe número sequencial de tarefa; referir tarefa por número em conversa seria útil
- ~~Dados de teste no banco.~~ O cartão "tal tal" e as horas fabricadas da conta de teste foram
  apagados em 26/08/2026. Falta conferir "Criativo de teste"
- O filtro "Mostrar concluídas" na tela de Trabalho não muda mais nada: a lista agrupada inclui
  tudo, porque grupo marcando zero por causa de filtro mente sobre o que existe. O controle
  continua na tela sem efeito — some ou vira "recolher os terminados"
- `resendInvite` gera token novo mas não invalida a senha vigente. Como não existe (por decisão
  aprovada) ação de admin para trocar senha de terceiro, o convite é o único caminho e hoje ele
  não fecha a porta
- No banco de **desenvolvimento** ficaram quatro regras de exemplo (SB-01 a SB-04), três itens de
  checklist e a entrega "Peça de teste do revisor", com três rodadas de parecer. Servem para
  conhecer a tela; apagar quando as regras reais entrarem

## O que falta

**O V1.0 está construído.** A tela de Time entrou em 25/08/2026, o time foi cadastrado por
convite, e a Revisão IA entrou em 26/08/2026. O que separa "construído" de "fechado" não é
feature: é a virada de chave.

Duas decisões travam essa virada, e são a mesma decisão vista de dois lados:

1. **Como o board do ClickUp atravessa** — importador ou data de corte.
2. **A ponte de leitura para o MKT Hub 1.** Ela aparece como item do MVP no doc de arquitetura e
   como V1.5 aqui, e os dois não podem estar certos. Depende de a pontuação semanal precisar
   continuar rodando durante a migração — e ela lê o ClickUp. Se as tarefas novas pararem de
   nascer lá, a pontuação fica cega.

Decisão pendente desde 24/08/2026.

**V1.5:** rotinas, metas, motor de pontuação, coins, ranking e snapshot semanal.

**V2:** esteira de conteúdo, captações, capacidade da semana, templates de projeto.

**Revisão IA — no ar e provada em produção em 26/08/2026, em silencioso.** Entregue em 26/08/2026 e provada ponta a ponta: a etapa
`REVISÃO IA` é o gatilho, o porteiro barra entrada incompleta antes de gastar chamada, o
julgamento lê **a copy da entrega** (campo próprio, separado do briefing), o parecer cita a regra
e um trecho literal — achado que inventa regra ou inventa citação é descartado no servidor —, o
veredito sai de função pura com teste, o checklist humano trava a saída de `APROVAÇÃO`, e a
medição mostra a taxa de reversão. Nasce em silencioso: emite parecer e não move nada.
Ver [04-revisor.md](04-revisor.md).

O que falta não é código: é a chave do modelo e as regras escritas e classificadas. Sem regra
cadastrada o porteiro barra e diz exatamente isso, em vez de inventar parecer.
