import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from './categories';
import { parseQuickAdd } from './quick-add';
import { Expected, HELD_OUT, PHRASES } from './quick-add.phrases';
import { Category } from './types';

// Wednesday 18 Nov 2026, 14:30 local time.
const NOW = new Date(2026, 10, 18, 14, 30);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 14, 30).getTime();
const parse = (text: string, categories: readonly Category[] = DEFAULT_CATEGORIES) => parseQuickAdd(text, categories, NOW);

describe('parseQuickAdd amounts', () => {
  it.each([
    ['swiggy 340', 34_000],
    ['₹340 lunch', 34_000],
    ['₹ 340 lunch', 34_000],
    ['rs 340 lunch', 34_000],
    ['rs.340 lunch', 34_000],
    ['Rs340 lunch', 34_000],
    ['340rs lunch', 34_000],
    ['340/- lunch', 34_000],
    ['lunch 99.5', 9_950],
    ['lunch 99.05', 9_905],
    ['laptop 1,20,000', 1_20_000_00],
    ['laptop 120,000', 1_20_000_00],
    ['salary 50k', 50_000_00],
    ['bonus 1.5k', 1_500_00],
    ['car 2L', 2_00_000_00],
    ['car 3 lakh'.replace(' lakh', 'lakh'), 3_00_000_00],
  ])('%s -> %i paise', (text, paise) => {
    expect(parse(text).amountPaise).toBe(paise);
  });

  it('uses the first amount and keeps later numbers in the text', () => {
    const d = parse('auto 80 gate 2');
    expect(d.amountPaise).toBe(8_000);
    expect(d.payeeName).toBe('Auto Gate 2');
  });

  it.each(['dinner', 'swiggy', '0 dinner', '', '   '])('reports a missing amount for %j', (text) => {
    const d = parse(text);
    expect(d.amountPaise).toBeNull();
    expect(d.missing).toEqual(['amount']);
  });

  it('rejects amounts above the app limit', () => {
    expect(parse('house 99999999999').amountPaise).toBeNull();
  });
});

describe('parseQuickAdd types and categories', () => {
  it('merchant phrase: swiggy 340 dinner', () => {
    const d = parse('swiggy 340 dinner');
    expect(d).toMatchObject({ type: 'expense', payeeName: 'Swiggy', categoryKey: 'food', note: 'Dinner', paymentMethod: 'upi', tags: [], missing: [] });
    expect(d.occurredAt).toBe(NOW.getTime());
  });

  it.each([
    ['zomato 450', 'Zomato', 'food'],
    ['blinkit 220', 'Blinkit', 'food'],
    ['jio 239', 'Jio', 'utility'],
    ['uber 180', 'Uber', 'other'],
    ['amazon 999', 'Amazon', 'other'],
  ])('%s -> %s / %s', (text, payee, category) => {
    const d = parse(text);
    expect(d.payeeName).toBe(payee);
    expect(d.categoryKey).toBe(category);
  });

  it.each([
    ['chai 20', 'food'],
    ['electricity bill 1200', 'utility'],
    ['wifi 599', 'utility'],
    ['pg 8000', 'rent'],
    ['landlord 15000', 'rent'],
    ['rent 12000', 'rent'],
    ['tuition fees 5000', 'college'],
    ['random thing 50', 'other'],
  ])('keyword %s -> %s', (text, category) => {
    expect(parse(text).categoryKey).toBe(category);
  });

  it('prefers a user category whose name was typed', () => {
    const custom: Category[] = [
      ...DEFAULT_CATEGORIES,
      { key: 'transport', label: 'Transport', icon: 'car', color: '#EF4444', sortOrder: 6, isSystem: false },
      { key: 'eating-out', label: 'Eating', icon: 'pizza', color: '#F97316', sortOrder: 7, isSystem: false },
    ];
    expect(parse('uber 180', custom).categoryKey).toBe('transport');
    expect(parse('auto 60', custom).categoryKey).toBe('transport');
    expect(parse('eating 300 with friends', custom).categoryKey).toBe('eating-out');
  });

  it('never picks the hidden transfer category', () => {
    expect(parse('transfer 500').categoryKey).toBe('other');
  });

  it.each([
    ['salary 50k yesterday', 'Salary'],
    ['stipend 15000', 'Stipend'],
    ['received 500 from rahul', 'Rahul'],
    ['credited 2000', 'Income'],
  ])('income: %s', (text, payee) => {
    const d = parse(text);
    expect(d.type).toBe('income');
    expect(d.categoryKey).toBe('income');
    expect(d.payeeName).toBe(payee);
  });

  it('refunds keep the merchant', () => {
    const d = parse('amazon refund 499');
    expect(d).toMatchObject({ type: 'refund', payeeName: 'Amazon', amountPaise: 49_900 });
    expect(parse('swiggy cashback 40').type).toBe('refund');
  });

  it('falls back to a generic payee when only an amount is given', () => {
    expect(parse('250').payeeName).toBe('Expense');
    expect(parse('250').note).toBeNull();
  });

  it('drops filler words', () => {
    const d = parse('paid 200 for the auto');
    expect(d.payeeName).toBe('Auto');
    expect(d.note).toBeNull();
  });
});

