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
  mcd: { name: "McDonald's", hint: 'food' },
  kfc: { name: 'KFC', hint: 'food' },
  burgerking: { name: 'Burger King', hint: 'food' },
  pizzahut: { name: 'Pizza Hut', hint: 'food' },
  haldirams: { name: "Haldiram's", hint: 'food' },
  haldiram: { name: "Haldiram's", hint: 'food' },
  chaayos: { name: 'Chaayos', hint: 'food' },
  eatsure: { name: 'EatSure', hint: 'food' },
  barbequenation: { name: 'Barbeque Nation', hint: 'food' },
  blinkit: { name: 'Blinkit', hint: 'groceries' },
  zepto: { name: 'Zepto', hint: 'groceries' },
  bigbasket: { name: 'BigBasket', hint: 'groceries' },
  instamart: { name: 'Instamart', hint: 'groceries' },
  dmart: { name: 'DMart', hint: 'groceries' },
  jiomart: { name: 'JioMart', hint: 'groceries' },
  uber: { name: 'Uber', hint: 'transport' },
  ola: { name: 'Ola', hint: 'transport' },
  rapido: { name: 'Rapido', hint: 'transport' },
  nammayatri: { name: 'Namma Yatri', hint: 'transport' },
  redbus: { name: 'redBus', hint: 'travel' },
  oyo: { name: 'OYO', hint: 'travel' },
  irctc: { name: 'IRCTC', hint: 'travel' },
  makemytrip: { name: 'MakeMyTrip', hint: 'travel' },
  indigo: { name: 'IndiGo', hint: 'travel' },
  amazon: { name: 'Amazon', hint: 'shopping' },
  flipkart: { name: 'Flipkart', hint: 'shopping' },
  myntra: { name: 'Myntra', hint: 'shopping' },
  ajio: { name: 'AJIO', hint: 'shopping' },
  nykaa: { name: 'Nykaa', hint: 'shopping' },
  meesho: { name: 'Meesho', hint: 'shopping' },
  decathlon: { name: 'Decathlon', hint: 'shopping' },
  netflix: { name: 'Netflix', hint: 'entertainment' },
  spotify: { name: 'Spotify', hint: 'entertainment' },
  hotstar: { name: 'Hotstar', hint: 'entertainment' },
  bookmyshow: { name: 'BookMyShow', hint: 'entertainment' },
  pvr: { name: 'PVR', hint: 'entertainment' },
  jio: { name: 'Jio', hint: 'bills' },
  airtel: { name: 'Airtel', hint: 'bills' },
  bsnl: { name: 'BSNL', hint: 'bills' },
  bescom: { name: 'BESCOM', hint: 'bills' },
  tataplay: { name: 'Tata Play', hint: 'bills' },
  udemy: { name: 'Udemy', hint: 'education' },
  coursera: { name: 'Coursera', hint: 'education' },
  pharmeasy: { name: 'PharmEasy', hint: 'health' },
  apollo: { name: 'Apollo', hint: 'health' },
};

