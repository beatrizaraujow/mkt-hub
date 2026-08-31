# Estado do projeto

Onde o MKT Hub 2 está. Atualizado em **31/08/2026**.

Para o porquê de cada decisão, veja [01-analise-e-arquitetura.md](01-analise-e-arquitetura.md).
Para o board que estamos substituindo, [02-clickup-house-quatro5.md](02-clickup-house-quatro5.md).
Para o revisor de entregas, [04-revisor.md](04-revisor.md).

## Endereços

| | |
|---|---|
| Produção | https://www.mkthub.space (desde 31/08/2026) |
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

O tempo é **escrito como se fala**, desde 31/08/2026: `1h30`, `45m`, `2h`, `1:30`, `90`, `1,5h`,
`2 horas`. Antes, lançar quatro horas e meia era digitar `270`. Duas regras dentro do leitor
(`src/lib/duration.ts`): número sozinho vale como **minuto**, porque quem digita `45` quer 45
minutos; e número solto ambíguo é **recusado, não adivinhado** — `3h20` são três e vinte, mas
`2h 20 30` não tem leitura óbvia, e chutar cria um número errado que ninguém confere.

A saída é `4h 30m`, `2h`, `30m`, `42s`. O formato antigo escrevia meia hora como `0h30`, que se lê
como zero no primeiro olhar.

**Corrigir e apagar lançamento moram na própria lista**, e não só no aviso de fim de expediente —
antes, um lançamento errado no dia a dia não tinha conserto. Só nas próprias linhas, garantido
pelo `where` por `userId` na action, não pelo botão escondido na tela. Cada lançamento aceita
**nota**: "reunião com o cliente" explica um registro de 2h que sem isso vira suspeita seis meses
depois.

**O que não foi copiado do ClickUp**, de propósito: o interruptor de faturável (a casa não cobra
por hora), tag por lançamento (o registro já sabe tarefa, empresa e pessoa), a linha "Sem
subtarefas" quando não há subtarefa, e o intervalo vazio que aparece antes de a pessoa digitar
qualquer coisa. A regra que sai disso: **divisão só quando há o que dividir** — vale para o total
com subtarefa e para o agrupamento por pessoa.

**Time.** Quem administra convida; a pessoa define a própria senha pelo link. A conta nasce sem
senha — quem convida nunca escolhe a senha de ninguém. O banco guarda só o hash do token, que vale
7 dias e serve uma vez. Desativa em vez de apagar, porque apagar levaria junto o histórico.

**O convite sai por e-mail desde 31/08/2026** (SMTP). O link continua aparecendo na tela mesmo
quando o envio dá certo — mensagem cai em spam, e enquanto o link estiver à mão isso não impede
ninguém de entrar. Falha de SMTP nunca cancela o convite: vira aviso, e o link vale igual.
`npm run invite -- --base <url> --enviar` faz o mesmo em lote.

**Convite para quem já tem senha é recusado.** Não substitui a senha vigente, só abre uma segunda
porta para a mesma conta — e por e-mail essa porta passaria a morar numa caixa de entrada,
encaminhável.

**A casa tem dois provedores de e-mail, um por domínio.** `@grupoquatro5.com` está no Google
Workspace (`smtp.gmail.com`); `@seubone.com` está no Zoho (`smtp.zoho.com`). Autenticar um
endereço no servidor do outro dá 535, e se passasse o SPF do domínio derrubaria a mensagem em
spam. Confira o MX antes de supor.

**Anexos.** Link e arquivo. `SUPABASE_URL` e a chave de serviço estão configuradas em produção
desde 26/08/2026 — antes disso o botão ficava desabilitado, em vez de aceitar o arquivo e recusar
depois. Bucket privado; a miniatura aparece por URL assinada, e a chave nunca chega ao navegador.

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

**Motivo obrigatório ao voltar.** Sair de uma etapa de revisão **para trás** pede um texto — pelo
campo de etapa e pelo arrastar no quadro. A comparação é por posição, não por tipo do destino: com
quatro etapas de revisão em sequência, avançar de uma para a seguinte também é sair de uma revisão,
e a regra antiga pedia motivo para seguir em frente. Motivo pedido no caminho normal vira "-"
digitado para passar, e aí o dado de retrabalho morre.

O motivo entra no histórico e fica em destaque no topo da tarefa enquanto ela estiver de volta,
sumindo sozinho quando ela anda de novo.

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

**Rotinas.** A grade da semana, uma linha por plataforma de cada empresa, com três estados por
célula: previsto, publicado, atrasado. Marcar que saiu é um clique na célula; botão direito abre a
tarefa gerada.

