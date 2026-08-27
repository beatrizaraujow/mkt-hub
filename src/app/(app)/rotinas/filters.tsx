"use client";

import { FilterBar, FilterSelect, useFilterParams } from "@/components/filter-bar";

const KEYS = ["empresa", "responsavel"];

/**
 * Empresa e responsavel, o mesmo desenho da tela de Trabalho.
 *
 * As duas listas vem do que **existe na grade**, nao do cadastro inteiro.
 * Oferecer no filtro uma empresa sem rotina nenhuma promete um recorte que so
 * devolve tela vazia — e quem clica conclui que o sistema esta quebrado, nao
 * que a empresa nao tem rotina.
 */
export function RoutineFilters({
  companies,
  people,
  meId,
}: {
  companies: Array<{ id: string; name: string }>;
  people: Array<{ id: string; name: string }>;
  meId: string | null;
}) {
  const { set, clear, current, dirty } = useFilterParams(KEYS);

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
            {company.name}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Responsável"
        value={current("responsavel")}
        onChange={(value) => set("responsavel", value)}
      >
        <option value="">Todo mundo</option>
        {meId && people.some((person) => person.id === meId) && (
          <option value={meId}>Minhas rotinas</option>
        )}
        {people
          .filter((person) => person.id !== meId)
          .map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
      </FilterSelect>
    </FilterBar>
  );
}
