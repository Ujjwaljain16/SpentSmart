/**
 * Every amount the assistant states must come from a tool result. This pulls rupee amounts out of text and checks
 * each against the amounts the tools returned, allowing the rounding a person would do ("about ₹3,500" for
 * ₹3,452.10). Anything left over is shown to the user as unverified.
 */

export interface StatedAmount {
  text: string;
  paise: number;
  /** Half the smallest unit the text expresses, in paise: "₹3,500" ±₹50, "₹3,452.10" exact. */
  tolerancePaise: number;
}

const AMOUNT = /(?:₹|\bRs\.?|\bINR)\s?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?\s?(k|K|lakh|lakhs|L)?\b/g;

export function statedAmounts(text: string): StatedAmount[] {
  const out: StatedAmount[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const digits = m[1]!.replace(/,/g, '');
    const fraction = m[2];
    const unit = m[3]?.toLowerCase();
    const multiplier = unit === 'k' ? 1_000 : unit ? 1_00_000 : 1;
    const rupees = Number(`${digits}${fraction ? `.${fraction}` : ''}`) * multiplier;
    let stepRupees: number;
    if (fraction) stepRupees = 10 ** -fraction.length * multiplier;
    else {
      const trailingZeros = digits.length - digits.replace(/0+$/, '').length;
      stepRupees = 10 ** Math.min(trailingZeros, digits.length - 1) * multiplier;
    }
    out.push({ text: m[0].trim(), paise: Math.round(rupees * 100), tolerancePaise: Math.max(0, Math.round((stepRupees * 100) / 2)) });
  }
  return out;
}

/** Amounts found anywhere in tool results (they're always formatted strings like "₹3,452.10"). */
export function evidenceAmounts(toolResults: readonly unknown[]): number[] {
  return statedAmounts(JSON.stringify(toolResults)).map((a) => a.paise);
}

export function untracedAmounts(reply: string, toolResults: readonly unknown[]): StatedAmount[] {
  const evidence = evidenceAmounts(toolResults);
  return statedAmounts(reply).filter((a) => !evidence.some((e) => Math.abs(e - a.paise) <= a.tolerancePaise));
}