Rotina **não é entidade paralela**: é um gerador. Cada ocorrência vira um `work_items` de verdade,
com responsável, prazo, cronômetro e histórico. Marcar publicado leva a tarefa ao fim do pipeline
junto — senão a grade diria "saiu" com a tarefa aberta na fila de alguém, e os dois números do
sistema passariam a discordar.

A geração roda **na leitura da tela**, sem cron e sem fila: o índice único em (rotina, dia) segura
duas pessoas abrindo ao mesmo tempo. Semana passada não gera — tarefa não nasce atrasada porque
alguém clicou na seta para trás.

Item de rotina fica **fora da lista de Trabalho por padrão**, com o filtro "Incluir rotinas" para
quem quiser ver. Story diário em quatro empresas são 28 itens por semana; misturados com a demanda
de verdade, afogam o que precisa de atenção. O lugar de olhar rotina é a grade.

A configuração da recorrência mora em **Ajustes de cada empresa**, não na grade: acompanhar é
diário e de olhar, configurar é raro e de decidir. Story diário é uma rotina com sete dias
marcados, não sete rotinas.

**Navegação.** Hoje, Trabalho, Rotinas, Desempenho, Revisor, Time, Empresas e Ajustes funcionam.
Revisor e Time só aparecem para gestor e admin — menu que oferece tela que a pessoa não pode abrir
promete o que não cumpre. Apagado, ainda não construído: só Produção.

## O fluxo de tarefa

Onze etapas. A cor sai de um lugar só (`src/lib/stages.ts`), então a etapa é a mesma na lista, no
quadro e no campo do painel. O **nome** continua vindo do banco — é livre e será customizável por
empresa; o que não muda é o `slug`, que liga o nome à cor e à regra de papel.

| # | Etapa | Slug | Cor |
|---|---|---|---|
| 1 | Solicitado | `solicitado` | `#8A8F98` |
| 2 | Pendente | `pendente` | `#6B7280` |
| 3 | Em andamento | `em_andamento` | `#F5C518` |
| 4 | Pré revisão | `pre_revisao` | `#8B5CF6` |
| 5 | Revisão IA | `revisao_ia` | `#06B6D4` |
| 6 | Ajustar | `ajustar` | `#E5352B` |
| 7 | Aprovação | `aprovacao` | `#14B8A6` |
| 8 | Aprovação líder | `aprovacao_lider` | `#F07C1E` |
| 9 | Publicar | `publicar` | `#E5187F` |
| 10 | Completo | `completo` | `#16A34A` |
| 11 | Banco de criativos | `banco_criativos` | `#2F6BFF` |

**Sair de `APROVAÇÃO LÍDER` exige gestor ou acima**, validado no servidor. A tela também não
oferece o arrasto, mas isso é conforto: quem chama a action direto bate na mesma linha.

**Sair de `APROVAÇÃO` para frente exige o checklist respondido.** Voltar para ajuste, não — quem
devolveu já viu o que estava errado, e exigir ali só ensinaria a marcar tudo para conseguir
devolver.

**Texto escuro nos onze pills.** Branco reprova o contraste em nove das onze cores; sobre o amarelo
dá 1.63:1. O `pendente` (`#6B7280`) fica em 4.34 e é o único abaixo do mínimo — clarear o cinza
resolve, e a cor é decisão de quem desenhou o fluxo.

## Decisões que governam o resto

1. **Ponte, não big bang** — o sistema novo serve os dados para o MKT Hub atual continuar
   pontuando durante a migração.
2. **Tarefas primeiro** — o MVP substitui o ClickUp; rotinas, metas e coins ficam para a V1.5.
3. **Entidade única** — tarefa, conteúdo e captação são o mesmo `work_items`.
4. **Supabase**, não Neon.
5. **Quatro empresas com sub-marcas dentro**, não nove soltas.
6. **Doze estágios viraram seis**, e os seis viraram **onze** em 26/08/2026, quando o fluxo
   ganhou as duas revisões, os dois portões de aprovação e o banco de criativos.
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

**Variável de ambiente congela no build.** Salvar no painel não muda nada até o próximo deploy.
Foi o que fez um "deploy Ready" parecer feature no ar quando o build era do commit anterior.

**Modelo do Google morre para conta nova antes de morrer para todo mundo.** Chave criada em
agosto/2026 recebeu `404 ... is no longer available to new users` num modelo que a documentação
ainda listava. A mensagem traz o substituto, então a falha se resolve na leitura — mas custa uma
rodada e um redeploy. O padrão no código precisa ser um modelo liberado para conta nova.