describe('parseQuickAdd payment method', () => {
  it.each([
    ['chai 20 cash', 'cash'],
    ['chai 20 upi', 'upi'],
    ['chai 20 via gpay', 'upi'],
    ['rent 12000 neft', 'bank'],
    ['shoes 2000 card', 'other'],
    ['chai 20', 'upi'],
  ])('%s -> %s', (text, method) => {
    expect(parse(text).paymentMethod).toBe(method);
  });
});

describe('parseQuickAdd dates', () => {
  it.each([
    ['chai 20 today', day(2026, 11, 18)],
    ['chai 20 yesterday', day(2026, 11, 17)],
    ['chai 20 day before yesterday', day(2026, 11, 16)],
    ['chai 20 3 days ago', day(2026, 11, 15)],
    ['chai 20 1 day ago', day(2026, 11, 17)],
    ['chai 20 monday', day(2026, 11, 16)],
    ['chai 20 wednesday', day(2026, 11, 18)],
    ['chai 20 last wednesday', day(2026, 11, 11)],
    ['chai 20 last friday', day(2026, 11, 13)],
    ['chai 20 15/11', day(2026, 11, 15)],
    ['chai 20 1-11', day(2026, 11, 1)],
    ['chai 20 28/12', day(2025, 12, 28)],
  ])('%s', (text, expected) => {
    expect(parse(text).occurredAt).toBe(expected);
  });

  it('reads "2 days ago" as a date even before the amount', () => {
    const d = parse('2 days ago swiggy 340');
    expect(d.amountPaise).toBe(34_000);
    expect(d.occurredAt).toBe(day(2026, 11, 16));
  });

  it('leaves impossible dates in the text', () => {
    const d = parse('chai 20 31/02');
    expect(d.occurredAt).toBe(NOW.getTime());
    expect(d.payeeName).toContain('31/02');
  });
});

