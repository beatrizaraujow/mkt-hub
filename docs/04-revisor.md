# Revisão IA

O que o revisor faz, o que ele deliberadamente não faz, e o que ainda falta.
O padrão de arquitetura que originou tudo isto está em
`D:\revisorautomaticodeentregas.md`; este arquivo registra o que foi decidido
e construído **aqui**.

## O escopo desta versão

**Entrada: só texto.** O revisor lê a **copy da entrega** — legenda, roteiro,
títulos de carrossel, CTA. Não olha arte nem vídeo.

A copy tem campo próprio (`work_items.copy`), separado do briefing. Não é
detalhe: `description` é o pedido de quem abriu a tarefa, e revisar o pedido
apontaria erro de português em texto que ninguém vai publicar, enquanto a peça
de verdade passaria sem ser lida.

**Autonomia: a IA só move o que reprova, e só depois da calibragem.** Aprovado
fica parado esperando um humano clicar. A IA nunca carimba aprovação sozinha.

**Regra é dado, nunca código.** Nenhum critério escrito em `if`. O que não
está na tabela não é conferido — e isso é garantia, não limitação.

## A fronteira

**Decisão** (`src/features/review/`) monta o conjunto de regras, roda o
porteiro, chama o modelo, valida a evidência, calcula o veredito e grava.
**Não move nada**: não conhece coluna de quadro, não faz `update` em
`stage_id`.

**Transporte** (`src/features/work-items/review-bridge.ts`) detecta a entrada
na etapa, chama o serviço, move o cartão depois e registra a decisão humana.
**Não julga nada.**

Se um dia o julgamento virar serviço separado, é o transporte que muda, e
nenhuma linha do raciocínio precisa ser reescrita.

## O caminho, do começo ao fim

1. **O gatilho é a etapa.** Entrar em `REVISÃO IA` enfileira o ciclo, dentro
   do mesmo `setStage` que valida papel e motivo de retrabalho. Não existe uma
   segunda porta — segunda porta é sempre a que esquece de validar alguma
   coisa.
2. **O processamento acontece depois da resposta** (`after()` do Next), não
   dentro dela: quem arrastou o cartão não fica olhando para uma tela travada.
   O cron diário continua sendo a rede: se o processamento morrer no meio, a
   reserva expira e a execução volta para a fila.
3. **O porteiro** (`gate.ts`) roda antes de gastar IA: empresa ligada, tipo da
   peça, copy presente com tamanho plausível para o tipo, e regra de máquina
   cadastrada para o recorte. Falhou algo, o ciclo termina em `incompleto`
   com a lista do que falta — não é reprovação.
4. **O julgamento** (`judge.ts`) manda só as regras de máquina daquele recorte
   e a copy. Saída estruturada obrigatória, sem texto livre para interpretar.
5. **A validação da evidência** acontece no servidor: achado citando regra que
   não foi enviada é descartado, e achado citando trecho que não está na copy
   também. O modelo não tem a palavra final sobre o que sobrevive.
6. **O veredito** sai de `verdict.ts`, função pura, com teste.
7. **O transporte** move o cartão — ou não, se o modo for silencioso.

## As propriedades que não se quebram

**O sistema nunca inventa critério.** O modelo recebe só as regras da tabela e
só pode citar o código de uma delas. Descarte por regra inexistente é contado
à parte de descarte por trecho inventado: o primeiro é pedido confuso, o
segundo é modelo alucinando citação — e é o número que decide trocar de
modelo.

**A regra violada decide, a nota não.** Não existe coluna de nota e o modelo
não dá nenhuma. Violou inegociável, reprova; achou algo negociável, ajusta;
nada, passa. Número gerado por modelo oscila entre execuções e ninguém
consegue defender por que foi 6,8 e não 7,1 — mas todo mundo passa a decidir
por ele.

**Português é lista separada e nunca reprova.** Vira correção de trinta
segundos, não veredito.

