/**
 * Duração: ler o que a pessoa escreveu, e escrever de volta o que se lê.
 *
 * Fica fora de `date.ts` porque duração não é data. Uma é um ponto na linha do
 * tempo e carrega fuso; a outra é um tamanho, e some se você tentar dar fuso a
 * ela.
 *
 * **Sem `server-only`**: a mesma leitura precisa valer no navegador, para o
 * campo dizer "não entendi" antes de gastar uma ida ao servidor, e no servidor,
 * porque validação que só existe no cliente não é validação.
 */

/** Vinte e quatro horas. Lançamento maior que isso é dedo escorregado. */
const LIMITE_SEGUNDOS = 24 * 60 * 60;

export type Duracao = { segundos: number } | { erro: string };

const EXEMPLOS = "Ex.: 1h30, 45m, 2h, 1:30.";

/**
 * Ordem importa: `horas?` antes de `h`, e `minutos?|mins?` antes de `m`, senão
 * o `m` de "min" casa sozinho e sobra um "in" que derruba a leitura inteira.
 */
const TOKEN = /(\d+(?:[.,]\d+)?)\s*(horas?|hrs?|h|minutos?|mins?|m|segundos?|segs?|s)?/gi;

const numero = (bruto: string) => Number(bruto.replace(",", "."));

function conferir(segundos: number): Duracao {
  if (!Number.isFinite(segundos)) return { erro: `Não entendi o tempo. ${EXEMPLOS}` };
  const inteiro = Math.round(segundos);
  if (inteiro <= 0) return { erro: "O tempo precisa ser maior que zero." };
  if (inteiro > LIMITE_SEGUNDOS) {
    return { erro: "Mais de 24 horas num lançamento só? Confira o número." };
  }
  return { segundos: inteiro };
}

/**
 * Lê `1h30`, `45m`, `2 horas`, `1:30`, `90`, `1,5h`, `30s`.
 *
 * **Número sozinho é minuto**, e não hora: quem digita `45` quase sempre quer
 * quarenta e cinco minutos. Tratar como hora transformaria um lançamento comum
 * numa jornada de dois dias, e o erro passaria despercebido no total.
 *
 * **Número solto depois de hora é minuto** — `3h20` são três e vinte. Solto em
 * qualquer outro lugar é recusado em vez de adivinhado: em `2h 20 30` não há
 * leitura óbvia, e chutar uma cria um número errado que ninguém confere.
 */
export function parseDuration(texto: string): Duracao {
  const limpo = texto.trim().toLowerCase();
  if (!limpo) return { erro: `Escreva quanto tempo. ${EXEMPLOS}` };

  // Relógio: 1:30 é uma hora e meia, 0:45 são quarenta e cinco minutos.
  const relogio = /^(\d{1,2}):([0-5]\d)$/.exec(limpo);
  if (relogio) {
    return conferir(Number(relogio[1]) * 3600 + Number(relogio[2]) * 60);
  }

  // Recusa o que sobrar fora dos números e unidades, em vez de ignorar.
  const restante = limpo.replace(TOKEN, "").replace(/[\s,.:e]/g, "");
  if (restante) return { erro: `Não entendi "${texto.trim()}". ${EXEMPLOS}` };

  let segundos = 0;
  let achou = false;
  let ultimaFoiHora = false;

  TOKEN.lastIndex = 0;
  for (const parte of limpo.matchAll(TOKEN)) {
    const valor = numero(parte[1]);
    const unidade = parte[2];
    achou = true;

    if (!unidade) {
      if (!ultimaFoiHora) {
        // Sozinho na expressão inteira, vale como minuto. No meio, é ambíguo.
        if (limpo.replace(/\s/g, "") !== parte[1]) {
          return { erro: `Não entendi "${texto.trim()}". ${EXEMPLOS}` };
        }
      }
      segundos += valor * 60;
      ultimaFoiHora = false;
      continue;
    }

    if (/^(h|hr|hrs|hora|horas)$/.test(unidade)) {
      segundos += valor * 3600;
      ultimaFoiHora = true;
    } else if (/^(s|seg|segs|segundo|segundos)$/.test(unidade)) {
      segundos += valor;
      ultimaFoiHora = false;
    } else {
      segundos += valor * 60;
      ultimaFoiHora = false;
    }
  }

  if (!achou) return { erro: `Não entendi "${texto.trim()}". ${EXEMPLOS}` };
  return conferir(segundos);
}

/**
 * Escreve para gente ler: `4h 30m`, `30m`, `2h`, `42s`.
 *
 * O formato antigo (`4h30`) escrevia meia hora como `0h30` — meia hora
 * anunciada como zero hora, que é a leitura errada logo no primeiro olhar.
 * Abaixo de uma hora, a hora some; abaixo de um minuto, aparecem os segundos,
 * senão um cronômetro recém-parado marca `0m` e parece que não gravou.
 */
export function formatarDuracao(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  if (total < 60) return `${total}s`;

  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);

  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * O relógio que anda: `1:04:09`, ou `4:09` na primeira hora.
 *
 * Diferente de `formatarDuracao` de propósito. Um cronômetro rodando precisa
 * de largura estável — o número não pode pular de lugar a cada segundo — e
 * precisa dos segundos visíveis, que são o que prova que está andando.
 */
export function relogio(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