describe('parseQuickAdd typos, Hinglish and number forms', () => {
  it.each([
    ['swigy 280', 'Swiggy', 'food'],
    ['zomto 300', 'Zomato', 'food'],
    ['uberr 200', 'Uber', 'other'],
    ['big basket 1200', 'BigBasket', 'food'],
    ['book my show 560', 'BookMyShow', 'other'],
  ])('%s -> %s / %s', (text, payee, category) => {
    expect(parse(text)).toMatchObject({ payeeName: payee, categoryKey: category });
  });

  it('fixes one slip in a known word but leaves real words alone', () => {
    expect(parse('resturant 900').categoryKey).toBe('food');
    expect(parse('salry 40000').type).toBe('income');
    expect(parse('refnd 200 amazon').type).toBe('refund');
    expect(parse('chair 1500').categoryKey).toBe('other');
    expect(parse('later 50').categoryKey).toBe('other');
  });

  it.each([
    ['1 lakh laptop', 1_00_000_00],
    ['1.5 lakh bike', 1_50_000_00],
    ['5 k shoes', 5_000_00],
    ['2 hazar rent', 2_000_00],
  ])('reads a unit typed as its own word: %s', (text, paise) => {
    const d = parse(text);
    expect(d.amountPaise).toBe(paise);
    expect(d.payeeName).not.toMatch(/lakh|hazar|k/i);
  });

  it('treats a small count before an item as a quantity, not the price', () => {
    expect(parse('2 chai 30')).toMatchObject({ amountPaise: 3_000, payeeName: '2 Chai', categoryKey: 'food' });
    expect(parse('auto 80 gate 2').amountPaise).toBe(8_000);
  });

  it('prefers an amount written as money over an earlier plain number', () => {
    expect(parse('gate 2 auto ₹80').amountPaise).toBe(8_000);
    expect(parse('gate 2 auto rs 80').amountPaise).toBe(8_000);
  });

  it('reads money coming in from Hinglish and "got ... from"', () => {
    expect(parse('papa se 2000 mile')).toMatchObject({ type: 'income', payeeName: 'Papa', amountPaise: 2_000_00 });
    expect(parse('got 500 from mom')).toMatchObject({ type: 'income', payeeName: 'Mom' });
    expect(parse('pocket money 3000')).toMatchObject({ type: 'income', payeeName: 'Pocket Money' });
    expect(parse('got haircut 150').type).toBe('expense');
  });

  it('drops Hinglish particles from the payee', () => {
    expect(parse('sabji wale ko 80 cash')).toMatchObject({ payeeName: 'Sabji', categoryKey: 'food', paymentMethod: 'cash' });
    expect(parse('ghar ka kiraya 9000')).toMatchObject({ payeeName: 'Ghar Kiraya', categoryKey: 'rent' });
  });

  it.each([
    ['kal swiggy 300', day(2026, 11, 17)],
    ['yday dinner 400', day(2026, 11, 17)],
    ['parso auto 60', day(2026, 11, 16)],
    ['15 nov chai 20', day(2026, 11, 15)],
    ['chai 20 nov 15', day(2026, 11, 15)],
    ['chai 20 25 december', day(2025, 12, 25)],
    ['lunch 250 on 5th', day(2026, 11, 5)],
    ['lunch 250 on 25th', day(2026, 10, 25)],
  ])('date: %s', (text, expected) => {
    const d = parse(text);
    expect(d.occurredAt).toBe(expected);
    expect(d.amountPaise).not.toBeNull();
  });
});

describe('parseQuickAdd tags', () => {
  it('collects, lowercases and dedupes hashtags', () => {
    const d = parse('swiggy 340 #Goa #trip #goa');
    expect(d.tags).toEqual(['goa', 'trip']);
    expect(d.note).toBeNull();
  });

  it('ignores a lone hash', () => {
    expect(parse('chai 20 #').tags).toEqual([]);
  });

  it('handles a busy phrase', () => {
    const d = parse('Paid ₹1,250.50 to Zomato for team lunch yesterday cash #office');
    expect(d).toMatchObject({
      amountPaise: 1_25_050,
      type: 'expense',
      payeeName: 'Zomato',
      categoryKey: 'food',
      note: 'Team Lunch',
      paymentMethod: 'cash',
      occurredAt: day(2026, 11, 17),
      tags: ['office'],
    });
  });
});

const missesIn = (set: readonly Expected[]) =>
  set
    .filter(([text, rupees, type, category]) => {
      const d = parse(text);
      return d.amountPaise !== (rupees === null ? null : Math.round(rupees * 100)) || d.type !== type || d.categoryKey !== category;
    })
    .map(([text]) => text);

describe('parseQuickAdd accuracy (amount, type and category all right)', () => {
  it('scores at least 90% on the 200+ phrase set', () => {
    const misses = missesIn(PHRASES);
    expect(PHRASES.length).toBeGreaterThanOrEqual(200);
    // Listed so a fix or a regression shows up here. "water bottle" reads as a water bill.
    expect(misses).toEqual(['water bottle 20']);
    expect((PHRASES.length - misses.length) / PHRASES.length).toBeGreaterThanOrEqual(0.9);
  });

  // Not tuned on, so this is the honest number for new phrases: 33/40 (82.5%). Misses are dishes and products the
  // dictionary has never seen; the fix is learning from the user's own history, not adding these words here.
  it('keeps its score on held-out phrases it was not tuned on', () => {
    const misses = missesIn(HELD_OUT);
    expect(misses).toEqual(['swiggy genie 120', 'chole bhature 140', 'vada pav 30', 'paneer 180', 'chicken 320', 'aata chawal 900', 'textbooks 1100']);
    expect((HELD_OUT.length - misses.length) / HELD_OUT.length).toBeGreaterThanOrEqual(0.8);
  });
});