**O erro do Postgres vem embrulhado.** A mensagem de fora diz só `Failed query` com o SQL colado; o
nome da constraint fica em `cause`. Sem desembrulhar, quem cadastrava um código repetido recebia o
`insert into` inteiro na tela. Mora em `src/lib/errors.ts`.

**`vercel env pull` traz nome sem valor.** As variáveis sensíveis de produção voltam como
`DATABASE_URL=""`. E **não existe `DIRECT_URL` em produção** — ela só é usada por migration, que
roda da máquina de quem desenvolve. Ou seja: migrar produção exige a string do session pooler vinda
de fora, não do painel.

**O pooler do Supabase é compartilhado.** O host é idêntico em desenvolvimento e em produção — o
que identifica o projeto é o **usuário** da conexão, antes do `@`. Conferir pelo host aprova o banco
errado com aparência de conferência feita.

## Como chegou aqui

| Data | O que entrou |
|---|---|
| 21/08 | Base: autenticação, empresas, projetos e o deploy na Vercel |
| 22/08 | Tarefas: criação rápida, lista, quadro com arrastar, detalhe em modal, cronômetro, subtarefas |
| 23/08 | Redesenho a partir dos mockups. Anexos, formulário público de pedido, motivo ao reprovar |
| 24/08 | Busca global, calendário, e as primeiras tabelas do revisor |
| 25/08 | Tela de Time e convite. Desenvolvimento separado de produção, com trava contra seed no lugar errado |
| 26/08 | Pipeline de onze etapas, a Revisão IA inteira com o adaptador do Gemini, e a primeira revisão de verdade em produção |
| 27/08 | Rotinas: grade da semana, filtros, análise por empresa e por pessoa, import por colagem |
| 28/08 | Bloco C inteiro — pontuação, metas, snapshot, coins — e a tela Desempenho. Import das 90 tarefas vivas do ClickUp |
| 30/08 | Coluna do quadro para de esticar e rola por dentro. Conta desativada deixava a pessoa presa num laço de redirecionamento (`/sair`) |
| 31/08 | Convite por e-mail (SMTP); o tempo escrito como se fala; o placar do dia — o último bloco da V1.5; domínio próprio `www.mkthub.space`; a seção Revisor redesenhada; a tela de entrada nova; o logo oficial e o ouro da marca; e a escolha de tema |

## Pendências

**Que dependem da usuária:**

- ~~Desativar a conta `teste@mkthub.test`.~~ Desativada em 30/08/2026. Ela era, sem ninguém
  saber, **a única conta que alguém já tinha usado**: as seis do time nunca definiram senha, e os
  convites de 25/08 nunca chegaram a ninguém. Desativá-la deixou a produção sem porta de entrada.
  Ver o item novo abaixo.
- **Ninguém consegue entrar em produção.** Klenio, Maria Clara, Maria Luiza, Samuel, Thiago e Zion
  têm conta ativa e **nenhuma senha**; a conta da Anny tem senha mas nunca foi usada. Resolve em
  uma hora, sem depender de e-mail: `create-user` para o admin e `npm run invite` para os seis,
  entregando os links à mão. É o item mais sério desta lista inteira.
- ~~Decidir como o board do ClickUp atravessa.~~ **Decidido em 31/08/2026: a data de corte é
  07/09/2026.** A partir dela, tarefa nova nasce só no Hub 2; o que estiver em andamento no
  ClickUp termina lá. As 258 vivas já atravessaram, e `npm run clickup:sincronizar` alinha a etapa
  enquanto os dois convivem — o que deixa de ser necessário no dia do corte.
- **A semana do corte tem quatro dias úteis, não cinco.** 07/09 é feriado da Independência, e as
  metas semanais (130, 80, 80, 60) pressupõem cinco dias. O teto real de todo mundo naquela semana
  é **80% da meta** — abaixo da faixa de 90%, por causa do calendário e não do trabalho. Fechar
  essa semana sem corrigir puniria o time inteiro na primeira semana do sistema novo. A saída
  prevista no desenho é a mesa de fechamento: o sistema sugere, uma pessoa valida. Meta
  proporcional a dias úteis é assunto de V2, e exige calendário de feriados.
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
- ~~`resendInvite` gera token novo mas não invalida a senha vigente.~~ Corrigido em 31/08/2026:
  a action **recusa quem já tem senha**, em vez de abrir uma segunda porta para a mesma conta.
  Virou urgente quando o convite passou a sair por e-mail, porque a segunda porta deixaria de
  morrer na tela de quem convida e passaria a ficar numa caixa de entrada, encaminhável
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

