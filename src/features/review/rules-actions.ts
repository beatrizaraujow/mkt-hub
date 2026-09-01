"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reviewChecklistItems, reviewRules } from "@/db/schema";
import { assertCanManage, requireUserAction } from "@/lib/auth";
import { isFormat, isSkill } from "@/lib/catalog";
import { describeError, errorMentions } from "@/lib/errors";
import { setCompanyEnabled, setReviewMode } from "./settings";

/**
 * A área de negócio muda regra sem abrir chamado de desenvolvimento.
 *
 * É o princípio que sustenta o resto: quem sabe a regra é quem convive com o
 * erro, não quem escreve o código. Regra escrita à mão dentro do programa
 * envelhece na primeira mudança de manual e ninguém percebe.
 *
 * Nada aqui inventa critério: o sistema só aplica o que está na tabela. Se a
 * regra não foi cadastrada, ela não é conferida — e isso é garantia, não
 * limitação.
 */

export type RulesState = { error?: string; ok?: boolean };

/** `""` no formulário significa "vale para qualquer um" — vira nulo no banco. */
const optional = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value));

const ruleSchema = z.object({
  id: optional,
  code: z
    .string()
    .trim()
    .min(2, "O código precisa de pelo menos 2 caracteres.")
    .max(40)
    // É o que aparece no parecer e o que a pessoa contesta: precisa ser curto,
    // estável e digitável.
    .regex(/^[A-Za-z0-9._-]+$/, "Use só letras, números, ponto, hífen ou sublinhado."),
  text: z.string().trim().min(8, "Escreva a regra por extenso.").max(600),
  rationale: optional,
  verifier: z.enum(["maquina", "pessoa", "fora"]),
  isBlocking: z.coerce.boolean(),
  machineHint: optional,
  companyId: optional,
  skill: optional,
  format: optional,
  overridesRuleId: optional,
});

function readForm(form: FormData) {
  return {
    id: String(form.get("id") ?? ""),
    code: String(form.get("code") ?? ""),
    text: String(form.get("text") ?? ""),
    rationale: String(form.get("rationale") ?? ""),
    verifier: String(form.get("verifier") ?? ""),
    isBlocking: form.get("isBlocking") === "on",
    machineHint: String(form.get("machineHint") ?? ""),
    companyId: String(form.get("companyId") ?? ""),
    skill: String(form.get("skill") ?? ""),
    format: String(form.get("format") ?? ""),
    overridesRuleId: String(form.get("overridesRuleId") ?? ""),
  };
}

function refresh() {
  revalidatePath("/revisor");
  revalidatePath("/revisor/regras");
}

export async function saveRule(_prev: RulesState, form: FormData): Promise<RulesState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    const parsed = ruleSchema.safeParse(readForm(form));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };
    }

    const data = parsed.data;

    // Recorte que não existe no catálogo nunca casaria com entrega nenhuma: a
    // regra ficaria cadastrada, invisível e sem nunca ser aplicada.
    if (data.skill && !isSkill(data.skill)) return { error: "Tipo de peça fora do catálogo." };
    if (data.format && !isFormat(data.format)) return { error: "Formato fora do catálogo." };

    /**
     * Pista de verificação só faz sentido para quem a máquina confere. Guardar
     * pista numa regra de balde humano confunde quem lê a tela depois.
     */
    const machineHint = data.verifier === "maquina" ? data.machineHint : null;

    // Uma regra substituindo a si mesma se apagaria do proprio recorte.
    const overrides = data.overridesRuleId === data.id ? null : data.overridesRuleId;

    const values = {
      orgId: user.orgId,
      companyId: data.companyId,
      skill: data.skill,
      format: data.format,
      code: data.code,
      text: data.text,
      rationale: data.rationale,
      verifier: data.verifier,
      isBlocking: data.isBlocking,
      machineHint,
      overridesRuleId: overrides,
      updatedAt: new Date(),
    };

    if (data.id) {
      /**
       * A versao sobe quando o **texto** muda, nao a cada salvamento.
       *
       * E o que a impressao digital do parecer usa: corrigir uma virgula do
       * "por que existe" nao pode invalidar o reaproveitamento de todos os
       * pareceres emitidos com aquela regra.
       */
      const [before] = await db
        .select({ text: reviewRules.text, version: reviewRules.version })
        .from(reviewRules)
        .where(and(eq(reviewRules.id, data.id), eq(reviewRules.orgId, user.orgId)))
        .limit(1);

      const version =
        before && before.text !== data.text ? before.version + 1 : (before?.version ?? 1);

      await db
        .update(reviewRules)
        .set({ ...values, version })
        .where(and(eq(reviewRules.id, data.id), eq(reviewRules.orgId, user.orgId)));
    } else {
      await db.insert(reviewRules).values(values);
    }

    refresh();
    return { ok: true };
  } catch (error) {
    /**
     * O índice único é por (organização, código), e o nome da constraint vem
     * embrulhado dentro de `cause` — a mensagem de fora só diz "Failed query"
     * com o SQL colado. Sem desembrulhar, quem cadastra um código repetido
     * recebia o `insert into` inteiro na tela.
     */
    if (errorMentions(error, "review_rules_org_code_unique")) {
      return { error: "Já existe uma regra com esse código." };
    }

    // O detalhe fica no log do servidor: SQL na tela não ajuda ninguém a
    // consertar o cadastro.
    console.error("saveRule:", describeError(error));
    return { error: "Não foi possível salvar a regra." };
  }
}

