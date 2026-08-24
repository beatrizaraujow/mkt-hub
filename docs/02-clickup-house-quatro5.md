# O board que vamos substituir — House Quatro5 (ClickUp)

Levantamento do quadro real de execução da house, feito em **24/08/2026** via API do ClickUp.
Este é o sistema que o MVP do MKT Hub 2 precisa substituir. Toda decisão de escopo de tarefas,
estágios e campos deve conferir esta página antes.

## Identificação

| | |
|---|---|
| Workspace | Quatro5 Workspace — `9013450208` |
| Space | Shared with me — `901310318852` > Pasta **MKT** |
| Lista | House Quatro5 — `901321051391` |
| View padrão | "Quadro" (board por Status) — https://app.clickup.com/9013450208/v/b/6-901321051391-2 |
| Views | 24 no total (Quadro, Lista, Painéis, Canal, "Painel de rotinas - Social Media" e mais 19) |

## O que é

O board único de execução da house de marketing do Grupo Quatro5. Toda demanda de marketing das
empresas do grupo entra aqui — por formulário (status `solicitado form`) ou criada direto pelo
time. É onde social media, design, edição, tráfego e copy executam.

Volume histórico: **3.093 tarefas concluídas.**

## Fluxo de status — 12 etapas

1. `solicitado form` — chegou pelo formulário, ainda não triada
2. `pendente` — triada, na fila, sem execução iniciada
3. `em progresso` — alguém está executando
4. `alterar` — voltou com ajuste pedido
5. `pré revisão` — checagem interna antes da revisão formal
6. `revisão ia` — revisão assistida por IA
7. `aprovar` — aguardando aprovação
8. `aprovação líder` — aguardando aval da liderança
9. `publicar` — aprovado, na fila de publicação
10. `banco de criativos` — peça pronta guardada para uso futuro
11. `revisão solicitada` — pedido de revisão aberto
12. `completo` — encerrado

### Foto do board em 24/08/2026

| Status | Qtd |
|---|---:|
| solicitado form | 8 |
| pendente | 147 |
| em progresso | 3 |
| alterar | 4 |
| pré revisão | 0 |
| revisão ia | 0 |
| aprovar | 38 |
| aprovação líder | 5 |
| publicar | 21 |
| banco de criativos | 48 |
| revisão solicitada | 0 |
| completo | 3.093 |

## Empresas atendidas

Campo **"Empresa Tag"** (labels), 9 valores:

Onevo Energia · Onevo Investimentos · Carbone Club · Carbone Educação · SeuBoné · Weevo ·
Box Corporativo · Cássio Maia P2P · Pedro Galvão P2P

Campos de empresa **redundantes** que também existem no board:

- **Empresa** (dropdown): Seu Boné, Onevo, Carbone
- **Empresa solicitante** (dropdown): Onevo, SB, Carbone Educação, Quatro5, Outra
- **Área da Quatro5**: Growth, Marketing, Money, People
- **Setor da SeuBoné**: Vendas, Vendas Diretas, Fornecimento, Quatro5-Growth, Quatro5-MKT,
  Quatro5-Money, Quatro5-People

## Tipo de trabalho — campo "Tarefas SKILL", 30 labels

Captação · Edição de foto · Edição de vídeo · Roteiro de vídeo · Planejamento de conteúdos ·
Arte de criativo · Arte de post · Arte de Endomarketing · Arte de site · Apresentações comerciais ·
Criação de landing page · Otimização de landing page · Setup do Instagram · Fotos · Catálogo ·
Copy · Stories · Participação no evento · Animação · Id visual · Tráfego · Vídeo de post ·
Decupagem · Demanda extra · Vídeo de criativo · Arte OFF · ADS VÍDEOS · Post feed ·
Capa reels · Alteração

## Formato da peça — campo "Formato SKILL", 10 labels

Estático · Carrossel · Vídeo · Estático Ads · Carrossel Ads · Vídeo Ads · Stories · Mídia OFF ·
Capa de Reels · Outros

## Tipo de demanda — dropdown

Captação · Edição · Redação · Criação de arte/conteúdo · Manutenção/otimização ·
Nova campanha/Novo projeto · Ativação/Evento · Demanda avulsa

## Campos de gestão e produtividade

- **Ponto de atividade MKT** (número) — **único campo obrigatório da lista.** É a moeda de
  pontuação do time.
- Esforço (número) · Impacto (número) · Horas Trabalhadas (número)
- "Quanto tempo acha necessário para fazer essa atividade?" (número, estimativa do executor)
- Resolução da task (avaliação de 1 a 5 estrelas)
- SLA (texto) · Protocolo · Número · Estágio do lembrete
- Datas: Data de vencimento · Data de conclusão · Data de conclusão - Alteração ·
  Prazo para início da campanha
- Team (múltiplos usuários) · Solicitante · Nome do solicitante · Email · Whatsapp Captado
- **Urgência da demanda** — existe em dois campos distintos: `Urgente/Normal/Fazer depois` e
  `Normal/Urgente/Emergencial`

