import { describe, it, expect } from "vitest";
import { renameAccountInEntry } from "./accountRename";

describe("renameAccountInEntry", () => {
  it("renames the account of a normal entry", () => {
    const e = { id: "1", type: "expense", account: "Nubank", amount: 10 };
    expect(renameAccountInEntry(e, "Nubank", "Nu")).toEqual({ id: "1", type: "expense", account: "Nu", amount: 10 });
  });

  it("renames the origin of a transfer", () => {
    const e = { id: "2", type: "transfer", fromAccount: "Nubank", toAccount: "Itau", amount: 50 };
    expect(renameAccountInEntry(e, "Nubank", "Nu")).toEqual({ id: "2", type: "transfer", fromAccount: "Nu", toAccount: "Itau", amount: 50 });
  });

  it("renames the destination of a transfer", () => {
    const e = { id: "3", type: "transfer", fromAccount: "Itau", toAccount: "Nubank", amount: 50 };
    expect(renameAccountInEntry(e, "Nubank", "Nu")).toEqual({ id: "3", type: "transfer", fromAccount: "Itau", toAccount: "Nu", amount: 50 });
  });

  it("returns the very same object when nothing changes", () => {
    const e = { id: "4", type: "income", account: "Itau", amount: 5 };
    expect(renameAccountInEntry(e, "Nubank", "Nu")).toBe(e);
    const t = { id: "5", type: "transfer", fromAccount: "Itau", toAccount: "Bolso", amount: 5 };
    expect(renameAccountInEntry(t, "Nubank", "Nu")).toBe(t);
  });
});