/**
 * Desativa em vez de apagar. Um parecer antigo cita a regra que valia na
 * época; apagar a linha apagaria o porquê daquela reprovação.
 */
export async function setRuleActive(id: string, active: boolean): Promise<RulesState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    await db
      .update(reviewRules)
      .set({ isActive: active, updatedAt: new Date() })
      .where(and(eq(reviewRules.id, id), eq(reviewRules.orgId, user.orgId)));

    refresh();
    return { ok: true };
  } catch (error) {
    console.error("setRuleActive:", describeError(error));
    return { error: "Não foi possível mudar a regra." };
  }
}

/* --------------------------------------------------------------- checklist */

const checklistSchema = z.object({
  id: optional,
  text: z.string().trim().min(8, "Escreva o item por extenso.").max(300),
  companyId: optional,
  skill: optional,
  /**
   * A regra que este item cobre, quando cobre uma.
   *
   * E o que torna o medidor util: com a regra ligada, a medicao compara a
   * marcacao da pessoa com o que a maquina achou **naquela regra**. Sem ela,
   * a comparacao vira "o robo achou alguma coisa nesta entrega", que infla o
   * numero e destroi a utilidade do medidor.
   */
  ruleId: optional,
  isReliabilityProbe: z.coerce.boolean(),
  /**
   * O item so faz sentido quando existe laudo.
   *
   * Numa peca marcada como sem revisao automatica nao ha laudo nenhum, e o item
   * some — no lugar dele entra a co-assinatura da excecao. Sem esta marcacao, o
   * checklist pediria que alguem confirmasse ter lido um documento que nao
   * existe, que e o jeito mais rapido de ensinar o time a marcar sem ler.
   */
  dependsOnReport: z.coerce.boolean(),
});

export async function saveChecklistItem(
  _prev: RulesState,
  form: FormData,
): Promise<RulesState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    const parsed = checklistSchema.safeParse({
      id: String(form.get("id") ?? ""),
      text: String(form.get("text") ?? ""),
      companyId: String(form.get("companyId") ?? ""),
      skill: String(form.get("skill") ?? ""),
      ruleId: String(form.get("ruleId") ?? ""),
      isReliabilityProbe: form.get("isReliabilityProbe") === "on",
      dependsOnReport: form.get("dependsOnReport") === "on",
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };
    }

    const data = parsed.data;
    if (data.skill && !isSkill(data.skill)) return { error: "Tipo de peça fora do catálogo." };

    const values = {
      orgId: user.orgId,
      companyId: data.companyId,
      skill: data.skill,
      text: data.text,
      ruleId: data.ruleId,
      isReliabilityProbe: data.isReliabilityProbe,
      dependsOnReport: data.dependsOnReport,
    };

    if (data.id) {
      await db
        .update(reviewChecklistItems)
        .set(values)
        .where(and(eq(reviewChecklistItems.id, data.id), eq(reviewChecklistItems.orgId, user.orgId)));
    } else {
      await db.insert(reviewChecklistItems).values(values);
    }

    refresh();
    return { ok: true };
  } catch (error) {
    console.error("saveChecklistItem:", describeError(error));
    return { error: "Não foi possível salvar o item." };
  }
}

