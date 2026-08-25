import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O indicador de dev fica no canto inferior esquerdo, em cima do menu do
  // usuario. Move para a direita em vez de desligar — erros de compilacao
  // continuam aparecendo de qualquer forma.
  devIndicators: { position: "bottom-right" },

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