**Falha técnica nunca vira veredito.** Erro de rede, tentativas esgotadas,
resposta cortada: o ciclo termina em `falhou` e alguém precisa olhar. O
sistema não aprova por otimismo nem reprova por precaução. Aprovação
silenciosa por erro de rede é a falha mais perigosa, porque é invisível —
ninguém investiga o que passou, só o que barrou.

**Cobertura na tela, sempre.** O ciclo guarda o que conferiu
(`applied_rules`), o que se aplicava e não deu para conferir (`not_verified`,
com motivo) e onde uma camada substituiu outra (`overlaps`). No detalhe da
entrega há um bloco fixo: *"A revisão automática não confere isto"*, com as
regras de pessoa e de fora de escopo. Quando um sistema desses entra no ar,
todo mundo assume que ele cuida de tudo, e as regras humanas param de ser
conferidas por qualquer um — cada lado achando que o outro está olhando.

**Mesma entrada, mesmo parecer.** O ciclo guarda a impressão digital da copy
mais a versão das regras. Repetiu, reaproveita sem chamar a API. Não é só
economia: um revisor que muda de opinião sem nada ter mudado é um revisor que
ninguém consegue defender numa reunião.

**Terceira reprovação seguida para de decidir.** O parecer sai, o cartão não
anda, e a entrega vai para uma pessoa com as rodadas lado a lado. Ciclo
infinito de robô reprovando e designer ajustando é pior que não ter revisão.

**Conflito entre camadas é declarado, nunca adivinhado.** A regra mais
específica aponta qual ela substitui (`overrides_rule_id`), a mais específica
vence, e a substituição aparece no diagnóstico e no parecer. Duas regras sobre
o mesmo assunto não têm como ser reconhecidas por comparação de texto: um
sistema que tenta acerta na demonstração e cala a regra errada em produção.

**Nasce em silencioso.** `modo = silencioso` até alguém virar a chave na tela.

## Quem responde

Dois provedores, escolhidos por `REVIEW_PROVIDER`. Sem a variável, vale a chave que existir —
quem configurou só o Gemini não deve receber um erro dizendo que falta a chave da Anthropic.

| Arquivo | O que é |
|---|---|
| `model-contract.ts` | Os tipos, o `ModelError` e a classificação de status. Não importa ninguém |
| `model-anthropic.ts` | A chamada da Anthropic, com `tool_choice` fixo |
| `model-gemini.ts` | A chamada do Google, com `functionCallingConfig: ANY` |
| `model-gemini-read.ts` | O dialeto do Gemini: traduzir o esquema na ida, ler a resposta na volta |
| `model.ts` | Escolhe o provedor e passa adiante. Não julga nada |

O critério para um provedor entrar aqui é um só: **saída estruturada obrigatória**. Texto livre
teria que ser interpretado, e interpretação de texto livre erra em silêncio — um parecer que não
deu para ler viraria "nenhum problema encontrado".

Duas diferenças do Gemini que custam 400 se ignoradas, e por isso moram na fronteira:

- O esquema não é JSON Schema, é um recorte do OpenAPI: os tipos vão em **maiúsculas** e qualquer
  chave desconhecida (`additionalProperties`, `$schema`, `default`) derruba o pedido inteiro.
  `geminiSchema()` limpa isso, e o julgamento não precisa saber.
- A resposta não levanta exceção quando é recusada: vem 200 com `finishReason` ou
  `promptFeedback.blockReason`. `readGeminiAnswer()` traduz isso em falha explícita, distinguindo
  o que vale repetir (`MAX_TOKENS`, sem candidato) do que não vale (`SAFETY`).

**Modelo fraco não erra: emudece.** Como todo achado que cita regra inexistente ou trecho ausente
é descartado no servidor, um modelo que não segue instrução produz parecer **vazio**, não parecer
errado. É a falha segura — mas um revisor que nunca acha nada é um revisor que o time aprende a
pular. Vale olhar a tela de medição depois de trocar de provedor.

