import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  companies,
  reviewCycles,
  reviewFindings,
  workItems,
  type ReviewRule,
  type WorkItem,
} from "@/db/schema";
import { quotesTheCopy } from "./copy";
import { filesOf, loadFiles } from "./files";
import { askModel, ModelError } from "./model";
import type { Overlap } from "./resolve";
import { applicableRules, machineRules } from "./rules";
import { shouldEscalate, verdictFrom, type Verdict } from "./verdict";

/**
 * O julgamento.
 *
 * Quatro coisas não se quebram aqui, e cada uma existe por um jeito
 * específico de esse tipo de sistema morrer:
 *
 * 1. **O sistema nunca inventa critério.** O modelo recebe as regras da tabela
 *    e só pode citar o código de uma delas. Achado que cita regra inexistente
 *    é descartado — porque é exatamente assim que um revisor automático
 *    reprova uma entrega boa e perde o time para sempre.
 *
 * 2. **O modelo não tem a palavra final sobre o que sobrevive.** Todo achado
 *    cita um trecho, e o trecho precisa estar na peça. Citação que a peça não
 *    tem é descartada aqui, no servidor.
 *
 * 3. **A regra violada decide, a nota não.** Não existe nota em lugar nenhum.
 *    O veredito sai de uma função pura, em `verdict.ts`.
 *
 * 4. **Falha técnica nunca vira veredito.** Qualquer erro sobe como
 *    `ModelError` e vira ciclo `falhou`. Nunca "aprovado por não ter achado
 *    nada".
 */

/** Ver `files.ts`: o julgamento de arte fica guardado, desligado, atrás disto. */
export const READS_FILES = process.env.REVIEW_READ_FILES === "1";

const answerSchema = z.object({
  achados: z
    .array(
      z.object({
        regra: z.string(),
        trecho: z.string().min(1).max(600),
        problema: z.string().min(1).max(800),
        sugestao: z.string().max(800).nullish(),
      }),
    )
    .default([]),
  portugues: z
    .array(
      z.object({
        trecho: z.string().min(1).max(300),
        correcao: z.string().min(1).max(300),
        tipo: z.string().max(40).nullish(),
      }),
    )
    .default([]),
  nao_verificadas: z
    .array(z.object({ regra: z.string(), motivo: z.string().min(1).max(400) }))
    .default([]),
});

const TOOL = {
  name: "registrar_parecer",
  description:
    "Registra o resultado da revisão: os problemas encontrados, cada um citando o código " +
    "de uma regra recebida e um trecho literal da copy, as correções de português e as " +
    "regras que não deu para conferir.",
  schema: {
    type: "object",
    properties: {
      achados: {
        type: "array",
        description:
          "Um item por problema encontrado. Vazio quando a copy cumpre todas as regras conferíveis.",
        items: {
          type: "object",
          properties: {
            regra: {
              type: "string",
              description: "O código exato de uma regra recebida. Nunca um código inventado.",
            },
            trecho: {
              type: "string",
              description:
                "Texto copiado literalmente da copy, palavra por palavra. Se o problema for a " +
                "ausência de algo, cite o trecho onde a falta aparece.",
            },
            problema: { type: "string", description: "O que está errado, em uma frase." },
            sugestao: {
              type: "string",
              description: "Texto pronto para substituir o trecho.",
            },
          },
          required: ["regra", "trecho", "problema"],
        },
      },
      portugues: {
        type: "array",
        description:
          "Erros de português, separados dos achados. Não são violação de regra e não reprovam nada.",
        items: {
          type: "object",
          properties: {
            trecho: { type: "string" },
            correcao: { type: "string" },
            tipo: {
              type: "string",
              description: "ortografia, gramatica, pontuacao ou concordancia.",
            },
          },
          required: ["trecho", "correcao"],
        },
      },
      nao_verificadas: {
        type: "array",
        description:
          "Regras recebidas que você não teve como conferir com o que foi enviado. Preencher " +
          "isto é obrigatório quando for o caso: silêncio aqui vira promessa falsa de cobertura.",
        items: {
          type: "object",
          properties: { regra: { type: "string" }, motivo: { type: "string" } },
          required: ["regra", "motivo"],
        },
      },
    },
    required: ["achados", "portugues", "nao_verificadas"],
  },
} as const;

