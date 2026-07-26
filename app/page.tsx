"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Frequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
type Status = "not-paid" | "paid" | "cleared";
type Category = "first-half" | "second-half" | "flex";
type Recurrence = "per-paycheck" | "monthly" | "selected-months" | "annual";
type ItemKind = "expense" | "credit";
type ExpenseSortKey = "name" | "kind" | "amount" | "dueDay" | "category" | "recurrence";
type FilterKey = "all" | ExpenseSortKey;
type SortDirection = "asc" | "desc";
type AppTheme = "classic" | "halloween" | "sakura" | "hotline";

type Expense = {
  id: string;
  name: string;
  kind: ItemKind;
  amount: number;
  dueDay: number;
  category: Category;
  recurrence: Recurrence;
  activeMonths: number[];
  annualMonth: number;
  statuses: Record<string, Status>;
  monthlyAmounts: Record<string, number>;
  amountOverrides: Record<string, number>;
};

type Paycheck = {
  date: Date;
  label: string;
  income: number;
  expenses: ProjectedExpense[];
  expenseTotal: number;
  creditTotal: number;
  remaining: number;
};

type ProjectedExpense = {
  expense: Expense;
  occurrence: Date;
  monthKey: string;
  statusKey: string;
  amount: number;
  status: Status;
};

type AppState = {
  paycheckAmount: number;
  frequency: Frequency;
  nextPayDate: string;
  threshold: number;
  monthsAhead: number;
  theme: AppTheme;
  expenses: Expense[];
};

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const shortMonths = monthNames.map((month) => month.slice(0, 3));

const expenseSortLabels: Record<ExpenseSortKey, string> = {
  name: "Name",
  kind: "Type",
  amount: "Amount",
  dueDay: "Due",
  category: "Group",
  recurrence: "Schedule",
};

const themeLabels: Record<AppTheme, string> = {
  classic: "Classic",
  halloween: "Halloween",
  sakura: "Sakura",
  hotline: "Hotline Miami",
};

const defaultExpenses: Expense[] = [];

const defaultState: AppState = {
  paycheckAmount: 0,
  frequency: "biweekly",
  nextPayDate: isoDate(new Date()),
  threshold: 0,
  monthsAhead: 4,
  theme: "classic",
  expenses: defaultExpenses,
};

function makeExpense(
  name: string,
  amount: number,
  dueDay: number,
  category: Category,
  id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${dueDay}-${category}`,
): Expense {
  return {
    id,
    name,
    kind: "expense",
    amount,
    dueDay,
    category,
    recurrence: "monthly",
    activeMonths: [],
    annualMonth: new Date().getMonth(),
    statuses: {},
    monthlyAmounts: {},
    amountOverrides: {},
  };
}

function normalizeExpense(expense: Expense): Expense {
  return {
    ...expense,
    kind: expense.kind || "expense",
    recurrence: expense.recurrence || "monthly",
    activeMonths: Array.isArray(expense.activeMonths) ? expense.activeMonths : [],
    annualMonth: Number.isInteger(expense.annualMonth) ? expense.annualMonth : new Date().getMonth(),
    statuses: expense.statuses || {},
    monthlyAmounts: expense.monthlyAmounts || {},
    amountOverrides: expense.amountOverrides || {},
  };
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function occurrenceStatusKey(date: Date) {
  return `occurrence:${isoDate(date)}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return `${shortMonths[month - 1]} ${year}`;
}