const KEYWORDS: Record<string, Hint> = {
  breakfast: 'food', lunch: 'food', dinner: 'food', snacks: 'food', chai: 'food', tea: 'food', coffee: 'food',
  food: 'food', biryani: 'food', pizza: 'food', canteen: 'food', mess: 'food', meal: 'food', samosa: 'food',
  momos: 'food', dosa: 'food', thali: 'food', juice: 'food', panipuri: 'food', golgappe: 'food', maggi: 'food',
  cafe: 'food', restaurant: 'food', tiffin: 'food', dhaba: 'food', lassi: 'food', paratha: 'food', burger: 'food',
  icecream: 'food', mithai: 'food', sweets: 'food',
  // Hinglish: khana = food, nashta = breakfast/snack, sabzi = vegetables, doodh = milk, kirana = grocery store.
  khana: 'food', nashta: 'food',
  groceries: 'groceries', grocery: 'groceries', vegetables: 'groceries', milk: 'groceries', fruits: 'groceries',
  sabzi: 'groceries', sabji: 'groceries', doodh: 'groceries', kirana: 'groceries', ration: 'groceries', atta: 'groceries',
  eggs: 'groceries', bread: 'groceries',
  auto: 'transport', rickshaw: 'transport', fastag: 'transport', cab: 'transport', taxi: 'transport', metro: 'transport', bus: 'transport', petrol: 'transport',
  fuel: 'transport', diesel: 'transport', parking: 'transport', toll: 'transport',
  flight: 'travel', train: 'travel', hotel: 'travel', trip: 'travel',
  electricity: 'bills', bijli: 'bills', broadband: 'bills', fibernet: 'bills', dth: 'bills', postpaid: 'bills', lpg: 'bills', wifi: 'bills', internet: 'bills', recharge: 'bills', bill: 'bills', gas: 'bills', water: 'bills',
  rent: 'rent', kiraya: 'rent', pg: 'rent', hostel: 'rent', landlord: 'rent', flat: 'rent', maintenance: 'rent',
  movie: 'entertainment', movies: 'entertainment', concert: 'entertainment', game: 'entertainment',
  medicine: 'health', medicines: 'health', dawai: 'health', dawa: 'health', doctor: 'health', pharmacy: 'health', gym: 'health',
  fees: 'education', fee: 'education', books: 'education', course: 'education', college: 'education', tuition: 'education',
  coaching: 'education', stationery: 'education', notebook: 'education', notebooks: 'education', exam: 'education',
  semester: 'education', library: 'education',
  shopping: 'shopping', clothes: 'shopping', shoes: 'shopping',
};

/** Where each hint lands among the categories that ship with the app, if the user has no better match. */
const DEFAULT_HINT_CATEGORY: Record<Hint, string> = {
  food: 'food', groceries: 'food', rent: 'rent', bills: 'utility', education: 'college',
  transport: OTHER_CATEGORY_KEY, shopping: OTHER_CATEGORY_KEY, entertainment: OTHER_CATEGORY_KEY,
  health: OTHER_CATEGORY_KEY, travel: OTHER_CATEGORY_KEY,
};

const INCOME_WORDS = new Set([
  'salary', 'stipend', 'income', 'received', 'credited', 'bonus', 'freelance', 'payout', 'interest', 'dividend',
  'incentive', 'scholarship', 'sold',
  // Hinglish "mila/mile" = got.
  'mila', 'mile',
]);
/** Income words that also describe the source well enough to name the payee. */
const NAMED_INCOME = new Set(['salary', 'stipend', 'bonus', 'freelance', 'interest', 'dividend', 'incentive', 'scholarship']);
const REFUND_WORDS = new Set(['refund', 'refunded', 'cashback', 'reversal']);
const FILLER_WORDS = new Set([
  'spent', 'paid', 'pay', 'for', 'on', 'at', 'to', 'from', 'via', 'using', 'rs', 'inr', 'got', 'the', 'a', 'an',
  'rupee', 'rupees', 'rupay', 'rupaye',
  // Hinglish particles: ka/ki/ke = of, ko = to, ne/se = by/from, wala/wale/wali = the one who.
  'ka', 'ki', 'ke', 'ko', 'ne', 'se', 'wala', 'wale', 'wali',
]);
const METHOD_WORDS: Record<string, PaymentMethod> = { cash: 'cash', upi: 'upi', gpay: 'upi', phonepe: 'upi', paytm: 'upi', card: 'other', bank: 'bank', neft: 'bank', imps: 'bank' };
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// Hinglish: kal = yesterday (for spending it is never tomorrow), parso = the day before.
const DAYS_BACK: Record<string, number> = { today: 0, yesterday: 1, yday: 1, yest: 1, kal: 1, parso: 2 };
/** A unit typed as its own word after the number: "1.5 lakh", "5 k", "2 hazar". */
const UNIT_WORDS: Record<string, number> = { k: 1000, thousand: 1000, hazar: 1000, hazaar: 1000, l: 100_000, lakh: 100_000, lakhs: 100_000 };

