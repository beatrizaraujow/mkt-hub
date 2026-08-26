# Revisor automático de entregas

Estado da construção. O padrão de arquitetura completo está em
`D:\revisorautomaticodeentregas.md` — este arquivo registra o que foi decidido
e construído **aqui**, e o que ainda falta.

## O que existe

**Seis tabelas**, aplicadas no banco pela migration `0004_simple_darkhawk`.

| Tabela | Metade | Para quê |
|---|---|---|
| `review_rules` | aprovado | O texto da regra, o escopo, se é inegociável e quem consegue verificar |
| `review_checklist_items` | aprovado | O que a pessoa responde, por escopo e tipo de peça |
| `review_cycles` | operação | Cada rodada de revisão de uma entrega |
| `review_runs` | operação | O log técnico: estado, tentativa, erro, modelo e custo |
| `review_findings` | operação | Cada problema, sempre citando a regra que o originou |
| `review_settings` | operação | O que muda sem deploy |

**A fila**, em `src/features/review/`. Pedido é aceito na hora e devolve o
identificador do ciclo; o processamento acontece depois, pelo cron em
`/api/cron/review`.

O cron roda **uma vez por dia**, às 8h de Brasília. Não é escolha de produto: o
plano Hobby da Vercel recusa qualquer agenda mais frequente que diária — e
recusa o **deploy inteiro**, antes de criar o build, sem aparecer como falha em
lugar nenhum. Foi o que deixou seis commits fora do ar entre 25 e 26/08/2026.
Enquanto o revisor não tiver regras nem chave de modelo, a frequência não muda
nada. Quando tiver, ou o plano vira Pro, ou a fila passa a ser drenada por
outro gatilho.

**O porteiro**, em `gate.ts`. Roda antes de gastar IA e devolve o que falta:
tipo da peça, arquivo anexado, regra cadastrada para aquele recorte.

**O julgamento**, em `judge.ts` e `model.ts`. Monta o pedido com as regras de
máquina daquele recorte e os arquivos legíveis, pergunta ao modelo por `fetch`
— sem SDK — e grava os achados. `model.ts` leva e traz; `judge.ts` decide. A
fronteira existe para trocar de modelo um dia não obrigar a reescrever o
raciocínio.

**A tela de regras**, em `/revisor/regras`. É onde a área de negócio cadastra e
classifica sem abrir chamado de desenvolvimento — regra é dado, nunca código.
Desativa em vez de apagar: parecer antigo cita a regra que valia na época.

## Duas tabelas do padrão que não existem aqui

**`entregas`** — lá era espelho do que estava sendo julgado, porque a origem
era outro sistema. Aqui a entrega é o próprio `work_items`: espelhar seria
copiar dado que já é nosso.

**`recortes`** — lá guardava as dimensões que escolhem as regras. Aqui as
dimensões já existem como dado de primeira classe: empresa, com herança de
sub-marca, e tipo/formato do catálogo. Criar a tabela seria duplicá-las.

## Uma etapa do padrão que virou outra coisa

A sequência do padrão pede **carga das regras a partir de um arquivo**, com
teste provando que o que entrou no banco é o que estava no arquivo. Aqui a
carga virou tela.

O motivo: as regras da Carbone não estão num arquivo. Estão em conversa de
grupo e em correção repetida, e quem as conhece é quem convive com o erro.
Um arquivo de origem mais a tela dariam duas fontes de verdade para o mesmo
dado — e no dia em que divergissem, ninguém saberia qual vale. A tela é a
fonte. Se um manual aprovado aparecer depois, a carga é um script de uma
tarde, alimentando a mesma tabela.

## O que o sistema faz hoje quando você pede uma revisão

Depende do que existe cadastrado:

**Sem regra para o recorte** — o porteiro barra antes de gastar IA e o ciclo
termina em `incompleto`, com o motivo escrito:

> Nenhuma regra de máquina cadastrada para "Arte de post" nesta empresa.
> Enquanto não houver, o revisor não emite parecer.

Onde o manual não define nada, a tentação é preencher com boa prática de
mercado. Regra ruim aplicada em escala e com autoridade é pior que regra
ausente. O buraco fica visível e a área de negócio decide.

**Sem `ANTHROPIC_API_KEY`** — o ciclo termina em `falhou`, com o motivo, **sem
repetir a tentativa**: chave ausente não melhora na terceira vez.

**Com regra e com chave** — sai parecer: os achados citando o código da regra,
o veredito calculado em código, e a cobertura na tela.

## As propriedades que não se quebram

**O sistema nunca inventa critério.** O modelo recebe só as regras da tabela e
só pode citar o código de uma delas. Achado que cita regra inexistente é
descartado, e o descarte é contado — descarte que sobe de repente é sinal de
que o pedido ficou confuso ou de que alguém apagou uma regra no meio.

**A regra violada decide, a nota não.** Não existe coluna de nota e o modelo
não dá nenhuma. Violou inegociável, reprova; achou algo que não é inegociável,
ajusta; nada, passa. O cálculo é em código, não no parecer.

**Falha técnica nunca vira veredito.** Reserva vencida, erro de rede,
tentativas esgotadas, resposta cortada no meio: o ciclo termina em `falhou` e
alguém precisa olhar. O sistema não aprova por otimismo nem reprova por
precaução. Aprovação silenciosa por erro de rede é a falha mais perigosa,
porque é invisível — ninguém investiga o que passou, só o que barrou.

