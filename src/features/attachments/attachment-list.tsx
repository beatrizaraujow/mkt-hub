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
import { addLink, getDownloadUrl, removeAttachment, uploadAttachment } from "./actions";

export type AttachmentRow = {
  id: string;
  kind: "file" | "link";
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string | null;
  uploadedByName: string | null;
};

const IMAGE = ["png", "jpg", "jpeg", "webp", "gif", "svg"];
const SHEET = ["xls", "xlsx", "csv"];
const ARCHIVE = ["zip", "rar"];

function extOf(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function iconFor(row: AttachmentRow) {
  if (row.kind === "link") return Link2;
  const ext = extOf(row.filename);
  if (IMAGE.includes(ext)) return ImageIcon;
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
  const fileRef = useRef<HTMLInputElement>(null);

  function send(file: File) {
    setError(null);
    const data = new FormData();
    data.set("file", file);
    start(async () => {
      const result = await uploadAttachment(workItemId, data);
      if (result.error) setError(result.error);
    });
  }

  function openDownload(id: string) {
    setError(null);
    start(async () => {
      const url = await getDownloadUrl(id);
      if (url) window.open(url, "_blank", "noopener");
      else setError("Não foi possível gerar o link do arquivo.");
    });
  }

  return (
    <section>
      <h3 className="label-mono mb-2 flex items-center gap-2">
        <span>Arquivos e links</span>
        {items.length > 0 && <span className="tnum opacity-70">{items.length}</span>}
      </h3>

      {items.length > 0 && (
        <div className="mb-2 flex flex-col">
          {items.map((row) => {
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
                  onClick={() => {
                    setError(null);
                    start(async () => {
                      const result = await removeAttachment(row.id);
                      if (result.error) setError(result.error);
                    });
                  }}
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
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) send(file);
            e.target.value = "";
          }}
        />

        {/*
          Com o storage desligado, o botao fica desabilitado em vez de abrir o
          seletor e recusar depois. Escolher o arquivo, esperar e so entao levar
          nao a e o pior jeito de dar a noticia.
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