const SYSTEM = [
  "Você revisa o texto de peças de marketing contra uma lista de regras, e só contra ela.",
  "",
  "O que você recebe: o contexto da entrega, as regras que se aplicam e a copy entregue.",
  "",
  "Como trabalhar:",
  "- Confira apenas as regras recebidas. Não existe boa prática de mercado aqui: critério que não está na lista não é aplicado, ponto.",
  "- Todo achado cita o código exato de uma regra recebida e um trecho copiado literalmente da copy. Trecho que não estiver na copy é descartado.",
  "- Se o problema que você viu não corresponde a nenhuma regra recebida, não registre. Não é falha sua: é o limite do que foi combinado.",
  "- Um achado por problema concreto e observável. Diga o que está no texto, não o que poderia ficar melhor.",
  "- Não elogie. Não escreva 'gancho forte' nem 'boa copy'. Se não há problema, a lista vem vazia.",
  "- Erro de português vai na lista de português, nunca em achados: ele se conserta em segundos e não reprova entrega nenhuma.",
  "- Se não deu para conferir uma regra com o que foi enviado, diga em nao_verificadas, com o motivo. Isso não é falha: é honestidade sobre a cobertura. Chutar seria pior.",
  "- Não dê nota, não classifique gravidade e não diga se aprova. Quem decide isso é o sistema, pela regra violada.",
  "- Não reescreva a peça e não opine sobre estratégia, formato ou emoji.",
  "- Escreva em português do Brasil, direto. Quem lê precisa saber o que corrigir.",
].join("\n");

/* ------------------------------------------------------- o pedido montado */

export type Assembled = {
  system: string;
  briefing: string;
  rules: ReviewRule[];
  overlaps: Overlap[];
  copy: string;
  /** Impressão digital da entrada: copy mais as regras e as versões delas. */
  hash: string;
};

/** Uma regra como o modelo a recebe. O código vem primeiro: é o que se cita. */
function ruleLine(rule: ReviewRule) {
  const parts = [`- [${rule.code}] ${rule.text}`];
  if (rule.machineHint) parts.push(`  Como conferir: ${rule.machineHint}`);
  if (rule.rationale) parts.push(`  Por que existe: ${rule.rationale}`);
  return parts.join("\n");
}

/**
 * Monta exatamente o que vai para o modelo, sem chamar ninguém.
 *
 * Existe separado para a tela de diagnóstico poder mostrar o pedido inteiro,
 * copiável, sem gastar uma chamada — e para que o que a tela mostra seja o
 * mesmo texto que o julgamento manda, não uma simulação parecida que diverge
 * com o tempo.
 */
