import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import {
  Plus, Trash2, ChevronLeft, ChevronRight, Wallet, TrendingUp,
  TrendingDown, PiggyBank, Target, X, Check, Settings, Pencil, Upload,
  Landmark, CreditCard, ArrowRightLeft, RotateCcw, AlertTriangle,
  Download, HardDrive, LogOut
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid
} from "recharts";
import * as XLSX from "xlsx";
import { DEFAULT_CATEGORIES } from "./lib/defaultCategories";
import {
  fetchAll,
  insertEntry, insertEntriesBulk, updateEntry, deleteEntry as dbDeleteEntry, deleteEntriesForInstallmentCancel,
  insertCategory, deleteCategoryRow, renameCategoryRow, updateCategorySubcategories, renameCategoryInEntries,
  upsertGoals,
  insertAccount, updateAccount, deleteAccount as dbDeleteAccount, renameAccountInEntries,
} from "./lib/db";
import { supabase } from "./lib/supabaseClient";

const TYPE_META = {
  income: { label: "Entrada", color: "var(--income)", soft: "var(--income-soft)", icon: TrendingUp },
  expense: { label: "Saída", color: "var(--expense)", soft: "var(--expense-soft)", icon: TrendingDown },
  invest: { label: "Investimento", color: "var(--invest)", soft: "var(--invest-soft)", icon: PiggyBank },
};

const SECTION_LABEL = { income: "Entradas", expense: "Saídas", invest: "Investimentos" };

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const STORAGE_KEY = "balancete-data";

function fmt(n, currency = "BRL") {
  return (Number(n) || 0).toLocaleString(currency === "USD" ? "en-US" : "pt-BR", { style: "currency", currency });
}
function fmtCompact(n, currency = "BRL") {
  const v = Number(n) || 0;
  return v.toLocaleString(currency === "USD" ? "en-US" : "pt-BR", { style: "currency", currency, maximumFractionDigits: 0 });
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function uid() {
  return crypto.randomUUID();
}
function addMonthsToDate(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const totalMonths = (m - 1) + n;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(d, daysInTargetMonth);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}
function monthKey(y, m) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}
function parseMonthStr(str) {
  const [y, m] = str.split("-").map(Number);
  return { y, m: m - 1 };
}

function sortPt(arr) {
  return [...arr].sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" }));
}

