"use client";

import {
  FilterBar,
  FilterCheck,
  FilterSelect,
  useFilterParams,
} from "@/components/filter-bar";

const KEYS = ["empresa", "responsavel", "concluidas", "rotinas"];

export function Filters({
  companies,
  people,
  meId,
}: {
  companies: Array<{ id: string; name: string; parentId: string | null }>;
  people: Array<{ id: string; name: string }>;
  meId: string;
}) {
  const { set, clear, current, dirty, params } = useFilterParams(KEYS);

  return (
    <FilterBar dirty={dirty} onClear={clear}>
      <FilterSelect
        label="Empresa"
        value={current("empresa")}
        onChange={(value) => set("empresa", value)}
      >
        <option value="">Todas as empresas</option>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.parentId ? `— ${company.name}` : company.name}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Responsável"
        value={current("responsavel")}
        onChange={(value) => set("responsavel", value)}
      >
        <option value="">Todo mundo</option>
        <option value={meId}>Minhas tarefas</option>
        {people
          .filter((person) => person.id !== meId)
          .map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
      </FilterSelect>

      {/* No quadro a coluna de concluído já existe — o filtro não faria sentido. */}
      {params.get("view") !== "quadro" && (
        <FilterCheck
          label="Mostrar concluídas"
          checked={current("concluidas") === "1"}
          onChange={(checked) => set("concluidas", checked ? "1" : "")}
        />
      )}

      {/*
        Item de rotina fica escondido por padrao: story diario em quatro
        empresas sao 28 por semana, e o lugar de olhar isso e a grade.
      */}
      <FilterCheck
        label="Incluir rotinas"
        checked={current("rotinas") === "1"}
        onChange={(checked) => set("rotinas", checked ? "1" : "")}
      />
    </FilterBar>
  );
}