/**
 * Fecha um checklist inteiro de uma vez, uma linha por item.
 *
 * Sem isto, montar um checklist de seis itens para cinco combinações são trinta
 * idas e voltas de janelinha — e o custo de escrever o checklist passa a ser
 * maior que o de conferir na mão, que é o começo do fim da ferramenta. Quem
 * define o checklist escreve numa lista corrida; a tela aceita a lista.
 */
export async function addChecklistBatch(_prev: RulesState, form: FormData): Promise<RulesState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    const companyId = String(form.get("companyId") ?? "").trim() || null;
    const skill = String(form.get("skill") ?? "").trim() || null;
    if (skill && !isSkill(skill)) return { error: "Tipo de peça fora do catálogo." };

    const linhas = String(form.get("bulk") ?? "")
      .split("\n")
      // Lista colada de outro lugar costuma vir com marcador na frente.
      .map((linha) => linha.replace(/^\s*(?:[-*\u2022\u00b7]|\d+[.)])\s*/, "").trim())
      .filter((linha) => linha.length > 0);

    if (linhas.length === 0) return { error: "Cole ao menos um item, um por linha." };

    const curtas = linhas.filter((linha) => linha.length < 8);
    if (curtas.length > 0) {
      return { error: `Item curto demais para significar alguma coisa: “${curtas[0]}”` };
    }

    /**
     * Entre quatro e oito por combinação. O teto não é capricho: checklist
     * longo vira marcação automática, e aí ele deixa de valer justamente para
     * os poucos itens em que era a única defesa.
     */
    if (linhas.length > 12) {
      return { error: "São 12 itens no máximo por vez. Checklist longo ninguém lê." };
    }

    const existentes = await db
      .select({ text: reviewChecklistItems.text, position: reviewChecklistItems.position })
      .from(reviewChecklistItems)
      .where(
        and(
          eq(reviewChecklistItems.orgId, user.orgId),
          companyId
            ? eq(reviewChecklistItems.companyId, companyId)
            : isNull(reviewChecklistItems.companyId),
          skill ? eq(reviewChecklistItems.skill, skill) : isNull(reviewChecklistItems.skill),
        ),
      )
      .orderBy(asc(reviewChecklistItems.position));

    const jaTem = new Set(existentes.map((item) => item.text.toLowerCase()));
    const novos = linhas.filter((linha) => !jaTem.has(linha.toLowerCase()));

    if (novos.length === 0) return { error: "Todos esses itens já estão na lista." };

    // A ordem colada é a ordem que a pessoa vai ler. Sem posição crescente,
    // todos empatam em 1000 e o banco devolve na ordem que quiser.
    const ultima = existentes.at(-1)?.position ?? 0;

    await db.insert(reviewChecklistItems).values(
      novos.map((text, indice) => ({
        orgId: user.orgId,
        companyId,
        skill,
        text,
        position: ultima + (indice + 1) * 10,
      })),
    );

    refresh();
    return { ok: true };
  } catch (error) {
    console.error("addChecklistBatch:", describeError(error));
    return { error: "Não foi possível gravar a lista." };
  }
}

export async function setChecklistActive(id: string, active: boolean): Promise<RulesState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);

    await db
      .update(reviewChecklistItems)
      .set({ isActive: active })
      .where(and(eq(reviewChecklistItems.id, id), eq(reviewChecklistItems.orgId, user.orgId)));

    refresh();
    return { ok: true };
  } catch (error) {
    console.error("setChecklistActive:", describeError(error));
    return { error: "Não foi possível mudar o item." };
  }
}

/* ------------------------------------------------------- o que muda sem deploy */

/**
 * Sai do silencioso, ou volta para ele.
 *
 * Em ativo, so a reprovacao anda sozinha. Aprovado continua esperando clique
 * humano — carimbar aprovacao sem ninguem olhar e a autonomia que ninguem
 * pediu e que so se descobre errada depois de publicada.
 */
export async function setMode(mode: "silencioso" | "ativo"): Promise<RulesState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);
    await setReviewMode(user.orgId, mode);
    refresh();
    return { ok: true };
  } catch (error) {
    return { error: describeError(error) };
  }
}

/** O botao de desligar por marca. Vale nos dois modos e para as chamadas na hora. */
export async function setCompanyReview(
  companyId: string,
  enabled: boolean,
): Promise<RulesState> {
  try {
    const user = await requireUserAction();
    assertCanManage(user);
    await setCompanyEnabled(user.orgId, companyId, enabled);
    refresh();
    return { ok: true };
  } catch (error) {
    return { error: describeError(error) };
  }
}