const AMOUNT = /^(₹|rs\.?|inr)?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?(k|l|lakh)?(rs|\/-|₹)?$/i;
const SMALL_NUMBER = /^\d{1,2}$/;

interface AmountMatch {
  paise: Paise;
  /** Written with ₹, rs, /- or a unit, so it is clearly money rather than a count or a gate number. */
  marked: boolean;
  /** The unit was the following word ("1.5 lakh"). */
  usesNext: boolean;
}

function parseAmountToken(token: string, nextWord?: string): AmountMatch | null {
  const m = AMOUNT.exec(token);
  if (!m) return null;
  const whole = Number(m[2]!.replace(/,/g, ''));
  const frac = m[3] ? Number(m[3].padEnd(2, '0')) : 0;
  let paise = whole * 100 + frac;
  const unit = m[4]?.toLowerCase();
  let usesNext = false;
  if (unit === 'k') paise *= 1000;
  else if (unit === 'l' || unit === 'lakh') paise *= 100_000;
  else if (nextWord !== undefined && nextWord in UNIT_WORDS) {
    paise *= UNIT_WORDS[nextWord]!;
    usesNext = true;
  }
  paise = Math.round(paise);
  if (!(paise > 0 && paise <= MAX_PAISE)) return null;
  return { paise, marked: Boolean(m[1] || m[4] || m[5] || usesNext), usesNext };
}

function monthOf(word: string | undefined): number {
  if (word === undefined || word.length < 3) return -1;
  return MONTHS.findIndex((m) => m.startsWith(word));
}

const isWord = (w: string) => /^[a-z]+$/.test(w);

/** "15 nov" or "nov 15" at position i. In "chai 20 nov 15" the 20 is the price and "nov 15" the date. */
function dayMonthAt(words: readonly string[], i: number): { day: number; month: number } | null {
  const word = words[i]!;
  const next = words[i + 1];
  if (SMALL_NUMBER.test(word) && monthOf(next) !== -1 && !SMALL_NUMBER.test(words[i + 2] ?? '')) {
    return { day: Number(word), month: monthOf(next) };
  }
  if (monthOf(word) !== -1 && next !== undefined && SMALL_NUMBER.test(next)) return { day: Number(next), month: monthOf(word) };
  return null;
}

/** Picks which number is the amount: the first one written as money, else the first plain one. */
function pickAmount(words: readonly string[]): (AmountMatch & { index: number }) | null {
  let firstPlain: (AmountMatch & { index: number }) | null = null;
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const next = words[i + 1];
    const prev = words[i - 1];
    if (SMALL_NUMBER.test(word) && (next === 'days' || next === 'day') && words[i + 2] === 'ago') {
      i += 2;
      continue;
    }
    const date = dayMonthAt(words, i);
    if (date) {
      i++;
      continue;
    }
    const parsed = parseAmountToken(word, next);
    if (!parsed) continue;
    const marked = parsed.marked || prev === 'rs' || prev === 'inr';
    // "2 chai 30": a small count right before what was bought, with the price after it.
    const isCount =
      !marked &&
      SMALL_NUMBER.test(word) &&
      next !== undefined &&
      (next in KEYWORDS || next in MERCHANTS) &&
      words.slice(i + 2).some((w) => parseAmountToken(w) !== null);
    if (isCount) continue;
    if (marked) return { ...parsed, marked, index: i };
    firstPlain ??= { ...parsed, index: i };
    if (parsed.usesNext) i++;
  }
  return firstPlain;
}