**Cobertura na tela, sempre.** O ciclo guarda quais regras conferiu
(`applied_rules`) e quais se aplicavam mas não deu para conferir
(`not_verified`, com o motivo). Quando o sistema entra no ar, todo mundo assume
que ele cuida de tudo, e as regras que continuaram humanas param de ser
conferidas por qualquer um — cada lado achando que o outro está olhando.

**Arquivo não lido nunca vira "sem problemas".** O revisor lê imagem e PDF. O
que ele não lê entra na lista de ignorados, que vai junto no pedido e no
parecer, com o motivo.

**Modo silencioso é o padrão.** `is_silent` nasce `true`. Antes de deixar o
sistema mover qualquer coisa, ele emite parecer e não decide nada, para
comparar com o que uma pessoa acharia.

## Testado

Fila completa, com o cron local:

- Rota recusa sem segredo e com segredo errado (401 nos dois)
- Porteiro barra por tipo faltando, por arquivo faltando e por regra ausente
- Reserva vencida vira falha explícita e conta a tentativa
- Tentativa 3 esgotada leva o ciclo a `falhou` e **não** cria a tentativa 4
- Passada com a fila vazia não faz nada

Julgamento, com uma entrega real no banco de desenvolvimento — tarefa com tipo
"Arte de post", um PNG anexado, uma regra de máquina inegociável e uma regra de
balde humano:

- **Sem a chave do modelo:** ciclo `falhou`, motivo escrito, uma tentativa só,
  sem veredito e sem achado gravado
- **Com um servidor de mentira no lugar da API**, para provar o caminho sem
  gastar chamada real:
  - o PNG foi baixado do storage e mandado como imagem
  - só a regra de máquina entrou no pedido; a de balde humano ficou de fora
  - achado citando código inventado: **descartado**
  - achado citando a regra humana: **descartado** (não estava no pedido)
  - achado citando a regra de máquina inegociável: gravado, com arquivo e
    trecho, ligado ao anexo
  - veredito `reprovado`, calculado pela regra violada
  - cobertura e não-conferidas gravadas; custo em tokens separado por entrada e
    saída

Tela de regras, pelo navegador: regra criada pelo formulário, contagem por
balde subindo de 1 para 2, a regra nova aparecendo no recorte certo da entrega,
e código repetido devolvendo *"Já existe uma regra com esse código."*

Os dados de teste foram removidos do banco e do bucket depois.

## Duas armadilhas que custaram tempo aqui

**O erro do Postgres vem embrulhado.** A mensagem de fora só diz `Failed query`
com o SQL colado; o nome da constraint fica em `cause`. Sem desembrulhar, quem
cadastrava um código repetido recebia o `insert into` inteiro na tela. Mora em
`src/lib/errors.ts` agora, usado pela tela e pelo cron.

**`server-only` bloqueia script de linha de comando.** `storage.ts` e `queue.ts`
não podem ser importados por um `tsx` avulso. Script de apoio fala com o banco e
com o storage direto.

## A tela de diagnóstico

Em `/revisor`, para gestor e admin. Não ganhou item de menu — entrada fixa na
navegação para uma ferramenta que o time todo não usa é ruído. O caminho é
**Ajustes → Revisor de entregas**.

Você escolhe uma entrega real e ela mostra, em ordem:

1. **O que o sistema vê** — empresa, projeto, etapa, tipo, formato e arquivos.
   É daqui que sai o recorte.
2. **O porteiro**, rodando de verdade. Não é simulação parecida: é a mesma
   função que o cron chama, senão as duas divergem com o tempo.
3. **As regras que se aplicam**, cada uma com a camada em que entrou e quem
   consegue verificar. É o que revela recorte errado de longe.
4. **O checklist da pessoa** para aquela combinação.
5. **As revisões da entrega** — tentativa, erro, veredito, cada achado com a
   regra que o originou, o que foi conferido e o que não deu para conferir.

Conferido com cinco regras de exemplo, depois removidas:

| Regra | Camada | Apareceu? |
|---|---|---|
| universal, sem tipo | todas as empresas | sim |
| empresa Onevo | mãe da sub-marca | **sim** — herança funciona |
| tipo "Arte de post" | todas as empresas · tipo | sim |
| tipo "Edição de vídeo" | outro tipo | não |
| empresa Carbone | outra empresa | não |

O porteiro contou 2 regras de máquina e ignorou a de balde humano, como deve.

## O que falta, em ordem

1. **Classificar as regras** em máquina / pessoa / fora de escopo, pela tela
   **Revisor → Regras**. Depende da usuária, e é o passo sem o qual todo o
   resto é chute. As regras existem na skill `auditoria-carbone`, que é o
   checklist extraído dos feedbacks reais — o que falta é a separação.
2. **Fechar o checklist humano** — entre quatro e oito itens por combinação, na
   mesma tela. Só o que a máquina não pega, mais um ou dois medidores.
3. **`ANTHROPIC_API_KEY` no ambiente**, mais `CRON_SECRET` na Vercel.
4. **Modo silencioso por um período**, comparando parecer com parecer humano.
   Só a tela de diagnóstico mostra o resultado nessa fase: o parecer não aparece
   para o time enquanto não estiver calibrado.
5. **Autonomia**, só então — e é quando o parecer passa a aparecer na tarefa.

## Pendências de ambiente

- `CRON_SECRET` está no `.env.local` e **falta na Vercel**. Sem ela a rota
  responde 503 e a fila não anda em produção.
- Nenhuma chave de modelo configurada, em lugar nenhum.
