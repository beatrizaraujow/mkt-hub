/**
 * Qual conjunto de regras vale para uma entrega — sem banco, sem rede.
 *
 * A consulta traz a união das camadas; esta função decide o que sobra dela.
 * É pura de propósito: é a parte do sistema que mais precisa de teste e a que
 * mais dói errar em silêncio, porque uma regra que some do conjunto não
 * aparece em lugar nenhum — a peça só passa.
 */

export type RuleLike = {
  id: string;
  code: string;
  companyId: string | null;
  skill: string | null;
  format: string | null;
  overridesRuleId: string | null;
};

export type Layer = "universal" | "empresa" | "tipo" | "empresa-tipo";

const LAYER_LABEL: Record<Layer, string> = {
  universal: "Todas as empresas",
  empresa: "Empresa",
  tipo: "Tipo de peça",
  "empresa-tipo": "Empresa · tipo de peça",
};

export function layerOf(rule: Pick<RuleLike, "companyId" | "skill" | "format">): Layer {
  const byCompany = rule.companyId !== null;
  const byType = rule.skill !== null || rule.format !== null;

  if (byCompany && byType) return "empresa-tipo";
  if (byCompany) return "empresa";
  if (byType) return "tipo";
  return "universal";
}

export function layerLabel(layer: Layer): string {
  return LAYER_LABEL[layer];
}

/**
 * Quão específica é a regra. Conta cada dimensão preenchida: quem escreveu
 * "para a Carbone, em carrossel" foi mais longe que quem escreveu "para a
 * Carbone", e é essa a que vale quando as duas falam do mesmo assunto.
 */
export function specificityOf(rule: Pick<RuleLike, "companyId" | "skill" | "format">): number {
  return (rule.companyId ? 1 : 0) + (rule.skill ? 1 : 0) + (rule.format ? 1 : 0);
}

export type Overlap = {
  winner: string;
  loser: string;
  /** `false` quando a sobreposição foi declarada e o sistema não a respeitou. */
  applied: boolean;
  why: string;
};

/**
 * Resolve as sobreposições declaradas.
 *
 * O conflito entre camadas é sempre **declarado** por quem cadastra, nunca
 * adivinhado pelo texto: duas regras sobre o mesmo assunto escritas de jeitos
 * diferentes não têm como ser reconhecidas por comparação, e um sistema que
 * tenta acerta na demonstração e erra em produção — calando a regra errada.
 *
 * Sobreposição que não é respeitada **não some**: volta na lista com o motivo.
 * Conflito silencioso é bug, e aqui ele seria invisível.
 */
export function resolveRules<T extends RuleLike>(
  rules: T[],
): { applied: T[]; overlaps: Overlap[] } {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const dropped = new Set<string>();
  const overlaps: Overlap[] = [];

  /**
   * Da mais especifica para a mais generica, e quem ja saiu nao decide mais
   * nada. Numa corrente — a regra da empresa substitui a universal, e a regra
   * do tipo substitui a da empresa — quem sai leva junto so a propria voz: a
   * universal volta a valer, porque quem mandava tira-la nao esta mais aqui.
   * Regra a mais e discutivel; regra a menos e invisivel.
   */
  const byPrecision = [...rules].sort((a, b) => specificityOf(b) - specificityOf(a));

  for (const rule of byPrecision) {
    if (!rule.overridesRuleId) continue;
    if (dropped.has(rule.id)) continue;

    const target = byId.get(rule.overridesRuleId);
    // A regra substituída não está neste recorte: nada a resolver.
    if (!target) continue;

    if (specificityOf(rule) > specificityOf(target)) {
      dropped.add(target.id);
      overlaps.push({
        winner: rule.code,
        loser: target.code,
        applied: true,
        why: `${layerLabel(layerOf(rule))} é mais específica que ${layerLabel(layerOf(target)).toLowerCase()}.`,
      });
      continue;
    }

    overlaps.push({
      winner: target.code,
      loser: rule.code,
      applied: false,
      why:
        "A regra que diz substituir não é mais específica que a substituída. " +
        "As duas continuam valendo — corrija o escopo de uma delas.",
    });
  }

  return { applied: rules.filter((rule) => !dropped.has(rule.id)), overlaps };
}
