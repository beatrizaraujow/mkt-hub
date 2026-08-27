import type { Faixa } from "./stats";

/**
 * Faixa de aderencia para cor. So o mapa, sem React — assim o painel (que roda
 * no servidor) e a grade (que roda no cliente) usam o mesmo verde sem que um
 * arraste o outro para dentro do seu bundle.
 *
 * Verde so quando esta bom de verdade. Amarelo e aviso, nao elogio.
 */
export const TOM: Record<Faixa, string> = {
  boa: "text-success",
  atencao: "text-warning",
  ruim: "text-danger",
  "sem-dado": "text-faint",
};

export const BARRA: Record<Faixa, string> = {
  boa: "bg-success",
  atencao: "bg-warning",
  ruim: "bg-danger",
  "sem-dado": "bg-line",
};