**A camada gratuita do Google treina em cima do que recebe.** No plano pago, não. É decisão de
quem manda a copy do cliente, não do código.

## As telas

| Onde | Para quem | O que resolve |
|---|---|---|
| Detalhe da entrega | todo mundo | O parecer, o trecho, a correção pronta, o checklist da aprovação e o que o robô não confere |
| `/revisor` | gestor e admin | O que o sistema entendeu de uma entrega real: recorte, regras por camada, sobreposições, porteiro rodando de verdade e **o pedido exato que iria para o modelo**, copiável, sem gastar chamada |
| `/revisor/regras` | gestor e admin | Cadastrar e classificar; o modo; o botão de desligar por marca; e os **recortes sem regra** |
| `/revisor/medicao` | gestor e admin | Taxa de reversão, regras que mais reprovam, medidores, custo e falhas |

O caminho para as três é **Ajustes → Revisor de entregas**. Nenhuma ganhou
item de menu: entrada fixa na navegação para ferramenta que o time todo não
usa é ruído.

## O checklist humano

Gerado das regras `verificador: pessoa` do recorte, aparece na etapa
`APROVAÇÃO` e **trava a saída para frente** enquanto faltar item. Voltar para
ajuste não exige checklist: quem devolveu já viu o que estava errado, e exigir
ali só ensinaria a marcar tudo para conseguir devolver.

Entre quatro e oito itens por recorte, e **nunca repetindo o que a máquina
confere** — se a pessoa confere o que o robô confere, em duas semanas ela
marca tudo no automático, e o checklist deixa de valer justamente nos itens em
que era a única defesa. A exceção são um ou dois **medidores**, que a máquina
também confere, para comparar. A divergência aparece na medição.

## A taxa de reversão

Das reprovações da IA, quantas uma pessoa derrubou. É o número que decide se a
ferramenta fica.

A concordância é **inferida do movimento**: parecer pedindo trabalho e a
pessoa mandando a peça adiante conta como discordância; mandando refazer,
concordância. Ninguém responde questionário sobre parecer de robô — uma
caixinha depois de cada revisão seria ignorada em uma semana. A tela diz que é
inferência.

## O que virou outra coisa em relação ao padrão

**A carga das regras a partir de arquivo virou tela.** As regras da Carbone não
estão num arquivo: estão em conversa de grupo e em correção repetida. Arquivo
mais tela dariam duas fontes de verdade, e no dia em que divergissem ninguém
saberia qual vale. A tela é a fonte. Se um manual aprovado aparecer, a carga é
um script de uma tarde alimentando a mesma tabela. (Reconfirmado em 26/08/2026.)

**`entregas` e `recortes` não existem.** A entrega é o próprio `work_items`, e
as dimensões do recorte já são dado de primeira classe: empresa, com herança
de sub-marca, e `skill`/`format` do catálogo. Criar as tabelas seria copiar o
que já é nosso.

**`achado.regra_id` é anulável, e não `NOT NULL`.** O padrão pedia a
constraint; aqui `rule_code` e `rule_text` são obrigatórios e ficam
**congelados** no achado. Achado sem regra continua impossível, e o parecer de
março sobrevive à regra apagada em julho.

**O veredito tem três saídas, não duas.** `aprovado · ajustar · reprovado`,
porque existe uma etapa AJUSTAR no fluxo. No binário, achado negociável viraria
"aprovado" e seguiria para a aprovação humana carregando o problema junto.

**Não existe termômetro.** Nota que ninguém usa, num parecer com autoridade, é
lida como veredito pelo time em duas semanas.

## A leitura de arquivo, guardada

`files.ts` baixa anexo e manda imagem e PDF ao modelo. Funciona, está testado,
e fica atrás de `REVIEW_READ_FILES=1`, desligado. Quando a revisão de peça
visual entrar, é religar e ajustar o prompt — não reescrever download, teto de
bytes e tratamento do que não dá para ler. Ligado sem regra escrita sobre
imagem, ele só encareceria o parecer sem mudar nenhuma conclusão.

