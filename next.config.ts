import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O indicador de dev fica no canto inferior esquerdo, em cima do menu do
  // usuario. Move para a direita em vez de desligar — erros de compilacao
  // continuam aparecendo de qualquer forma.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
