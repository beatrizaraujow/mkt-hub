import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TEMA_SCRIPT } from "@/lib/theme";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MKT Hub",
  description: "Gestão de equipe, tarefas, metas e produção de conteúdo.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1413" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * `suppressHydrationWarning` porque o script abaixo mexe na classe do
     * `<html>` antes de o React hidratar, e sem isto o React reclamaria de uma
     * diferenca que e exatamente o que se quer.
     */
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/*
          Antes de qualquer pintura. Se isto esperasse o React, quem escolheu o
          escuro veria a tela clara por um quadro toda vez que abrisse o
          sistema — e esse pisco branco e pior que nao ter a opcao.
        */}
        <script dangerouslySetInnerHTML={{ __html: TEMA_SCRIPT }} />
      </head>
      <body className={`${bricolage.variable} ${instrument.variable} ${jetbrains.variable}`}>
        {children}
      </body>
    </html>
  );
}
