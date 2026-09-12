import { supabase } from "./supabaseClient";
import { DEFAULT_CATEGORIES } from "./defaultCategories";
import {
  fromEntryRow, fromAccountRow, fromCategoryRows, fromGoalsRow, fromRuleRows,
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
