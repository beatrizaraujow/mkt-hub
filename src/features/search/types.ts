/**
 * Tipos e constantes da busca, fora do `queries.ts` porque aquele arquivo é
 * `server-only` — a caixa de busca roda no navegador e não pode importar de
 * lá sem quebrar o build.
 */

export type SearchHit = {
  id: string;
  title: string;
  /** Título da tarefa mãe, quando o resultado é uma subtarefa. */
  parentTitle: string | null;
  companyName: string;
  companyColor: string;
  projectName: string | null;
  stageName: string;
  assigneeName: string | null;
  done: boolean;
};

export type SearchResults = {
  items: SearchHit[];
  projects: Array<{ id: string; name: string; companySlug: string; companyName: string }>;
  companies: Array<{ id: string; name: string; slug: string; color: string }>;
};

/** Uma letra devolveria o board inteiro e não ajudaria ninguém. */
export const MIN_TERM = 2;

export const EMPTY_RESULTS: SearchResults = { items: [], projects: [], companies: [] };