## Campos de briefing

Cerca de **100 campos**, vindos do formulário de solicitação, agrupados por tipo de demanda:

- **Post orgânico** — objetivo, público-alvo, mensagem principal, proposta de copy, tipo de
  conteúdo (estático/carrossel/reels/story), referências visuais, impulsionar?
- **Criativo de Ads** — headline, descrição do corpo, CTA, destino (URL), formato do criativo,
  tipo de criativo, estágio do público (frio/morno/quente), quantidade de variações A/B
- **Campanha** — objetivo, plataforma (Meta/Google/TikTok/LinkedIn), orçamento total,
  distribuição de verba, duração, região geográfica, métrica de sucesso, pixel instalado?,
  públicos personalizados?, acompanhamento (diário/semanal/quinzenal)
- **Vídeo e captação** — tipo de vídeo, tom e ritmo, quem aparece, local, data e horário,
  autorização de filmagem, restrições, formato (9:16 / 16:9 / 1:1)
- **Landing page** — objetivo, público, mensagem, benefícios, estrutura, CTA, formato da landing,
  origem do tráfego, integração com sistema, onde publicar
- **Apresentação comercial** — objetivo, público, quem apresenta, duração, nº de páginas,
  formato de entrega (Pptx/Pdf/Canva), link do modelo base
- **Material gráfico e brinde** — tipo (cartão, troféu, sacola, caixa, mouse pad, banner,
  bandeira, tenda, camisa, tirante, crachá, folder, etiqueta, boné), dimensões, frente e verso,
  acabamento, formato de cores (RGB/CMYK), arquivo final (PSD/AI/PDF)
- **Novo perfil de Instagram** — objetivo, função no funil, @ sugerida, nome comercial, bio,
  e-mail vinculado, telefone, link de direcionamento, vai receber tráfego pago?

## Convenções de nomenclatura nos títulos

- Prefixo em colchetes para o tipo: `[EDIÇÃO]`, `[CAPTAÇÃO]`, `[SISTEMA]`
- Data no fim entre colchetes: `[03_OUT]`, `[26_SET]`, `[08 JUL]`
- Criativos versionados com pipe:
  `Criativo E4 | Estático | Escassez real + garantia (padrão V4) | Carbone Workshop`
- Ads com código: `ADS_C2430 BARATO QUE SAI CARO (DOR)`
- Tarefas de sistema e automação usam `[SISTEMA]` e costumam ter subtarefas

## Pessoas vistas no board

Anny Beatriz da Silva Araujo · Samuel Melo · Thiago · GR (iniciais)

## Débito técnico do board — confirmado na API

Campos duplicados, com nomes iguais ou quase iguais e IDs diferentes. Ao ler ou preencher,
sempre conferir qual dos dois está de fato populado:

"Qual é o objetivo principal da campanha?" (2×) · "Plataforma de veiculação:" (2×) ·
"Formato do criativo desejado:" (2×) · "Tipo de público:" (2×) · "Distribuição de orçamento" (2×) ·
"Região geográfica de veiculação:" (2×) · "Descrição breve da campanha:" (2×) ·
"Sugestão de estrutura da página:" (2×) · "Formato da entrega:" (2×) · "Urgência da demanda" (2×) ·
"Qual é o formato de cores?" (2×)

---

## O que isto muda no MKT Hub 2

Cinco pontos que este levantamento coloca em cima da mesa. Nenhum foi decidido ainda.

1. **São 9 empresas, não 4.** A semente atual cria SeuBoné, Onevo, Carbone Educação e Weevo.
   Faltam Carbone Club, Box Corporativo, Cássio Maia P2P, Pedro Galvão P2P — e Onevo se divide
   em Energia e Investimentos.

2. **O pipeline padrão de `task` tem 5 estágios; o board real tem 12.** Alguns são estados de
   verdade (`pendente`, `em progresso`, `alterar`, `aprovar`, `aprovação líder`, `publicar`),
   outros parecem etapas de conteúdo (`pré revisão`, `revisão ia`) e um não é estado nenhum:
   `banco de criativos` é um arquivo de peças prontas, não uma etapa de fluxo.

3. **Existe um formulário de entrada que o MVP não previu.** O status `solicitado form` e os
   ~100 campos de briefing significam que quem pede a demanda não é do time. Isso é um módulo —
   intake — que hoje não está em nenhuma fase do plano.

4. **"Ponto de atividade MKT" é o único campo obrigatório do board.** Confirma que a pontuação
   não é acessório: é o eixo da operação. Reforça a decisão da ponte — no dia em que as tarefas
   saírem do ClickUp, esse número precisa continuar existindo.

5. **A duplicação de campos é exatamente o problema que o produto novo existe para resolver.**
   Onze pares de campos duplicados e quatro maneiras diferentes de dizer de que empresa é a
   demanda. Migrar isso como está seria levar o problema junto.
