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
    max: 5,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__sql = client;

export const db = drizzle(client, { schema });
export { client, schema };
