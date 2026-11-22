import { Paise, parseRupees } from '../money';
import { deriveNameFromVpa, sanitizeText } from '../upi/vpa';

export type CaptureDirection = 'debit' | 'credit';

export interface CapturedPayment {
  direction: CaptureDirection;
  amountPaise: Paise;
  payeeName: string | null;
  payeeVpa: string | null;
  reference: string | null;
  /** How the money moved, when the text says: an ATM withdrawal is a transfer to cash, not spending. */
  via: 'upi' | 'card' | 'atm' | null;
}

/**
 * Anything that isn't a completed payment, and anything that carries a secret, is rejected outright: OTPs, collect
 * requests (a common scam), reminders, upcoming or failed debits, and promotions.
 */
const REJECT =
  /\b(otp|one[\s-]?time|verification code|passcode|do not share|don'?t share|never share|cvv|upi pin|enter (?:your )?pin|has requested|requested (?:money|₹|rs|inr)|requesting|collect request|request(?:ed)? (?:for|of) (?:₹|rs|inr)|will be (?:debited|deducted|charged)|is due|due (?:on|date|by)|minimum due|reminder|mandate|autopay (?:is )?(?:set|registered|created)|scheduled|failed|declined|unsuccessful|insufficient|cashback|scratch card|you won|reward|offer)\b/i;

const DEBIT = /\b(debited|spent|paid|sent|withdrawn|deducted|purchase|transferred|txn of)\b/i;
const CREDIT = /\b(credited|received|deposited|refund(?:ed)?|sent you|added to your)\b/i;

const MONEY = /(?:₹|\brs\.?|\binr)\s*([\d,]+(?:\.\d{1,2})?)/gi;
/** SBI-style "debited by 432.0" with no currency sign. */
const BARE_AMOUNT = /\b(?:debited|credited)\s+(?:by|for|with)\s+([\d,]+(?:\.\d{1,2})?)/i;
const BALANCE_CONTEXT = /(bal|balance|lmt|limit)[^\d]{0,12}$/i;

const VPA = /\b([a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,63})\b/i;
const NOT_A_PAYEE = /\b(a\/c|acct|account|card|your|bank|xx\d|x\d{3,}|self)\b|\*\d{3,}/i;

const REFERENCE = [/\b(?:upi\s*)?ref(?:erence)?\.?\s*(?:no\.?|number|#)?\s*[:.-]?\s*(\d{6,})/i, /\bupi[:\s/]+(?:p2[ap]\/)?(\d{9,})/i, /\brrn\s*[:.-]?\s*(\d{6,})/i];

function firstAmount(text: string): Paise | null {
  for (const match of text.matchAll(MONEY)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 16), match.index ?? 0);
    if (BALANCE_CONTEXT.test(before)) continue;
    const paise = parseRupees(match[1]);
    if (paise !== null && paise > 0) return paise;
  }
  const bare = BARE_AMOUNT.exec(text);
  const paise = bare ? parseRupees(bare[1]) : null;
  return paise !== null && paise > 0 ? paise : null;
}

function direction(text: string): CaptureDirection | null {
  // "Dhruv sent you ₹500" is money in, even though "sent" is a debit word.
  if (/\bsent you\b/i.test(text)) return 'credit';
  const d = DEBIT.exec(text);
  const c = CREDIT.exec(text);
  if (d && c) return d.index <= c.index ? 'debit' : 'credit';
  return d ? 'debit' : c ? 'credit' : null;
}

function tidyName(raw: string): string | null {
  let name = sanitizeText(raw.replace(/^(?:vpa|mr\.?|ms\.?|mrs\.?|m\/s)\s+/i, ''), 60);
  if (!name || NOT_A_PAYEE.test(name) || /^\d+$/.test(name)) return null;
  // Bank SMS shout merchant names; "ZEPTO" reads better as "Zepto".
  if (name === name.toUpperCase() && /[A-Z]{3}/.test(name)) name = name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return name;
}

// A full stop ends the name only before a space or the end, so "zepto.payments@ybl" stays whole.
const STOP = String.raw`(?=\s+(?:on|via|using|from|ref\w*|upi|txn|for|avl|bal|a\/c|is|was|has|dated|date|at)\b|\s*(?:[;,\n(]|\.(?=\s|$))|\s*$)`;

function payee(text: string, dir: CaptureDirection): { name: string | null; vpa: string | null } {
  const candidates: string[] = [];
  const add = (re: RegExp) => {
    const m = re.exec(text);
    if (m?.[1]) candidates.push(m[1]);
  };
  if (dir === 'debit') {
    add(new RegExp(String.raw`\b(?:paid|sent|trf|transferred)\s+(?:₹|rs\.?|inr)?\s*[\d,.]*\s*to\s+(?:vpa\s+)?(.+?)${STOP}`, 'i'));
    add(new RegExp(String.raw`\bto\s+(?:vpa\s+)?(.+?)${STOP}`, 'i'));
    add(new RegExp(String.raw`\bat\s+(.+?)${STOP}`, 'i'));
    add(/;\s*([^;]+?)\s+credited\b/i);
  } else {
    add(/^(.+?)\s+sent you\b/i);
    add(new RegExp(String.raw`\bfrom\s+(?:vpa\s+)?(.+?)${STOP}`, 'i'));
    // Bank transfers in: "credited ... by NEFT ACME CORP".
    add(new RegExp(String.raw`\bby\s+(?:neft|imps|rtgs|upi)[\s/:-]+(.+?)${STOP}`, 'i'));
  }
  add(/\binfo[:\s]+upi\/[a-z0-9]+\/\d+\/([^/\n.]+)/i);

  let vpa: string | null = VPA.exec(text)?.[1]?.toLowerCase() ?? null;
  for (const raw of candidates) {
    const asVpa = VPA.exec(raw)?.[1];
    if (asVpa) {
      vpa = asVpa.toLowerCase();
      continue;
    }
    const name = tidyName(raw);
    if (name) return { name, vpa };
  }
  return { name: vpa ? deriveNameFromVpa(vpa) : null, vpa };
}

/**
 * Read a completed payment out of a bank SMS or a UPI app notification ("₹340 paid to Zomato", "Rs.432 debited from
 * A/c XX1234 to VPA zepto@ybl"). Returns null for anything else, including every message that contains a code.
 */
export function parsePaymentText(input: string): CapturedPayment | null {
  const text = input.replace(/\s+/g, ' ').trim();
  if (!text || text.length > 1000 || REJECT.test(text)) return null;
  const dir = direction(text);
  const amount = firstAmount(text);
  if (!dir || amount === null) return null;
  const { name, vpa } = payee(text, dir);
  const reference = REFERENCE.map((re) => re.exec(text)?.[1]).find(Boolean) ?? null;
  const via = /\batm\b|withdrawn/i.test(text) ? 'atm' : /\bcard\b/i.test(text) ? 'card' : /\bupi\b|@/i.test(text) || vpa ? 'upi' : null;
  // "at ATM MG ROAD" is where, not who; a cash withdrawal reads better by what it is.
  const payeeName = via === 'atm' && dir === 'debit' ? 'ATM withdrawal' : name;
  return { direction: dir, amountPaise: amount, payeeName, payeeVpa: vpa, reference, via };
}