export async function assemble(
  item: WorkItem,
  companyName: string | null,
): Promise<Assembled | { error: string }> {
  const { rules: all, overlaps } = await applicableRules({
    orgId: item.orgId,
    companyId: item.companyId,
    skill: item.skill,
    format: item.format,
  });

  const rules = machineRules(all);
  if (rules.length === 0) return { error: "Nenhuma regra de máquina para este recorte." };

  const copy = item.copy?.trim() ?? "";
  if (!copy) return { error: "A entrega não tem copy." };

  const briefing = [
    `Entrega: ${item.title}`,
    `Empresa: ${companyName ?? "—"}`,
    `Tipo de peça: ${item.skill ?? "—"}`,
    item.format ? `Formato: ${item.format}` : null,
    item.description ? `Contexto do pedido (não é a peça, não revise este texto):\n${item.description}` : null,
    "",
    "Regras a conferir:",
    ...rules.map(ruleLine),
    "",
    "Copy entregue, entre as marcas:",
    "<<<COPY",
    copy,
    "COPY",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const signature = rules.map((rule) => `${rule.code}@${rule.version}`).join(",");
  const hash = createHash("sha256").update(`${copy}\n--\n${signature}`).digest("hex");

  return { system: SYSTEM, briefing, rules, overlaps, copy, hash };
}

/* ----------------------------------------------------------------- julgar */

export type JudgeResult = {
  verdict: Verdict;
  findings: number;
  applied: string[];
  notVerified: Array<{ code: string; reason: string }>;
  language: number;
  /** Achados jogados fora, por motivo. Contar importa: ver abaixo. */
  discarded: { regra: number; trecho: number };
  escalated: boolean;
  reused: boolean;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
};

export async function judgeCycle(cycleId: string): Promise<JudgeResult> {
  const [cycle] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1);
  if (!cycle) throw new ModelError("O ciclo sumiu no meio do julgamento.", { retry: false });

  const [item] = await db
    .select()
    .from(workItems)
    .where(eq(workItems.id, cycle.workItemId))
    .limit(1);
  if (!item) throw new ModelError("A tarefa sumiu no meio do julgamento.", { retry: false });

  const [company] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, item.companyId))
    .limit(1);

  const pedido = await assemble(item, company?.name ?? null);

  // O porteiro já garantiu isto. Se mudou entre uma coisa e outra, para:
  // parecer sem regra é opinião de robô, e copy vazia é julgar o nada.
  if ("error" in pedido) throw new ModelError(pedido.error, { retry: false });

  const history = await verdictHistory(cycle.workItemId, cycle.round);

  /**
   * Mesma copy e mesmas regras: reaproveita o parecer.
   *
   * Não é só economia. Chamar de novo devolveria uma resposta ligeiramente
   * diferente para a mesma entrada, e um revisor que muda de opinião sem nada
   * ter mudado é um revisor que ninguém consegue defender numa reunião.
   */
  const reused = await reusePrevious(cycle.id, cycle.workItemId, pedido.hash, history);
  if (reused) return reused;

  /**
   * Desligado, esta versão manda só o texto. Ligado, os anexos legíveis vão
   * junto — e os que não deram para ler vão escritos, porque arquivo não lido
   * virando "nenhum problema encontrado" é a falha invisível deste sistema.
   */
  const extra = READS_FILES ? await loadFiles(await filesOf(item.id)) : null;
  const ignored = extra?.skipped.length
    ? "\n\nArquivos que não chegaram até você: " +
      extra.skipped.map((row) => `${row.name} (${row.why})`).join("; ") +
      ". Não julgue o que não recebeu."
    : "";

  const answer = await askModel({
    system: pedido.system,
    content: [{ type: "text", text: pedido.briefing + ignored }, ...(extra?.blocks ?? [])],
    tool: { name: TOOL.name, description: TOOL.description, schema: TOOL.schema },
  });

  const parsed = answerSchema.safeParse(answer.raw);
  if (!parsed.success) {
    // Formato quebrado costuma ser resposta cortada no meio. Vale repetir; o
    // que não vale é deduzir "sem achados" de algo que não deu para ler.
    throw new ModelError(`Resposta do modelo fora do formato: ${parsed.error.message}`, {
      retry: true,
    });
  }

  const byCode = new Map(pedido.rules.map((rule) => [rule.code.trim().toLowerCase(), rule]));

  /**
   * Os dois descartes são contados separados de propósito.
   *
   * Descarte por regra inexistente que sobe de repente é sinal de que o pedido
   * ficou confuso, ou de que alguém apagou uma regra no meio. Descarte por
   * trecho inventado é sinal de que o modelo está alucinando citação — e esse
   * é o número que decide trocar de modelo.
   */
  const discarded = { regra: 0, trecho: 0 };

  const rows = parsed.data.achados.flatMap((found) => {
    const rule = byCode.get(found.regra.trim().toLowerCase());
    if (!rule) {
      discarded.regra += 1;
      return [];
    }

    if (!quotesTheCopy(pedido.copy, found.trecho)) {
      discarded.trecho += 1;
      return [];
    }

    return [
      {
        cycleId: cycle.id,
        ruleId: rule.id,
        ruleCode: rule.code,
        // Texto congelado: apagar a regra não pode apagar a história de
        // quando ela foi aplicada.
        ruleText: rule.text,
        detail: found.problema,
        evidence: {
          trecho: found.trecho,
          sugestao: found.sugestao ?? null,
          versao: rule.version,
        } as Record<string, unknown>,
        isBlocking: rule.isBlocking,
        attachmentId: null,
      },
    ];
  });

  const notVerified = parsed.data.nao_verificadas.flatMap((row) => {
    const rule = byCode.get(row.regra.trim().toLowerCase());
    return rule ? [{ code: rule.code, reason: row.motivo }] : [];
  });

  /** Correção que não aparece no texto também não entra: o mesmo critério. */
  const language = parsed.data.portugues
    .filter((note) => quotesTheCopy(pedido.copy, note.trecho))
    .map((note) => ({
      trecho: note.trecho,
      correcao: note.correcao,
      tipo: note.tipo ?? "revisão",
    }));

  const verdict = verdictFrom(rows);
  const escalated = shouldEscalate(history, verdict);

  if (rows.length > 0) await db.insert(reviewFindings).values(rows);

  await db
    .update(reviewCycles)
    .set({
      status: "emitido",
      verdict,
      appliedRules: pedido.rules.map((rule) => rule.code),
      notVerified,
      languageNotes: language,
      overlaps: pedido.overlaps,
      inputHash: pedido.hash,
      escalated,
      finishedAt: new Date(),
    })
    .where(eq(reviewCycles.id, cycle.id));

  return {
    verdict,
    findings: rows.length,
    applied: pedido.rules.map((rule) => rule.code),
    notVerified,
    language: language.length,
    discarded,
    escalated,
    reused: false,
    model: answer.model,
    tokensIn: answer.tokensIn,
    tokensOut: answer.tokensOut,
  };
}

