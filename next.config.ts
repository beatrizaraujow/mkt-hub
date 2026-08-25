import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O indicador de dev fica no canto inferior esquerdo, em cima do menu do
  // usuario. Move para a direita em vez de desligar — erros de compilacao
  // continuam aparecendo de qualquer forma.
  devIndicators: { position: "bottom-right" },

  // O servidor de desenvolvimento so aceita pedidos da origem em que subiu
  // (`localhost`). Abrir a mesma pagina por `127.0.0.1` fazia o Next recusar
  // os chunks com 403: a pagina aparecia inteira e nao hidratava — nenhum
  // botao respondia, sem erro no console. Vale so em desenvolvimento.
  allowedDevOrigins: ["127.0.0.1"],

  experimental: {
    serverActions: {
      // O padrao do Next e 1MB, e o upload aceita ate 4MB. Sem isso, qualquer
      // arte acima de 1MB estoura ANTES de entrar na action: o try/catch nao
      // pega, e o usuario ve falha generica. A Vercel corta o request em
      // 4.5MB, entao 4MB e o maior valor que passa nos dois.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
