import { supabase } from "./supabaseClient";
import { DEFAULT_CATEGORIES } from "./defaultCategories";
import {
  fromEntryRow, fromAccountRow, fromCategoryRows, fromGoalsRow, fromRuleRows,
  toEntryRow, toAccountRow, toGoalsRow,
} from "./mappers";

async function ensureDefaultCategories(userId) {
  const rows = [];
  Object.entries(DEFAULT_CATEGORIES).forEach(([type, cats]) => {
    Object.entries(cats).forEach(([name, subcategories]) => {
      rows.push({ user_id: userId, type, name, subcategories });
    });
  });
  const { error } = await supabase.from("categories").insert(rows);
  if (error) throw error;
}

export async function fetchAll(userId) {
  const [entriesRes, accountsRes, categoriesRes, goalsRes, rulesRes, descRulesRes] = await Promise.all([
    supabase.from("entries").select("*").order("date", { ascending: false }),
    supabase.from("accounts").select("*").order("created_at", { ascending: true }),
    supabase.from("categories").select("*"),
    supabase.from("goals").select("*").maybeSingle(),
    supabase.from("import_rules").select("*"),
    supabase.from("import_description_rules").select("*"),
  ]);

  for (const res of [entriesRes, accountsRes, categoriesRes, goalsRes, rulesRes, descRulesRes]) {
    if (res.error) throw res.error;
  }

  let categoryRows = categoriesRes.data;
  if (categoryRows.length === 0) {
    await ensureDefaultCategories(userId);
    const seeded = await supabase.from("categories").select("*");
    if (seeded.error) throw seeded.error;
    categoryRows = seeded.data;
  }

  return {
    entries: entriesRes.data.map(fromEntryRow),
    accounts: accountsRes.data.map(fromAccountRow),
    categories: fromCategoryRows(categoryRows),
    goals: fromGoalsRow(goalsRes.data),
    importRules: fromRuleRows(rulesRes.data),
    importDescriptionRules: fromRuleRows(descRulesRes.data),
  };
}

// --- entries ---

export async function insertEntry(entry, userId) {
  const { error } = await supabase.from("entries").insert(toEntryRow(entry, userId));
  if (error) throw error;
}

export async function insertEntriesBulk(entries, userId) {
  const rows = entries.map((e) => toEntryRow(e, userId));
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from("entries").insert(rows.slice(i, i + CHUNK));
    if (error) throw error;
  }
}

export async function updateEntry(id, entry, userId) {
  const { error } = await supabase.from("entries").update(toEntryRow(entry, userId)).eq("id", id);
  if (error) throw error;
}

export async function deleteEntry(id) {
  const { error } = await supabase.from("entries").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteEntriesForInstallmentCancel(userId, installmentGroupId, fromDate) {
  const { error } = await supabase
    .from("entries")
    .delete()
    .eq("user_id", userId)
    .eq("installment_group_id", installmentGroupId)
    .gte("date", fromDate);
  if (error) throw error;
}

export async function deleteAllEntries(userId) {
  const { error } = await supabase.from("entries").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function renameCategoryInEntries(userId, type, oldName, newName) {
  const { error } = await supabase
    .from("entries")
    .update({ category: newName })
    .eq("user_id", userId)
    .eq("type", type)
    .eq("category", oldName);
  if (error) throw error;
}

export async function renameAccountInEntries(userId, oldName, newName) {
  const { error } = await supabase
    .from("entries")
    .update({ account: newName })
    .eq("user_id", userId)
    .eq("account", oldName);
  if (error) throw error;
}

// --- accounts ---

export async function insertAccount(account, userId) {
  const { data, error } = await supabase.from("accounts").insert(toAccountRow(account, userId)).select().single();
  if (error) throw error;
  return fromAccountRow(data);
}

export async function updateAccount(id, patch) {
  const { error } = await supabase.from("accounts").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteAccount(id) {
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteAllAccounts(userId) {
  const { error } = await supabase.from("accounts").delete().eq("user_id", userId);
  if (error) throw error;
}

// --- categories ---

export async function insertCategory(userId, type, name) {
  const { error } = await supabase.from("categories").insert({ user_id: userId, type, name, subcategories: [] });
  if (error) throw error;
}

export async function deleteCategoryRow(userId, type, name) {
  const { error } = await supabase.from("categories").delete().eq("user_id", userId).eq("type", type).eq("name", name);
  if (error) throw error;
}

export async function renameCategoryRow(userId, type, oldName, newName) {
  const { error } = await supabase
    .from("categories")
    .update({ name: newName })
    .eq("user_id", userId)
    .eq("type", type)
    .eq("name", oldName);
  if (error) throw error;
}

export async function updateCategorySubcategories(userId, type, name, subcategories) {
  const { error } = await supabase
    .from("categories")
    .update({ subcategories })
    .eq("user_id", userId)
    .eq("type", type)
    .eq("name", name);
  if (error) throw error;
}

export async function deleteAllCategories(userId) {
  const { error } = await supabase.from("categories").delete().eq("user_id", userId);
  if (error) throw error;
}

// --- goals ---

export async function upsertGoals(goals, userId) {
  const { error } = await supabase.from("goals").upsert(toGoalsRow(goals, userId), { onConflict: "user_id" });
  if (error) throw error;
}

// --- import rules (shared by import_rules and import_description_rules) ---

export async function upsertRule(table, userId, rawKey, data) {
  const { error } = await supabase.from(table).upsert(
    { user_id: userId, raw_key: rawKey, data },
    { onConflict: "user_id,raw_key" }
  );
  if (error) throw error;
}

export async function deleteRule(table, userId, rawKey) {
  const { error } = await supabase.from(table).delete().eq("user_id", userId).eq("raw_key", rawKey);
  if (error) throw error;
}

export async function bulkUpsertRules(table, userId, rulesObject) {
  const rows = Object.entries(rulesObject).map(([rawKey, data]) => ({ user_id: userId, raw_key: rawKey, data }));
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "user_id,raw_key" });
  if (error) throw error;
}

export async function deleteAllRules(userId) {
  const [a, b] = await Promise.all([
    supabase.from("import_rules").delete().eq("user_id", userId),
    supabase.from("import_description_rules").delete().eq("user_id", userId),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
}