**V1.5** — o objetivo é desligar o MKT Hub 1, não somar funcionalidade.

**Construída em 31/08/2026**, com o F movido para a V2. O que separa "construída" de "ligada"
continua não sendo feature: é o acesso do time e a data de corte.

| Bloco | Estado |
|---|---|
| A · Rotinas | **No ar desde 27/08/2026.** Migration `0010` aplicada e conferida no banco de produção antes do push |
| B · Ponte de leitura | Não construída, por decisão — ver abaixo |
| C · Motor de pontuação, metas, snapshot, coins, ranking | **No ar desde 28/08/2026.** Semana fechada não recalcula; coin creditada não se despaga |
| D · Tela Desempenho | **No ar desde 28/08/2026.** Pódio e a própria posição para o time; mesa de fechamento para quem gerencia |
| E · Daily | **No ar desde 31/08/2026.** É meta de pontos **por dia**, não reunião: não existe daily assíncrona em lugar nenhum do `mktimer`. O placar aparece em Hoje |
| F · Notificações | Recomendado **mover para a V2**: não bloqueia desligar o sistema antigo, que é o objetivo declarado da V1.5, e ainda não há rotina de uso que diga quais valeriam a pena |

**Data de corte: 07/09/2026.** Decidida em 31/08/2026, encerrando a pendência mais antiga do
projeto. Com ela, a ponte de leitura deixa de fazer sentido de vez: não há período longo de
convivência para cobrir.

**A ponte não vai ser construída agora.** Em 27/08/2026 ficou sabido que a tarefa nasce **nos dois
sistemas** ao mesmo tempo. Nesse cenário a ponte sozinha não resolve e pode piorar: se o `mktimer`
trocar a origem, a tarefa que ainda nasce no ClickUp some da conta; se somar as duas, a mesma
tarefa recriada nos dois lados conta em dobro. Hoje o número já está errado para menos — a ponte
mal colocada troca isso por errado para mais, que é pior porque parece certo.

O que resolve é a **data de corte**: a partir dela, tarefa nova nasce só no Hub 2. Com ela marcada,
a ponte decide-se sozinha — perto, congela e espera o C1; longe, ponte. Enquanto a data não existir,
`docs/01` continua listando a ponte no MVP e este documento na V1.5, e a contradição fica de pé de
propósito, porque nenhum dos dois está errado ainda.

**V2:** esteira de conteúdo, captações, capacidade da semana, templates de projeto.

**Revisão IA — no ar e provada em produção em 26/08/2026, em silencioso.** Entregue em 26/08/2026 e provada ponta a ponta: a etapa
`REVISÃO IA` é o gatilho, o porteiro barra entrada incompleta antes de gastar chamada, o
julgamento lê **a copy da entrega** (campo próprio, separado do briefing), o parecer cita a regra
e um trecho literal — achado que inventa regra ou inventa citação é descartado no servidor —, o
veredito sai de função pura com teste, o checklist humano trava a saída de `APROVAÇÃO`, e a
medição mostra a taxa de reversão. Nasce em silencioso: emite parecer e não move nada.
Ver [04-revisor.md](04-revisor.md).

**A seção foi redesenhada em 31/08/2026.** O `<select>` de quarenta entregas virou busca com
filtro por empresa, etapa e dono, e escolher já diagnostica — o botão "Diagnosticar" existia só
para submeter um formulário desnecessário. O porteiro subiu para a primeira dobra com uma saída
por pendência (cada motivo do porteiro agora tem código, não só texto, e o código é o que sabe
para onde mandar quem quer resolver); "O que o sistema vê" desceu e virou recolhível com contador
de campos. O selo do modo passou a ficar no cabeçalho das três telas, em âmbar de aviso (nunca
`--reward`, que é de coin). Na Medição, taxa de reversão com menos de dez decisões humanas mostra
"amostra insuficiente" em vez de um percentual de amostra dois. Em Regras, o arredondado ficou
reservado para filtro: escopo de empresa virou retângulo reto. No parecer, cobertura virou bloco
fixo, as rodadas ganharam faixa comparativa, e falha técnica saiu do vermelho de reprovação.

O que falta não é código: é a chave do modelo e as regras escritas e classificadas. Sem regra
cadastrada o porteiro barra e diz exatamente isso, em vez de inventar parecer.
