import { Expected } from './quick-add.phrases';

/**
 * Blind set: 40 phrases written with their expected answers before the parser was run on them, and never used to
 * tune it. Its score is the honest estimate for phrases people haven't typed before. Expected categories are against
 * the default categories (food, utility, college, rent, income, other); transport, shopping, health and fun land in
 * "other" because there's no default category for them.
 */
const e = (text: string, rupees: number | null, category: string): Expected => [text, rupees, 'expense', category];
const inc = (text: string, rupees: number | null): Expected => [text, rupees, 'income', 'income'];
const ref = (text: string, rupees: number, category: string): Expected => [text, rupees, 'refund', category];

export const BLIND: Expected[] = [
  e('petrol 500', 500, 'other'),
  e('dosa 60', 60, 'food'),
  e('idli vada 45', 45, 'food'),
  e('maggi 30', 30, 'food'),
  e('momos 80 with friends', 80, 'food'),
  e('biryani parcel 260', 260, 'food'),
  e('blinkit 456 groceries', 456, 'food'),
  e('onions tomatoes 120', 120, 'food'),
  e('atta 5kg 280', 280, 'food'),
  e('fruits 150', 150, 'food'),
  e('chai sutta 40', 40, 'food'),
  e('dinner at barbeque nation 1850', 1850, 'food'),
  e('pizza hut 599', 599, 'food'),
  e('lunch 1.2k team', 1200, 'food'),
  e('electricity bescom 1340', 1340, 'utility'),
  e('broadband 799', 799, 'utility'),
  e('dth recharge 350', 350, 'utility'),
  e('gas cylinder 905', 905, 'utility'),
  e('house rent nov 14000', 14000, 'rent'),
  e('maintenance charges 2500', 2500, 'rent'),
  e('semester fee 45000', 45000, 'college'),
  e('exam form 1200', 1200, 'college'),
  e('stationery 150', 150, 'college'),
  e('uber to airport 650', 650, 'other'),
  e('metro card recharge 500', 500, 'other'),
  e('movie tickets 480', 480, 'other'),
  e('gym membership 1500', 1500, 'other'),
  e('doctor consultation 600', 600, 'other'),
  e('haircut 200', 200, 'other'),
  e('gift for mom 1200', 1200, 'other'),
  e('amazon headphones 1999', 1999, 'other'),
  e('flipkart 2.5k shoes', 2500, 'other'),
  e('rapido 85', 85, 'other'),
  e('netflix 649', 649, 'other'),
  inc('salary credited 52000', 52000),
  inc('got 1500 from papa', 1500),
  inc('freelance payment 7500', 7500),
  inc('received 300 from rohan for pizza', 300),
  ref('myntra refund 1299', 1299, 'other'),
  ref('swiggy refund 220', 220, 'food'),
];
