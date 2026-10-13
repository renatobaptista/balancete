/**
 * Aplica a troca de nome de uma conta a um lançamento: `account` nos lançamentos comuns e
 * `fromAccount`/`toAccount` nas transferências. Devolve o mesmo objeto se nada muda.
 */
export function renameAccountInEntry(entry, oldName, newName) {
  if (entry.type === "transfer") {
    if (entry.fromAccount !== oldName && entry.toAccount !== oldName) return entry;
    return {
      ...entry,
      fromAccount: entry.fromAccount === oldName ? newName : entry.fromAccount,
      toAccount: entry.toAccount === oldName ? newName : entry.toAccount,
    };
  }
  return entry.account === oldName ? { ...entry, account: newName } : entry;
}