## Testado

**Automático** (`npm test`, 35 casos): o veredito nas quatro combinações e a
independência da quantidade de achados; o escalonamento e o que zera a
sequência; a resolução de camadas, a substituição declarada, a substituição
recusada por não ser mais específica, e a corrente de três regras; o mínimo de
copy por tipo e a conferência de trecho literal, com acento, aspas e
reticências; e o dialeto do Gemini — tipos em maiúsculas em qualquer
profundidade, chave desconhecida removida, resposta cortada valendo nova
tentativa e recusa por segurança não valendo.

**Ponta a ponta, no banco de desenvolvimento, com um servidor de mentira no
lugar da API** — quatro achados mandados, um sobreviveu:

| O que o modelo mandou | O que aconteceu |
|---|---|
| regra real + trecho literal | **gravado**, com o trecho e a sugestão |
| regra que não existe (`XX-99`) | descartado |
| regra real + trecho que a copy não tem | descartado |
| regra de balde humano, nunca enviada | descartado |
| português com trecho real | gravado na lista separada |
| português com trecho inventado | descartado |

Veredito `reprovado` pela regra inegociável, com as duas regras conferidas e a
não-conferida escritas no parecer, e as duas humanas no bloco do que o robô
não confere.

Depois disso, em sequência: em **silencioso** o cartão não se moveu; em
**ativo** a segunda rodada **reaproveitou** o parecer (o servidor de mentira
recebeu **um** pedido no total) e o cartão foi sozinho para AJUSTAR; a decisão
humana foi gravada nos dois sentidos (`concordou` ao devolver, `discordou` ao
mandar adiante); o checklist barrou a saída de APROVAÇÃO com *"Faltam 3 itens"*
e liberou depois de respondido; a terceira reprovação **escalonou** e o cartão
parou mesmo em modo ativo; e uma entrega sem tipo e sem copy foi barrada pelo
porteiro, com os dois motivos escritos e sem gastar chamada.

**O Gemini, ponta a ponta**, com um servidor de mentira no lugar da API: o pedido
saiu no caminho certo (`/v1beta/models/…:generateContent`), com a instrução de
sistema separada, `functionCallingConfig: ANY` travando a ferramenta, os tipos
do esquema em maiúsculas em todos os níveis e nenhuma chave proibida. Dos três
achados devolvidos, sobreviveu **um** — os outros dois citavam regra
inexistente e trecho ausente. Veredito `reprovado`, português na lista
separada, cobertura gravada, modelo e custo registrados. As mesmas garantias
do outro provedor, sem uma linha do julgamento ter mudado.

## O que falta, em ordem

1. **Escrever as regras reais** em `/revisor/regras`, classificadas em
   máquina / pessoa / fora de escopo. É o passo sem o qual todo o resto é
   chute. As correções que se repetem são o melhor ponto de partida.
2. **Fechar o checklist humano** — quatro a oito itens por recorte, mais um ou
   dois medidores.
3. **A chave do provedor escolhido e `CRON_SECRET` na Vercel.**
4. **Rodar em silencioso por um período**, comparando o parecer com o que o
   time decidiu, pela tela de medição.
5. **Virar a chave para ativo**, só então.

## Armadilhas que já custaram tempo

**O erro do Postgres vem embrulhado.** A mensagem de fora diz `Failed query`
com o SQL colado; o nome da constraint fica em `cause`. Mora em
`src/lib/errors.ts`.

**`server-only` bloqueia script de linha de comando.** Nada de
`src/features/review/*` pode ser importado por um `tsx` avulso; script de
apoio fala com o banco direto.

**Cron mais frequente que diário faz a Vercel recusar o deploy inteiro** no
plano Hobby, sem log. Por isso o cron é diário — e por isso o gatilho de
verdade é o `after()` na mudança de etapa.
