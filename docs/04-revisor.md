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
identificador do ciclo; o processamento acontece depois, pelo cron de dez em
dez minutos em `/api/cron/review`.

**O porteiro**, em `gate.ts`. Roda antes de gastar IA e devolve o que falta:
tipo da peça, arquivo anexado, regra cadastrada para aquele recorte.

## Duas tabelas do padrão que não existem aqui

**`entregas`** — lá era espelho do que estava sendo julgado, porque a origem
era outro sistema. Aqui a entrega é o próprio `work_items`: espelhar seria
copiar dado que já é nosso.

**`recortes`** — lá guardava as dimensões que escolhem as regras. Aqui as
dimensões já existem como dado de primeira classe: empresa, com herança de
sub-marca, e tipo/formato do catálogo. Criar a tabela seria duplicá-las.

## O que o sistema faz hoje quando você pede uma revisão

Nada além de dizer o que falta — e isso é de propósito. Sem as regras da
Carbone classificadas em máquina / pessoa / fora de escopo, qualquer parecer
seria chute. O ciclo termina em `incompleto` com o motivo escrito:

> Nenhuma regra de máquina cadastrada para "Arte de post" nesta empresa.
> Enquanto não houver, o revisor não emite parecer.

Onde o manual não define nada, a tentação é preencher com boa prática de
mercado. Regra ruim aplicada em escala e com autoridade é pior que regra
ausente. O buraco fica visível e a área de negócio decide.

## As três propriedades que não se quebram

**Falha técnica nunca vira veredito.** Reserva vencida, erro de rede,
tentativas esgotadas: o ciclo termina em `falhou` e alguém precisa olhar. O
sistema não aprova por otimismo nem reprova por precaução. Aprovação silenciosa
por erro de rede é a falha mais perigosa, porque é invisível — ninguém
investiga o que passou, só o que barrou.

**A regra violada decide, a nota não.** Não existe coluna de nota. Violou regra
inegociável, reprova; não violou, passa. Quem recebe a reprovação lê o nome da
regra e sabe o que fazer.

**Modo silencioso é o padrão.** `is_silent` nasce `true`. Antes de deixar o
sistema mover qualquer coisa, ele emite parecer e não decide nada, para
comparar com o que uma pessoa acharia.

## Testado

Fila completa, com o cron local:

- Rota recusa sem segredo e com segredo errado (401 nos dois)
- Porteiro barra por tipo faltando, por arquivo faltando e por regra ausente
- Reserva vencida vira falha explícita e conta a tentativa
- Tentativa 3 esgotada leva o ciclo a `falhou` e **não** cria a tentativa 4
- Nenhum caminho produziu veredito
- Passada com a fila vazia não faz nada
- Com o porteiro **passando**, o ciclo termina em `falhou` com "julgamento ainda
  não implementado", sem repetir a tentativa, sem veredito e sem achado gravado

## A tela de diagnóstico

Em `/revisor`, para gestor e admin. Não ganhou item de menu — entrada fixa na
navegação para uma ferramenta que ainda não emite parecer é ruído para quem usa
o sistema todo dia. O caminho é **Ajustes → Revisor de entregas**.

Você escolhe uma entrega real e ela mostra, em ordem:

1. **O que o sistema vê** — empresa, projeto, etapa, tipo, formato e arquivos.
   É daqui que sai o recorte.
2. **O porteiro**, rodando de verdade. Não é simulação parecida: é a mesma
   função que o cron chama, senão as duas divergem com o tempo.
3. **As regras que se aplicam**, cada uma com a camada em que entrou e quem
   consegue verificar. É o que revela recorte errado de longe.
4. **O checklist da pessoa** para aquela combinação.
5. **As revisões da entrega**, com tentativa e erro de cada uma.

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

1. **Classificar as regras da Carbone** em máquina / pessoa / fora de escopo.
   Depende da usuária. As regras já existem na skill `auditoria-carbone`, que é
   o checklist extraído dos feedbacks reais — o que falta é a separação.
   Sem isso, tudo depois é chute.
2. **Fechar o checklist humano** — entre quatro e oito itens por combinação.
3. **Carga das regras**, com teste que prova que o que entrou no banco é o que
   estava no arquivo de origem.
4. ~~Tela de leitura e diagnóstico.~~ Pronta — ver acima.
5. **Julgamento.** Precisa de chave de modelo no ambiente, que ainda não existe.
6. **Modo silencioso por um período**, comparando com parecer humano.
7. **Autonomia**, só então.

## Pendências de ambiente

- `CRON_SECRET` está no `.env.local` e **falta na Vercel**. Sem ela a rota
  responde 503 e a fila não anda em produção.
- Nenhuma chave de modelo configurada.