function normalizeHeader(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function excelSerialToDate(serial) {
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400 * 1000;
  return new Date(utcMs);
}

function parseFlexibleDate(val) {
  if (val instanceof Date && !isNaN(val)) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, "0")}-${String(val.getDate()).padStart(2, "0")}`;
  }
  if (typeof val === "number" && val > 20000 && val < 90000) {
    const d = excelSerialToDate(val);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const str = String(val || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const br = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (br) {
    let [, d, m, y] = br;
    if (y.length === 2) y = "20" + y;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

function formatDateBr(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function parseFlexibleNumber(val) {
  if (typeof val === "number") return val;
  let str = String(val || "").trim();
  if (!str) return null;
  str = str.replace(/[^0-9,.\-]/g, "");
  if (str.includes(",") && str.includes(".")) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  }
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

export default function App({ session }) {
  const userId = session.user.id;
  const [entries, setEntries] = useState([]);
  const [goals, setGoals] = useState({ limits: {}, investTarget: 0 });
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [accounts, setAccounts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const [formOpen, setFormOpen] = useState(false);
  const [fType, setFType] = useState("expense");
  const [fAmount, setFAmount] = useState("");
  const [fCategory, setFCategory] = useState(Object.keys(DEFAULT_CATEGORIES.expense)[0]);
  const [fSubcategory, setFSubcategory] = useState(
    DEFAULT_CATEGORIES.expense[Object.keys(DEFAULT_CATEGORIES.expense)[0]][0] || "Geral"
  );
  const [fAccount, setFAccount] = useState("");
  const [fToAccount, setFToAccount] = useState("");
  const [fToAmount, setFToAmount] = useState("");
  const [accountFilterDashboard, setAccountFilterDashboard] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [appliedDescHint, setAppliedDescHint] = useState(null);
  const [fInstallmentsOn, setFInstallmentsOn] = useState(false);
  const [fInstallmentCurrent, setFInstallmentCurrent] = useState(1);
  const [fInstallmentsTotal, setFInstallmentsTotal] = useState(2);
  const [fDate, setFDate] = useState(todayISO());
  const [formError, setFormError] = useState("");
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [pendingEditScope, setPendingEditScope] = useState(false);

  const [addingLimitFor, setAddingLimitFor] = useState("");
  const [limitDraft, setLimitDraft] = useState("");
  const [targetDraft, setTargetDraft] = useState("");
  const [editingTarget, setEditingTarget] = useState(false);

  const [managerOpen, setManagerOpen] = useState(false);
  const [managerType, setManagerType] = useState("expense");
  const [newCatDraft, setNewCatDraft] = useState("");
  const [newSubDraft, setNewSubDraft] = useState({});
  const [editing, setEditing] = useState(null);

  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [restoreSuccess, setRestoreSuccess] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountKind, setNewAccountKind] = useState("corrente");
  const [newAccountCurrency, setNewAccountCurrency] = useState("BRL");
  const [editingAccount, setEditingAccount] = useState(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState(1);
  const [importFileName, setImportFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [importHeaders, setImportHeaders] = useState([]);
  const [importDataRows, setImportDataRows] = useState([]);
  const [importColMap, setImportColMap] = useState({ date: 0, desc: 1, value: 2, category: 3, account: -1 });
  const [importCategoryColKind, setImportCategoryColKind] = useState("category");
  const [importCatMap, setImportCatMap] = useState({});
  const [importAccountMap, setImportAccountMap] = useState({});
  const [importRules, setImportRules] = useState({});
  const [importDescriptionRules, setImportDescriptionRules] = useState({});
  const [importDescriptionOverrides, setImportDescriptionOverrides] = useState({});
  const [expandedCatRows, setExpandedCatRows] = useState({});
  const [editingDescKey, setEditingDescKey] = useState(null);
  const [editingDescDraft, setEditingDescDraft] = useState(null);
  const [importResult, setImportResult] = useState(null);

  const [reportEndStr, setReportEndStr] = useState(monthKey(now.getFullYear(), now.getMonth()));
  const [accountFilterReport, setAccountFilterReport] = useState("");
  const [reportStartStr, setReportStartStr] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 4, 1);
    return monthKey(d.getFullYear(), d.getMonth());
  });

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchAll(userId);
        setEntries(data.entries);
        setAccounts(data.accounts);
        setCategories(data.categories);
        setGoals(data.goals);
        setImportRules(data.importRules);
        setImportDescriptionRules(data.importDescriptionRules);
      } catch (e) {
        setSaveError(true);
      } finally {
        setLoaded(true);
      }
    })();
  }, [userId]);

  function defaultSubcategoryFor(type, category) {
    const subs = categories[type]?.[category] || [];
    return subs[0] || "Geral";
  }

  useEffect(() => {
    const names = Object.keys(categories[fType] || {});
    if (!names.includes(fCategory)) {
      const nextCat = names[0] || "";
      setFCategory(nextCat);
      setFSubcategory(nextCat ? defaultSubcategoryFor(fType, nextCat) : "");
    }
  }, [fType, categories, fCategory]);

  function resetFormFields() {
    setFAmount("");
    setFToAmount("");
    setFDesc("");
    setFNotes("");
    setFDate(todayISO());
    setFType("expense");
    setFAccount("");
    setFToAccount("");
    setFInstallmentsOn(false);
    setFInstallmentCurrent(1);
    setFInstallmentsTotal(2);
    setFormError("");
    setEditingEntryId(null);
    setPendingEditScope(false);
    setAppliedDescHint(null);
    setFormOpen(false);
  }

  function openNewEntryForm() {
    resetFormFields();
    setFormOpen(true);
  }

  function openEditEntryForm(entry) {
    setEditingEntryId(entry.id);
    setPendingEditScope(false);
    setFormError("");
    setFInstallmentsOn(false);
    setAppliedDescHint(null);
    setFAmount(String(entry.amount));
    setFDesc(entry.description || "");
    setFNotes(entry.notes || "");
    setFDate(entry.date);
    if (entry.type === "transfer") {
      setFType("transfer");
      setFAccount(entry.fromAccount);
      setFToAccount(entry.toAccount);
      setFToAmount(entry.toAmount != null ? String(entry.toAmount) : String(entry.amount));
    } else {
      setFType(entry.type);
      setFCategory(entry.category);
      setFSubcategory(entry.subcategory || "");
      setFAccount(entry.account || "");
      setFToAmount("");
    }
    setFormOpen(true);
  }

  function applyDescriptionRuleIfKnown() {
    if (fType === "transfer") return;
    const key = normalizeHeader(fDesc.trim());
    if (!key) { setAppliedDescHint(null); return; }
    const rule = importDescriptionRules[key];
    if (rule && rule.category && !rule.ignore) {
      setFType(rule.type);
      setFCategory(rule.category);
      setFSubcategory(rule.subcategory || defaultSubcategoryFor(rule.type, rule.category));
      setAppliedDescHint({ category: rule.category, subcategory: rule.subcategory });
    } else {
      setAppliedDescHint(null);
    }
  }

  function learnDescriptionRule(description, type, category, subcategory) {
    const desc = (description || "").trim();
    if (!desc) return;
    const key = normalizeHeader(desc);
    setImportDescriptionRules((prev) => ({ ...prev, [key]: { type, category, subcategory, ignore: false } }));
  }

  function saveEntry() {
    const amountNum = parseFloat(String(fAmount).replace(",", "."));
    if (!amountNum || amountNum <= 0) { setFormError("Informe um valor válido."); return; }
    if (!fDate) { setFormError("Informe a data."); return; }

    if (fType === "transfer") {
      if (!fAccount) { setFormError("Selecione a conta de origem."); return; }
      if (!fToAccount) { setFormError("Selecione a conta de destino."); return; }
      if (fAccount === fToAccount) { setFormError("A conta de origem e destino não podem ser a mesma."); return; }
      const fromCurrency = getAccountCurrency(fAccount);
      const toCurrency = getAccountCurrency(fToAccount);
      const crossCurrency = fromCurrency !== toCurrency;
      let toAmountNum = amountNum;
      if (crossCurrency) {
        toAmountNum = parseFloat(String(fToAmount).replace(",", "."));
        if (!toAmountNum || toAmountNum <= 0) { setFormError("Informe o valor recebido na conta de destino."); return; }
      }
      setFormError("");
      if (editingEntryId) {
        const nextEntry = {
          ...entries.find((e) => e.id === editingEntryId),
          type: "transfer", amount: amountNum, toAmount: toAmountNum, fromCurrency, toCurrency,
          fromAccount: fAccount, toAccount: fToAccount, description: fDesc.trim(), notes: fNotes.trim(), date: fDate,
        };
        setEntries((prev) => prev.map((e) => (e.id === editingEntryId ? nextEntry : e)));
        updateEntry(editingEntryId, nextEntry, userId).catch(() => setSaveError(true));
        resetFormFields();
        return;
      }
      const entry = {
        id: uid(),
        type: "transfer",
        amount: amountNum,
        toAmount: toAmountNum,
        fromCurrency,
        toCurrency,
        fromAccount: fAccount,
        toAccount: fToAccount,
        description: fDesc.trim(),
        notes: fNotes.trim(),
        date: fDate,
      };
      setEntries((prev) => [entry, ...prev]);
      insertEntry(entry, userId).catch(() => setSaveError(true));
      resetFormFields();
      return;
    }

    if (!fCategory) { setFormError("Selecione uma categoria."); return; }
    if (!fSubcategory) { setFormError("Selecione uma subcategoria."); return; }
    if (!fAccount) { setFormError("Selecione uma conta."); return; }
    const currency = getAccountCurrency(fAccount);

    if (editingEntryId) {
      const original = entries.find((e) => e.id === editingEntryId);
      setFormError("");
      if (!(categories[fType][fCategory] || []).includes(fSubcategory)) {
        addSubcategory(fType, fCategory, fSubcategory);
      }
      if (original && original.installmentCount) {
        setPendingEditScope(true);
        return;
      }
      const nextEntry = {
        ...original, type: fType, amount: amountNum, category: fCategory, subcategory: fSubcategory,
        account: fAccount.trim(), currency, description: fDesc.trim(), notes: fNotes.trim(), date: fDate,
      };
      setEntries((prev) => prev.map((e) => (e.id === editingEntryId ? nextEntry : e)));
      updateEntry(editingEntryId, nextEntry, userId).catch(() => setSaveError(true));
      learnDescriptionRule(fDesc, fType, fCategory, fSubcategory);
      resetFormFields();
      return;
    }

    const useInstallments = fType === "expense" && fInstallmentsOn;
    const totalCount = Math.max(2, parseInt(fInstallmentsTotal, 10) || 2);
    const currentNum = Math.min(totalCount, Math.max(1, parseInt(fInstallmentCurrent, 10) || 1));
    if (useInstallments && totalCount < 2) { setFormError("Informe pelo menos 2 parcelas."); return; }
    setFormError("");

    if (!(categories[fType][fCategory] || []).includes(fSubcategory)) {
      addSubcategory(fType, fCategory, fSubcategory);
    }

    if (useInstallments) {
      const groupId = uid();
      const newEntries = [];
      for (let i = currentNum - 1; i < totalCount; i++) {
        newEntries.push({
          id: uid(),
          type: fType,
          amount: amountNum,
          category: fCategory,
          subcategory: fSubcategory,
          account: fAccount.trim(),
          currency,
          description: fDesc.trim(),
          notes: fNotes.trim(),
          date: addMonthsToDate(fDate, i - (currentNum - 1)),
          installmentGroupId: groupId,
          installmentNumber: i + 1,
          installmentCount: totalCount,
        });
      }
      setEntries((prev) => [...newEntries, ...prev]);
      insertEntriesBulk(newEntries, userId).catch(() => setSaveError(true));
      learnDescriptionRule(fDesc, fType, fCategory, fSubcategory);
      resetFormFields();
      return;
    }

    const entry = {
      id: uid(),
      type: fType,
      amount: amountNum,
      category: fCategory,
      subcategory: fSubcategory,
      account: fAccount.trim(),
      currency,
      description: fDesc.trim(),
      notes: fNotes.trim(),
      date: fDate,
    };
    setEntries((prev) => [entry, ...prev]);
    insertEntry(entry, userId).catch(() => setSaveError(true));
    learnDescriptionRule(fDesc, fType, fCategory, fSubcategory);
    resetFormFields();
  }

  function applyInstallmentEdit(scope) {
    const amountNum = parseFloat(String(fAmount).replace(",", "."));
    const original = entries.find((e) => e.id === editingEntryId);
    if (!original) { resetFormFields(); return; }
    const changed = [];
    const nextEntries = entries.map((e) => {
      if (e.installmentGroupId !== original.installmentGroupId) return e;
      if (scope === "single" && e.id !== original.id) return e;
      if (scope === "future" && e.date < original.date) return e;
      const isThisOne = e.id === original.id;
      const next = {
        ...e,
        type: fType,
        amount: amountNum,
        category: fCategory,
        subcategory: fSubcategory,
        account: fAccount.trim(),
        currency: getAccountCurrency(fAccount),
        description: fDesc.trim(),
        notes: fNotes.trim(),
        date: isThisOne ? fDate : e.date,
      };
      changed.push(next);
      return next;
    });
    setEntries(nextEntries);
    Promise.all(changed.map((e) => updateEntry(e.id, e, userId))).catch(() => setSaveError(true));
    learnDescriptionRule(fDesc, fType, fCategory, fSubcategory);
    resetFormFields();
  }

  function deleteEntry(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    dbDeleteEntry(id).catch(() => setSaveError(true));
  }
  function cancelRemainingInstallments(entry) {
    setEntries((prev) => prev.filter((e) =>
      !(e.installmentGroupId === entry.installmentGroupId && e.date >= entry.date)
    ));
    deleteEntriesForInstallmentCancel(userId, entry.installmentGroupId, entry.date).catch(() => setSaveError(true));
  }

  function setLimit(category, value) {
    const next = { ...goals, limits: { ...goals.limits, [category]: value } };
    setGoals(next);
    upsertGoals(next, userId).catch(() => setSaveError(true));
  }
  function removeLimit(category) {
    const nextLimits = { ...goals.limits };
    delete nextLimits[category];
    const next = { ...goals, limits: nextLimits };
    setGoals(next);
    upsertGoals(next, userId).catch(() => setSaveError(true));
  }
  function setInvestTarget(value) {
    const next = { ...goals, investTarget: value };
    setGoals(next);
    upsertGoals(next, userId).catch(() => setSaveError(true));
  }

  function addCategory(type, name) {
    const clean = name.trim();
    if (!clean) return;
    if (categories[type] && categories[type][clean] !== undefined) return;
    setCategories((prev) => ({ ...prev, [type]: { ...prev[type], [clean]: [] } }));
    insertCategory(userId, type, clean).catch(() => setSaveError(true));
  }
  function deleteCategory(type, name) {
    setCategories((prev) => {
      const next = { ...prev[type] };
      delete next[name];
      return { ...prev, [type]: next };
    });
    deleteCategoryRow(userId, type, name).catch(() => setSaveError(true));
  }
  function renameCategory(type, oldName, newName) {
    const clean = (newName || "").trim();
    if (!clean || clean === oldName) return;
    if (categories[type][clean] !== undefined) return;
    const nextTypeCategories = {};
    Object.entries(categories[type]).forEach(([k, v]) => {
      nextTypeCategories[k === oldName ? clean : k] = v;
    });
    setCategories((prev) => ({ ...prev, [type]: nextTypeCategories }));
    renameCategoryRow(userId, type, oldName, clean).catch(() => setSaveError(true));
    setEntries((prev) => prev.map((e) => (e.type === type && e.category === oldName ? { ...e, category: clean } : e)));
    renameCategoryInEntries(userId, type, oldName, clean).catch(() => setSaveError(true));
    if (goals.limits[oldName] !== undefined) {
      const nextLimits = { ...goals.limits };
      nextLimits[clean] = nextLimits[oldName];
      delete nextLimits[oldName];
      const nextGoals = { ...goals, limits: nextLimits };
      setGoals(nextGoals);
      upsertGoals(nextGoals, userId).catch(() => setSaveError(true));
    }
  }
  function addSubcategory(type, category, sub) {
    const clean = sub.trim();
    if (!clean) return;
    const list = categories[type][category] || [];
    if (list.includes(clean)) return;
    const nextList = [...list, clean];
    setCategories((prev) => ({ ...prev, [type]: { ...prev[type], [category]: nextList } }));
    updateCategorySubcategories(userId, type, category, nextList).catch(() => setSaveError(true));
  }
  function deleteSubcategory(type, category, sub) {
    const nextList = (categories[type][category] || []).filter((s) => s !== sub);
    setCategories((prev) => ({ ...prev, [type]: { ...prev[type], [category]: nextList } }));
    updateCategorySubcategories(userId, type, category, nextList).catch(() => setSaveError(true));
  }

  function addAccount(name, kind, currency) {
    const clean = name.trim();
    if (!clean) return;
    if (accounts.some((a) => a.name === clean)) return;
    const draft = { name: clean, kind: kind || "corrente", currency: currency || "BRL", active: true, initialBalance: 0 };
    insertAccount(draft, userId)
      .then((saved) => setAccounts((prev) => [...prev, saved]))
      .catch(() => setSaveError(true));
  }
  function renameAccount(oldName, newName) {
    const clean = (newName || "").trim();
    if (!clean || clean === oldName) return;
    if (accounts.some((a) => a.name === clean)) return;
    const account = accounts.find((a) => a.name === oldName);
    if (!account) return;
    setAccounts((prev) => prev.map((a) => (a.name === oldName ? { ...a, name: clean } : a)));
    updateAccount(account.id, { name: clean }).catch(() => setSaveError(true));
    setEntries((prev) => prev.map((e) => (e.account === oldName ? { ...e, account: clean } : e)));
    renameAccountInEntries(userId, oldName, clean).catch(() => setSaveError(true));
  }
  function deleteAccount(name) {
    const account = accounts.find((a) => a.name === name);
    setAccounts((prev) => prev.filter((a) => a.name !== name));
    if (account) dbDeleteAccount(account.id).catch(() => setSaveError(true));
  }
  function patchAccountByName(name, localPatch, dbPatch) {
    const account = accounts.find((a) => a.name === name);
    setAccounts((prev) => prev.map((a) => (a.name === name ? { ...a, ...localPatch } : a)));
    if (account) updateAccount(account.id, dbPatch).catch(() => setSaveError(true));
  }
  function setAccountKind(name, kind) {
    patchAccountByName(name, { kind }, { kind });
  }
  function setAccountCurrency(name, currency) {
    patchAccountByName(name, { currency }, { currency });
  }
  function setAccountActive(name, active) {
    patchAccountByName(name, { active }, { active });
  }
  function setAccountInitialBalance(name, value) {
    patchAccountByName(name, { initialBalance: value }, { initial_balance: value });
  }
  function getAccountCurrency(name) {
    return accounts.find((a) => a.name === name)?.currency || "BRL";
  }
  function currencyPrefix(accountName) {
    return getAccountCurrency(accountName) === "USD" ? "US$" : "R$";
  }
  function getAccountKind(name) {
    return accounts.find((a) => a.name === name)?.kind || "corrente";
  }
  function findMatchingAccountName(rawText) {
    const key = normalizeHeader(rawText);
    if (!key) return null;
    const found = accounts.find((a) => normalizeHeader(a.name) === key);
    return found ? found.name : null;
  }
  function renderAccountOptions(excludeName) {
    const correntes = sortPt(
      accounts.filter((a) => a.kind === "corrente" && a.active !== false && a.name !== excludeName).map((a) => a.name)
    );
    const creditos = sortPt(
      accounts.filter((a) => a.kind === "credito" && a.active !== false && a.name !== excludeName).map((a) => a.name)
    );
    const label = (name) => `${name}${getAccountCurrency(name) === "USD" ? " (US$)" : ""}`;
    return (
      <>
        <option value="">Selecione</option>
        {correntes.length > 0 && (
          <optgroup label="Contas correntes">
            {correntes.map((name) => <option key={name} value={name}>{label(name)}</option>)}
          </optgroup>
        )}
        {creditos.length > 0 && (
          <optgroup label="Cartões de crédito">
            {creditos.map((name) => <option key={name} value={name}>{label(name)}</option>)}
          </optgroup>
        )}
      </>
    );
  }
  function renderImportAccountOptions() {
    const existingNames = accounts.filter((a) => a.active !== false).map((a) => a.name);
    const newNames = Object.keys(importAccountMap).filter((n) => importAccountMap[n]?.include !== false);
    const all = sortPt(Array.from(new Set([...existingNames, ...newNames])));
    return (
      <>
        <option value="">(usar conta da planilha)</option>
        {all.map((name) => <option key={name} value={name}>{name}</option>)}
      </>
    );
  }
  function getAccountBalance(name) {
    const acc = accounts.find((a) => a.name === name);
    const initial = acc?.initialBalance || 0;
    const movement = entries.reduce((s, e) => {
      if (e.type === "transfer") {
        if (e.fromAccount === name) return s - e.amount;
        if (e.toAccount === name) return s + (e.toAmount ?? e.amount);
        return s;
      }
      if (e.account !== name) return s;
      if (e.type === "income") return s + e.amount;
      if (e.type === "expense") return s - e.amount;
      if (e.type === "invest") return s - e.amount;
      return s;
    }, 0);
    return initial + movement;
  }

  function resetEntriesOnly() {
    setEntries([]);
    setCursor({ y: now.getFullYear(), m: now.getMonth() });
    setAccountFilterDashboard("");
    setAccountFilterReport("");
    setResetConfirmOpen(false);
  }

  function buildBackupPayload() {
    return {
      app: "balancete",
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
      goals,
      categories,
      accounts,
      importRules,
      importDescriptionRules,
    };
  }

  function exportBackup() {
    const payload = buildBackupPayload();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `balancete-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function restoreBackupFile(file) {
    setRestoreError("");
    setRestoreSuccess("");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (!parsed || !Array.isArray(parsed.entries)) {
          setRestoreError("Esse arquivo não parece ser um backup válido do Balancete.");
          return;
        }
        setEntries(parsed.entries || []);
        setGoals(parsed.goals || { limits: {}, investTarget: 0 });
        setCategories(parsed.categories || DEFAULT_CATEGORIES);
        setAccounts((parsed.accounts || []).map((a) => ({ active: true, initialBalance: 0, ...a })));
        setImportRules(parsed.importRules || {});
        setImportDescriptionRules(parsed.importDescriptionRules || {});
        setRestoreSuccess(`Backup restaurado: ${parsed.entries.length} lançamentos carregados.`);
      } catch (e) {
        setRestoreError("Não conseguimos ler esse arquivo. Confira se é um backup .json exportado pelo Balancete.");
      }
    };
    reader.readAsText(file);
  }

  function resetAllData() {
    setEntries([]);
    setGoals({ limits: {}, investTarget: 0 });
    setCategories(DEFAULT_CATEGORIES);
    setAccounts([]);
    setImportRules({});
    setImportDescriptionRules({});
    setCursor({ y: now.getFullYear(), m: now.getMonth() });
    setAccountFilterDashboard("");
    setAccountFilterReport("");
    setResetConfirmOpen(false);
    setManagerOpen(false);
    setAccountManagerOpen(false);
    setImportOpen(false);
  }

  function resetImport() {
    setImportStep(1);
    setImportFileName("");
    setImportError("");
    setImportHeaders([]);
    setImportDataRows([]);
    setImportColMap({ date: 0, desc: 1, value: 2, category: 3, account: -1 });
    setImportCategoryColKind("category");
    setImportCatMap({});
    setImportAccountMap({});
    setImportDescriptionOverrides({});
    setExpandedCatRows({});
    setEditingDescKey(null);
    setEditingDescDraft(null);
    setImportResult(null);
  }

  function handleImportFile(file) {
    setImportError("");
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
        if (!rows || rows.length < 2) {
          setImportError("Não encontramos linhas de dados nessa planilha.");
          return;
        }
        const headers = rows[0].map((h) => String(h ?? "").trim() || "(sem nome)");
        const dataRows = rows.slice(1).filter((r) => r.some((c) => c !== "" && c != null));

        const guess = (keyword) => {
          const idx = headers.findIndex((h) => normalizeHeader(h).includes(keyword));
          return idx >= 0 ? idx : 0;
        };
        const guessOptional = (keyword) => headers.findIndex((h) => normalizeHeader(h).includes(keyword));
        setImportHeaders(headers);
        setImportDataRows(dataRows);
        setImportColMap({
          date: guess("data"),
          desc: guess("descri"),
          value: guess("valor"),
          category: guess("categ"),
          account: guessOptional("conta"),
        });
        setImportStep(2);
      } catch (err) {
        setImportError("Não conseguimos ler esse arquivo. Confira se é um .xls, .xlsx ou .csv válido.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function buildAllSubMatches() {
    const allSubMatches = {};
    ["income", "expense", "invest"].forEach((type) => {
      Object.entries(categories[type] || {}).forEach(([cat, subs]) => {
        if (!allSubMatches[normalizeHeader(cat)]) allSubMatches[normalizeHeader(cat)] = { type, category: cat, subcategory: "" };
        (subs || []).forEach((s) => {
          allSubMatches[normalizeHeader(s)] = { type, category: cat, subcategory: s };
        });
      });
    });
    return allSubMatches;
  }

  function buildCategoryDefault(rawCat, stats, kind, ignore) {
    const key = normalizeHeader(rawCat);
    const uniqueSheetAccounts = Array.from(new Set(stats.sheetAccounts || []));
    const autoAccount = uniqueSheetAccounts.length === 1 && findMatchingAccountName(uniqueSheetAccounts[0])
      ? uniqueSheetAccounts[0]
      : "";
    const rule = importRules[key];
    if (rule) {
      return { ...rule, account: rule.account || autoAccount, count: stats.count, sum: stats.sum, samples: stats.samples || [], byDescription: stats.byDescription || {}, sheetAccounts: stats.sheetAccounts || [], fromRule: true };
    }
    const allSubMatches = buildAllSubMatches();
    const match = allSubMatches[key];
    if (match) {
      return { account: autoAccount, ...match, ignore, count: stats.count, sum: stats.sum, samples: stats.samples || [], byDescription: stats.byDescription || {}, sheetAccounts: stats.sheetAccounts || [] };
    }
    const guessedType = stats.sum >= 0 ? "income" : "expense";
    if (kind === "subcategory") {
      const fallbackCategory = Object.keys(categories[guessedType] || {}).includes("Outros")
        ? "Outros"
        : Object.keys(categories[guessedType] || {})[0] || "Outros";
      return { type: guessedType, category: fallbackCategory, subcategory: rawCat, account: autoAccount, ignore, count: stats.count, sum: stats.sum, samples: stats.samples || [], byDescription: stats.byDescription || {}, sheetAccounts: stats.sheetAccounts || [] };
    }
    return { type: guessedType, category: rawCat, subcategory: "", account: autoAccount, ignore, count: stats.count, sum: stats.sum, samples: stats.samples || [], byDescription: stats.byDescription || {}, sheetAccounts: stats.sheetAccounts || [] };
  }

  function forgetImportRule(rawCat) {
    const key = normalizeHeader(rawCat);
    setImportRules((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    updateImportCatMap(rawCat, { fromRule: false });
  }

  function applyCategoryKindToAll(kind) {
    setImportCategoryColKind(kind);
    setImportCatMap((prev) => {
      const next = {};
      Object.entries(prev).forEach(([rawCat, m]) => {
        const key = normalizeHeader(rawCat);
        const isTransfer = key.includes("transfer");
        next[rawCat] = buildCategoryDefault(rawCat, { count: m.count, sum: m.sum, samples: m.samples, byDescription: m.byDescription, sheetAccounts: m.sheetAccounts }, kind, isTransfer);
      });
      return next;
    });
  }

  function goToCategoryMapping() {
    const { date, desc, value, category, account } = importColMap;
    const byCategory = {};
    importDataRows.forEach((row) => {
      const rawCat = String(row[category] ?? "").trim() || "(sem categoria)";
      const val = parseFlexibleNumber(row[value]);
      const descText = String(row[desc] ?? "").trim();
      const parsedDate = parseFlexibleDate(row[date]);
      const accTextRaw = account >= 0 ? String(row[account] ?? "").trim() : "";
      const accText = accTextRaw ? (findMatchingAccountName(accTextRaw) || accTextRaw) : "";
      if (!byCategory[rawCat]) byCategory[rawCat] = { count: 0, sum: 0, samples: [], byDescription: {}, sheetAccounts: [] };
      byCategory[rawCat].count += 1;
      byCategory[rawCat].sum += val || 0;
      if (descText && byCategory[rawCat].samples.length < 4 && !byCategory[rawCat].samples.includes(descText)) {
        byCategory[rawCat].samples.push(descText);
      }
      if (accText && !byCategory[rawCat].sheetAccounts.includes(accText)) {
        byCategory[rawCat].sheetAccounts.push(accText);
      }
      if (descText) {
        if (!byCategory[rawCat].byDescription[descText]) {
          byCategory[rawCat].byDescription[descText] = { count: 0, sum: 0, firstDate: parsedDate, lastDate: parsedDate, sheetAccounts: [] };
        }
        const d = byCategory[rawCat].byDescription[descText];
        d.count += 1;
        d.sum += val || 0;
        if (parsedDate && (!d.firstDate || parsedDate < d.firstDate)) d.firstDate = parsedDate;
        if (parsedDate && (!d.lastDate || parsedDate > d.lastDate)) d.lastDate = parsedDate;
        if (accText && !d.sheetAccounts.includes(accText)) d.sheetAccounts.push(accText);
      }
    });

    const initialMap = {};
    Object.entries(byCategory).forEach(([rawCat, stats]) => {
      const key = normalizeHeader(rawCat);
      const isTransfer = key.includes("transfer");
      initialMap[rawCat] = buildCategoryDefault(rawCat, stats, importCategoryColKind, isTransfer);
    });
    setImportCatMap(initialMap);

    const initialDescOverrides = {};
    Object.values(byCategory).forEach((stats) => {
      Object.keys(stats.byDescription || {}).forEach((descText) => {
        const descKey = normalizeHeader(descText);
        if (importDescriptionRules[descKey]) {
          initialDescOverrides[descKey] = importDescriptionRules[descKey];
        }
      });
    });
    setImportDescriptionOverrides(initialDescOverrides);
    setExpandedCatRows({});

    if (account >= 0) {
      const knownAccounts = new Set(accounts.map((a) => a.name));
      const newAccounts = {};
      importDataRows.forEach((row) => {
        const rawAcc = String(row[account] ?? "").trim();
        if (rawAcc && !knownAccounts.has(rawAcc) && !newAccounts[rawAcc]) {
          newAccounts[rawAcc] = { kind: "corrente", include: true };
        }
      });
      setImportAccountMap(newAccounts);
    } else {
      setImportAccountMap({});
    }

    setImportStep(3);
  }

  function updateImportCatMap(rawCat, patch) {
    setImportCatMap((prev) => ({ ...prev, [rawCat]: { ...prev[rawCat], ...patch } }));
  }
  function updateImportAccountMap(rawAcc, patch) {
    setImportAccountMap((prev) => ({ ...prev, [rawAcc]: { ...prev[rawAcc], ...patch } }));
  }
  function toggleExpandCat(rawCat) {
    setExpandedCatRows((prev) => ({ ...prev, [rawCat]: !prev[rawCat] }));
  }
  function startEditDescription(descText, parentMapping, descStats) {
    const descKey = normalizeHeader(descText);
    const existing = importDescriptionOverrides[descKey];
    const uniqueDescAccounts = Array.from(new Set((descStats && descStats.sheetAccounts) || []));
    const autoAccount = uniqueDescAccounts.length === 1 && findMatchingAccountName(uniqueDescAccounts[0])
      ? uniqueDescAccounts[0]
      : (parentMapping.account || "");
    setEditingDescKey(descKey);
    setEditingDescDraft(existing
      ? { ...existing }
      : { type: parentMapping.type, category: parentMapping.category, subcategory: parentMapping.subcategory, account: autoAccount, ignore: false });
  }
  function cancelEditingDescription() {
    setEditingDescKey(null);
    setEditingDescDraft(null);
  }
  function saveDescriptionOverride() {
    setImportDescriptionOverrides((prev) => ({ ...prev, [editingDescKey]: editingDescDraft }));
    setEditingDescKey(null);
    setEditingDescDraft(null);
  }
  function removeDescriptionOverride(descText) {
    const descKey = normalizeHeader(descText);
    setImportDescriptionOverrides((prev) => {
      const next = { ...prev };
      delete next[descKey];
      return next;
    });
  }

  function commitImport() {
    const { date, desc, value, category, account } = importColMap;
    const existingSignatures = new Set(
      entries.filter((e) => e.type !== "transfer").map((e) => `${e.date}|${e.description}|${e.amount}|${e.type}|${e.account || ""}`)
    );
    const existingTransferSignatures = new Set(
      entries.filter((e) => e.type === "transfer").map((e) => `${e.date}|${e.description}|${e.amount}|${e.fromAccount}|${e.toAccount}`)
    );
    const newEntries = [];
    const categoriesPatch = JSON.parse(JSON.stringify(categories));
    let ignored = 0, invalid = 0, duplicates = 0, newCategoriesCount = 0, transfersDetected = 0;

    const normalRows = [];
    const transferCandidates = [];

    importDataRows.forEach((row) => {
      const rawCat = String(row[category] ?? "").trim() || "(sem categoria)";
      const mapping = importCatMap[rawCat];
      if (!mapping) { ignored += 1; return; }
      if (mapping.ignore) {
        if (account >= 0) {
          const parsedDate = parseFlexibleDate(row[date]);
          const parsedValue = parseFlexibleNumber(row[value]);
          const accountName = String(row[account] ?? "").trim();
          const descriptionText = String(row[desc] ?? "").trim() || rawCat;
          if (parsedDate && parsedValue != null && parsedValue !== 0 && accountName) {
            transferCandidates.push({ date: parsedDate, description: descriptionText, value: parsedValue, account: accountName, used: false });
          } else {
            ignored += 1;
          }
        } else {
          ignored += 1;
        }
        return;
      }
      normalRows.push({ row, rawCat, mapping });
    });

    const transferGroups = {};
    transferCandidates.forEach((c) => {
      const key = `${c.date}|${normalizeHeader(c.description)}`;
      if (!transferGroups[key]) transferGroups[key] = [];
      transferGroups[key].push(c);
    });

    Object.values(transferGroups).forEach((group) => {
      const negatives = group.filter((c) => c.value < 0);
      const positives = group.filter((c) => c.value > 0);
      negatives.forEach((neg) => {
        const match = positives.find((pos) =>
          !pos.used && Math.abs(Math.abs(pos.value) - Math.abs(neg.value)) < 0.01 && pos.account !== neg.account
        );
        if (match) {
          match.used = true;
          neg.used = true;
          const amount = Math.round(Math.abs(neg.value) * 100) / 100;
          const signature = `${neg.date}|${neg.description}|${amount}|${neg.account}|${match.account}`;
          if (existingTransferSignatures.has(signature)) { duplicates += 1; return; }
          existingTransferSignatures.add(signature);
          newEntries.push({
            id: uid(),
            type: "transfer",
            amount,
            fromAccount: neg.account,
            toAccount: match.account,
            description: neg.description,
            date: neg.date,
          });
          transfersDetected += 1;
        }
      });
    });
    transferCandidates.forEach((c) => { if (!c.used) ignored += 1; });

    normalRows.forEach(({ row, rawCat, mapping }) => {
      const parsedDate = parseFlexibleDate(row[date]);
      const parsedValue = parseFlexibleNumber(row[value]);
      if (!parsedDate || parsedValue == null || parsedValue === 0) { invalid += 1; return; }

      const description = String(row[desc] ?? "").trim() || rawCat;
      const descOverride = importDescriptionOverrides[normalizeHeader(description)];
      if (descOverride && descOverride.ignore) { ignored += 1; return; }

      const type = descOverride ? descOverride.type : mapping.type;
      const catName = (descOverride ? descOverride.category : mapping.category).trim() || "Outros";
      const subName = ((descOverride ? descOverride.subcategory : mapping.subcategory) || "").trim();
      const amount = Math.abs(parsedValue);
      const accountFromSheetRaw = account >= 0 ? String(row[account] ?? "").trim() : "";
      const accountFromSheet = accountFromSheetRaw ? (findMatchingAccountName(accountFromSheetRaw) || accountFromSheetRaw) : "";
      const accountName = (descOverride && descOverride.account) || mapping.account || accountFromSheet;

      const signature = `${parsedDate}|${description}|${amount}|${type}|${accountName}`;
      if (existingSignatures.has(signature)) { duplicates += 1; return; }
      existingSignatures.add(signature);

      if (!categoriesPatch[type][catName]) { categoriesPatch[type][catName] = []; newCategoriesCount += 1; }
      if (subName && !categoriesPatch[type][catName].includes(subName)) {
        categoriesPatch[type][catName].push(subName);
        newCategoriesCount += 1;
      }

      newEntries.push({
        id: uid(),
        type,
        amount,
        category: catName,
        subcategory: subName,
        account: accountName,
        description,
        date: parsedDate,
      });
    });

    setCategories(categoriesPatch);
    setEntries((prev) => [...newEntries, ...prev]);
    setImportRules((prev) => {
      const next = { ...prev };
      Object.entries(importCatMap).forEach(([rawCat, m]) => {
        next[normalizeHeader(rawCat)] = {
          type: m.type, category: m.category, subcategory: m.subcategory, account: m.account || "", ignore: !!m.ignore,
        };
      });
      return next;
    });
    if (Object.keys(importDescriptionOverrides).length > 0) {
      setImportDescriptionRules((prev) => ({ ...prev, ...importDescriptionOverrides }));
    }
    const discovered = Array.from(new Set(
      newEntries.flatMap((e) => e.type === "transfer" ? [e.fromAccount, e.toAccount] : [e.account]).filter(Boolean)
    ));
    const knownAccountNames = new Set(accounts.map((a) => a.name));
    const accountAdditions = discovered
      .filter((n) => !knownAccountNames.has(n) && importAccountMap[n]?.include !== false)
      .map((name) => ({ name, kind: importAccountMap[name]?.kind || "corrente", active: true, initialBalance: 0 }));
    if (accountAdditions.length > 0) {
      setAccounts((prev) => [...prev, ...accountAdditions]);
    }
    setImportResult({
      imported: newEntries.length,
      ignored,
      invalid,
      duplicates,
      newAccounts: accountAdditions.length,
      newCategories: newCategoriesCount,
      transfersDetected,
    });
    setImportStep(4);
  }

  const isFirstRun = loaded && entries.length === 0 && accounts.length === 0;

  const storageInfo = useMemo(() => {
    const byYear = {};
    let totalEntryBytes = 0;
    entries.forEach((e) => {
      const year = (e.date || "").slice(0, 4) || "sem-data";
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(e);
    });
    let biggestYear = null, biggestBytes = 0;
    Object.entries(byYear).forEach(([year, list]) => {
      const bytes = new Blob([JSON.stringify(list)]).size;
      totalEntryBytes += bytes;
      if (bytes > biggestBytes) { biggestBytes = bytes; biggestYear = year; }
    });
    const mainBytes = new Blob([JSON.stringify({ goals, categories, accounts, importRules, importDescriptionRules })]).size;
    const totalBytes = totalEntryBytes + mainBytes;
    const limitBytes = 5 * 1024 * 1024;
    const pct = Math.min(100, (biggestBytes / limitBytes) * 100);
    return {
      totalBytes,
      totalKb: totalBytes / 1024,
      biggestYear,
      biggestBytes,
      pct,
      entryCount: entries.length,
      yearCount: Object.keys(byYear).length,
      warn: pct >= 60,
    };
  }, [entries, goals, categories, accounts, importRules, importDescriptionRules]);

  const allAccounts = useMemo(
    () => sortPt(Array.from(new Set([...accounts.map((a) => a.name), ...entries.map((e) => e.account).filter(Boolean)]))),
    [entries, accounts]
  );

  const monthEntries = useMemo(() => {
    return entries
      .filter((e) => {
        const d = new Date(e.date + "T00:00:00");
        const inMonth = d.getFullYear() === cursor.y && d.getMonth() === cursor.m;
        if (!inMonth) return false;
        if (!accountFilterDashboard) return true;
        if (e.type === "transfer") {
          return e.fromAccount === accountFilterDashboard || e.toAccount === accountFilterDashboard;
        }
        return e.account === accountFilterDashboard;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [entries, cursor, accountFilterDashboard]);

  const dashboardCurrency = accountFilterDashboard ? getAccountCurrency(accountFilterDashboard) : "BRL";

  const monthEntriesInCurrency = useMemo(
    () => monthEntries.filter((e) => e.type === "transfer" || (e.currency || "BRL") === dashboardCurrency),
    [monthEntries, dashboardCurrency]
  );

  const totals = useMemo(() => {
    let income = 0, expense = 0, invest = 0;
    for (const e of monthEntriesInCurrency) {
      if (e.type === "income") income += e.amount;
      else if (e.type === "expense") expense += e.amount;
      else if (e.type === "invest") invest += e.amount;
    }
    return { income, expense, invest, balance: income - expense - invest };
  }, [monthEntriesInCurrency]);

  const allTimeInvested = useMemo(
    () => entries.filter((e) => e.type === "invest" && (e.currency || "BRL") === dashboardCurrency).reduce((s, e) => s + e.amount, 0),
    [entries, dashboardCurrency]
  );

  const expenseBreakdown = useMemo(() => {
    const map = {};
    for (const e of monthEntriesInCurrency) {
      if (e.type !== "expense") continue;
      map[e.category] = (map[e.category] || 0) + e.amount;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [monthEntriesInCurrency]);

  const dailyBalance = useMemo(() => {
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const byDay = {};
    for (const e of monthEntriesInCurrency) {
      if (e.type === "transfer") continue;
      const day = parseInt(e.date.slice(8, 10), 10);
      const sign = e.type === "income" ? 1 : -1;
      byDay[day] = (byDay[day] || 0) + sign * e.amount;
    }
    let running = 0;
    const data = [];
    for (let d = 1; d <= daysInMonth; d++) {
      running += byDay[d] || 0;
      data.push({ day: d, saldo: Math.round(running * 100) / 100 });
    }
    return data;
  }, [monthEntriesInCurrency, cursor]);

  const donutColors = ["#A6432C", "#93701D", "#5F6F4F", "#7C5A3B", "#8A4A5C", "#4F6F6A", "#B08040"];

  function changeMonth(delta) {
    setCursor((prev) => {
      let m = prev.m + delta;
      let y = prev.y;
      if (m < 0) { m = 11; y -= 1; }
      if (m > 11) { m = 0; y += 1; }
      return { y, m };
    });
  }

  const isCurrentMonth = cursor.y === now.getFullYear() && cursor.m === now.getMonth();

  const limitRows = useMemo(() => {
    const set = new Set([...Object.keys(goals.limits || {})]);
    for (const e of monthEntriesInCurrency) if (e.type === "expense") set.add(e.category);
    return Array.from(set).filter((c) => goals.limits && goals.limits[c] != null);
  }, [goals.limits, monthEntriesInCurrency]);

  const availableForLimit = sortPt(
    Object.keys(categories.expense || {}).filter((c) => !(goals.limits && goals.limits[c] != null))
  );

  const reportMonths = useMemo(() => {
    let start = parseMonthStr(reportStartStr);
    let end = parseMonthStr(reportEndStr);
    if (start.y * 12 + start.m > end.y * 12 + end.m) { const t = start; start = end; end = t; }
    const months = [];
    let y = start.y, m = start.m;
    let guard = 0;
    while ((y * 12 + m) <= (end.y * 12 + end.m) && guard < 36) {
      months.push({ y, m, key: monthKey(y, m), label: `${MONTH_ABBR[m]}/${String(y).slice(2)}` });
      m += 1;
      if (m > 11) { m = 0; y += 1; }
      guard += 1;
    }
    return months;
  }, [reportStartStr, reportEndStr]);

  const reportCurrency = accountFilterReport ? getAccountCurrency(accountFilterReport) : "BRL";

  const reportRangeEntries = useMemo(() => {
    if (reportMonths.length === 0) return [];
    const first = reportMonths[0];
    const last = reportMonths[reportMonths.length - 1];
    const startDate = `${first.y}-${String(first.m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(last.y, last.m + 1, 0).getDate();
    const endDate = `${last.y}-${String(last.m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return entries.filter((e) =>
      e.date >= startDate && e.date <= endDate &&
      (!accountFilterReport || e.account === accountFilterReport) &&
      (e.type === "transfer" || (e.currency || "BRL") === reportCurrency)
    );
  }, [entries, reportMonths, accountFilterReport, reportCurrency]);

  function buildSection(type) {
    const rangeEntries = reportRangeEntries.filter((e) => e.type === type);
    const catNames = new Set(Object.keys(categories[type] || {}));
    rangeEntries.forEach((e) => catNames.add(e.category));

    const rows = [];
    const sectionTotals = reportMonths.map(() => 0);
    let sectionAll = 0;

    Array.from(catNames).forEach((catName) => {
      const catEntries = rangeEntries.filter((e) => e.category === catName);
      if (catEntries.length === 0) return;
      const subNames = Array.from(new Set(catEntries.filter((e) => e.subcategory).map((e) => e.subcategory)));
      const hasNoSub = catEntries.some((e) => !e.subcategory);

      const sumForMonth = (list, mo) => list
        .filter((e) => {
          const d = new Date(e.date + "T00:00:00");
          return d.getFullYear() === mo.y && d.getMonth() === mo.m;
        })
        .reduce((s, e) => s + e.amount, 0);

      if (subNames.length === 0) {
        const values = reportMonths.map((mo) => sumForMonth(catEntries, mo));
        const total = values.reduce((a, b) => a + b, 0);
        rows.push({ label: catName, bold: true, values, total });
        values.forEach((v, i) => (sectionTotals[i] += v));
        sectionAll += total;
      } else {
        rows.push({ label: catName, header: true });
        const subRows = [];
        subNames.forEach((sub) => {
          const subEntries = catEntries.filter((e) => e.subcategory === sub);
          const values = reportMonths.map((mo) => sumForMonth(subEntries, mo));
          subRows.push({ label: sub, values, total: values.reduce((a, b) => a + b, 0) });
        });
        if (hasNoSub) {
          const noSubEntries = catEntries.filter((e) => !e.subcategory);
          const values = reportMonths.map((mo) => sumForMonth(noSubEntries, mo));
          subRows.push({ label: "(sem subcategoria)", values, total: values.reduce((a, b) => a + b, 0) });
        }
        rows.push(...subRows);
        const totalValues = reportMonths.map((_, i) => subRows.reduce((s, r) => s + r.values[i], 0));
        const totalAll = subRows.reduce((s, r) => s + r.total, 0);
        rows.push({ label: `Total - ${catName}`, bold: true, values: totalValues, total: totalAll });
        totalValues.forEach((v, i) => (sectionTotals[i] += v));
        sectionAll += totalAll;
      }
    });

    return { rows, sectionTotals, sectionAll };
  }

  const reportSections = useMemo(() => ({
    income: buildSection("income"),
    expense: buildSection("expense"),
    invest: buildSection("invest"),
  }), [reportRangeEntries, reportMonths, categories]);

  const saldoValues = useMemo(() => {
    return reportMonths.map((_, i) =>
      (reportSections.income.sectionTotals[i] || 0) -
      (reportSections.expense.sectionTotals[i] || 0) -
      (reportSections.invest.sectionTotals[i] || 0)
    );
  }, [reportSections, reportMonths]);
  const saldoAll = reportSections.income.sectionAll - reportSections.expense.sectionAll - reportSections.invest.sectionAll;

  const reportHasData = reportRangeEntries.length > 0;

  return (
    <div className="bc-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        .bc-root {
          --paper: #F6F2E9;
          --paper-card: #FBF9F3;
          --ink: #23281F;
          --ink-soft: #6B6A5C;
          --rule: #D9D2BE;
          --rule-strong: #C3BA9F;
          --income: #2F6F4F;
          --income-soft: #E3EEE6;
          --expense: #A6432C;
          --expense-soft: #F3E3DC;
          --invest: #93701D;
          --invest-soft: #EFE6C8;
          --transfer: #3E5C6E;
          --transfer-soft: #E2E8EA;
          font-family: 'Inter', sans-serif;
          color: var(--ink);
          background: var(--paper);
          padding: 24px;
          border-radius: 14px;
          max-width: 1020px;
          margin: 0 auto;
        }
        .bc-root * { box-sizing: border-box; }
        .bc-header {
          display: flex; align-items: flex-end; justify-content: space-between;
          margin-bottom: 18px; flex-wrap: wrap; gap: 12px;
        }
        .bc-title {
          font-family: 'Fraunces', serif; font-weight: 600; font-size: 30px;
          letter-spacing: -0.01em; margin: 0;
        }
        .bc-subtitle { font-size: 12.5px; color: var(--ink-soft); margin-top: 2px; }
        .bc-header-right { display: flex; align-items: center; gap: 10px; }
        .bc-icon-btn {
          border: 1px solid var(--rule-strong); background: var(--paper-card); color: var(--ink);
          border-radius: 8px; width: 34px; height: 34px; display: flex; align-items: center;
          justify-content: center; cursor: pointer;
        }
        .bc-icon-btn:hover { background: var(--rule); }
        .bc-icon-btn-danger:hover { background: var(--expense-soft); border-color: var(--expense); color: var(--expense); }
        .bc-month-nav {
          display: flex; align-items: center; gap: 10px;
          font-family: 'IBM Plex Mono', monospace; font-size: 13.5px;
        }
        .bc-month-nav button {
          border: 1px solid var(--rule-strong); background: var(--paper-card);
          color: var(--ink); border-radius: 8px; width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .bc-month-nav button:hover { background: var(--rule); }
        .bc-month-label { min-width: 150px; text-align: center; text-transform: capitalize; }
        .bc-today-btn {
          font-size: 11px; text-decoration: underline; color: var(--ink-soft);
          background: none; border: none; cursor: pointer; padding: 0;
        }

        .bc-tabs { display: flex; gap: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--rule); }
        .bc-tab {
          background: none; border: none; padding: 8px 2px; font-size: 13.5px; color: var(--ink-soft);
          cursor: pointer; border-bottom: 2px solid transparent; font-family: 'Inter', sans-serif;
        }
        .bc-tab.active { color: var(--ink); border-bottom-color: var(--ink); font-weight: 500; }

        .bc-welcome {
          background: var(--invest-soft); border: 1px solid var(--invest); border-radius: 12px;
          padding: 16px 18px; margin-bottom: 20px;
        }
        .bc-welcome-title { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; margin-bottom: 6px; }
        .bc-welcome-text { font-size: 13px; color: var(--ink); margin-bottom: 8px; line-height: 1.5; }
        .bc-welcome-steps { font-size: 13px; color: var(--ink); line-height: 1.9; padding-left: 18px; }
        .bc-welcome-steps .bc-manage-link { color: var(--invest); text-decoration: underline; font-size: 13px; }
        .bc-cards {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px;
        }
        .bc-currency-note { font-size: 11.5px; color: var(--ink-soft); margin-top: -12px; margin-bottom: 18px; }
        .bc-card {
          background: var(--paper-card); border: 1px solid var(--rule);
          border-top: 3px solid var(--card-accent, var(--rule-strong));
          border-radius: 10px; padding: 14px 16px;
        }
        .bc-card-label {
          font-size: 11.5px; color: var(--ink-soft); display: flex; align-items: center; gap: 6px;
          margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em;
        }
        .bc-card-value {
          font-family: 'IBM Plex Mono', monospace; font-size: 19px; font-weight: 500;
        }
        .bc-card-sub { font-size: 11px; color: var(--ink-soft); margin-top: 4px; }

        .bc-add-row { margin-bottom: 18px; }
        .bc-add-toggle {
          display: flex; align-items: center; gap: 8px; background: var(--ink); color: var(--paper);
          border: none; border-radius: 8px; padding: 10px 16px; font-size: 13.5px;
          font-weight: 500; cursor: pointer;
        }
        .bc-add-toggle:hover { opacity: 0.9; }

        .bc-form {
          background: var(--paper-card); border: 1px solid var(--rule); border-radius: 12px;
          padding: 16px; margin-top: 10px;
        }
        .bc-type-row { display: flex; gap: 8px; margin-bottom: 14px; }
        .bc-type-btn {
          flex: 1; padding: 9px 10px; border-radius: 8px; border: 1px solid var(--rule-strong);
          background: var(--paper); font-size: 13px; font-weight: 500; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--ink-soft);
        }
        .bc-type-btn.active-income { background: var(--income-soft); border-color: var(--income); color: var(--income); }
        .bc-type-btn.active-expense { background: var(--expense-soft); border-color: var(--expense); color: var(--expense); }
        .bc-type-btn.active-invest { background: var(--invest-soft); border-color: var(--invest); color: var(--invest); }
        .bc-type-btn.active-transfer { background: var(--transfer-soft); border-color: var(--transfer); color: var(--transfer); }

        .bc-form-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; align-items: end;
        }
        .bc-field label {
          display: block; font-size: 11px; color: var(--ink-soft); margin-bottom: 4px;
          text-transform: uppercase; letter-spacing: 0.03em;
        }
        .bc-field input, .bc-field select {
          width: 100%; padding: 8px 10px; border-radius: 7px; border: 1px solid var(--rule-strong);
          background: var(--paper); font-size: 13.5px; font-family: 'Inter', sans-serif; color: var(--ink);
        }
        .bc-field input:focus, .bc-field select:focus { outline: 2px solid var(--ink-soft); outline-offset: 1px; }
        .bc-field-hint { display: block; font-size: 10.5px; color: var(--expense); margin-top: 4px; }
        .bc-installment-toggle {
          display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink);
          padding: 8px 0; cursor: pointer;
        }
        .bc-installment-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
        .bc-installment-row input[type=number] {
          width: 56px; padding: 6px 8px; border-radius: 7px; border: 1px solid var(--rule-strong);
          background: var(--paper); font-size: 13px;
        }
        .bc-installment-row span { font-size: 12px; color: var(--ink-soft); }
        .bc-installment-preview {
          display: block; font-family: 'IBM Plex Mono', monospace; color: var(--expense) !important;
          font-size: 11px !important; margin-top: 6px; line-height: 1.4; white-space: normal;
        }
        .bc-installment-scope { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--rule); }
        .bc-installment-scope-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
        .bc-form-actions { display: flex; gap: 8px; margin-top: 14px; justify-content: space-between; align-items: center; }
        .bc-manage-link { background: none; border: none; color: var(--ink-soft); font-size: 12px; text-decoration: underline; cursor: pointer; padding: 0; }
        .bc-form-actions-left { display: flex; gap: 14px; }
        .bc-form-actions-right { display: flex; gap: 8px; }
        .bc-btn-primary {
          background: var(--ink); color: var(--paper); border: none; border-radius: 7px;
          padding: 9px 18px; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px;
        }
        .bc-btn-ghost {
          background: none; border: 1px solid var(--rule-strong); color: var(--ink-soft); border-radius: 7px;
          padding: 9px 14px; font-size: 13px; cursor: pointer;
        }
        .bc-btn-danger {
          background: var(--expense); color: var(--paper); border: none; border-radius: 7px;
          padding: 9px 18px; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px;
        }
        .bc-danger-option { padding: 12px 0; border-bottom: 1px dashed var(--rule); }
        .bc-danger-option:last-of-type { border-bottom: none; }
        .bc-storage-box { padding-bottom: 12px; margin-bottom: 4px; border-bottom: 1px dashed var(--rule); }
        .bc-storage-top {
          display: flex; justify-content: space-between; font-size: 11.5px; color: var(--ink-soft);
          margin-bottom: 6px; font-family: 'IBM Plex Mono', monospace;
        }

        .bc-main-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 18px; }
        @media (max-width: 760px) {
          .bc-main-grid { grid-template-columns: 1fr; }
          .bc-cards { grid-template-columns: repeat(2, 1fr); }
          .bc-form-grid { grid-template-columns: 1fr 1fr; }
        }

        .bc-ledger {
          background: var(--paper-card); border: 1px solid var(--rule); border-radius: 12px;
          padding: 4px 0; border-left: 3px solid var(--expense); overflow: hidden;
        }
        .bc-ledger-head {
          font-family: 'Fraunces', serif; font-size: 15px; font-weight: 600; padding: 12px 16px 8px;
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
        }
        .bc-ledger-filter {
          font-family: 'Inter', sans-serif; font-size: 11.5px; font-weight: 400; color: var(--ink-soft);
          border: 1px solid var(--rule-strong); border-radius: 6px; padding: 4px 8px; background: var(--paper);
        }
        .bc-ledger-account-balance {
          font-size: 11.5px; color: var(--ink-soft); padding: 0 16px 10px; font-family: 'IBM Plex Mono', monospace;
        }
        .bc-ledger-account-balance strong { color: var(--ink); font-weight: 500; }
        .bc-ledger-row {
          display: flex; align-items: center; gap: 10px; padding: 9px 16px;
          border-top: 1px dashed var(--rule); font-size: 13.5px;
        }
        .bc-ledger-row:first-of-type { border-top: none; }
        .bc-ledger-date {
          font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: var(--ink-soft); width: 42px; flex-shrink: 0;
        }
        .bc-ledger-desc { flex: 1; min-width: 0; }
        .bc-ledger-desc-main { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bc-ledger-cat {
          font-size: 10.5px; color: var(--ink-soft); background: var(--paper); border: 1px solid var(--rule);
          border-radius: 5px; padding: 1px 6px; display: inline-block; margin-top: 2px;
        }
        .bc-ledger-account {
          font-size: 10.5px; color: var(--ink-soft); margin-left: 6px; margin-top: 2px;
          display: inline-flex; align-items: center; gap: 3px;
        }
        .bc-ledger-transfer {
          font-size: 10.5px; color: var(--transfer); background: var(--transfer-soft); border: 1px solid var(--transfer);
          border-radius: 5px; padding: 1px 6px; margin-top: 2px; display: inline-flex; align-items: center; gap: 4px;
        }
        .bc-ledger-notes {
          font-size: 10.5px; color: var(--ink-soft); margin-left: 6px; margin-top: 2px; display: inline-block;
          max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle;
        }
        .bc-cancel-installments {
          background: none; border: none; color: var(--rule-strong); font-size: 10px; text-decoration: underline;
          cursor: pointer; padding: 0; margin-left: 8px; opacity: 0; transition: opacity 0.1s;
        }
        .bc-ledger-row:hover .bc-cancel-installments { opacity: 1; }
        .bc-cancel-installments:hover { color: var(--expense); }
        .bc-ledger-amount {
          font-family: 'IBM Plex Mono', monospace; font-size: 13.5px; font-weight: 500; white-space: nowrap;
        }
        .bc-ledger-del {
          background: none; border: none; color: var(--rule-strong); cursor: pointer; padding: 4px;
          display: flex; opacity: 0; transition: opacity 0.1s;
        }
        .bc-ledger-edit {
          background: none; border: none; color: var(--rule-strong); cursor: pointer; padding: 4px;
          display: flex; opacity: 0; transition: opacity 0.1s;
        }
        .bc-ledger-row:hover .bc-ledger-edit { opacity: 1; }
        .bc-ledger-edit:hover { color: var(--ink); }
        .bc-ledger-row:hover .bc-ledger-del { opacity: 1; }
        .bc-ledger-del:hover { color: var(--expense); }
        .bc-ledger-empty { padding: 30px 16px; text-align: center; color: var(--ink-soft); font-size: 13px; }

        .bc-panel {
          background: var(--paper-card); border: 1px solid var(--rule); border-radius: 12px;
          padding: 14px 16px; margin-bottom: 16px;
        }
        .bc-panel-title { font-family: 'Fraunces', serif; font-size: 15px; font-weight: 600; margin-bottom: 10px; }
        .bc-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 8px; }
        .bc-legend-item { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-soft); }
        .bc-legend-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }

        .bc-goal-row { margin-bottom: 12px; }
        .bc-goal-top { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; margin-bottom: 4px; }
        .bc-goal-cat { color: var(--ink); }
        .bc-goal-nums { font-family: 'IBM Plex Mono', monospace; color: var(--ink-soft); font-size: 11.5px; }
        .bc-progress-track { height: 6px; background: var(--rule); border-radius: 4px; overflow: hidden; }
        .bc-progress-fill { height: 100%; border-radius: 4px; }
        .bc-goal-remove { background: none; border: none; color: var(--rule-strong); cursor: pointer; margin-left: 6px; }
        .bc-goal-remove:hover { color: var(--expense); }

        .bc-add-limit { display: flex; gap: 6px; margin-top: 10px; }
        .bc-add-limit select, .bc-add-limit input { font-size: 12px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--rule-strong); background: var(--paper); }
        .bc-add-limit button { background: var(--ink); color: var(--paper); border: none; border-radius: 6px; padding: 0 10px; cursor: pointer; }

        .bc-invest-box { border-top: 1px dashed var(--rule); padding-top: 12px; margin-top: 4px; }
        .bc-invest-edit { display: flex; gap: 6px; margin-top: 6px; }
        .bc-invest-edit input { flex: 1; font-size: 12px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--rule-strong); }
        .bc-invest-edit button { background: var(--ink); color: var(--paper); border: none; border-radius: 6px; padding: 0 10px; cursor: pointer; }
        .bc-invest-target-text { font-size: 11.5px; color: var(--ink-soft); cursor: pointer; text-decoration: underline dotted; }

        .bc-save-warning { font-size: 11.5px; color: var(--expense); margin-top: 10px; }

        .bc-modal-overlay {
          position: fixed; inset: 0; background: rgba(35,40,31,0.45); display: flex;
          align-items: center; justify-content: center; z-index: 50; padding: 20px;
        }
        .bc-modal {
          background: var(--paper-card); border-radius: 14px; max-width: 560px; width: 100%;
          max-height: 82vh; overflow-y: auto; padding: 20px; border: 1px solid var(--rule);
        }
        .bc-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .bc-modal-title { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; }
        .bc-modal-close { background: none; border: none; cursor: pointer; color: var(--ink-soft); }
        .bc-cat-block { border: 1px solid var(--rule); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
        .bc-cat-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .bc-cat-name { font-weight: 500; font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
        .bc-cat-name:hover .bc-pencil { opacity: 1; }
        .bc-pencil { opacity: 0; color: var(--ink-soft); }
        .bc-cat-name-input { font-size: 14px; font-weight: 500; border: 1px solid var(--rule-strong); border-radius: 6px; padding: 3px 8px; font-family: 'Inter', sans-serif; }
        .bc-cat-del { background: none; border: none; color: var(--rule-strong); cursor: pointer; flex-shrink: 0; }
        .bc-cat-del:hover { color: var(--expense); }
        .bc-sub-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .bc-sub-chip { display: flex; align-items: center; gap: 4px; background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 2px 4px 2px 10px; font-size: 11.5px; }
        .bc-sub-chip button { background: none; border: none; cursor: pointer; color: var(--ink-soft); display: flex; padding: 2px; }
        .bc-sub-chip button:hover { color: var(--expense); }
        .bc-add-sub-row { display: flex; gap: 6px; margin-top: 8px; }
        .bc-add-sub-row input { flex: 1; font-size: 12px; padding: 5px 8px; border-radius: 6px; border: 1px solid var(--rule-strong); background: var(--paper); }
        .bc-add-sub-row button { background: var(--ink); color: var(--paper); border: none; border-radius: 6px; padding: 0 10px; cursor: pointer; }
        .bc-add-cat-row { display: flex; gap: 8px; margin-top: 14px; }
        .bc-add-cat-row input { flex: 1; padding: 8px 10px; border-radius: 7px; border: 1px solid var(--rule-strong); background: var(--paper); }
        .bc-add-cat-row select { padding: 8px 10px; border-radius: 7px; border: 1px solid var(--rule-strong); background: var(--paper); font-size: 13px; }
        .bc-add-cat-row button { background: var(--ink); color: var(--paper); border: none; border-radius: 7px; padding: 0 14px; cursor: pointer; }
        .bc-account-kind-row { display: flex; gap: 8px; margin-top: 10px; }
        .bc-cat-head-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .bc-active-toggle {
          font-size: 10.5px; padding: 3px 9px; border-radius: 12px; border: 1px solid var(--rule-strong);
          background: var(--paper); color: var(--ink-soft); cursor: pointer;
        }
        .bc-active-toggle.is-active { background: var(--income-soft); border-color: var(--income); color: var(--income); }
        .bc-account-balance-row {
          display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px;
          padding-top: 10px; border-top: 1px dashed var(--rule); flex-wrap: wrap;
        }
        .bc-account-balance-row label {
          display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--ink-soft);
        }
        .bc-account-balance-row input {
          width: 110px; padding: 5px 8px; border-radius: 6px; border: 1px solid var(--rule-strong);
          background: var(--paper); font-size: 12.5px; font-family: 'IBM Plex Mono', monospace;
        }
        .bc-account-current-balance { font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 500; }

        .bc-report-controls { display: flex; gap: 14px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
        .bc-report-controls label { font-size: 12px; color: var(--ink-soft); margin-right: 6px; }
        .bc-report-controls input[type=month] {
          padding: 6px 8px; border: 1px solid var(--rule-strong); border-radius: 7px;
          font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; background: var(--paper-card); color: var(--ink);
        }
        .bc-report-wrap { overflow-x: auto; border: 1px solid var(--rule); border-radius: 12px; background: var(--paper-card); padding: 4px 0; }
        table.bc-report { border-collapse: collapse; width: 100%; font-size: 12.5px; min-width: 560px; }
        .bc-report th, .bc-report td { padding: 6px 14px; text-align: right; white-space: nowrap; font-family: 'IBM Plex Mono', monospace; }
        .bc-report th:first-child, .bc-report td.bc-rc-label { text-align: left; font-family: 'Inter', sans-serif; }
        .bc-report thead th { border-bottom: 1px solid var(--rule-strong); font-size: 10.5px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: .03em; font-weight: 500; padding-top: 10px; padding-bottom: 8px; }
        .bc-report tr.bc-section-head td { font-family: 'Fraunces', serif; font-weight: 600; font-size: 13.5px; padding-top: 16px; padding-bottom: 4px; }
        .bc-report tr.bc-cat-header td.bc-rc-label { font-weight: 500; padding-top: 8px; color: var(--ink); }
        .bc-report tr.bc-bold td { font-weight: 500; border-top: 1px dashed var(--rule); }
        .bc-report tr.bc-total-row td { font-weight: 600; border-top: 1px solid var(--rule-strong); }
        .bc-report tr.bc-saldo-row td { font-weight: 600; border-top: 2px solid var(--ink); font-size: 13.5px; padding-top: 10px; }
        .bc-report-empty { padding: 30px 16px; text-align: center; color: var(--ink-soft); font-size: 13px; }

        .bc-import-modal { max-width: 640px; }
        .bc-import-steps { display: flex; gap: 16px; margin-bottom: 16px; border-bottom: 1px solid var(--rule); padding-bottom: 10px; }
        .bc-import-steps span { font-size: 11.5px; color: var(--rule-strong); }
        .bc-import-steps span.on { color: var(--ink); font-weight: 500; }
        .bc-import-help { font-size: 12.5px; color: var(--ink-soft); margin-bottom: 14px; line-height: 1.5; }
        .bc-file-drop {
          display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px 16px;
          border: 1.5px dashed var(--rule-strong); border-radius: 10px; cursor: pointer; color: var(--ink-soft);
          font-size: 13px; text-align: center;
        }
        .bc-file-drop:hover { background: var(--paper); }
        .bc-colmap-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
        .bc-catkind-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink-soft); flex-wrap: wrap; }
        .bc-catkind-row .bc-type-btn { flex: none; padding: 6px 12px; }
        .bc-import-sample { font-size: 11.5px; color: var(--ink-soft); font-family: 'IBM Plex Mono', monospace; margin-bottom: 12px; }
        .bc-catmap-list { max-height: 360px; overflow-y: auto; margin-bottom: 14px; }
        .bc-catmap-row { border: 1px solid var(--rule); border-radius: 9px; padding: 8px 10px; margin-bottom: 8px; }
        .bc-catmap-top { display: flex; align-items: center; gap: 10px; font-size: 12.5px; }
        .bc-catmap-raw { font-weight: 500; flex: 1; }
        .bc-catmap-stats { font-family: 'IBM Plex Mono', monospace; color: var(--ink-soft); font-size: 11.5px; }
        .bc-catmap-ignore { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--ink-soft); white-space: nowrap; }
        .bc-catmap-fields { display: grid; grid-template-columns: 0.8fr 1fr 1fr 1fr; gap: 6px; margin-top: 8px; }
        .bc-catmap-fields select, .bc-catmap-fields input {
          font-size: 12px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--rule-strong); background: var(--paper);
          width: 100%;
        }
        .bc-catmap-fields > span { display: block; }
        .bc-new-badge {
          display: inline-block; font-size: 9.5px; color: var(--invest); background: var(--invest-soft);
          border-radius: 4px; padding: 1px 5px; margin-top: 3px;
        }
        .bc-sheet-account-hint {
          display: block; font-size: 10px; color: var(--ink-soft); margin-top: 3px; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap;
        }
        .bc-rule-badge {
          display: inline-block; font-size: 9.5px; color: var(--income); background: var(--income-soft);
          border-radius: 4px; padding: 2px 6px;
        }
        .bc-catmap-samples {
          font-size: 11px; color: var(--ink-soft); margin-top: 2px; overflow: hidden; text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bc-desc-breakdown { margin-top: 8px; }
        .bc-desc-list { margin-top: 6px; display: flex; flex-direction: column; gap: 6px; }
        .bc-desc-row { background: var(--paper); border: 1px solid var(--rule); border-radius: 7px; padding: 6px 8px; }
        .bc-desc-top { display: flex; align-items: center; gap: 8px; font-size: 12px; flex-wrap: wrap; }
        .bc-desc-name { font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bc-desc-actions { display: flex; align-items: center; gap: 10px; margin-top: 4px; flex-wrap: wrap; }
        .bc-desc-override-summary { font-size: 11px; color: var(--income); font-family: 'IBM Plex Mono', monospace; }
        .bc-desc-edit { margin-top: 6px; }
        .bc-desc-edit .bc-catmap-fields { grid-template-columns: 0.8fr 1fr 1fr 1fr; }
        .bc-desc-edit-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
      `}</style>

      <div className="bc-header">
        <div>
          <p className="bc-title">Balancete</p>
          <p className="bc-subtitle">Seu livro-caixa pessoal: entradas, saídas e investimentos.</p>
        </div>
        <div className="bc-header-right">
          {activeTab === "dashboard" && (
            <div className="bc-month-nav">
              <button aria-label="Mês anterior" onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button>
              <div>
                <div className="bc-month-label">{MONTH_NAMES[cursor.m]} {cursor.y}</div>
                {!isCurrentMonth && (
                  <div style={{ textAlign: "center" }}>
                    <button className="bc-today-btn" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}>voltar para hoje</button>
                  </div>
                )}
              </div>
              <button aria-label="Próximo mês" onClick={() => changeMonth(1)}><ChevronRight size={16} /></button>
            </div>
          )}
          <button className="bc-icon-btn" aria-label="Importar dados" onClick={() => { resetImport(); setImportOpen(true); }}>
            <Upload size={16} />
          </button>
          <button className="bc-icon-btn" aria-label="Gerenciar contas" onClick={() => setAccountManagerOpen(true)}>
            <Landmark size={16} />
          </button>
          <button className="bc-icon-btn" aria-label="Gerenciar categorias" onClick={() => setManagerOpen(true)}>
            <Settings size={16} />
          </button>
          <button className="bc-icon-btn" aria-label="Backup e armazenamento" onClick={() => { setRestoreError(""); setRestoreSuccess(""); setBackupOpen(true); }}>
            <HardDrive size={16} />
          </button>
          <button className="bc-icon-btn bc-icon-btn-danger" aria-label="Apagar dados" onClick={() => setResetConfirmOpen(true)}>
            <RotateCcw size={16} />
          </button>
          <button className="bc-icon-btn" aria-label="Sair" title={session.user.email} onClick={() => supabase.auth.signOut()}>
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div className="bc-tabs">
        <button className={`bc-tab ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}>Visão geral</button>
        <button className={`bc-tab ${activeTab === "report" ? "active" : ""}`} onClick={() => setActiveTab("report")}>Relatório</button>
      </div>

      {activeTab === "dashboard" && (
        <>
          {isFirstRun && (
            <div className="bc-welcome">
              <p className="bc-welcome-title">Bem-vindo ao Balancete 👋</p>
              <p className="bc-welcome-text">
                Este é o seu espaço pessoal e privado de controle financeiro — o que você registrar aqui só você vê.
                Pra começar:
              </p>
              <ol className="bc-welcome-steps">
                <li>
                  <button className="bc-manage-link" onClick={() => setAccountManagerOpen(true)}>Cadastre suas contas</button>
                  {" "}(correntes ou cartões de crédito).
                </li>
                <li>
                  Registre seus lançamentos com{" "}
                  <button className="bc-manage-link" onClick={openNewEntryForm}>"Novo lançamento"</button>
                  {" "}ou{" "}
                  <button className="bc-manage-link" onClick={() => { resetImport(); setImportOpen(true); }}>importe uma planilha</button>.
                </li>
                <li>Acompanhe seus gastos e metas aqui, e a evolução mês a mês na aba <strong>Relatório</strong>.</li>
              </ol>
            </div>
          )}
          <div className="bc-cards">
            <div className="bc-card" style={{ "--card-accent": "var(--income)" }}>
              <div className="bc-card-label"><TrendingUp size={13} color="var(--income)" /> Entradas</div>
              <div className="bc-card-value">{fmt(totals.income, dashboardCurrency)}</div>
            </div>
            <div className="bc-card" style={{ "--card-accent": "var(--expense)" }}>
              <div className="bc-card-label"><TrendingDown size={13} color="var(--expense)" /> Saídas</div>
              <div className="bc-card-value">{fmt(totals.expense, dashboardCurrency)}</div>
            </div>
            <div className="bc-card" style={{ "--card-accent": "var(--invest)" }}>
              <div className="bc-card-label"><PiggyBank size={13} color="var(--invest)" /> Investido</div>
              <div className="bc-card-value">{fmt(totals.invest, dashboardCurrency)}</div>
              <div className="bc-card-sub">Total acumulado: {fmtCompact(allTimeInvested, dashboardCurrency)}</div>
            </div>
            <div className="bc-card" style={{ "--card-accent": "var(--ink)" }}>
              <div className="bc-card-label"><Wallet size={13} /> Saldo do mês</div>
              <div className="bc-card-value" style={{ color: totals.balance < 0 ? "var(--expense)" : "var(--ink)" }}>
                {fmt(totals.balance, dashboardCurrency)}
              </div>
            </div>
          </div>
          {dashboardCurrency === "USD" && (
            <p className="bc-currency-note">Mostrando apenas os valores em dólar da conta selecionada.</p>
          )}
          {dashboardCurrency === "BRL" && monthEntries.some((e) => e.type !== "transfer" && (e.currency || "BRL") !== "BRL") && (
            <p className="bc-currency-note">Há lançamentos em dólar neste mês, não somados nos cartões acima. Filtre por uma conta em dólar para vê-los.</p>
          )}

          <div className="bc-add-row">
            {!formOpen && (
              <button className="bc-add-toggle" onClick={openNewEntryForm}>
                <Plus size={16} /> Novo lançamento
              </button>
            )}
            {formOpen && (
              <div className="bc-form">
                <div className="bc-type-row">
                  {Object.entries(TYPE_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    return (
                      <button
                        key={key}
                        className={`bc-type-btn ${fType === key ? "active-" + key : ""}`}
                        onClick={() => setFType(key)}
                      >
                        <Icon size={14} /> {meta.label}
                      </button>
                    );
                  })}
                  <button
                    className={`bc-type-btn ${fType === "transfer" ? "active-transfer" : ""}`}
                    onClick={() => setFType("transfer")}
                  >
                    <ArrowRightLeft size={14} /> Transferência
                  </button>
                </div>
                <div className="bc-form-grid">
                  <div className="bc-field">
                    <label>Data</label>
                    <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
                  </div>
                  <div className="bc-field">
                    <label>Descrição</label>
                    <input
                      type="text" placeholder="Ex: mercado do mês"
                      value={fDesc}
                      onChange={(e) => { setFDesc(e.target.value); setAppliedDescHint(null); }}
                      onBlur={applyDescriptionRuleIfKnown}
                    />
                    {appliedDescHint && (
                      <span className="bc-field-hint" style={{ color: "var(--income)" }}>
                        categoria aplicada: {appliedDescHint.category}{appliedDescHint.subcategory ? ` › ${appliedDescHint.subcategory}` : ""}
                      </span>
                    )}
                  </div>
                  {fType !== "transfer" ? (
                    <>
                      <div className="bc-field">
                        <label>Categoria *</label>
                        <select
                          value={fCategory}
                          onChange={(e) => { setFCategory(e.target.value); setFSubcategory(defaultSubcategoryFor(fType, e.target.value)); }}
                        >
                          {sortPt(Object.keys(categories[fType] || {})).map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="bc-field">
                        <label>Subcategoria *</label>
                        <select value={fSubcategory} onChange={(e) => setFSubcategory(e.target.value)}>
                          {sortPt(categories[fType]?.[fCategory]?.length ? categories[fType][fCategory] : ["Geral"]).map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div className="bc-field">
                        <label>Conta *</label>
                        <select value={fAccount} onChange={(e) => setFAccount(e.target.value)}>
                          {renderAccountOptions()}
                        </select>
                        {accounts.filter((a) => a.active !== false).length === 0 && (
                          <span className="bc-field-hint">Nenhuma conta cadastrada ainda.</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bc-field">
                        <label>Conta de origem *</label>
                        <select value={fAccount} onChange={(e) => setFAccount(e.target.value)}>
                          {renderAccountOptions(fToAccount)}
                        </select>
                      </div>
                      <div className="bc-field">
                        <label>Conta de destino *</label>
                        <select value={fToAccount} onChange={(e) => setFToAccount(e.target.value)}>
                          {renderAccountOptions(fAccount)}
                        </select>
                      </div>
                      {accounts.filter((a) => a.active !== false).length < 2 && (
                        <div className="bc-field">
                          <span className="bc-field-hint">Cadastre pelo menos duas contas para transferir entre elas.</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="bc-field">
                    <label>
                      {fType === "transfer"
                        ? `Valor enviado (${getAccountCurrency(fAccount) === "USD" ? "US$" : "R$"})`
                        : fInstallmentsOn && fType === "expense" ? `Valor da parcela (${currencyPrefix(fAccount)})` : `Valor (${currencyPrefix(fAccount)})`}
                    </label>
                    <input
                      type="text" inputMode="decimal" placeholder="0,00"
                      value={fAmount} onChange={(e) => setFAmount(e.target.value)}
                    />
                  </div>
                  {fType === "transfer" && fAccount && fToAccount && getAccountCurrency(fAccount) !== getAccountCurrency(fToAccount) && (
                    <div className="bc-field">
                      <label>Valor recebido ({getAccountCurrency(fToAccount) === "USD" ? "US$" : "R$"}) *</label>
                      <input
                        type="text" inputMode="decimal" placeholder="0,00"
                        value={fToAmount} onChange={(e) => setFToAmount(e.target.value)}
                      />
                      <span className="bc-field-hint" style={{ color: "var(--ink-soft)" }}>
                        Moedas diferentes — informe quanto chegou na conta de destino.
                      </span>
                    </div>
                  )}
                  {fType === "expense" && !editingEntryId && (
                    <div className="bc-field">
                      <label>&nbsp;</label>
                      <label className="bc-installment-toggle">
                        <input
                          type="checkbox" checked={fInstallmentsOn}
                          onChange={(e) => setFInstallmentsOn(e.target.checked)}
                        />
                        Compra parcelada
                      </label>
                      {fInstallmentsOn && (
                        <>
                          <div className="bc-installment-row">
                            <input
                              type="number" min="1" max="60" value={fInstallmentCurrent}
                              onChange={(e) => setFInstallmentCurrent(e.target.value)}
                            />
                            <span>de</span>
                            <input
                              type="number" min="2" max="60" value={fInstallmentsTotal}
                              onChange={(e) => setFInstallmentsTotal(e.target.value)}
                            />
                            <span>parcelas</span>
                          </div>
                          {fAmount && parseFloat(String(fAmount).replace(",", ".")) > 0 && (() => {
                            const total = Math.max(2, parseInt(fInstallmentsTotal, 10) || 2);
                            const current = Math.min(total, Math.max(1, parseInt(fInstallmentCurrent, 10) || 1));
                            const perInstallment = parseFloat(String(fAmount).replace(",", "."));
                            const count = total - current + 1;
                            const totalValue = perInstallment * total;
                            return (
                              <span className="bc-installment-preview">
                                Valor total da compra: {fmt(totalValue, currencyPrefix(fAccount) === "US$" ? "USD" : "BRL")} ({total}x de {fmt(perInstallment, currencyPrefix(fAccount) === "US$" ? "USD" : "BRL")}) — serão criadas {count} parcelas, de {String(current).padStart(2, "0")}/{total} até {String(total).padStart(2, "0")}/{total}
                              </span>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  )}
                  <div className="bc-field">
                    <label>Obs</label>
                    <input
                      type="text" placeholder="Alguma observação (opcional)"
                      value={fNotes} onChange={(e) => setFNotes(e.target.value)}
                    />
                  </div>
                </div>
                {pendingEditScope ? (
                  <div className="bc-installment-scope">
                    <p className="bc-import-help">
                      Esse lançamento faz parte de uma compra parcelada. Aplicar as alterações para:
                    </p>
                    <div className="bc-installment-scope-actions">
                      <button className="bc-btn-ghost" onClick={() => applyInstallmentEdit("single")}>Somente esta parcela</button>
                      <button className="bc-btn-ghost" onClick={() => applyInstallmentEdit("future")}>Esta e as próximas</button>
                      <button className="bc-btn-primary" onClick={() => applyInstallmentEdit("all")}>Todas as parcelas</button>
                    </div>
                    <button className="bc-manage-link" onClick={() => setPendingEditScope(false)}>voltar</button>
                  </div>
                ) : (
                  <div className="bc-form-actions">
                    <div className="bc-form-actions-left">
                      {fType !== "transfer" && (
                        <button className="bc-manage-link" onClick={() => { setManagerType(fType); setManagerOpen(true); }}>
                          gerenciar categorias
                        </button>
                      )}
                      <button className="bc-manage-link" onClick={() => setAccountManagerOpen(true)}>
                        gerenciar contas
                      </button>
                    </div>
                    <div className="bc-form-actions-right">
                      <button className="bc-btn-ghost" onClick={resetFormFields}>Cancelar</button>
                      <button className="bc-btn-primary" onClick={saveEntry}>
                        <Check size={14} /> {editingEntryId ? "Salvar alterações" : "Salvar"}
                      </button>
                    </div>
                  </div>
                )}
                {formError && <div className="bc-save-warning">{formError}</div>}
              </div>
            )}
          </div>

          <div className="bc-main-grid">
            <div className="bc-ledger">
              <div className="bc-ledger-head">
                <span>Lançamentos do mês</span>
                {allAccounts.length > 0 && (
                  <select
                    className="bc-ledger-filter"
                    value={accountFilterDashboard}
                    onChange={(e) => setAccountFilterDashboard(e.target.value)}
                  >
                    <option value="">Todas as contas</option>
                    {allAccounts.filter((a) => getAccountKind(a) === "corrente").length > 0 && (
                      <optgroup label="Contas correntes">
                        {allAccounts.filter((a) => getAccountKind(a) === "corrente").map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </optgroup>
                    )}
                    {allAccounts.filter((a) => getAccountKind(a) === "credito").length > 0 && (
                      <optgroup label="Cartões de crédito">
                        {allAccounts.filter((a) => getAccountKind(a) === "credito").map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                )}
              </div>
              {accountFilterDashboard && (
                <div className="bc-ledger-account-balance">
                  Saldo atual em {accountFilterDashboard}: <strong>{fmt(getAccountBalance(accountFilterDashboard), getAccountCurrency(accountFilterDashboard))}</strong>
                </div>
              )}
              {monthEntries.length === 0 && (
                <div className="bc-ledger-empty">Nenhum lançamento em {MONTH_NAMES[cursor.m].toLowerCase()}. Que tal registrar o primeiro?</div>
              )}
              {monthEntries.map((e) => {
                const day = e.date.slice(8, 10);
                const month = e.date.slice(5, 7);
                if (e.type === "transfer") {
                  const crossCurrency = e.toCurrency && e.fromCurrency && e.toCurrency !== e.fromCurrency;
                  return (
                    <div className="bc-ledger-row" key={e.id}>
                      <div className="bc-ledger-date">{day}/{month}</div>
                      <div className="bc-ledger-desc">
                        <div className="bc-ledger-desc-main">{e.description || "Transferência"}</div>
                        <span className="bc-ledger-transfer">
                          <ArrowRightLeft size={10} />
                          {e.fromAccount} <ArrowRightLeft size={9} style={{ opacity: 0.5 }} /> {e.toAccount}
                        </span>
                        {e.notes && <span className="bc-ledger-notes" title={e.notes}>💬 {e.notes}</span>}
                      </div>
                      <div className="bc-ledger-amount" style={{ color: "var(--transfer)" }}>
                        {crossCurrency
                          ? `${fmt(e.amount, e.fromCurrency)} → ${fmt(e.toAmount, e.toCurrency)}`
                          : fmt(e.amount, e.fromCurrency || "BRL")}
                      </div>
                      <button className="bc-ledger-edit" aria-label="Editar lançamento" onClick={() => openEditEntryForm(e)}>
                        <Pencil size={13} />
                      </button>
                      <button className="bc-ledger-del" aria-label="Excluir lançamento" onClick={() => deleteEntry(e.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                }
                const meta = TYPE_META[e.type];
                const baseDesc = e.description || e.category;
                const displayDesc = e.installmentCount
                  ? `${baseDesc} ${String(e.installmentNumber).padStart(2, "0")}/${e.installmentCount}`
                  : baseDesc;
                return (
                  <div className="bc-ledger-row" key={e.id}>
                    <div className="bc-ledger-date">{day}/{month}</div>
                    <div className="bc-ledger-desc">
                      <div className="bc-ledger-desc-main">{displayDesc}</div>
                      <span className="bc-ledger-cat">{e.category}{e.subcategory ? ` › ${e.subcategory}` : ""}</span>
                      {e.account && (
                        <span className="bc-ledger-account">
                          {getAccountKind(e.account) === "credito" ? <CreditCard size={10} /> : <Landmark size={10} />}
                          {e.account}{(e.currency || "BRL") === "USD" ? " (US$)" : ""}
                        </span>
                      )}
                      {e.installmentCount && e.installmentNumber < e.installmentCount && (
                        <button className="bc-cancel-installments" onClick={() => cancelRemainingInstallments(e)}>
                          cancelar parcelas restantes
                        </button>
                      )}
                      {e.notes && <span className="bc-ledger-notes" title={e.notes}>💬 {e.notes}</span>}
                    </div>
                    <div className="bc-ledger-amount" style={{ color: meta.color }}>
                      {e.type === "income" ? "+" : "−"} {fmt(e.amount, e.currency || "BRL")}
                    </div>
                    <button className="bc-ledger-edit" aria-label="Editar lançamento" onClick={() => openEditEntryForm(e)}>
                      <Pencil size={13} />
                    </button>
                    <button className="bc-ledger-del" aria-label="Excluir lançamento" onClick={() => deleteEntry(e.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div>
              <div className="bc-panel">
                <div className="bc-panel-title">Para onde foi o dinheiro</div>
                {expenseBreakdown.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Sem saídas registradas neste mês.</div>
                ) : (
                  <>
                    <div style={{ width: "100%", height: 160 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={expenseBreakdown} dataKey="value" nameKey="name"
                            innerRadius={40} outerRadius={65} paddingAngle={2}
                          >
                            {expenseBreakdown.map((entry, i) => (
                              <Cell key={entry.name} fill={donutColors[i % donutColors.length]} />
                            ))}
                          </Pie>
                          <ReTooltip formatter={(v) => fmt(v, dashboardCurrency)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bc-legend">
                      {expenseBreakdown.map((entry, i) => (
                        <div className="bc-legend-item" key={entry.name}>
                          <span className="bc-legend-dot" style={{ background: donutColors[i % donutColors.length] }} />
                          {entry.name} · {fmtCompact(entry.value, dashboardCurrency)}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="bc-panel">
                <div className="bc-panel-title">Saldo ao longo do mês</div>
                <div style={{ width: "100%", height: 140 }}>
                  <ResponsiveContainer>
                    <LineChart data={dailyBalance} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke="var(--rule)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} width={50}
                        tickFormatter={(v) => fmtCompact(v, dashboardCurrency)} />
                      <ReTooltip formatter={(v) => fmt(v, dashboardCurrency)} labelFormatter={(l) => `Dia ${l}`} />
                      <Line type="monotone" dataKey="saldo" stroke="var(--ink)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bc-panel">
                <div className="bc-panel-title"><Target size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Metas do mês</div>
                {limitRows.length === 0 && (
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 8 }}>
                    Defina um limite de gastos por categoria para acompanhar aqui.
                  </div>
                )}
                {limitRows.map((cat) => {
                  const spent = monthEntriesInCurrency.filter((e) => e.type === "expense" && e.category === cat)
                    .reduce((s, e) => s + e.amount, 0);
                  const limit = goals.limits[cat] || 0;
                  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
                  const over = limit > 0 && spent > limit;
                  return (
                    <div className="bc-goal-row" key={cat}>
                      <div className="bc-goal-top">
                        <span className="bc-goal-cat">{cat}</span>
                        <span className="bc-goal-nums">
                          {fmtCompact(spent, dashboardCurrency)} / {fmtCompact(limit, dashboardCurrency)}
                          <button className="bc-goal-remove" onClick={() => removeLimit(cat)} aria-label={`Remover meta de ${cat}`}>
                            <X size={12} />
                          </button>
                        </span>
                      </div>
                      <div className="bc-progress-track">
                        <div className="bc-progress-fill" style={{ width: pct + "%", background: over ? "var(--expense)" : "var(--invest)" }} />
                      </div>
                    </div>
                  );
                })}

                {addingLimitFor === "" ? (
                  availableForLimit.length > 0 && (
                    <button className="bc-btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => setAddingLimitFor(availableForLimit[0])}>
                      <Plus size={12} style={{ verticalAlign: -1 }} /> Adicionar meta
                    </button>
                  )
                ) : (
                  <div className="bc-add-limit">
                    <select value={addingLimitFor} onChange={(e) => setAddingLimitFor(e.target.value)}>
                      {availableForLimit.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="text" inputMode="decimal" placeholder="limite R$" value={limitDraft} onChange={(e) => setLimitDraft(e.target.value)} />
                    <button onClick={() => {
                      const v = parseFloat(String(limitDraft).replace(",", "."));
                      if (v > 0) { setLimit(addingLimitFor, v); setLimitDraft(""); setAddingLimitFor(""); }
                    }}><Check size={13} /></button>
                  </div>
                )}

                <div className="bc-invest-box">
                  <div className="bc-goal-top">
                    <span className="bc-goal-cat">Meta de investimento</span>
                    <span className="bc-goal-nums">{fmtCompact(allTimeInvested, dashboardCurrency)} / {fmtCompact(goals.investTarget || 0, dashboardCurrency)}</span>
                  </div>
                  <div className="bc-progress-track">
                    <div className="bc-progress-fill" style={{
                      width: (goals.investTarget > 0 ? Math.min(100, (allTimeInvested / goals.investTarget) * 100) : 0) + "%",
                      background: "var(--income)"
                    }} />
                  </div>
                  {!editingTarget ? (
                    <div style={{ marginTop: 6 }}>
                      <span className="bc-invest-target-text" onClick={() => { setEditingTarget(true); setTargetDraft(String(goals.investTarget || "")); }}>
                        editar meta
                      </span>
                    </div>
                  ) : (
                    <div className="bc-invest-edit">
                      <input type="text" inputMode="decimal" value={targetDraft} onChange={(e) => setTargetDraft(e.target.value)} placeholder="valor alvo R$" />
                      <button onClick={() => {
                        const v = parseFloat(String(targetDraft).replace(",", "."));
                        setInvestTarget(v > 0 ? v : 0);
                        setEditingTarget(false);
                      }}><Check size={13} /></button>
                    </div>
                  )}
                </div>
              </div>

              {saveError && (
                <div className="bc-save-warning">Não foi possível salvar agora. Seus dados podem não persistir entre sessões.</div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === "report" && (
        <div>
          <div className="bc-report-controls">
            <span>
              <label>De</label>
              <input type="month" value={reportStartStr} onChange={(e) => setReportStartStr(e.target.value)} />
            </span>
            <span>
              <label>Até</label>
              <input type="month" value={reportEndStr} onChange={(e) => setReportEndStr(e.target.value)} />
            </span>
            {allAccounts.length > 0 && (
              <span>
                <label>Conta</label>
                <select
                  className="bc-ledger-filter"
                  value={accountFilterReport}
                  onChange={(e) => setAccountFilterReport(e.target.value)}
                >
                  <option value="">Todas</option>
                  {allAccounts.filter((a) => getAccountKind(a) === "corrente").length > 0 && (
                    <optgroup label="Contas correntes">
                      {allAccounts.filter((a) => getAccountKind(a) === "corrente").map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </optgroup>
                  )}
                  {allAccounts.filter((a) => getAccountKind(a) === "credito").length > 0 && (
                    <optgroup label="Cartões de crédito">
                      {allAccounts.filter((a) => getAccountKind(a) === "credito").map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </span>
            )}
          </div>
          {reportCurrency === "BRL" && entries.some((e) => (e.currency || "BRL") === "USD") && (
            <p className="bc-currency-note">Há contas em dólar cadastradas — filtre por uma delas acima para ver o relatório em US$.</p>
          )}

          {!reportHasData ? (
            <div className="bc-report-wrap"><div className="bc-report-empty">Sem lançamentos nesse período.</div></div>
          ) : (
            <div className="bc-report-wrap">
              <table className="bc-report">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Total</th>
                    {reportMonths.map((mo) => <th key={mo.key}>{mo.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {["income", "expense", "invest"].map((type) => {
                    const section = reportSections[type];
                    if (section.rows.length === 0) return null;
                    const meta = TYPE_META[type];
                    return (
                      <Fragment key={type}>
                        <tr className="bc-section-head">
                          <td colSpan={2 + reportMonths.length} style={{ color: meta.color }}>{SECTION_LABEL[type]}</td>
                        </tr>
                        {section.rows.map((row, idx) => (
                          <tr
                            key={type + "-row-" + idx}
                            className={row.header ? "bc-cat-header" : row.bold ? "bc-bold" : ""}
                          >
                            <td className="bc-rc-label">{row.label}</td>
                            {row.header ? (
                              <td colSpan={1 + reportMonths.length}></td>
                            ) : (
                              <>
                                <td>{fmt(row.total, reportCurrency)}</td>
                                {row.values.map((v, i) => <td key={i}>{v ? fmt(v, reportCurrency) : "-"}</td>)}
                              </>
                            )}
                          </tr>
                        ))}
                        <tr className="bc-total-row">
                          <td className="bc-rc-label" style={{ color: meta.color }}>Total - {SECTION_LABEL[type]}</td>
                          <td style={{ color: meta.color }}>{fmt(section.sectionAll, reportCurrency)}</td>
                          {section.sectionTotals.map((v, i) => <td key={i} style={{ color: meta.color }}>{fmt(v, reportCurrency)}</td>)}
                        </tr>
                      </Fragment>
                    );
                  })}
                  <tr className="bc-saldo-row">
                    <td className="bc-rc-label">Saldo</td>
                    <td>{fmt(saldoAll, reportCurrency)}</td>
                    {saldoValues.map((v, i) => <td key={i}>{fmt(v, reportCurrency)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {managerOpen && (
        <div className="bc-modal-overlay" onClick={() => setManagerOpen(false)}>
          <div className="bc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bc-modal-head">
              <span className="bc-modal-title">Gerenciar categorias</span>
              <button className="bc-modal-close" onClick={() => setManagerOpen(false)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="bc-type-row">
              {Object.entries(TYPE_META).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={key}
                    className={`bc-type-btn ${managerType === key ? "active-" + key : ""}`}
                    onClick={() => setManagerType(key)}
                  >
                    <Icon size={14} /> {meta.label}
                  </button>
                );
              })}
            </div>

            {sortPt(Object.keys(categories[managerType] || {})).map((cat) => (
              <div className="bc-cat-block" key={cat}>
                <div className="bc-cat-head">
                  {editing && editing.type === managerType && editing.category === cat && !editing.sub ? (
                    <input
                      className="bc-cat-name-input" autoFocus value={editing.draft}
                      onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { renameCategory(managerType, cat, editing.draft); setEditing(null); }
                        if (e.key === "Escape") setEditing(null);
                      }}
                      onBlur={() => { renameCategory(managerType, cat, editing.draft); setEditing(null); }}
                    />
                  ) : (
                    <span className="bc-cat-name" onClick={() => setEditing({ type: managerType, category: cat, sub: null, draft: cat })}>
                      {cat} <Pencil size={12} className="bc-pencil" />
                    </span>
                  )}
                  <button className="bc-cat-del" onClick={() => deleteCategory(managerType, cat)} aria-label={`Excluir categoria ${cat}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="bc-sub-chips">
                  {sortPt(categories[managerType][cat] || []).map((sub) => (
                    <span className="bc-sub-chip" key={sub}>
                      {sub}
                      <button onClick={() => deleteSubcategory(managerType, cat, sub)} aria-label={`Excluir subcategoria ${sub}`}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="bc-add-sub-row">
                  <input
                    type="text" placeholder="nova subcategoria"
                    value={newSubDraft[cat] || ""}
                    onChange={(e) => setNewSubDraft({ ...newSubDraft, [cat]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        addSubcategory(managerType, cat, newSubDraft[cat] || "");
                        setNewSubDraft({ ...newSubDraft, [cat]: "" });
                      }
                    }}
                  />
                  <button onClick={() => {
                    addSubcategory(managerType, cat, newSubDraft[cat] || "");
                    setNewSubDraft({ ...newSubDraft, [cat]: "" });
                  }}><Plus size={13} /></button>
                </div>
              </div>
            ))}

            <div className="bc-add-cat-row">
              <input
                type="text" placeholder="nova categoria" value={newCatDraft}
                onChange={(e) => setNewCatDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { addCategory(managerType, newCatDraft); setNewCatDraft(""); }
                }}
              />
              <button onClick={() => { addCategory(managerType, newCatDraft); setNewCatDraft(""); }}>
                <Plus size={14} style={{ verticalAlign: -2 }} /> Categoria
              </button>
            </div>
          </div>
        </div>
      )}

      {accountManagerOpen && (
        <div className="bc-modal-overlay" onClick={() => setAccountManagerOpen(false)}>
          <div className="bc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bc-modal-head">
              <span className="bc-modal-title">Gerenciar contas</span>
              <button className="bc-modal-close" onClick={() => setAccountManagerOpen(false)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <p className="bc-import-help">
              Cadastre as contas correntes e cartões de crédito de onde o dinheiro sai ou entra.
            </p>

            {accounts.length === 0 && (
              <p className="bc-import-help">Nenhuma conta cadastrada ainda.</p>
            )}

            {[...accounts].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })).map((acc) => (
              <div className="bc-cat-block" key={acc.name}>
                <div className="bc-cat-head">
                  {editingAccount && editingAccount.oldName === acc.name ? (
                    <input
                      className="bc-cat-name-input" autoFocus value={editingAccount.draft}
                      onChange={(e) => setEditingAccount({ ...editingAccount, draft: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { renameAccount(acc.name, editingAccount.draft); setEditingAccount(null); }
                        if (e.key === "Escape") setEditingAccount(null);
                      }}
                      onBlur={() => { renameAccount(acc.name, editingAccount.draft); setEditingAccount(null); }}
                    />
                  ) : (
                    <span className="bc-cat-name" onClick={() => setEditingAccount({ oldName: acc.name, draft: acc.name })}>
                      {acc.name} <Pencil size={12} className="bc-pencil" />
                    </span>
                  )}
                  <div className="bc-cat-head-actions">
                    <button
                      className={`bc-active-toggle ${acc.active !== false ? "is-active" : ""}`}
                      onClick={() => setAccountActive(acc.name, acc.active === false)}
                    >
                      {acc.active !== false ? "Ativa" : "Inativa"}
                    </button>
                    <button className="bc-cat-del" onClick={() => deleteAccount(acc.name)} aria-label={`Excluir conta ${acc.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="bc-account-kind-row">
                  <button
                    className={`bc-type-btn ${acc.kind === "corrente" ? "active-income" : ""}`}
                    onClick={() => setAccountKind(acc.name, "corrente")}
                  >
                    <Landmark size={14} /> Conta corrente
                  </button>
                  <button
                    className={`bc-type-btn ${acc.kind === "credito" ? "active-invest" : ""}`}
                    onClick={() => setAccountKind(acc.name, "credito")}
                  >
                    <CreditCard size={14} /> Cartão de crédito
                  </button>
                </div>
                <div className="bc-account-kind-row">
                  <button
                    className={`bc-type-btn ${(acc.currency || "BRL") === "BRL" ? "active-income" : ""}`}
                    onClick={() => setAccountCurrency(acc.name, "BRL")}
                  >
                    R$ Real
                  </button>
                  <button
                    className={`bc-type-btn ${acc.currency === "USD" ? "active-invest" : ""}`}
                    onClick={() => setAccountCurrency(acc.name, "USD")}
                  >
                    US$ Dólar
                  </button>
                </div>
                <div className="bc-account-balance-row">
                  <label>
                    Saldo inicial
                    <input
                      type="text" inputMode="decimal" placeholder="0,00"
                      key={acc.name + "-" + acc.initialBalance}
                      defaultValue={acc.initialBalance ? String(acc.initialBalance) : ""}
                      onBlur={(e) => {
                        const v = parseFloat(String(e.target.value).replace(",", "."));
                        setAccountInitialBalance(acc.name, isNaN(v) ? 0 : v);
                      }}
                    />
                  </label>
                  <span className="bc-account-current-balance">Saldo atual: {fmt(getAccountBalance(acc.name), acc.currency || "BRL")}</span>
                </div>
              </div>
            ))}

            <div className="bc-add-cat-row">
              <input
                type="text" placeholder="nome da conta" value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { addAccount(newAccountName, newAccountKind, newAccountCurrency); setNewAccountName(""); }
                }}
              />
              <select value={newAccountKind} onChange={(e) => setNewAccountKind(e.target.value)}>
                <option value="corrente">Conta corrente</option>
                <option value="credito">Cartão de crédito</option>
              </select>
              <select value={newAccountCurrency} onChange={(e) => setNewAccountCurrency(e.target.value)}>
                <option value="BRL">R$ Real</option>
                <option value="USD">US$ Dólar</option>
              </select>
              <button onClick={() => { addAccount(newAccountName, newAccountKind, newAccountCurrency); setNewAccountName(""); }}>
                <Plus size={14} style={{ verticalAlign: -2 }} /> Conta
              </button>
            </div>
          </div>
        </div>
      )}

      {backupOpen && (
        <div className="bc-modal-overlay" onClick={() => setBackupOpen(false)}>
          <div className="bc-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="bc-modal-head">
              <span className="bc-modal-title">Backup e armazenamento</span>
              <button className="bc-modal-close" onClick={() => setBackupOpen(false)} aria-label="Fechar"><X size={18} /></button>
            </div>

            <div className="bc-storage-box">
              <div className="bc-storage-top">
                <span>{storageInfo.entryCount} lançamentos em {storageInfo.yearCount} ano(s) · {storageInfo.totalKb < 1024 ? `${storageInfo.totalKb.toFixed(0)} KB` : `${(storageInfo.totalKb / 1024).toFixed(2)} MB`} no total</span>
              </div>
              <div className="bc-storage-top">
                <span>Ano mais cheio: {storageInfo.biggestYear || "—"} ({(storageInfo.biggestBytes / 1024).toFixed(0)} KB)</span>
                <span>{storageInfo.pct.toFixed(1)}% de 5 MB nesse ano</span>
              </div>
              <div className="bc-progress-track">
                <div
                  className="bc-progress-fill"
                  style={{ width: storageInfo.pct + "%", background: storageInfo.warn ? "var(--expense)" : "var(--income)" }}
                />
              </div>
              <p className="bc-import-help" style={{ marginTop: 8 }}>
                Desde a versão atual, os lançamentos ficam guardados <strong>separados por ano</strong> — cada ano é uma "gaveta" própria, então o limite de 5 MB vale por ano, não pra tudo somado. Isso evita que anos antigos travem o espaço de anos novos.
              </p>
              {storageInfo.warn && (
                <p className="bc-import-help" style={{ color: "var(--expense)", marginTop: 8 }}>
                  <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                  O ano de {storageInfo.biggestYear} já está usando uma boa parte do espaço disponível. Considere fazer um backup regularmente.
                </p>
              )}
            </div>

            <div className="bc-danger-option">
              <p className="bc-import-help">
                Baixe um arquivo com todos os seus dados (lançamentos, categorias, contas, metas e regras de importação). Guarde esse arquivo em outro lugar — no computador, no seu email, no Google Drive — como uma cópia de segurança independente do Balancete.
              </p>
              <div className="bc-form-actions" style={{ justifyContent: "flex-end" }}>
                <button className="bc-btn-primary" onClick={exportBackup}><Download size={14} /> Baixar backup (.json)</button>
              </div>
            </div>

            <div className="bc-danger-option">
              <p className="bc-import-help">
                Já tem um arquivo de backup? Restaure aqui — isso <strong>substitui</strong> os dados atuais do Balancete pelos dados salvos no arquivo.
              </p>
              <label className="bc-file-drop" style={{ padding: "16px" }}>
                <Upload size={18} />
                <span>Clique para escolher o arquivo de backup (.json)</span>
                <input
                  type="file" accept=".json" style={{ display: "none" }}
                  onChange={(e) => { if (e.target.files[0]) restoreBackupFile(e.target.files[0]); }}
                />
              </label>
              {restoreError && <div className="bc-save-warning">{restoreError}</div>}
              {restoreSuccess && <p className="bc-import-help" style={{ color: "var(--income)" }}>{restoreSuccess}</p>}
            </div>
          </div>
        </div>
      )}

      {resetConfirmOpen && (
        <div className="bc-modal-overlay" onClick={() => setResetConfirmOpen(false)}>
          <div className="bc-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="bc-modal-head">
              <span className="bc-modal-title">Apagar dados</span>
              <button className="bc-modal-close" onClick={() => setResetConfirmOpen(false)} aria-label="Fechar"><X size={18} /></button>
            </div>

            <div className="bc-danger-option">
              <p className="bc-import-help">
                <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 4, color: "var(--expense)" }} />
                Apaga <strong>só os lançamentos</strong> (entradas, saídas, investimentos e transferências). Categorias, contas e metas continuam como estão — útil pra reimportar do zero sem perder o que você já organizou.
              </p>
              <div className="bc-form-actions" style={{ justifyContent: "flex-end" }}>
                <button className="bc-btn-danger" onClick={resetEntriesOnly}><Trash2 size={14} /> Apagar somente os lançamentos</button>
              </div>
            </div>

            <div className="bc-danger-option">
              <p className="bc-import-help">
                <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 4, color: "var(--expense)" }} />
                Apaga <strong>permanentemente tudo</strong>: lançamentos, categorias, contas, metas e regras de importação. Use se quiser recomeçar do zero. Essa ação não pode ser desfeita.
              </p>
              <div className="bc-form-actions" style={{ justifyContent: "flex-end" }}>
                <button className="bc-btn-danger" onClick={resetAllData}><Trash2 size={14} /> Apagar tudo</button>
              </div>
            </div>

            <div className="bc-form-actions" style={{ justifyContent: "flex-end" }}>
              <button className="bc-btn-ghost" onClick={() => setResetConfirmOpen(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="bc-modal-overlay" onClick={() => setImportOpen(false)}>
          <div className="bc-modal bc-import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bc-modal-head">
              <span className="bc-modal-title">Importar dados</span>
              <button className="bc-modal-close" onClick={() => setImportOpen(false)} aria-label="Fechar"><X size={18} /></button>
            </div>

            <div className="bc-import-steps">
              <span className={importStep >= 1 ? "on" : ""}>1. Arquivo</span>
              <span className={importStep >= 2 ? "on" : ""}>2. Colunas</span>
              <span className={importStep >= 3 ? "on" : ""}>3. Categorias</span>
              <span className={importStep >= 4 ? "on" : ""}>4. Concluído</span>
            </div>

            {importStep === 1 && (
              <div>
                <p className="bc-import-help">
                  Envie o extrato exportado do seu gerenciador antigo (.xls, .xlsx ou .csv).
                  Você pode importar mês a mês ou ano a ano — lançamentos repetidos são identificados e pulados automaticamente.
                </p>
                <label className="bc-file-drop">
                  <Upload size={20} />
                  <span>{importFileName || "Clique para escolher o arquivo"}</span>
                  <input
                    type="file" accept=".xls,.xlsx,.csv" style={{ display: "none" }}
                    onChange={(e) => { if (e.target.files[0]) handleImportFile(e.target.files[0]); }}
                  />
                </label>
                {importError && <div className="bc-save-warning">{importError}</div>}
              </div>
            )}

            {importStep === 2 && (
              <div>
                <p className="bc-import-help">
                  Identificamos {importDataRows.length} linhas em <strong>{importFileName}</strong>. Confirme qual coluna é qual:
                </p>
                <div className="bc-colmap-grid">
                  {[
                    { key: "date", label: "Data" },
                    { key: "desc", label: "Descrição" },
                    { key: "value", label: "Valor" },
                    { key: "category", label: "Categoria" },
                    { key: "account", label: "Conta", optional: true },
                  ].map((f) => (
                    <div className="bc-field" key={f.key}>
                      <label>{f.label}</label>
                      <select
                        value={importColMap[f.key]}
                        onChange={(e) => setImportColMap({ ...importColMap, [f.key]: Number(e.target.value) })}
                      >
                        {f.optional && <option value={-1}>(nenhuma)</option>}
                        {importHeaders.map((h, i) => (
                          <option key={i} value={i}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                {importDataRows[0] && (
                  <p className="bc-import-sample">
                    Exemplo: {parseFlexibleDate(importDataRows[0][importColMap.date]) || "?"} ·{" "}
                    {String(importDataRows[0][importColMap.desc] ?? "")} ·{" "}
                    {parseFlexibleNumber(importDataRows[0][importColMap.value]) ?? "?"} ·{" "}
                    {String(importDataRows[0][importColMap.category] ?? "")}
                    {importColMap.account >= 0 && <> · {String(importDataRows[0][importColMap.account] ?? "")}</>}
                  </p>
                )}
                <div className="bc-form-actions" style={{ justifyContent: "flex-end" }}>
                  <button className="bc-btn-ghost" onClick={() => setImportStep(1)}>Voltar</button>
                  <button className="bc-btn-primary" onClick={goToCategoryMapping}>Continuar</button>
                </div>
              </div>
            )}

            {importStep === 3 && (
              <div>
                <p className="bc-import-help">
                  Encontramos {Object.keys(importCatMap).length} categorias diferentes, listadas abaixo. Olhando os nomes, esses valores são:
                </p>
                <div className="bc-catkind-row">
                  <button
                    className={`bc-type-btn ${importCategoryColKind === "category" ? "active-income" : ""}`}
                    onClick={() => applyCategoryKindToAll("category")}
                  >
                    Categorias (ex: "Alimentação")
                  </button>
                  <button
                    className={`bc-type-btn ${importCategoryColKind === "subcategory" ? "active-invest" : ""}`}
                    onClick={() => applyCategoryKindToAll("subcategory")}
                  >
                    Subcategorias (ex: "Restaurante")
                  </button>
                </div>
                <p className="bc-import-help" style={{ marginTop: 6 }}>
                  {importCategoryColKind === "subcategory"
                    ? "Cada uma virou uma subcategoria — troque a categoria principal onde fizer sentido, abaixo."
                    : "Ajuste o tipo e para qual categoria/subcategoria cada uma vai."} Marque "ignorar" para transferências entre suas próprias contas —
                  o Balancete procura pares com mesma data, descrição e valores opostos e já cria a transferência certinha, com a conta de origem e destino.
                  Suas escolhas ficam salvas: da próxima vez que aparecer o mesmo nome, o Balancete já aplica sozinho.
                </p>
                {importColMap.account < 0 && (
                  <p className="bc-import-help" style={{ color: "var(--expense)" }}>
                    Você não mapeou uma coluna de Conta no passo anterior — sem ela, não dá pra identificar de qual conta saiu e para qual foi, então linhas ignoradas serão apenas descartadas.
                  </p>
                )}
                <div className="bc-catmap-list">
                  {Object.entries(importCatMap)
                    .sort((a, b) => Math.abs(b[1].sum) - Math.abs(a[1].sum))
                    .map(([rawCat, m]) => {
                      const catExists = Object.keys(categories[m.type] || {}).includes(m.category);
                      const subExists = !m.subcategory || (categories[m.type]?.[m.category] || []).includes(m.subcategory);
                      return (
                        <div className="bc-catmap-row" key={rawCat}>
                          <div className="bc-catmap-top">
                            <span className="bc-catmap-raw">{rawCat}</span>
                            {m.fromRule && <span className="bc-rule-badge">regra salva</span>}
                            <span className="bc-catmap-stats">{m.count}x · {fmt(m.sum)}</span>
                            <label className="bc-catmap-ignore">
                              <input
                                type="checkbox" checked={!!m.ignore}
                                onChange={(e) => updateImportCatMap(rawCat, { ignore: e.target.checked })}
                              /> ignorar
                            </label>
                          </div>
                          {m.samples && m.samples.length > 0 && (
                            <div className="bc-catmap-samples">
                              Ex: {m.samples.join(" · ")}
                            </div>
                          )}
                          {m.fromRule && (
                            <button className="bc-manage-link" onClick={() => forgetImportRule(rawCat)}>
                              esquecer regra e adivinhar de novo
                            </button>
                          )}
                          {!m.ignore && (
                            <div className="bc-catmap-fields">
                              <select value={m.type} onChange={(e) => updateImportCatMap(rawCat, { type: e.target.value, category: "", subcategory: "" })}>
                                <option value="income">Entrada</option>
                                <option value="expense">Saída</option>
                                <option value="invest">Investimento</option>
                              </select>
                              <span>
                                <input
                                  type="text" placeholder="categoria" value={m.category}
                                  list={`dl-cat-${normalizeHeader(m.type)}`}
                                  onChange={(e) => updateImportCatMap(rawCat, { category: e.target.value })}
                                />
                                {!catExists && m.category && <span className="bc-new-badge">nova categoria</span>}
                              </span>
                              <datalist id={`dl-cat-${normalizeHeader(m.type)}`}>
                                {Object.keys(categories[m.type] || {}).map((c) => <option key={c} value={c} />)}
                              </datalist>
                              <span>
                                <input
                                  type="text" placeholder="subcategoria (opcional)" value={m.subcategory}
                                  list={`dl-sub-${normalizeHeader(m.type)}-${normalizeHeader(m.category)}`}
                                  onChange={(e) => updateImportCatMap(rawCat, { subcategory: e.target.value })}
                                />
                                {!subExists && <span className="bc-new-badge">nova subcategoria</span>}
                              </span>
                              <datalist id={`dl-sub-${normalizeHeader(m.type)}-${normalizeHeader(m.category)}`}>
                                {(categories[m.type]?.[m.category] || []).map((s) => <option key={s} value={s} />)}
                              </datalist>
                              <span>
                                <select value={m.account || ""} onChange={(e) => updateImportCatMap(rawCat, { account: e.target.value })}>
                                  {renderImportAccountOptions()}
                                </select>
                                {m.sheetAccounts && m.sheetAccounts.length > 0 && (
                                  <span className="bc-sheet-account-hint">
                                    na planilha: {m.sheetAccounts.join(", ")}
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                          {!m.ignore && Object.keys(m.byDescription || {}).length > 1 && (
                            <div className="bc-desc-breakdown">
                              <button className="bc-manage-link" onClick={() => toggleExpandCat(rawCat)}>
                                {expandedCatRows[rawCat] ? "ocultar" : "ver"} {Object.keys(m.byDescription).length} descrições diferentes
                              </button>
                              {expandedCatRows[rawCat] && (
                                <div className="bc-desc-list">
                                  {sortPt(Object.keys(m.byDescription)).map((descText) => {
                                    const dstats = m.byDescription[descText];
                                    const descKey = normalizeHeader(descText);
                                    const override = importDescriptionOverrides[descKey];
                                    const isEditing = editingDescKey === descKey;
                                    return (
                                      <div className="bc-desc-row" key={descText}>
                                        <div className="bc-desc-top">
                                          <span className="bc-desc-name">{descText}</span>
                                          <span className="bc-catmap-stats">
                                            {dstats.count}x · {fmt(dstats.sum)}
                                            {dstats.firstDate && (
                                              <> · {formatDateBr(dstats.firstDate)}{dstats.lastDate && dstats.lastDate !== dstats.firstDate ? ` a ${formatDateBr(dstats.lastDate)}` : ""}</>
                                            )}
                                            {dstats.sheetAccounts && dstats.sheetAccounts.length > 0 && (
                                              <> · na planilha: {dstats.sheetAccounts.join(", ")}</>
                                            )}
                                          </span>
                                          {override && <span className="bc-rule-badge">personalizado</span>}
                                        </div>
                                        {!isEditing ? (
                                          <div className="bc-desc-actions">
                                            {override && (
                                              <span className="bc-desc-override-summary">
                                                → {override.ignore ? "ignorar" : `${override.category}${override.subcategory ? " › " + override.subcategory : ""}${override.account ? " · " + override.account : ""}`}
                                              </span>
                                            )}
                                            <button className="bc-manage-link" onClick={() => startEditDescription(descText, m, dstats)}>
                                              {override ? "editar" : "personalizar"}
                                            </button>
                                            {override && (
                                              <button className="bc-manage-link" onClick={() => removeDescriptionOverride(descText)}>
                                                remover
                                              </button>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="bc-desc-edit">
                                            <label className="bc-catmap-ignore">
                                              <input
                                                type="checkbox" checked={!!editingDescDraft.ignore}
                                                onChange={(e) => setEditingDescDraft({ ...editingDescDraft, ignore: e.target.checked })}
                                              /> ignorar
                                            </label>
                                            {!editingDescDraft.ignore && (
                                              <div className="bc-catmap-fields">
                                                <select
                                                  value={editingDescDraft.type}
                                                  onChange={(e) => setEditingDescDraft({ ...editingDescDraft, type: e.target.value, category: "", subcategory: "" })}
                                                >
                                                  <option value="income">Entrada</option>
                                                  <option value="expense">Saída</option>
                                                  <option value="invest">Investimento</option>
                                                </select>
                                                <input
                                                  type="text" placeholder="categoria" value={editingDescDraft.category}
                                                  list={`dl-cat-${normalizeHeader(editingDescDraft.type)}`}
                                                  onChange={(e) => setEditingDescDraft({ ...editingDescDraft, category: e.target.value })}
                                                />
                                                <input
                                                  type="text" placeholder="subcategoria (opcional)" value={editingDescDraft.subcategory}
                                                  list={`dl-sub-${normalizeHeader(editingDescDraft.type)}-${normalizeHeader(editingDescDraft.category)}`}
                                                  onChange={(e) => setEditingDescDraft({ ...editingDescDraft, subcategory: e.target.value })}
                                                />
                                                <datalist id={`dl-sub-${normalizeHeader(editingDescDraft.type)}-${normalizeHeader(editingDescDraft.category)}`}>
                                                  {(categories[editingDescDraft.type]?.[editingDescDraft.category] || []).map((s) => <option key={s} value={s} />)}
                                                </datalist>
                                                <select
                                                  value={editingDescDraft.account || ""}
                                                  onChange={(e) => setEditingDescDraft({ ...editingDescDraft, account: e.target.value })}
                                                >
                                                  {renderImportAccountOptions()}
                                                </select>
                                              </div>
                                            )}
                                            <div className="bc-desc-edit-actions">
                                              <button className="bc-btn-ghost" onClick={cancelEditingDescription}>Cancelar</button>
                                              <button className="bc-btn-primary" onClick={saveDescriptionOverride}><Check size={13} /> Salvar</button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>

                {Object.keys(importAccountMap).length > 0 && (
                  <>
                    <p className="bc-import-help">
                      Encontramos {Object.keys(importAccountMap).length} conta(s) que ainda não estão cadastradas. Escolha o tipo de cada uma, ou desmarque para não cadastrar.
                    </p>
                    <div className="bc-catmap-list">
                      {Object.entries(importAccountMap).map(([rawAcc, m]) => (
                        <div className="bc-catmap-row" key={rawAcc}>
                          <div className="bc-catmap-top">
                            <label className="bc-catmap-ignore">
                              <input
                                type="checkbox" checked={m.include !== false}
                                onChange={(e) => updateImportAccountMap(rawAcc, { include: e.target.checked })}
                              />
                            </label>
                            <span className="bc-catmap-raw">{rawAcc}</span>
                            {m.include !== false && (
                              <span className="bc-new-badge">nova conta</span>
                            )}
                          </div>
                          {m.include !== false && (
                            <div className="bc-account-kind-row">
                              <button
                                className={`bc-type-btn ${m.kind === "corrente" ? "active-income" : ""}`}
                                onClick={() => updateImportAccountMap(rawAcc, { kind: "corrente" })}
                              >
                                <Landmark size={14} /> Conta corrente
                              </button>
                              <button
                                className={`bc-type-btn ${m.kind === "credito" ? "active-invest" : ""}`}
                                onClick={() => updateImportAccountMap(rawAcc, { kind: "credito" })}
                              >
                                <CreditCard size={14} /> Cartão de crédito
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="bc-form-actions" style={{ justifyContent: "flex-end" }}>
                  <button className="bc-btn-ghost" onClick={() => setImportStep(2)}>Voltar</button>
                  <button className="bc-btn-primary" onClick={commitImport}>Importar lançamentos</button>
                </div>
              </div>
            )}

            {importStep === 4 && importResult && (
              <div>
                <p className="bc-import-help">
                  <strong>{importResult.imported}</strong> lançamentos importados com sucesso.
                  {importResult.transfersDetected > 0 && <> {importResult.transfersDetected} identificados como transferências entre suas contas.</>}
                  {importResult.duplicates > 0 && <> {importResult.duplicates} já existiam e foram pulados.</>}
                  {importResult.ignored > 0 && <> {importResult.ignored} ignorados (sem par correspondente ou marcados manualmente).</>}
                  {importResult.invalid > 0 && <> {importResult.invalid} linhas com data ou valor inválido foram descartadas.</>}
                </p>
                {importResult.newAccounts > 0 && (
                  <p className="bc-import-help">
                    {importResult.newAccounts} conta(s) nova(s) cadastrada(s) com o tipo que você escolheu.{" "}
                    <button className="bc-manage-link" onClick={() => setAccountManagerOpen(true)}>Revisar contas</button>
                  </p>
                )}
                {importResult.newCategories > 0 && (
                  <p className="bc-import-help">
                    {importResult.newCategories} categoria(s)/subcategoria(s) nova(s) cadastrada(s).{" "}
                    <button className="bc-manage-link" onClick={() => setManagerOpen(true)}>Revisar categorias</button>
                  </p>
                )}
                <div className="bc-form-actions" style={{ justifyContent: "flex-end" }}>
                  <button className="bc-btn-ghost" onClick={() => { resetImport(); }}>Importar outro arquivo</button>
                  <button className="bc-btn-primary" onClick={() => setImportOpen(false)}><Check size={14} /> Concluir</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
