"use client";

import { useRef, useState, useTransition } from "react";
import {
  FileArchive,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ACCEPT_ATTRIBUTE, checkFile, isImage } from "@/lib/upload-rules";
import { addLink, getDownloadUrl, removeAttachment, uploadAttachment } from "./actions";

export type AttachmentRow = {
  id: string;
  kind: "file" | "link";
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string | null;
  /** Link assinado da miniatura. Nulo em link, em nao-imagem e se falhar. */
  previewUrl: string | null;
  uploadedByName: string | null;
};

const SHEET = ["xls", "xlsx", "csv"];
const ARCHIVE = ["zip", "rar"];

function extOf(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function iconFor(row: AttachmentRow) {
  if (row.kind === "link") return Link2;
  const ext = extOf(row.filename);
  if (isImage(row.filename)) return ImageIcon;
  if (SHEET.includes(ext)) return FileSpreadsheet;
  if (ARCHIVE.includes(ext)) return FileArchive;
  return FileText;
}

function humanSize(bytes: number) {
  if (bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentList({
  workItemId,
  items,
  storageOn,
}: {
  workItemId: string;
  items: AttachmentRow[];
  storageOn: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [dragging, setDragging] = useState(false);
  const [broken, setBroken] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  /*
    Imagem com link assinado vira miniatura: o time revisa a peca no card, que
    e o motivo de existir o anexo. Sem assinatura ela cai de volta na lista com
    icone — uma assinatura que falhou nao pode sumir com o arquivo.

    O link assinado vale PREVIEW_TTL_SECONDS. Card aberto alem disso faz a
    imagem falhar, e o `onError` devolve o anexo para a lista com icone, que
    continua abrindo o arquivo por assinatura nova. Some a miniatura, nunca o
    arquivo.
  */
  const gallery = items.filter((row) => row.previewUrl && !broken.includes(row.id));
  const rows = items.filter((row) => !row.previewUrl || broken.includes(row.id));

  function send(file: File) {
    // Recusa antes de subir. Escolher o arquivo, esperar o upload inteiro e so
    // entao levar nao e o pior jeito de dar a noticia. O servidor confere de novo.
    const problem = checkFile(file);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    const data = new FormData();
    data.set("file", file);
    start(async () => {
      const result = await uploadAttachment(workItemId, data);
      if (result.error) setError(result.error);
    });
  }

  /**
   * A aba precisa ser aberta dentro do gesto do clique, antes do `await`.
   * O link e assinado no servidor e vale pouco tempo, entao nao da para
   * deixar pronto no href; mas abrir a aba depois da resposta faz o
   * bloqueador de pop-up engolir tudo — a pessoa clica e nao acontece nada,
   * sem erro nenhum na tela.
   *
   * `noopener` fica de fora aqui de proposito: com ele o `window.open`
   * devolve `null` e nao ha como apontar a aba depois. O `opener` e cortado
   * na mao, logo em seguida, que da o mesmo isolamento.
   */
  function openDownload(id: string) {
    setError(null);

    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;

    start(async () => {
      const url = await getDownloadUrl(id);

      if (!url) {
        tab?.close();
        setError("Não foi possível gerar o link do arquivo.");
        return;
      }

      // Sem aba (bloqueador agressivo): tenta o caminho direto.
      if (tab) tab.location.replace(url);
      else window.open(url, "_blank", "noopener");
    });
  }

  function remove(id: string) {
    setError(null);
    start(async () => {
      const result = await removeAttachment(id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <section>
      <h3 className="label-mono mb-2 flex items-center gap-2">
        <span>Arquivos e links</span>
        {items.length > 0 && <span className="tnum opacity-70">{items.length}</span>}
      </h3>

      {gallery.length > 0 && (
        <div className="mb-2 grid grid-cols-4 gap-1.5">
          {gallery.map((row) => (
            <div key={row.id} className="group relative">
              <button
                type="button"
                onClick={() => openDownload(row.id)}
                disabled={pending}
                title={row.filename}
                aria-label={`Abrir ${row.filename}`}
                className="block aspect-square w-full overflow-hidden rounded-[var(--radius-control)] border border-line bg-hover transition-colors hover:border-accent"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.previewUrl ?? ""}
                  alt={row.filename}
                  loading="lazy"
                  onError={() => setBroken((ids) => (ids.includes(row.id) ? ids : [...ids, row.id]))}
                  className="h-full w-full object-cover"
                />
              </button>

              <button
                type="button"
                aria-label="Remover"
                onClick={() => remove(row.id)}
                className="absolute right-1 top-1 rounded-[var(--radius-control)] bg-surface/90 p-1 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mb-2 flex flex-col">
          {rows.map((row) => {
            const Icon = iconFor(row);
            const size = humanSize(row.sizeBytes);

            return (
              <div
                key={row.id}
                className="group flex items-center gap-2 rounded-[var(--radius-control)] px-1 py-1 hover:bg-hover"
              >
                <Icon size={14} strokeWidth={1.75} className="shrink-0 text-faint" />

                {row.kind === "link" ? (
                  <a
                    href={row.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-[13px] text-accent hover:underline"
                  >
                    {row.filename}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => openDownload(row.id)}
                    disabled={pending}
                    className="min-w-0 flex-1 truncate text-left text-[13px] text-ink hover:text-accent"
                  >
                    {row.filename}
                  </button>
                )}

                {size ? (
                  <span className="tnum shrink-0 text-[11.5px] text-faint">{size}</span>
                ) : null}

                <button
                  type="button"
                  aria-label="Remover"
                  onClick={() => remove(row.id)}
                  className="shrink-0 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div
        onDragOver={(e) => {
          if (!storageOn) return;
          e.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!storageOn) return;
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) send(file);
        }}
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-dashed px-3 py-2.5 transition-colors duration-150",
          dragging ? "border-accent bg-accent-soft" : "border-line",
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) send(file);
            e.target.value = "";
          }}
        />

        {/*
          Com o storage desligado, o botao fica desabilitado em vez de abrir o
          seletor e recusar depois.
        */}
        <button
          type="button"
          disabled={pending || !storageOn}
          title={storageOn ? undefined : "Guardar arquivo ainda nao esta ligado"}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-faint disabled:hover:text-faint"
        >
          <Paperclip size={13} />
          Anexar arquivo
        </button>

        <span aria-hidden className="text-faint">
          ·
        </span>

        <button
          type="button"
          onClick={() => setLinkOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-muted transition-colors hover:text-ink"
        >
          <Link2 size={13} />
          Colar link
        </button>

        {storageOn ? (
          <span className="ml-auto text-[11.5px] text-faint">
            {dragging ? "Solte aqui" : "arraste também"}
          </span>
        ) : null}
      </div>

      {linkOpen && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const url = linkUrl;
            const label = linkLabel;
            start(async () => {
              const result = await addLink(workItemId, url, label);
              if (result.error) {
                setError(result.error);
                return;
              }
              setLinkUrl("");
              setLinkLabel("");
              setLinkOpen(false);
            });
          }}
        >
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://drive.google.com/…"
            className="h-7 min-w-[220px] flex-1 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="nome (opcional)"
            className="h-7 w-[150px] rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <Button type="submit" size="sm" disabled={pending}>
            Adicionar
          </Button>
        </form>
      )}

      {!storageOn && (
        <p className="mt-2 text-[11.5px] text-faint">
          Guardar arquivo ainda não está ligado — falta a chave do storage no ambiente. Cole o
          link do Drive aqui, que funciona normalmente.
        </p>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
