import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL nao definida. Copie .env.example para .env.local e preencha com a string do Supabase.",
  );
}

/**
 * Supabase, transaction pooler (porta 6543).
 * `prepare: false` e obrigatorio: o pooler em modo transacao nao mantem
 * prepared statements entre queries.
 *
 * Em dev o Next recarrega o modulo a cada alteracao — sem o singleton,
 * cada recarga abriria um pool novo e estouraria o limite de conexao.
 */
const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

const client =
  globalForDb.__sql ??
  postgres(url, {
    prepare: false,
    /*
     * O pooler em modo **sessao** (5432) so admite 15 clientes no total, e a
     * aplicacao em producao ja ocupa parte deles. Um script de linha de comando
     * pedindo 5 de uma vez estoura o limite e derruba a propria migracao — foi o
     * que aconteceu em 01/09/2026. Com `DB_MAX=1` o script passa a disputar uma
     * conexao so. No modo transacao (6543), que e o normal em producao, o teto e
     * muito maior e o padrao de 5 nao incomoda.
     */
    max: Number(process.env.DB_MAX ?? 5),
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__sql = client;

export const db = drizzle(client, { schema });
export { client, schema };
