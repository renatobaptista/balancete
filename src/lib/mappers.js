export function toEntryRow(entry, userId) {
  const isTransfer = entry.type === "transfer";
  return {
    id: entry.id,
    user_id: userId,
    type: entry.type,
    amount: entry.amount,
    currency: isTransfer ? null : (entry.currency || "BRL"),
    category: isTransfer ? null : entry.category,
    subcategory: isTransfer ? null : (entry.subcategory || ""),
    account: isTransfer ? null : entry.account,
    from_account: isTransfer ? entry.fromAccount : null,
    to_account: isTransfer ? entry.toAccount : null,
    to_amount: isTransfer ? entry.toAmount : null,
    from_currency: isTransfer ? (entry.fromCurrency || "BRL") : null,
    to_currency: isTransfer ? (entry.toCurrency || "BRL") : null,
    description: entry.description || "",
    notes: entry.notes || "",
    date: entry.date,
    installment_group_id: entry.installmentGroupId || null,
    installment_number: entry.installmentNumber || null,
    installment_count: entry.installmentCount || null,
  };
}

export function fromEntryRow(row) {
  const base = {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    description: row.description || "",
    notes: row.notes || "",
    date: row.date,
  };
  if (row.type === "transfer") {
    return {
      ...base,
      fromAccount: row.from_account,
      toAccount: row.to_account,
      toAmount: row.to_amount != null ? Number(row.to_amount) : Number(row.amount),
      fromCurrency: row.from_currency || "BRL",
      toCurrency: row.to_currency || "BRL",
    };
  }
  const out = {
    ...base,
    category: row.category,
    subcategory: row.subcategory || "",
    account: row.account,
    currency: row.currency || "BRL",
  };
  if (row.installment_group_id) {
    out.installmentGroupId = row.installment_group_id;
    out.installmentNumber = row.installment_number;
    out.installmentCount = row.installment_count;
  }
  return out;
}

export function toAccountRow(account, userId) {
  return {
    user_id: userId,
    name: account.name,
    kind: account.kind || "corrente",
    currency: account.currency || "BRL",
    active: account.active !== false,
    initial_balance: account.initialBalance || 0,
  };
}

export function fromAccountRow(row) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    active: row.active,
    initialBalance: Number(row.initial_balance),
  };
}

export function fromCategoryRows(rows) {
  const out = { income: {}, expense: {}, invest: {} };
  rows.forEach((r) => {
    if (!out[r.type]) out[r.type] = {};
    out[r.type][r.name] = r.subcategories || [];
  });
  return out;
}

export function toGoalsRow(goals, userId) {
  return {
    user_id: userId,
    limits: goals.limits || {},
    invest_target: goals.investTarget || 0,
  };
}

export function fromGoalsRow(row) {
  if (!row) return { limits: {}, investTarget: 0 };
  return { limits: row.limits || {}, investTarget: Number(row.invest_target) || 0 };
}

export function fromRuleRows(rows) {
  const out = {};
  rows.forEach((r) => { out[r.raw_key] = r.data; });
  return out;
}
