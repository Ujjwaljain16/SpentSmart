import { addDays, startOfDay, subDays } from 'date-fns';
import { INCOME_CATEGORY_KEY, OTHER_CATEGORY_KEY, TRANSFER_CATEGORY_KEY } from './categories';
import { MAX_PAISE, Paise } from './money';
import { Category, PaymentMethod } from './types';

/**
 * Turns a short phrase like "swiggy 340 dinner" or "salary 50k yesterday" into a transaction draft, entirely on
 * the device. Deterministic and explainable: every field it fills comes from a word the user typed.
 */
export interface QuickAddDraft {
  amountPaise: Paise | null;
  type: 'expense' | 'income' | 'refund';
  payeeName: string;
  categoryKey: string;
  note: string | null;
  paymentMethod: PaymentMethod;
  occurredAt: number;
  tags: string[];
  /** Fields the user still has to provide before saving. */
  missing: Array<'amount'>;
}

type Hint = 'food' | 'transport' | 'shopping' | 'bills' | 'rent' | 'groceries' | 'entertainment' | 'health' | 'travel' | 'education';

const MERCHANTS: Record<string, { name: string; hint: Hint }> = {
  swiggy: { name: 'Swiggy', hint: 'food' },
  zomato: { name: 'Zomato', hint: 'food' },
  dominos: { name: "Domino's", hint: 'food' },
  starbucks: { name: 'Starbucks', hint: 'food' },
  mcdonalds: { name: "McDonald's", hint: 'food' },
  kfc: { name: 'KFC', hint: 'food' },
  blinkit: { name: 'Blinkit', hint: 'groceries' },
  zepto: { name: 'Zepto', hint: 'groceries' },
  bigbasket: { name: 'BigBasket', hint: 'groceries' },
  instamart: { name: 'Instamart', hint: 'groceries' },
  dmart: { name: 'DMart', hint: 'groceries' },
  uber: { name: 'Uber', hint: 'transport' },
  ola: { name: 'Ola', hint: 'transport' },
  rapido: { name: 'Rapido', hint: 'transport' },
  irctc: { name: 'IRCTC', hint: 'travel' },
  makemytrip: { name: 'MakeMyTrip', hint: 'travel' },
  indigo: { name: 'IndiGo', hint: 'travel' },
  amazon: { name: 'Amazon', hint: 'shopping' },
  flipkart: { name: 'Flipkart', hint: 'shopping' },
  myntra: { name: 'Myntra', hint: 'shopping' },
  ajio: { name: 'AJIO', hint: 'shopping' },
  nykaa: { name: 'Nykaa', hint: 'shopping' },
  netflix: { name: 'Netflix', hint: 'entertainment' },
  spotify: { name: 'Spotify', hint: 'entertainment' },
  hotstar: { name: 'Hotstar', hint: 'entertainment' },
  bookmyshow: { name: 'BookMyShow', hint: 'entertainment' },
  jio: { name: 'Jio', hint: 'bills' },
  airtel: { name: 'Airtel', hint: 'bills' },
  pharmeasy: { name: 'PharmEasy', hint: 'health' },
  apollo: { name: 'Apollo', hint: 'health' },
};

const KEYWORDS: Record<string, Hint> = {
  breakfast: 'food', lunch: 'food', dinner: 'food', snacks: 'food', chai: 'food', tea: 'food', coffee: 'food',
  food: 'food', biryani: 'food', pizza: 'food', canteen: 'food', mess: 'food',
  groceries: 'groceries', grocery: 'groceries', vegetables: 'groceries', milk: 'groceries', fruits: 'groceries',
  auto: 'transport', cab: 'transport', taxi: 'transport', metro: 'transport', bus: 'transport', petrol: 'transport',
  fuel: 'transport', diesel: 'transport', parking: 'transport', toll: 'transport',
  flight: 'travel', train: 'travel', hotel: 'travel', trip: 'travel',
  electricity: 'bills', wifi: 'bills', internet: 'bills', recharge: 'bills', bill: 'bills', gas: 'bills', water: 'bills',
  rent: 'rent', pg: 'rent', hostel: 'rent', landlord: 'rent', flat: 'rent', maintenance: 'rent',
  movie: 'entertainment', movies: 'entertainment', concert: 'entertainment', game: 'entertainment',
  medicine: 'health', medicines: 'health', doctor: 'health', pharmacy: 'health', gym: 'health',
  fees: 'education', fee: 'education', books: 'education', course: 'education', college: 'education', tuition: 'education',
  shopping: 'shopping', clothes: 'shopping', shoes: 'shopping',
};

