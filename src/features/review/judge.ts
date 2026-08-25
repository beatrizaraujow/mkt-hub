import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  attachments,
  companies,
  reviewCycles,
  reviewFindings,
  workItems,
  type Attachment,
  type ReviewRule,
} from "@/db/schema";
import { signedUrl } from "@/lib/storage";
import { extensionOf, isImage, mimeFor } from "@/lib/upload-rules";
import { askModel, ModelError, type Block } from "./model";
import { machineRules, rulesFor } from "./rules";

/**
 * O julgamento.
 *
 * Três coisas não se quebram aqui, e cada uma existe por um jeito específico
 * de esse tipo de sistema morrer:
 *
 * 1. **O sistema nunca inventa critério.** O modelo recebe as regras da tabela
 *    e só pode citar o código de uma delas. Achado que cita regra inexistente
 *    é descartado — porque é exatamente assim que um revisor automático
 *    reprova uma entrega boa e perde o time para sempre.
 *
 * 2. **A regra violada decide, a nota não.** Não existe nota. O veredito é
 *    calculado **aqui**, em código: violou inegociável, reprova. Pedir a nota
 *    ao modelo daria um número que oscila entre execuções e que ninguém
 *    consegue explicar.
 *
 * 3. **Falha técnica nunca vira veredito.** Qualquer erro sobe como
 *    `ModelError` e vira ciclo `falhou`. Nunca "aprovado por não ter achado
 *    nada".
 */

/** Teto de arquivos por parecer. Acima disso o custo cresce e a atenção cai. */
const MAX_FILES = 6;

/**
 * Teto de bytes mandados ao modelo por rodada. O upload já para em 4MB por
 * arquivo; isto aqui é o teto da soma, para seis anexos não virarem um pedido
 * de 24MB que estoura no meio.
 */
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

