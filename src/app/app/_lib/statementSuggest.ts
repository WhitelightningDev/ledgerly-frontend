import type { BankTxn } from "./bankTxns";
import { firstMatchingRule, loadRules } from "./rules";

function pickCounterpartyName(txn: BankTxn): string {
  const s = (txn.original_description || txn.description || "").trim();
  return s || (txn.description || "").trim();
}

export function suggestAllocationForTxn(args: {
  companyId: string;
  txn: BankTxn;
}): Partial<BankTxn> {
  const rules = loadRules(args.companyId);
  const direction = args.txn.amount < 0 ? "money_out" : "money_in";
  const appliesTo = direction === "money_out" ? "receipt" : "invoice";
  const counterpartyName = pickCounterpartyName(args.txn);

  const rule = firstMatchingRule({
    rules,
    appliesTo,
    counterpartyName,
  });

  const suggestion: Partial<BankTxn> = {
    allocation_direction: direction,
  };

  if (rule) {
    if (rule.set_category) suggestion.allocation_category = rule.set_category;
    if (rule.set_account_code) suggestion.allocation_account_code = rule.set_account_code;
    if (rule.set_tax_treatment) suggestion.allocation_tax_treatment = rule.set_tax_treatment;
    if (rule.set_payment_method) suggestion.allocation_notes = `Payment method: ${rule.set_payment_method}`;
  }

  // Fall back to bank-provided category if present.
  if (!suggestion.allocation_category && args.txn.statement_category) {
    suggestion.allocation_category = args.txn.statement_category;
  }

  return suggestion;
}