/** Where each hint lands among the categories that ship with the app, if the user has no better match. */
const DEFAULT_HINT_CATEGORY: Record<Hint, string> = {
  food: 'food', groceries: 'food', rent: 'rent', bills: 'utility', education: 'college',
  transport: OTHER_CATEGORY_KEY, shopping: OTHER_CATEGORY_KEY, entertainment: OTHER_CATEGORY_KEY,
  health: OTHER_CATEGORY_KEY, travel: OTHER_CATEGORY_KEY,
};

const INCOME_WORDS = new Set(['salary', 'stipend', 'income', 'received', 'credited', 'bonus', 'freelance', 'payout']);
const REFUND_WORDS = new Set(['refund', 'refunded', 'cashback', 'reversal']);
const FILLER_WORDS = new Set(['spent', 'paid', 'pay', 'for', 'on', 'at', 'to', 'from', 'via', 'using', 'rs', 'inr', 'got', 'the', 'a', 'an']);
const METHOD_WORDS: Record<string, PaymentMethod> = { cash: 'cash', upi: 'upi', gpay: 'upi', phonepe: 'upi', paytm: 'upi', card: 'other', bank: 'bank', neft: 'bank', imps: 'bank' };
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const AMOUNT = /^(?:₹|rs\.?|inr)?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?(k|l|lakh)?(?:rs|\/-|₹)?$/i;

function parseAmountToken(token: string): Paise | null {
  const m = AMOUNT.exec(token);
  if (!m) return null;
  const whole = Number(m[1]!.replace(/,/g, ''));
  const frac = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  let paise = whole * 100 + frac;
  const unit = m[3]?.toLowerCase();
  if (unit === 'k') paise *= 1000;
  if (unit === 'l' || unit === 'lakh') paise *= 100_000;
  paise = Math.round(paise);
  return paise > 0 && paise <= MAX_PAISE ? paise : null;
}

function titleCase(words: string[]): string {
  return words.map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ');
}

function resolveHint(hint: Hint, categories: readonly Category[]): string {
  const byKeyOrLabel = categories.find(
    (c) => c.key !== TRANSFER_CATEGORY_KEY && (c.key === hint || c.label.toLowerCase() === hint),
  );
  if (byKeyOrLabel) return byKeyOrLabel.key;
  const fallback = DEFAULT_HINT_CATEGORY[hint];
  return categories.some((c) => c.key === fallback) ? fallback : OTHER_CATEGORY_KEY;
}

