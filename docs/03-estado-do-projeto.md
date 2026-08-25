# Estado do projeto

Onde o MKT Hub 2 está. Atualizado em **24/08/2026**.

Para o porquê de cada decisão, veja [01-analise-e-arquitetura.md](01-analise-e-arquitetura.md).
Para o board que estamos substituindo, [02-clickup-house-quatro5.md](02-clickup-house-quatro5.md).

## Endereços

| | |
|---|---|
| Produção | https://mkt-hub-wheat.vercel.app |
| Código | `D:\mkt-hub` |
| Repositório | github.com/beatrizaraujow/mkt-hub (privado) |
| Banco | Supabase `mkt-hub` · região sa-east-1 · org mktimer45 |
| Deploy | push em `main` sobe sozinho; função roda em `gru1` |

## O que funciona

**Entrar e permissões.** Sessão de 12h em cookie httpOnly, senha com bcrypt. Quatro papéis; o
papel define o teto e o acesso por empresa define o alcance. Quem tem acesso a Onevo enxerga
Onevo Energia, Onevo Investimentos e Cássio Maia P2P automaticamente.

**Empresas e projetos.** As quatro empresas com as cinco sub-marcas aninhadas na lista, somando
os projetos das filhas.

**Tarefas.** Criação rápida com atalho `C` de qualquer tela, lista com filtros por empresa,
responsável e concluídas, quadro com arrastar entre as seis etapas, e o detalhe em modal.

**O popup de Nova tarefa**, desenhado a partir dos mockups: título em destaque, empresa, projeto,
responsável e prazo em duas colunas, `mais detalhes` abrindo Ponto MKT, tipo e formato, e
prioridade em segmentos. Fecha depois de criar — o rodapé Cancelar / Criar tarefa promete isso, e
`C` reabre numa tecla.

**O modal**, desenhado a partir dos mockups: cabeçalho com cronômetro ao vivo e Concluir, trilha
de etapas clicável, quatro abas (Trabalho · Conversa · Tempo · Histórico) e trilho lateral com
tempo, responsável, prazo, prioridade, Ponto MKT, tipo e formato.

Dentro dele: subtarefas com cronômetro próprio, checklist, arquivos e links, comentários, e o
histórico mostrando `de → para` em toda mudança.

**Os seletores são nossos**, não do sistema operacional: popover ancorado por `position: fixed`
para escapar do `overflow` do trilho, busca que ignora acento (`edicao` acha "Edição de vídeo"),
grupos, navegação por teclado e calendário com semana começando na segunda.

**Cronômetro.** Play direto na linha, widget na barra lateral com o relógio andando, lançamento
manual, e o corte automático na virada do dia com o aviso de confirmar, ajustar ou descartar no
dia seguinte.

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

**Nunca apagar a tela durante uma ação.** Opacidade em modal deixa o fundo escuro atravessar e
parece defeito. O certo é retorno otimista mais uma barra fina de progresso.

**Confirmar que a edição do schema pegou** antes de acreditar no `db:generate`. Sem diferença no
schema, ele não gera nada — e o silêncio parece bug da ferramenta.

**Contador que soma sobre o próprio valor** precisa de `setState` funcional. Lendo a prop, cinco
cliques rápidos no `+` viram um: cada clique lê o valor antes do React atualizar.

## Pendências

**Que dependem da usuária:**

- `SUPABASE_URL` e a chave `service_role` — sem elas o upload de arquivo fica desligado
- Nome, e-mail e papel das sete pessoas, quando for a hora de cadastrar
- `npx vercel login` uma vez; o token do CLI expirou

**Conhecidas, do lado técnico:**

- Produção e desenvolvimento dividem o mesmo banco
- Variáveis do escopo Preview não configuradas (o CLI da Vercel exige prompt)
- Não existe número sequencial de tarefa; referir tarefa por número em conversa seria útil
- Dados de teste no banco: duas tarefas, uma subtarefa, um link e alguns registros de tempo

## O que falta

**Para fechar o V1.0:** busca global, calendário como visualização e a tela de pessoas — que é o
que destrava o time entrar, e está parada por decisão até os dados corretos subirem.

A ponte de leitura para o MKT Hub atual está listada como item do MVP no doc de arquitetura e como
V1.5 aqui. Os dois não podem estar certos: depende de a pontuação semanal precisar ou não continuar
rodando durante a migração. Decisão pendente.

**V1.5:** rotinas, metas, motor de pontuação, coins, ranking e snapshot semanal.

**V2:** esteira de conteúdo, captações, capacidade da semana, templates de projeto.

**V3:** revisor automático de entregas. Parado por decisão: sem as regras da Carbone
classificadas em máquina / pessoa / fora de escopo, seria chute.