/* --------------------------------------------------------------- apoio */

/** Os vereditos anteriores da mesma entrega, do mais antigo para o mais novo. */
async function verdictHistory(workItemId: string, round: number): Promise<Array<Verdict | null>> {
  const rows = await db
    .select({ verdict: reviewCycles.verdict, round: reviewCycles.round })
    .from(reviewCycles)
    .where(eq(reviewCycles.workItemId, workItemId))
    .orderBy(asc(reviewCycles.round));

  return rows.filter((row) => row.round < round).map((row) => row.verdict);
}

/**
 * Procura um parecer anterior para a mesma entrada e o repete neste ciclo.
 *
 * Copia os achados em vez de apontar para os antigos: o achado pertence ao
 * ciclo em que apareceu, e um parecer que some porque o ciclo velho foi
 * apagado é pior que um achado duplicado.
 */
async function reusePrevious(
  cycleId: string,
  workItemId: string,
  hash: string,
  history: Array<Verdict | null>,
): Promise<JudgeResult | null> {
  const [previous] = await db
    .select()
    .from(reviewCycles)
    .where(
      and(
        eq(reviewCycles.workItemId, workItemId),
        eq(reviewCycles.status, "emitido"),
        eq(reviewCycles.inputHash, hash),
        isNotNull(reviewCycles.verdict),
      ),
    )
    .orderBy(asc(reviewCycles.round))
    .limit(1);

  if (!previous || previous.id === cycleId) return null;

  /**
   * O escalonamento e recalculado, nunca copiado.
   *
   * O parecer se repete porque a entrada nao mudou; a **contagem de
   * reprovacoes seguidas** mudou, e e ela que decide chamar gente. Copiar o
   * `escalated` do ciclo anterior faria a trava de pingue-pongue nunca
   * disparar justamente no caso em que ela mais importa: a peca voltando
   * igual pela terceira vez.
   */
  const escalated = shouldEscalate(history, previous.verdict as Verdict);

  const old = await db
    .select()
    .from(reviewFindings)
    .where(eq(reviewFindings.cycleId, previous.id));

  if (old.length > 0) {
    await db.insert(reviewFindings).values(
      old.map((finding) => ({
        cycleId,
        ruleId: finding.ruleId,
        ruleCode: finding.ruleCode,
        ruleText: finding.ruleText,
        detail: finding.detail,
        evidence: finding.evidence,
        isBlocking: finding.isBlocking,
        attachmentId: finding.attachmentId,
      })),
    );
  }

  await db
    .update(reviewCycles)
    .set({
      status: "emitido",
      verdict: previous.verdict,
      appliedRules: previous.appliedRules,
      notVerified: previous.notVerified,
      languageNotes: previous.languageNotes,
      overlaps: previous.overlaps,
      inputHash: hash,
      reusedFromId: previous.id,
      escalated,
      finishedAt: new Date(),
    })
    .where(eq(reviewCycles.id, cycleId));

  return {
    verdict: previous.verdict as Verdict,
    findings: old.length,
    applied: previous.appliedRules,
    notVerified: previous.notVerified,
    language: previous.languageNotes.length,
    discarded: { regra: 0, trecho: 0 },
    escalated,
    reused: true,
    model: "(parecer reaproveitado)",
    tokensIn: 0,
    tokensOut: 0,
  };
}