const KNOWN_WORDS = new Set<string>([
  ...Object.keys(MERCHANTS), ...Object.keys(KEYWORDS), ...INCOME_WORDS, ...REFUND_WORDS, ...FILLER_WORDS,
  ...Object.keys(METHOD_WORDS), ...Object.keys(DAYS_BACK), ...WEEKDAYS, ...MONTHS,
]);
const TYPO_TARGETS = [...Object.keys(MERCHANTS), ...Object.keys(KEYWORDS), ...INCOME_WORDS, ...REFUND_WORDS];

/** True when b is a one-letter insertion, deletion, substitution or swap of neighbours away from a. */
function oneEditApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

const collapseRepeats = (w: string) => w.replace(/(.)\1+/g, '$1');

/**
 * Maps a likely typo ("swigy", "resturant", "salry") to the word we know. Only fixes one slip, keeps the first
 * letter, and gives up when two known words are equally close. Short words only match a doubled letter ("uberr"),
 * because one edit away from "chai" is also "chair".
 */
function fixTypo(word: string): string {
  if (word.length < 5 || !isWord(word) || KNOWN_WORDS.has(word)) return word;
  const matches = TYPO_TARGETS.filter((t) => {
    if (t[0] !== word[0]) return false;
    if (t.length < 5) return collapseRepeats(word) === collapseRepeats(t);
    return oneEditApart(word, t);
  });
  return matches.length === 1 ? matches[0]! : word;
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

/** How a payee is matched against the user's history: case, punctuation and extra spaces don't matter. */
export function learnKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim();
}

/**
 * The category the user most often gave each payee, from their past expenses. Lets quick add file "Vada Pav Stall"
 * under Food because the user did so before, which no built-in dictionary can know.
 */
export function learnCategories(history: readonly { payeeName: string; categoryKey: string; type: string }[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const t of history) {
    if (t.type !== 'expense') continue;
    const key = learnKey(t.payeeName);
    if (!key) continue;
    const byCategory = counts.get(key) ?? new Map<string, number>();
    byCategory.set(t.categoryKey, (byCategory.get(t.categoryKey) ?? 0) + 1);
    counts.set(key, byCategory);
  }
  const out = new Map<string, string>();
  for (const [key, byCategory] of counts) out.set(key, [...byCategory].sort((a, b) => b[1] - a[1])[0]![0]);
  return out;
}