function selectedMonthIndex(key: string) {
  return Number(key.split("-")[1]) - 1;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function normalizeStatus(value: string | undefined): Status {
  const clean = (value || "").trim().toLowerCase();
  if (clean === "c" || clean === "cleared") return "cleared";
  if (clean === "p" || clean === "paid") return "paid";
  return "not-paid";
}

function normalizeKind(value: string | undefined): ItemKind {
  const clean = (value || "").trim().toLowerCase();
  return clean === "credit" || clean === "income" ? "credit" : "expense";
}

function parseCurrency(value: string | undefined) {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") return 0;
  const parsed = Number(trimmed.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

function parseImportedExpenses(text: string): Expense[] {
  const rows = parseCsv(text);
  const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) || [];
  const hasListHeaders =
    header.includes("name") &&
    (header.includes("amount") || header.includes("due date") || header.includes("due day"));

  if (hasListHeaders) {
    const nameIndex = header.indexOf("name");
    const amountIndex = header.indexOf("amount");
    const dueIndex = header.includes("due day")
      ? header.indexOf("due day")
      : header.indexOf("due date");
    const statusIndex = header.indexOf("status");
    const categoryIndex = header.indexOf("category");
    const kindIndex = header.indexOf("type");

    return rows.slice(1).flatMap((row) => {
      const name = row[nameIndex]?.trim();
      if (!name) return [];
      const dueDay = Math.min(31, Math.max(1, parseInt(row[dueIndex] || "1", 10) || 1));
      const category = normalizeCategory(row[categoryIndex], dueDay);
      const expense = makeExpense(name, parseCurrency(row[amountIndex]), dueDay, category);
      if (kindIndex >= 0) {
        expense.kind = normalizeKind(row[kindIndex]);
      }
      if (statusIndex >= 0) {
        expense.statuses[monthKey(new Date())] = normalizeStatus(row[statusIndex]);
      }
      return [expense];
    });
  }

  const monthColumns = rows[0]
    .map((cell, index) => ({ month: monthNames.findIndex((m) => m.toLowerCase() === cell.trim().toLowerCase()), index }))
    .filter((item) => item.month >= 0);

  const byName = new Map<string, Expense>();

  rows.slice(1).forEach((row, rowIndex) => {
    const name = (row[0] || row[row.length - 1] || "").trim();
    if (!name || /total|remaining/i.test(name)) return;

    const entries = monthColumns
      .map(({ month, index }) => ({
        key: `2026-${String(month + 1).padStart(2, "0")}`,
        amount: parseCurrency(row[index]),
        status: normalizeStatus(row[index + 1]),
      }))
      .filter((entry) => entry.amount > 0);

    if (!entries.length) return;

    const category: Category = rowIndex < 22 ? "first-half" : rowIndex < 30 ? "flex" : "second-half";
    const dueDay = category === "second-half" ? 16 : category === "flex" ? 8 : 1;
    const expense = byName.get(name) || makeExpense(name, entries[entries.length - 1].amount, dueDay, category);
    expense.recurrence = entries.length < monthColumns.length ? "selected-months" : "monthly";
    expense.activeMonths = entries.map((entry) => Number(entry.key.split("-")[1]) - 1);

    entries.forEach((entry) => {
      expense.monthlyAmounts[entry.key] = entry.amount;
      expense.statuses[entry.key] = entry.status;
      expense.amount = entry.amount;
    });

    byName.set(name, expense);
  });

  return Array.from(byName.values());
}

function normalizeCategory(value: string | undefined, dueDay: number): Category {
  const clean = (value || "").toLowerCase();
  if (clean.includes("second")) return "second-half";
  if (clean.includes("flex") || clean.includes("other")) return "flex";
  if (clean.includes("first")) return "first-half";
  return dueDay > 15 ? "second-half" : "first-half";
}

function categoryLabel(category: Category) {
  if (category === "first-half") return "First half";
  if (category === "second-half") return "Second half";
  return "Flexible";
}

function kindLabel(kind: ItemKind) {
  return kind === "credit" ? "Credit" : "Expense";
}

function recurrenceFilterLabel(expense: Expense) {
  const cleanExpense = normalizeExpense(expense);
  if (cleanExpense.recurrence === "per-paycheck") return "Per paycheck";
  if (cleanExpense.recurrence === "monthly") return "Per month";
  if (cleanExpense.recurrence === "annual") return `Once a year ${monthNames[cleanExpense.annualMonth]}`;
  return `Certain months ${cleanExpense.activeMonths.map((month) => shortMonths[month]).join(" ")}`;
}

function dueDayForCategory(category: Category, currentDueDay: number) {
  if (category === "first-half") return 1;
  if (category === "second-half") return 15;
  return currentDueDay || 1;
}

function expenseFieldValue(expense: Expense, key: ExpenseSortKey, selectedMonth: string) {
  const cleanExpense = normalizeExpense(expense);
  if (key === "name") return cleanExpense.name;
  if (key === "kind") return kindLabel(cleanExpense.kind);
  if (key === "amount") return expenseAmountForMonth(cleanExpense, selectedMonth);
  if (key === "dueDay") return cleanExpense.dueDay;
  if (key === "category") return categoryLabel(cleanExpense.category);
  return recurrenceFilterLabel(cleanExpense);
}

function expenseSearchText(expense: Expense, selectedMonth: string) {
  return (Object.keys(expenseSortLabels) as ExpenseSortKey[])
    .map((key) => String(expenseFieldValue(expense, key, selectedMonth)))
    .join(" ")
    .toLowerCase();
}

function expenseRunsInMonth(expense: Expense, date: Date) {
  const cleanExpense = normalizeExpense(expense);
  const month = date.getMonth();
  if (cleanExpense.recurrence === "per-paycheck") return true;
  if (cleanExpense.recurrence === "monthly") return true;
  if (cleanExpense.recurrence === "selected-months") return cleanExpense.activeMonths.includes(month);
  return cleanExpense.annualMonth === month;
}

function recurrenceLabel(expense: Expense) {
  const cleanExpense = normalizeExpense(expense);
  if (cleanExpense.recurrence === "per-paycheck") return "every paycheck";
  if (cleanExpense.recurrence === "monthly") return "monthly";
  if (cleanExpense.recurrence === "annual") return `yearly in ${monthNames[cleanExpense.annualMonth]}`;
  if (!cleanExpense.activeMonths.length) return "no months selected";
  return cleanExpense.activeMonths.map((month) => shortMonths[month]).join(", ");
}

function expenseAmountForMonth(expense: Expense, key: string) {
  const cleanExpense = normalizeExpense(expense);
  if (cleanExpense.recurrence === "per-paycheck" || cleanExpense.recurrence === "monthly") {
    return cleanExpense.amount;
  }
  return cleanExpense.monthlyAmounts[key] ?? cleanExpense.amount;
}

function projectedAmountForOccurrence(expense: Expense, statusKey: string, fallbackMonthKey: string) {
  const cleanExpense = normalizeExpense(expense);
  return cleanExpense.amountOverrides[statusKey] ?? expenseAmountForMonth(cleanExpense, fallbackMonthKey);
}

function applyProjectedItem(check: Paycheck, item: ProjectedExpense) {
  check.expenses.push(item);
  if (item.expense.kind === "credit") {
    check.creditTotal += item.amount;
    check.remaining += item.amount;
    return;
  }
  check.expenseTotal += item.amount;
  check.remaining -= item.amount;
}

function itemAmountLabel(item: ProjectedExpense) {
  const prefix = item.expense.kind === "credit" ? "+" : "";
  return `${prefix}${money(item.amount)}`;
}

function statusForOccurrence(expense: Expense, key: string, fallbackMonthKey: string) {
  return expense.statuses[key] || expense.statuses[fallbackMonthKey] || "not-paid";
}

function unpaidSummary(check: Paycheck) {
  const unpaidCount = check.expenses.filter((item) => item.status === "not-paid").length;
  if (unpaidCount === 0) return "All Paid";
  return `${unpaidCount} unpaid ${unpaidCount === 1 ? "item" : "items"}`;
}

function nextPayDate(current: Date, frequency: Frequency) {
  if (frequency === "weekly") return addDays(current, 7);
  if (frequency === "biweekly") return addDays(current, 14);
  if (frequency === "monthly") return addMonths(current, 1);

  const next = new Date(current);
  const day = next.getDate();
  if (day < 15) {
    next.setDate(15);
  } else {
    next.setMonth(next.getMonth() + 1, 1);
  }
  return next;
}

function buildPaychecks(state: AppState): Paycheck[] {
  const start = new Date(`${state.nextPayDate}T12:00:00`);
  const end = addMonths(start, state.monthsAhead);
  const checks: Paycheck[] = [];
  let cursor = start;

  while (cursor <= addDays(end, 31)) {
    checks.push({
      date: new Date(cursor),
      label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      income: state.paycheckAmount,
      expenses: [],
      expenseTotal: 0,
      creditTotal: 0,
      remaining: state.paycheckAmount,
    });
    cursor = nextPayDate(cursor, state.frequency);
  }

  const displayedChecks = checks.filter((check) => check.date <= end);

  displayedChecks.forEach((check, checkIndex) => {
    const periodEnd = checks[checkIndex + 1]?.date || nextPayDate(check.date, state.frequency);

    state.expenses.map(normalizeExpense).forEach((expense) => {
      if (expense.recurrence !== "per-paycheck") return;
      const key = monthKey(check.date);
      const statusKey = occurrenceStatusKey(check.date);
      const amount = projectedAmountForOccurrence(expense, statusKey, key);
      applyProjectedItem(check, {
        expense,
        occurrence: check.date,
        monthKey: key,
        statusKey,
        amount,
        status: statusForOccurrence(expense, statusKey, key),
      });
    });

    const monthCursor = new Date(check.date.getFullYear(), check.date.getMonth(), 1, 12);
    const finalMonth = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1, 12);

    while (monthCursor <= finalMonth) {
      const key = monthKey(monthCursor);
      state.expenses.map(normalizeExpense).forEach((expense) => {
        if (expense.recurrence === "per-paycheck" || !expenseRunsInMonth(expense, monthCursor)) return;
        const occurrence = new Date(
          monthCursor.getFullYear(),
          monthCursor.getMonth(),
          Math.min(expense.dueDay, 28),
          12,
        );
        if (occurrence < check.date || occurrence >= periodEnd) return;
        const statusKey = occurrenceStatusKey(occurrence);
        const amount = projectedAmountForOccurrence(expense, statusKey, key);
        applyProjectedItem(check, {
          expense,
          occurrence,
          monthKey: key,
          statusKey,
          amount,
          status: statusForOccurrence(expense, statusKey, key),
        });
      });

      monthCursor.setMonth(monthCursor.getMonth() + 1);
    }

    check.expenses.sort((a, b) => {
      const dateSort = a.occurrence.getTime() - b.occurrence.getTime();
      if (dateSort !== 0) return dateSort;
      return a.expense.name.localeCompare(b.expense.name);
    });
  });

  return displayedChecks;
}

export default function Home() {
  const [state, setState] = useState<AppState>(defaultState);
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const [importMessage, setImportMessage] = useState("Ready to import a Google Sheet CSV.");
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Loading shared household data...");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [filterKey, setFilterKey] = useState<FilterKey>("all");
  const [filterValue, setFilterValue] = useState("");
  const [sortKey, setSortKey] = useState<ExpenseSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    async function loadSavedState() {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) throw new Error("The shared database could not be reached.");
        const payload = (await response.json()) as { state?: AppState | null };
        if (!active) return;
        if (payload.state) {
          setState({
            ...defaultState,
            ...payload.state,
            expenses: (payload.state.expenses || []).map(normalizeExpense),
          });
          setSaveStatus("Shared data loaded.");
        } else {
          setSaveStatus("No shared data yet. Changes will save to the database.");
        }
      } catch {
        if (!active) return;
        setSaveStatus("Database unavailable. Changes on this screen may not be shared.");
      } finally {
        if (active) setIsLoaded(true);
      }
    }

    loadSavedState();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setSaveStatus("Saving shared data...");
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Save failed.");
        setSaveStatus("Shared data saved.");
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSaveStatus("Shared database save failed.");
        }
      }
    }, 500);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [isLoaded, state]);

  const paychecks = useMemo(() => buildPaychecks(state), [state]);
  const selectedTotal = useMemo(
    () =>
      state.expenses.reduce((sum, expense) => {
        const cleanExpense = normalizeExpense(expense);
        const selectedDate = new Date(`${selectedMonth}-01T12:00:00`);
        if (!expenseRunsInMonth(cleanExpense, selectedDate)) return sum;
        const amount = expenseAmountForMonth(cleanExpense, selectedMonth);
        const signedAmount = cleanExpense.kind === "credit" ? -amount : amount;
        if (cleanExpense.recurrence !== "per-paycheck") return sum + signedAmount;
        return sum + signedAmount * paychecks.filter((check) => monthKey(check.date) === selectedMonth).length;
      }, 0),
    [paychecks, selectedMonth, state.expenses],
  );
  const tightChecks = paychecks.filter((check) => check.remaining < state.threshold);
  const displayedExpenses = useMemo(() => {
    const search = expenseSearch.trim().toLowerCase();
    const filter = filterValue.trim().toLowerCase();

    return state.expenses
      .map(normalizeExpense)
      .filter((expense) => {
        const matchesSearch = !search || expenseSearchText(expense, selectedMonth).includes(search);
        if (!matchesSearch) return false;
        if (!filter) return true;
        if (filterKey === "all") return expenseSearchText(expense, selectedMonth).includes(filter);
        return String(expenseFieldValue(expense, filterKey, selectedMonth)).toLowerCase().includes(filter);
      })
      .sort((left, right) => {
        const leftValue = expenseFieldValue(left, sortKey, selectedMonth);
        const rightValue = expenseFieldValue(right, sortKey, selectedMonth);
        const direction = sortDirection === "asc" ? 1 : -1;
        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return (leftValue - rightValue) * direction;
        }
        return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true }) * direction;
      });
  }, [expenseSearch, filterKey, filterValue, selectedMonth, sortDirection, sortKey, state.expenses]);

  function updateState<K extends keyof AppState>(key: K, value: AppState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function updateExpenseSort(key: ExpenseSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  function updateExpense(id: string, patch: Partial<Expense>) {
    setState((current) => ({
      ...current,
      expenses: current.expenses.map((expense) =>
        expense.id === id ? { ...normalizeExpense(expense), ...patch } : normalizeExpense(expense),
      ),
    }));
  }

  function updateExpenseRecurrence(expense: Expense, recurrence: Recurrence) {
    const month = selectedMonthIndex(selectedMonth);
    updateExpense(expense.id, {
      recurrence,
      activeMonths:
        recurrence === "selected-months" && !expense.activeMonths.length ? [month] : expense.activeMonths,
      annualMonth: recurrence === "annual" ? month : expense.annualMonth,
      monthlyAmounts: recurrence === "per-paycheck" || recurrence === "monthly" ? {} : expense.monthlyAmounts,
    });
  }

  function updateExpenseCategory(expense: Expense, category: Category) {
    updateExpense(expense.id, {
      category,
      dueDay: dueDayForCategory(category, expense.dueDay),
    });
  }

  function toggleExpenseMonth(expense: Expense, month: number) {
    const activeMonths = expense.activeMonths.includes(month)
      ? expense.activeMonths.filter((activeMonth) => activeMonth !== month)
      : [...expense.activeMonths, month].sort((a, b) => a - b);
    updateExpense(expense.id, { activeMonths });
  }

  function updateProjectedStatus(item: ProjectedExpense, status: Status) {
    updateExpense(item.expense.id, {
      statuses: { ...item.expense.statuses, [item.statusKey]: status },
    });
  }

  function updateProjectedAmount(item: ProjectedExpense, amount: number) {
    const baseline = expenseAmountForMonth(item.expense, item.monthKey);
    const amountOverrides = { ...normalizeExpense(item.expense).amountOverrides };
    if (amount === baseline) {
      delete amountOverrides[item.statusKey];
    } else {
      amountOverrides[item.statusKey] = amount;
    }
    updateExpense(item.expense.id, { amountOverrides });
  }

  function addExpense() {
    setState((current) => ({
      ...current,
      expenses: [...current.expenses, makeExpense("New expense", 0, 1, "first-half", `expense-${Date.now()}`)],
    }));
  }

  function removeExpense(id: string) {
    setState((current) => ({
      ...current,
      expenses: current.expenses.filter((expense) => expense.id !== id),
    }));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pay-schedule-dashboard.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const imported = parseImportedExpenses(text);
    if (!imported.length) {
      setImportMessage("I could not find expense rows in that CSV.");
      return;
    }
    setState((current) => ({ ...current, expenses: imported }));
    setSelectedMonth(imported[0] ? Object.keys(imported[0].monthlyAmounts)[0] || selectedMonth : selectedMonth);
    setImportMessage(`Imported ${imported.length} expenses from ${file.name}.`);
    event.target.value = "";
  }

  return (
    <main className="app-shell min-h-screen" data-theme={state.theme}>
      <section className="app-header">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6f5f4d]">Pay Schedule Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold md:text-5xl">Payroll, bills, and expense planner</h1>
            <p className="mt-3 max-w-3xl text-base text-[#665f55]">
              Import your sheet, mark bills as paid or cleared, and see which paycheck carries each expense before it
              hits the account.
            </p>
          </div>
          <div className="summary-strip" aria-label="Projection summary">
            <span>
              <strong>{money(state.paycheckAmount)}</strong>
              paycheck
            </span>
            <span>
              <strong>{paychecks.length}</strong>
              checks
            </span>
            <span className={tightChecks.length ? "warning" : ""}>
              <strong>{tightChecks.length}</strong>
              tight
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-5 xl:grid-cols-[360px_1fr]">
        <aside className="control-panel">
          <section>
            <h2>Paycheck setup</h2>
            <label>
              Pay per paycheck
              <input
                type="number"
                value={state.paycheckAmount}
                min={0}
                onChange={(event) => updateState("paycheckAmount", Number(event.target.value))}
              />
            </label>
            <label>
              Pay frequency
              <select value={state.frequency} onChange={(event) => updateState("frequency", event.target.value as Frequency)}>
                <option value="biweekly">Bi-weekly</option>
                <option value="weekly">Weekly</option>
                <option value="semimonthly">Semi-monthly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label>
              Next paycheck date
              <input
                type="date"
                value={state.nextPayDate}
                onChange={(event) => updateState("nextPayDate", event.target.value)}
              />
            </label>
            <label>
              Tight-money threshold
              <input
                type="number"
                value={state.threshold}
                min={0}
                onChange={(event) => updateState("threshold", Number(event.target.value))}
              />
            </label>
            <label>
              Projection window
              <select value={state.monthsAhead} onChange={(event) => updateState("monthsAhead", Number(event.target.value))}>
                <option value={2}>2 months</option>
                <option value={4}>4 months</option>
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
              </select>
            </label>
            <label>
              Theme
              <select value={state.theme} onChange={(event) => updateState("theme", event.target.value as AppTheme)}>
                {(Object.keys(themeLabels) as AppTheme[]).map((theme) => (
                  <option value={theme} key={theme}>
                    {themeLabels[theme]}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section>
            <h2>Import and save</h2>
            <input ref={fileRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={importCsv} />
            <button className="primary-button" type="button" onClick={() => fileRef.current?.click()}>
              Import CSV
            </button>
            <button className="secondary-button" type="button" onClick={exportData}>
              Export backup
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setState(defaultState);
                setImportMessage("Shared data was reset.");
              }}
            >
              Reset saved data
            </button>
            <p className="status-note">{importMessage}</p>
            <p className="status-note">{saveStatus}</p>
          </section>
        </aside>

        <section className="space-y-5">
          {tightChecks.length > 0 && (
            <div className="alert-band">
              <strong>Money is tight on {tightChecks.length} paycheck{tightChecks.length > 1 ? "s" : ""}.</strong>
              <span>
                Lowest projected remainder: {money(Math.min(...tightChecks.map((check) => check.remaining)))}.
              </span>
            </div>
          )}

          <div className="projection-grid">
            {paychecks.map((check) => (
              <article className={check.remaining < state.threshold ? "paycheck-card tight" : "paycheck-card"} key={check.date.toISOString()}>
                <div className="paycheck-head">
                  <div>
                    <p>{check.date.toLocaleDateString("en-US", { weekday: "short" })}</p>
                    <h2>{check.label}</h2>
                    <div className="paycheck-totals">
                      <span className={check.expenses.some((item) => item.status === "not-paid") ? "open-status" : "paid-status"}>
                        {unpaidSummary(check)}
                      </span>
                      <span>Expenses {money(check.expenseTotal)}</span>
                      {check.creditTotal > 0 && <span>Credits +{money(check.creditTotal)}</span>}
                      <span>Difference {money(check.remaining)}</span>
                    </div>
                  </div>
                  <span className="remaining-total">{money(check.remaining)}</span>
                </div>
                <div className="meter" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, (check.remaining / check.income) * 100))}%` }} />
                </div>
                <ul>
                  {check.expenses.map((item, index) => (
                    <li key={`${item.expense.id}-${item.monthKey}-${index}`}>
                      <div>
                        <strong>{item.expense.name}</strong>
                        <small>
                          Due {item.occurrence.toLocaleDateString("en-US", { month: "short", day: "numeric" })} -{" "}
                          {item.status.replace("-", " ")} - {recurrenceLabel(item.expense)}
                        </small>
                        <div
                          className="projected-status"
                          aria-label={`${item.expense.name} status for ${item.occurrence.toLocaleDateString("en-US")}`}
                        >
                          {(["not-paid", "paid", "cleared"] as Status[]).map((status) => (
                            <button
                              type="button"
                              className={item.status === status ? "active" : ""}
                              onClick={() => updateProjectedStatus(item, status)}
                              key={status}
                            >
                              {status === "not-paid" ? "Open" : status === "paid" ? "Paid" : "Cleared"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="projected-amount">
                        Amount
                        <input
                          type="number"
                          value={item.amount}
                          min={0}
                          onChange={(event) => updateProjectedAmount(item, Number(event.target.value))}
                          aria-label={`${item.expense.name} amount for ${item.occurrence.toLocaleDateString("en-US")}`}
                        />
                        {item.amount !== expenseAmountForMonth(item.expense, item.monthKey) && (
                          <small>Original {itemAmountLabel({ ...item, amount: expenseAmountForMonth(item.expense, item.monthKey) })}</small>
                        )}
                      </label>
                    </li>
                  ))}
                  {check.expenses.length === 0 && <li className="empty-row">No scheduled expenses.</li>}
                </ul>
              </article>
            ))}
          </div>

          <div className="expense-manager">
            <div className="table-toolbar">
              <div>
                <h2>Expense register</h2>
                <p>
                  {monthLabel(selectedMonth)} total: {money(selectedTotal)} - Showing {displayedExpenses.length} of{" "}
                  {state.expenses.length}
                </p>
              </div>
              <div className="toolbar-actions">
                <input
                  type="search"
                  value={expenseSearch}
                  onChange={(event) => setExpenseSearch(event.target.value)}
                  placeholder="Search expenses"
                  aria-label="Search expenses"
                />
                <select value={filterKey} onChange={(event) => setFilterKey(event.target.value as FilterKey)} aria-label="Filter field">
                  <option value="all">Any field</option>
                  {(Object.keys(expenseSortLabels) as ExpenseSortKey[]).map((key) => (
                    <option value={key} key={key}>
                      {expenseSortLabels[key]}
                    </option>
                  ))}
                </select>
                <input
                  type="search"
                  value={filterValue}
                  onChange={(event) => setFilterValue(event.target.value)}
                  placeholder="Filter value"
                  aria-label="Filter value"
                />
                <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
                  {Array.from({ length: 12 }, (_, index) => {
                    const date = addMonths(new Date(), index);
                    const key = monthKey(date);
                    return (
                      <option value={key} key={key}>
                        {monthLabel(key)}
                      </option>
                    );
                  })}
                </select>
                <button className="primary-button compact" type="button" onClick={addExpense}>
                  Add item
                </button>
              </div>
            </div>

            <div className="expense-table">
              <div className="expense-row header">
                {(Object.keys(expenseSortLabels) as ExpenseSortKey[]).map((key) => (
                  <button type="button" onClick={() => updateExpenseSort(key)} key={key}>
                    {expenseSortLabels[key]}
                    {sortKey === key ? (sortDirection === "asc" ? " Asc" : " Desc") : ""}
                  </button>
                ))}
                <span></span>
              </div>
              {displayedExpenses.map((rawExpense) => {
                const expense = normalizeExpense(rawExpense);
                return (
                <div className="expense-row" key={expense.id}>
                  <input value={expense.name} onChange={(event) => updateExpense(expense.id, { name: event.target.value })} />
                  <select value={expense.kind} onChange={(event) => updateExpense(expense.id, { kind: event.target.value as ItemKind })}>
                    <option value="expense">Expense</option>
                    <option value="credit">Credit</option>
                  </select>
                  <input
                    type="number"
                    value={expenseAmountForMonth(expense, selectedMonth)}
                    min={0}
                    onChange={(event) => {
                      const amount = Number(event.target.value);
                      updateExpense(expense.id, {
                        amount,
                        monthlyAmounts:
                          expense.recurrence === "per-paycheck" || expense.recurrence === "monthly"
                            ? {}
                            : { ...expense.monthlyAmounts, [selectedMonth]: amount },
                      });
                    }}
                  />
                  <input
                    type="number"
                    value={expense.dueDay}
                    min={1}
                    max={31}
                    onChange={(event) => updateExpense(expense.id, { dueDay: Number(event.target.value) })}
                  />
                  <select value={expense.category} onChange={(event) => updateExpenseCategory(expense, event.target.value as Category)}>
                    <option value="first-half">First half</option>
                    <option value="second-half">Second half</option>
                    <option value="flex">Flexible</option>
                  </select>
                  <div className="recurrence-cell">
                    <select value={expense.recurrence} onChange={(event) => updateExpenseRecurrence(expense, event.target.value as Recurrence)}>
                      <option value="per-paycheck">Per paycheck</option>
                      <option value="monthly">Per month</option>
                      <option value="selected-months">Certain months</option>
                      <option value="annual">Once a year</option>
                    </select>
                    {expense.recurrence === "selected-months" && (
                      <div className="month-picker" aria-label={`${expense.name} active months`}>
                        {shortMonths.map((month, index) => (
                          <button
                            type="button"
                            className={expense.activeMonths.includes(index) ? "active" : ""}
                            onClick={() => toggleExpenseMonth(expense, index)}
                            key={month}
                          >
                            {month}
                          </button>
                        ))}
                      </div>
                    )}
                    {expense.recurrence === "annual" && (
                      <select value={expense.annualMonth} onChange={(event) => updateExpense(expense.id, { annualMonth: Number(event.target.value) })}>
                        {monthNames.map((month, index) => (
                          <option value={index} key={month}>
                            {month}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <button className="remove-button" type="button" onClick={() => removeExpense(expense.id)} aria-label={`Remove ${expense.name}`}>
                    Remove
                  </button>
                </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
