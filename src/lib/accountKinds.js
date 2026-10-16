// Tipos de conta. `value` é o que fica gravado em accounts.kind (texto livre no banco).
export const ACCOUNT_KINDS = [
  { value: "corrente", label: "Conta corrente", group: "Contas correntes" },
  { value: "credito", label: "Cartão de crédito", group: "Cartões de crédito" },
  { value: "internacional", label: "Internacional", group: "Internacional" },
  { value: "investimentos", label: "Investimentos", group: "Investimentos" },
];

const KNOWN = new Set(ACCOUNT_KINDS.map((k) => k.value));

/** Tipo conhecido, ou "corrente" quando ausente/desconhecido. */
export function normalizeKind(kind) {
  return KNOWN.has(kind) ? kind : "corrente";
}

/**
 * Agrupa nomes de conta por tipo (na ordem de ACCOUNT_KINDS), sem grupos vazios.
 * Com `isActive`, as contas inativas vão para o fim de cada grupo (a ordem de cada parte é mantida).
 */
export function groupByKind(names, getKind, isActive) {
  const inactiveLast = (list) => (isActive ? [...list.filter((n) => isActive(n)), ...list.filter((n) => !isActive(n))] : list);
  return ACCOUNT_KINDS
    .map((k) => ({ ...k, names: inactiveLast(names.filter((n) => normalizeKind(getKind(n)) === k.value)) }))
    .filter((g) => g.names.length > 0);
}

/** Como groupByKind, mas só com as ativas; todas as inativas vão juntas num último grupo "Contas inativas" (na ordem dos tipos). */
export function groupWithInactiveLast(names, getKind, isActive) {
  const active = groupByKind(names.filter((n) => isActive(n)), getKind);
  const inactive = groupByKind(names.filter((n) => !isActive(n)), getKind).flatMap((g) => g.names);
  return inactive.length ? [...active, { value: "inativas", label: "Contas inativas", group: "Contas inativas", names: inactive }] : active;
}