export function parseQuickAdd(input: string, categories: readonly Category[], now: Date, options: { learned?: ReadonlyMap<string, string> } = {}): QuickAddDraft {
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
  const words = lower.map((w) => w.replace(/[.,!?]+$/, ''));
  const amount = pickAmount(words);
  const today = startOfDay(now);
  const keepTime = (day: Date) => day.getTime() + (now.getTime() - today.getTime());
  /** A day/month without a year; one later than today means last year ("28/12" typed in January). */
  const pastDate = (day: number, month: number): number | null => {
    let date = new Date(now.getFullYear(), month, day);
    if (date.getTime() >= addDays(today, 1).getTime()) date = new Date(now.getFullYear() - 1, month, day);
    return date.getMonth() === month && date.getDate() === day ? keepTime(startOfDay(date)) : null;
  };

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i]!;
    const next = words[i + 1];
    const userCategory = categories.find(
      (c) => c.key !== TRANSFER_CATEGORY_KEY && (c.label.toLowerCase() === words[i] || c.key === words[i]),
    );
    const word = userCategory ? words[i]! : fixTypo(words[i]!);

    if (word.startsWith('#') && word.length > 1) {
      tags.push(word.slice(1));
      continue;
    }
    if (SMALL_NUMBER.test(word) && (next === 'days' || next === 'day') && words[i + 2] === 'ago') {
      occurredAt = keepTime(subDays(today, Number(word)));
      i += 2;
      continue;
    }
    if (amount && i === amount.index) {
      amountPaise = amount.paise;
      if (amount.usesNext) i++;
      continue;
    }
    // Two- and three-word names: "big basket", "book my show", "ice cream".
    let joined = false;
    for (const n of [3, 2]) {
      const parts = words.slice(i, i + n);
      if (parts.length < n || !parts.every(isWord)) continue;
      const key = parts.join('');
      if (key in MERCHANTS && merchant === null) {
        merchant = MERCHANTS[key]!.name;
        hint = MERCHANTS[key]!.hint;
      } else if (key in KEYWORDS) {
        hint ??= KEYWORDS[key]!;
        rest.push(...tokens.slice(i, i + n));
      } else continue;
      i += n - 1;
      joined = true;
      break;
    }
    if (joined) continue;
    if (word === 'pocket' && next === 'money') {
      type = 'income';
      rest.push(raw, tokens[i + 1]!);
      i++;
      continue;
    }
    if (INCOME_WORDS.has(word)) {
      type = 'income';
      if (NAMED_INCOME.has(word)) rest.push(raw);
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
    if (word in DAYS_BACK) {
      occurredAt = keepTime(subDays(today, DAYS_BACK[word]!));
      continue;
    }
    if (word === 'day' && next === 'before' && words[i + 2] === 'yesterday') {
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
      const date = pastDate(Number(dm[1]), Number(dm[2]) - 1);
      if (date !== null) {
        occurredAt = date;
        continue;
      }
    }
    // "15 nov" and "nov 15"
    const dayMonth = dayMonthAt(words, i);
    const named = dayMonth ? pastDate(dayMonth.day, dayMonth.month) : null;
    if (named !== null) {
      occurredAt = named;
      i++;
      continue;
    }
    // "5th": that day this month, or last month if it has not come yet.
    const ordinal = /^(\d{1,2})(?:st|nd|rd|th)$/.exec(word);
    if (ordinal) {
      const d = Number(ordinal[1]);
      let date = new Date(now.getFullYear(), now.getMonth(), d);
      if (date.getTime() >= addDays(today, 1).getTime()) date = new Date(now.getFullYear(), now.getMonth() - 1, d);
      if (date.getDate() === d) {
        occurredAt = keepTime(startOfDay(date));
        continue;
      }
    }
    if (word in MERCHANTS && merchant === null) {
      merchant = MERCHANTS[word]!.name;
      hint = MERCHANTS[word]!.hint;
      continue;
    }
    if (userCategory && explicitCategory === null) {
      explicitCategory = userCategory.key;
      rest.push(raw);
      continue;
    }
    if (word in KEYWORDS) hint ??= KEYWORDS[word]!;
    if (FILLER_WORDS.has(word)) continue;
    rest.push(raw);
  }

  // "got 500 from mom": money arriving from someone, without a clearer word for it.
  if (type === 'expense' && words.includes('got') && words.includes('from')) type = 'income';

  const note = rest.length > 0 ? titleCase(rest).slice(0, 80) : null;

  // Compound words: "textbooks", "notebooks", "groceries" end in a word the dictionary knows.
  if (!hint) {
    for (const w of rest.map((r) => r.toLowerCase())) {
      const k = Object.keys(KEYWORDS).find((kw) => kw.length >= 4 && w.length > kw.length && w.endsWith(kw));
      if (k) {
        hint = KEYWORDS[k]!;
        break;
      }
    }
  }

  const payeeName = merchant ?? note ?? (type === 'income' ? 'Income' : 'Expense');
  // What the user filed this payee under before beats the built-in dictionary, but not a category they typed.
  const learnedKey = options.learned?.get(learnKey(payeeName));
  const learned = learnedKey && categories.some((c) => c.key === learnedKey) ? learnedKey : null;

  let categoryKey: string;
  if (type === 'income') categoryKey = INCOME_CATEGORY_KEY;
  else if (explicitCategory) categoryKey = explicitCategory;
  else if (learned) categoryKey = learned;
  else if (hint) categoryKey = resolveHint(hint, categories);
  else categoryKey = OTHER_CATEGORY_KEY;

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