export function parseQuickAdd(input: string, categories: readonly Category[], now: Date): QuickAddDraft {
  const tokens = input
    .trim()
    .replace(/[₹]\s+/g, '₹')
    .split(/\s+/)
    .filter(Boolean);

  let amountPaise: Paise | null = null;
  let type: QuickAddDraft['type'] = 'expense';
  let paymentMethod: PaymentMethod = 'upi';
  let occurredAt = now.getTime();
  let merchant: string | null = null;
  let hint: Hint | null = null;
  let explicitCategory: string | null = null;
  const tags: string[] = [];
  const rest: string[] = [];

  const lower = tokens.map((t) => t.toLowerCase());
  const today = startOfDay(now);
  const keepTime = (day: Date) => day.getTime() + (now.getTime() - today.getTime());

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i]!;
    const word = lower[i]!.replace(/[.,!?]+$/, '');
    const next = lower[i + 1]?.replace(/[.,!?]+$/, '');

    if (word.startsWith('#') && word.length > 1) {
      tags.push(word.slice(1));
      continue;
    }
    if (/^\d{1,2}$/.test(word) && (next === 'days' || next === 'day') && lower[i + 2] === 'ago') {
      occurredAt = keepTime(subDays(today, Number(word)));
      i += 2;
      continue;
    }
    if (amountPaise === null) {
      const parsed = parseAmountToken(word);
      if (parsed !== null) {
        amountPaise = parsed;
        continue;
      }
    }
    if (INCOME_WORDS.has(word)) {
      type = 'income';
      if (word === 'salary' || word === 'stipend' || word === 'bonus' || word === 'freelance') rest.push(raw);
      continue;
    }
    if (REFUND_WORDS.has(word)) {
      type = 'refund';
      continue;
    }
    if (word in METHOD_WORDS && !(word in MERCHANTS)) {
      paymentMethod = METHOD_WORDS[word]!;
      continue;
    }
    if (word === 'today') continue;
    if (word === 'yesterday') {
      occurredAt = keepTime(subDays(today, 1));
      continue;
    }
    if (word === 'day' && next === 'before' && lower[i + 2] === 'yesterday') {
      occurredAt = keepTime(subDays(today, 2));
      i += 2;
      continue;
    }
    const weekday = WEEKDAYS.indexOf(word === 'last' ? (next ?? '') : word);
    if (weekday !== -1) {
      const isLast = word === 'last';
      let back = (today.getDay() - weekday + 7) % 7;
      if (isLast && back === 0) back = 7;
      occurredAt = keepTime(subDays(today, back));
      if (isLast) i += 1;
      continue;
    }
    const dm = /^(\d{1,2})[/-](\d{1,2})$/.exec(word);
    if (dm) {
      const day = Number(dm[1]);
      const month = Number(dm[2]) - 1;
      let date = new Date(now.getFullYear(), month, day);
      // A date later than today means last year ("28/12" typed in January).
      if (date.getTime() >= addDays(today, 1).getTime()) date = new Date(now.getFullYear() - 1, month, day);
      if (date.getMonth() === month && date.getDate() === day) {
        occurredAt = keepTime(startOfDay(date));
        continue;
      }
    }
    if (word in MERCHANTS && merchant === null) {
      merchant = MERCHANTS[word]!.name;
      hint = MERCHANTS[word]!.hint;
      continue;
    }
    const userCategory = categories.find(
      (c) => c.key !== TRANSFER_CATEGORY_KEY && (c.label.toLowerCase() === word || c.key === word),
    );
    if (userCategory && explicitCategory === null) {
      explicitCategory = userCategory.key;
      rest.push(raw);
      continue;
    }
    if (word in KEYWORDS) hint ??= KEYWORDS[word]!;
    if (FILLER_WORDS.has(word)) continue;
    rest.push(raw);
  }

  const note = rest.length > 0 ? titleCase(rest).slice(0, 80) : null;

  let categoryKey: string;
  if (type === 'income') categoryKey = INCOME_CATEGORY_KEY;
  else if (explicitCategory) categoryKey = explicitCategory;
  else if (hint) categoryKey = resolveHint(hint, categories);
  else categoryKey = OTHER_CATEGORY_KEY;

  const payeeName = merchant ?? note ?? (type === 'income' ? 'Income' : 'Expense');

  return {
    amountPaise,
    type,
    payeeName,
    categoryKey,
    note: merchant ? note : note && note !== payeeName ? note : null,
    paymentMethod,
    occurredAt,
    tags: [...new Set(tags)],
    missing: amountPaise === null ? ['amount'] : [],
  };
}