const answerSchema = z.object({
  achados: z
    .array(
      z.object({
        regra: z.string(),
        detalhe: z.string().min(1).max(1200),
        arquivo: z.string().nullish(),
        evidencia: z.string().max(600).nullish(),
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
    "de uma regra recebida, e as regras que não deu para conferir.",
  schema: {
    type: "object",
    properties: {
      achados: {
        type: "array",
        description:
          "Um item por problema encontrado. Vazio quando a peça cumpre todas as regras conferíveis.",
        items: {
          type: "object",
          properties: {
            regra: {
              type: "string",
              description: "O código exato de uma regra recebida. Nunca um código inventado.",
            },
            detalhe: {
              type: "string",
              description: "O que foi visto, em uma ou duas frases, na peça concreta.",
            },
            arquivo: { type: "string", description: "Nome do arquivo em que apareceu." },
            evidencia: {
              type: "string",
              description: "Onde exatamente: trecho citado, posição, elemento.",
            },
          },
          required: ["regra", "detalhe"],
        },
      },
      nao_verificadas: {
        type: "array",
        description:
          "Regras recebidas que você não teve como conferir com o que foi enviado. Preencher " +
          "isto é obrigatório quando for o caso: silêncio aqui vira promessa falsa de cobertura.",
        items: {
          type: "object",
          properties: {
            regra: { type: "string" },
            motivo: { type: "string" },
          },
          required: ["regra", "motivo"],
        },
      },
    },
    required: ["achados", "nao_verificadas"],
  },
} as const;

const SYSTEM = [
  "Você revisa peças de marketing contra uma lista de regras, e só contra ela.",
  "",
  "O que você recebe: a descrição da entrega, as regras que se aplicam a ela e os arquivos entregues.",
  "",
  "Como trabalhar:",
  "- Confira apenas as regras recebidas. Não existe boa prática de mercado aqui: critério que não está na lista não é aplicado, ponto.",
  "- Todo achado cita o código exato de uma regra recebida. Se o problema que você viu não corresponde a nenhuma regra, não registre.",
  "- Um achado por problema concreto e observável. Diga o que está na peça, não o que poderia ficar melhor.",
  "- Se não deu para conferir uma regra com o que foi enviado, diga em nao_verificadas, com o motivo. Isso não é falha: é honestidade sobre a cobertura. Chutar seria pior.",
  "- Não dê nota, não classifique gravidade e não diga se aprova. Quem decide isso é o sistema, pela regra violada.",
  "- Escreva em português do Brasil, direto, sem elogio e sem rodeio. Quem lê precisa saber o que corrigir.",
].join("\n");

/* ------------------------------------------------------------- os arquivos */

type Loaded = { blocks: Block[]; sent: string[]; skipped: Array<{ name: string; why: string }> };

/**
 * Baixa os anexos e transforma no que o modelo consegue ler.
 *
 * O que ele não consegue ler não vira problema nem é escondido: entra na lista
 * de ignorados, que aparece no parecer. Peça não lida virando "nenhum problema
 * encontrado" é a falha invisível deste sistema.
 */
async function loadFiles(files: Attachment[]): Promise<Loaded> {
  const blocks: Block[] = [];
  const sent: string[] = [];
  const skipped: Array<{ name: string; why: string }> = [];
  let total = 0;

  for (const file of files) {
    if (sent.length >= MAX_FILES) {
      skipped.push({ name: file.filename, why: `acima do limite de ${MAX_FILES} arquivos` });
      continue;
    }

    const extension = extensionOf(file.filename);
    const readable = isImage(file.filename) || extension === "pdf";

    if (!readable) {
      skipped.push({ name: file.filename, why: `o revisor não lê arquivo .${extension || "?"}` });
      continue;
    }

    const url = await signedUrl(file.storageKey, 300);
    if (!url) {
      skipped.push({ name: file.filename, why: "não foi possível gerar o link do arquivo" });
      continue;
    }

    const response = await fetch(url);
    if (!response.ok) {
      skipped.push({ name: file.filename, why: `download falhou (${response.status})` });
      continue;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (total + bytes.length > MAX_TOTAL_BYTES) {
      skipped.push({ name: file.filename, why: "a soma dos arquivos passou do teto da rodada" });
      continue;
    }
    total += bytes.length;

    const data = bytes.toString("base64");
    const mime = file.mimeType || mimeFor(file.filename);

    blocks.push({ type: "text", text: `Arquivo: ${file.filename}` });
    blocks.push(
      extension === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: mime, data } },
    );
    sent.push(file.filename);
  }

  return { blocks, sent, skipped };
}

/* -------------------------------------------------------------- o veredito */

/**
 * Binário e nomeável, calculado em código.
 *
 * Violou regra inegociável, reprova. Achou algo que não é inegociável, ajusta.
 * Nada, passa. Quem recebe lê o nome da regra e sabe o que fazer — que é a
 * diferença entre um parecer que se discute e um que se ignora.
 */
function verdictFrom(findings: Array<{ isBlocking: boolean }>) {
  if (findings.some((finding) => finding.isBlocking)) return "reprovado" as const;
  return findings.length > 0 ? ("ajustar" as const) : ("aprovado" as const);
}

/* ----------------------------------------------------------------- julgar */

export type JudgeResult = {
  verdict: "aprovado" | "ajustar" | "reprovado";
  findings: number;
  applied: string[];
  notVerified: Array<{ code: string; reason: string }>;
  discarded: number;
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

  const rules = machineRules(
    await rulesFor({
      orgId: item.orgId,
      companyId: item.companyId,
      skill: item.skill,
      format: item.format,
    }),
  );

  // O porteiro já garantiu que existe regra. Se sumiu entre uma coisa e outra,
  // para: parecer sem regra é opinião de robô.
  if (rules.length === 0) {
    throw new ModelError("Nenhuma regra de máquina para este recorte.", { retry: false });
  }

  const files = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.workItemId, item.id), eq(attachments.kind, "file")));

  const loaded = await loadFiles(files);

  if (loaded.sent.length === 0) {
    throw new ModelError(
      "Nenhum arquivo legível chegou ao revisor: " +
        (loaded.skipped.map((row) => `${row.name} (${row.why})`).join("; ") || "sem anexos"),
      { retry: false },
    );
  }

  const briefing = [
    `Entrega: ${item.title}`,
    `Empresa: ${company?.name ?? "—"}`,
    `Tipo de peça: ${item.skill ?? "—"}`,
    item.format ? `Formato: ${item.format}` : null,
    item.description ? `Descrição de quem pediu:\n${item.description}` : null,
    "",
    "Regras a conferir:",
    ...rules.map(ruleLine),
    loaded.skipped.length
      ? "\nArquivos que não chegaram até você: " +
        loaded.skipped.map((row) => `${row.name} (${row.why})`).join("; ") +
        ". Não julgue o que não recebeu."
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const answer = await askModel({
    system: SYSTEM,
    content: [{ type: "text", text: briefing }, ...loaded.blocks],
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

  const byCode = new Map(rules.map((rule) => [rule.code.toLowerCase(), rule]));
  const fileByName = new Map(files.map((file) => [file.filename, file.id]));

  /**
   * Achado que cita regra inexistente é descartado, e o descarte é contado.
   * Contar importa: descarte que sobe de repente é sinal de que o pedido ficou
   * confuso, ou de que alguém apagou uma regra no meio do caminho.
   */
  let discarded = 0;

  const rows = parsed.data.achados.flatMap((found) => {
    const rule = byCode.get(found.regra.trim().toLowerCase());
    if (!rule) {
      discarded += 1;
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
        detail: found.detalhe,
        evidence: {
          arquivo: found.arquivo ?? null,
          trecho: found.evidencia ?? null,
        } as Record<string, unknown>,
        isBlocking: rule.isBlocking,
        attachmentId: found.arquivo ? (fileByName.get(found.arquivo) ?? null) : null,
      },
    ];
  });

  const notVerified = parsed.data.nao_verificadas.flatMap((row) => {
    const rule = byCode.get(row.regra.trim().toLowerCase());
    return rule ? [{ code: rule.code, reason: row.motivo }] : [];
  });

  const verdict = verdictFrom(rows);

  if (rows.length > 0) await db.insert(reviewFindings).values(rows);

  await db
    .update(reviewCycles)
    .set({
      status: "emitido",
      verdict,
      appliedRules: rules.map((rule) => rule.code),
      notVerified,
      finishedAt: new Date(),
    })
    .where(eq(reviewCycles.id, cycle.id));

  return {
    verdict,
    findings: rows.length,
    applied: rules.map((rule) => rule.code),
    notVerified,
    discarded,
    model: answer.model,
    tokensIn: answer.tokensIn,
    tokensOut: answer.tokensOut,
  };
}

/** Uma regra como o modelo a recebe. O código vem primeiro: é o que se cita. */
function ruleLine(rule: ReviewRule) {
  const parts = [`- [${rule.code}] ${rule.text}`];
  if (rule.machineHint) parts.push(`  Como conferir: ${rule.machineHint}`);
  if (rule.rationale) parts.push(`  Por que existe: ${rule.rationale}`);
  return parts.join("\n");
}
