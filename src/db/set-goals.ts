/**
 * Cadastra a regua de desempenho de cada pessoa. Idempotente: rodar de novo
 * atualiza em vez de duplicar, pela chave unica em `user_id`.
 *
 *   npm run metas               simula, nao escreve
 *   npm run metas -- --aplicar  escreve
 *
 * **Aponta para desenvolvimento**, porque le `.env.local` como todo script
 * daqui. Para producao, sobrescreva `DATABASE_URL` no ambiente — e confira o
 * **usuario** da conexao, nunca o host: o pooler do Supabase e o mesmo nos
 * dois, e o que separa e o `postgres.<ref>` antes do `@`.
 *
 * Os numeros vem de `sql/update_user_goals.sql` do MKT Hub 1, que e o modelo
 * que roda hoje. O time pensa em pontos por dia, e desde 31/08/2026 as duas
 * colunas existem: `daily_target` para o placar do dia e `weekly_target` para
 * o fechamento. A semana nao e o dia vezes cinco por acaso — ela e o acordo,
 * e o dia e o ritmo; guardar as duas evita que mudar uma reescreva a outra.
 *
 * **A meta de 120% e digitada, nao derivada.** Parece 1,2x ate voce conferir:
 * 130 vira 156 e 80 vira 96, mas 60 vira 70 e nao 72. Sao acordos individuais,
 * e uma formula reescreveria em silencio o que alguem combinou com alguem.
 *
 * Quem tem regua de rotinas nao tem meta fixa: a meta da semana e o que as
 * rotinas ativas previam para ela. Muda sozinha quando a grade muda.
 */
import { eq } from "drizzle-orm";
import { client, db } from "./index";
import { performanceGoals, users } from "./schema";

type Regua =
  | { email: string; rule: "pontos"; porDia: number; semanal: number; semanal120: number }
  | { email: string; rule: "rotinas" };

const REGUAS: Regua[] = [
  { email: "samuel.melo@grupoquatro5.com", rule: "pontos", porDia: 26, semanal: 130, semanal120: 156 },
  { email: "thiago.nascimento@grupoquatro5.com", rule: "pontos", porDia: 16, semanal: 80, semanal120: 96 },
  { email: "klenio.braz@grupoquatro5.com", rule: "pontos", porDia: 16, semanal: 80, semanal120: 96 },
  { email: "anny.beatriz@grupoquatro5.com", rule: "pontos", porDia: 12, semanal: 60, semanal120: 70 },

  // Storymaker e Publisher/UGC: entregam presenca, nao pontos. Cobrar pontos
  // dessas duas pessoas mediria a coisa errada.
  { email: "marialuiza.mariz@grupoquatro5.com", rule: "rotinas" },
  { email: "zion.bagatoli@grupoquatro5.com", rule: "rotinas" },
];

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const pessoas = new Map(
    (await db.select({ id: users.id, email: users.email, name: users.name, orgId: users.orgId }).from(users)).map(
      (pessoa) => [pessoa.email, pessoa],
    ),
  );

  const existentes = new Set(
    (await db.select({ userId: performanceGoals.userId }).from(performanceGoals)).map((g) => g.userId),
  );

  let criadas = 0;
  let atualizadas = 0;
  const ausentes: string[] = [];

  for (const regua of REGUAS) {
    const pessoa = pessoas.get(regua.email);
    if (!pessoa) {
      ausentes.push(regua.email);
      continue;
    }

    const valores = {
      rule: regua.rule,
      weeklyTarget: regua.rule === "pontos" ? regua.semanal : null,
      weeklyTarget120: regua.rule === "pontos" ? regua.semanal120 : null,
      // O `porDia` ja existia aqui e era descartado depois de virar semana.
      // Agora ele e gravado: o placar do dia le esta coluna, e nao a semana
      // dividida por cinco — os numeros da casa nao dividem assim.
      dailyTarget: regua.rule === "pontos" ? regua.porDia : null,
      isActive: true,
      updatedAt: new Date(),
    };

    const descricao =
      regua.rule === "pontos"
        ? `${regua.semanal}/sem (${regua.porDia}/dia) · 120% = ${regua.semanal120}`
        : "meta vem das rotinas da semana";

    console.log(`  ${pessoa.name}: ${descricao}`);

    if (!aplicar) {
      if (existentes.has(pessoa.id)) atualizadas++;
      else criadas++;
      continue;
    }

    if (existentes.has(pessoa.id)) {
      await db.update(performanceGoals).set(valores).where(eq(performanceGoals.userId, pessoa.id));
      atualizadas++;
    } else {
      await db.insert(performanceGoals).values({ orgId: pessoa.orgId, userId: pessoa.id, ...valores });
      criadas++;
    }
  }

  console.log(
    `\n${aplicar ? "Aplicado." : "Simulacao — nada foi escrito. Use -- --aplicar."}` +
      `\n  criadas: ${criadas}   atualizadas: ${atualizadas}   sem conta no sistema: ${ausentes.length}`,
  );
  for (const email of ausentes) console.log(`  ! ${email}`);
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error(err);
    await client.end().catch(() => {});
    process.exit(1);
  });
