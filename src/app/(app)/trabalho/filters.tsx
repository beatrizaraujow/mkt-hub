"use client";

import {
  FilterBar,
  FilterCheck,
  FilterSelect,
  useFilterParams,
} from "@/components/filter-bar";

const KEYS = ["empresa", "responsavel", "skill", "concluidas", "rotinas"];

export function Filters({
  companies,
  people,
  skills,
  meId,
}: {
  companies: Array<{ id: string; name: string; parentId: string | null }>;
  people: Array<{ id: string; name: string }>;
  /** Os rotulos de `Tarefas SKILL` que existem, do mais usado ao menos. */
  skills: Array<{ skill: string; n: number }>;
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

      {/*
        O tipo de trabalho veio do ClickUp (`Tarefas SKILL`) e existe em 2.119
        tarefas. Fica escondido quando nao ha nenhuma: um seletor vazio ocupa
        espaco na barra e nao responde nada.
      */}
      {skills.length > 0 && (
        <FilterSelect
          label="Tipo"
          value={current("skill")}
          onChange={(value) => set("skill", value)}
        >
          <option value="">Todos os tipos</option>
          {skills.map((s) => (
            <option key={s.skill} value={s.skill}>
              {s.skill} ({s.n})
            </option>
          ))}
        </FilterSelect>
      )}

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
