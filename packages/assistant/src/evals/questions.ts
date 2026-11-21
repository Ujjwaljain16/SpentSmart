/**
 * The assistant eval set: 50 questions about the fixture ledger. For each, the canonical tool call that answers it
 * and the fields of that tool's result whose amounts must appear in a correct reply. Questions are phrased the way
 * people type them, Hinglish included, so the eval also measures understanding.
 */
export interface EvalQuestion {
  id: string;
  question: string;
  /** A correct run calls at least one of these. */
  tools: string[];
  /** Canonical call used to work out the expected figures. */
  call: { name: string; input: Record<string, unknown> };
  /** Dotted paths into the canonical result; each amount must be stated in the reply (rounding allowed). */
  answer: string[];
  /** The run must end with a proposal for the user to confirm, and must not claim it was saved. */
  proposes?: 'transaction' | 'goal';
  /** The honest answer is "I can't tell" or "nothing found": no amounts may be invented. */
  noFigures?: boolean;
}

const search = (over: Record<string, unknown>) => ({
  name: 'search_transactions',
  input: { text: null, category: null, type: null, period: null, from_date: null, to_date: null, min_amount_rupees: null, max_amount_rupees: null, limit: 10, ...over },
});
const summary = (period: string) => ({ name: 'get_summary', input: { period } });
const compare = (current: string, previous: string) => ({ name: 'compare_periods', input: { current, previous } });
const none = (name: string) => ({ name, input: {} });

export const EVAL_QUESTIONS: EvalQuestion[] = [
  // Summaries
  { id: 's1', question: 'How much did I spend this month?', tools: ['get_summary'], call: summary('this_month'), answer: ['spending'] },
  { id: 's2', question: 'What did I spend last month?', tools: ['get_summary'], call: summary('last_month'), answer: ['spending'] },
  { id: 's3', question: 'How much money came in this month?', tools: ['get_summary'], call: summary('this_month'), answer: ['income'] },
  { id: 's4', question: 'What is my savings rate last month?', tools: ['get_summary'], call: summary('last_month'), answer: ['spending', 'income'] },
  { id: 's5', question: 'Where did most of my money go last month?', tools: ['get_summary'], call: summary('last_month'), answer: ['top_categories.0.spending'] },
  { id: 's6', question: 'Kitna kharcha hua is hafte?', tools: ['get_summary'], call: summary('this_week'), answer: ['spending'] },
  { id: 's7', question: 'How much did I spend yesterday?', tools: ['get_summary', 'search_transactions'], call: summary('yesterday'), answer: ['spending'] },
  { id: 's8', question: 'Total spending this year so far?', tools: ['get_summary'], call: summary('this_year'), answer: ['spending'] },
  { id: 's9', question: 'What was my net last month, income minus spending?', tools: ['get_summary'], call: summary('last_month'), answer: ['net'] },
  { id: 's10', question: 'Spending in the last 30 days?', tools: ['get_summary'], call: summary('last_30_days'), answer: ['spending'] },
  { id: 's11', question: 'How much did I spend last week?', tools: ['get_summary'], call: summary('last_week'), answer: ['spending'] },
  { id: 's12', question: 'Give me my top 3 categories for the last 90 days.', tools: ['get_summary'], call: summary('last_90_days'), answer: ['top_categories.0.spending', 'top_categories.1.spending', 'top_categories.2.spending'] },

  // Comparisons
  { id: 'c1', question: 'Did I spend more last month than the month before?', tools: ['compare_periods'], call: compare('last_month', 'this_month'), answer: [] },
  { id: 'c2', question: 'How does this week compare to last week?', tools: ['compare_periods'], call: compare('this_week', 'last_week'), answer: ['current.spending', 'previous.spending'] },
  { id: 'c3', question: 'Compare my spending this month with last month.', tools: ['compare_periods'], call: compare('this_month', 'last_month'), answer: ['current.spending', 'previous.spending'] },
  { id: 'c4', question: 'Which category went up the most this month vs last month?', tools: ['compare_periods'], call: compare('this_month', 'last_month'), answer: ['by_category.0.current'] },
  { id: 'c5', question: 'Last month vs this month for food?', tools: ['compare_periods', 'search_transactions'], call: compare('this_month', 'last_month'), answer: [] },

  // Search
  { id: 't1', question: 'How much have I spent on Swiggy this month?', tools: ['search_transactions'], call: search({ text: 'swiggy', period: 'this_month' }), answer: ['total'] },
  { id: 't2', question: 'Show my last 5 Uber rides.', tools: ['search_transactions'], call: search({ text: 'uber', limit: 5 }), answer: ['transactions.0.amount'] },
  { id: 't3', question: 'What did I spend on food last month?', tools: ['search_transactions', 'get_summary'], call: search({ category: 'Food', period: 'last_month' }), answer: ['total'] },
  { id: 't4', question: 'Any payment over ₹5,000 this month?', tools: ['search_transactions'], call: search({ period: 'this_month', min_amount_rupees: 5000, type: 'expense' }), answer: ['transactions.0.amount'] },
  { id: 't5', question: 'How much did Diwali cost me?', tools: ['search_transactions'], call: search({ text: 'diwali' }), answer: ['total'] },
  { id: 't6', question: 'When did I last pay rent and how much?', tools: ['search_transactions'], call: search({ category: 'Rent', limit: 1 }), answer: ['transactions.0.amount'] },
  { id: 't7', question: 'How much did I pay Netflix in total?', tools: ['search_transactions'], call: search({ text: 'netflix', limit: 20 }), answer: ['total'] },
  { id: 't8', question: 'Did I get any refunds?', tools: ['search_transactions'], call: search({ type: 'refund' }), answer: ['transactions.0.amount'] },
  { id: 't9', question: 'Total transport spending since August?', tools: ['search_transactions'], call: search({ category: 'Transport', from_date: '2026-08-01' }), answer: ['total'] },
  { id: 't10', question: 'How much freelance income did I get?', tools: ['search_transactions'], call: search({ text: 'freelance', type: 'income' }), answer: ['total'] },
  { id: 't11', question: 'What did I buy on Amazon?', tools: ['search_transactions'], call: search({ text: 'amazon' }), answer: ['transactions.0.amount'] },
  { id: 't12', question: 'How much on groceries (BigBasket) in October?', tools: ['search_transactions'], call: search({ text: 'bigbasket', from_date: '2026-10-01', to_date: '2026-10-31' }), answer: ['total'] },
  { id: 't13', question: 'Did I spend anything at Starbucks?', tools: ['search_transactions'], call: search({ text: 'starbucks' }), answer: [], noFigures: true },
  { id: 't14', question: 'Biggest expense this month?', tools: ['search_transactions'], call: search({ period: 'this_month', type: 'expense', min_amount_rupees: 10000 }), answer: ['transactions.0.amount'] },
  { id: 't15', question: 'How many times did I order Zomato last month?', tools: ['search_transactions'], call: search({ text: 'zomato', period: 'last_month' }), answer: ['total'] },
  { id: 't16', question: 'electricity bill kitna aaya last month?', tools: ['search_transactions'], call: search({ text: 'electricity', period: 'last_month' }), answer: ['total'] },

  // Budgets
  { id: 'b1', question: 'Am I within budget this month?', tools: ['budget_status'], call: none('budget_status'), answer: ['budgets.0.left'] },
  { id: 'b2', question: 'How much is left in my food budget?', tools: ['budget_status'], call: none('budget_status'), answer: ['budgets.1.left'] },
  { id: 'b3', question: 'Will I stay within my monthly budget at this pace?', tools: ['budget_status'], call: none('budget_status'), answer: ['budgets.0.projected_month_end'] },
  { id: 'b4', question: 'What are my budgets?', tools: ['budget_status'], call: none('budget_status'), answer: ['budgets.0.limit', 'budgets.1.limit'] },

  // Bills
  { id: 'r1', question: 'What subscriptions am I paying for?', tools: ['upcoming_recurring'], call: none('upcoming_recurring'), answer: ['monthly_total'] },
  { id: 'r2', question: 'When is my next Netflix payment?', tools: ['upcoming_recurring'], call: none('upcoming_recurring'), answer: [] },
  { id: 'r3', question: 'How much do my bills cost each month?', tools: ['upcoming_recurring'], call: none('upcoming_recurring'), answer: ['monthly_total'] },

  // Affordability
  { id: 'a1', question: 'Can I afford a ₹3,000 dinner this weekend?', tools: ['can_i_afford'], call: { name: 'can_i_afford', input: { amount_rupees: 3000 } }, answer: ['safe_to_spend_until_period_end'] },
  { id: 'a2', question: 'Can I buy a ₹60,000 phone right now?', tools: ['can_i_afford'], call: { name: 'can_i_afford', input: { amount_rupees: 60000 } }, answer: ['safe_to_spend_until_period_end'] },
  { id: 'a3', question: 'What will I have spent by the end of the month?', tools: ['can_i_afford'], call: { name: 'can_i_afford', input: { amount_rupees: 1 } }, answer: ['month_end_spending_forecast.likely'] },

  // Goals
  { id: 'g1', question: 'How is my Goa trip goal going?', tools: ['goals_status'], call: none('goals_status'), answer: ['goals.0.saved', 'goals.0.target'] },
  { id: 'g2', question: 'How much should I save each month for Goa?', tools: ['goals_status'], call: none('goals_status'), answer: ['goals.0.needed_per_month'] },

  // Changes, which must be proposals
  { id: 'm1', question: 'Add ₹250 for lunch at the canteen today.', tools: ['create_transaction'], call: { name: 'create_transaction', input: { amount_rupees: 250, type: 'expense', payee: 'Canteen', category: 'Food', date: null, note: 'Lunch' } }, answer: ['amount'], proposes: 'transaction' },
  { id: 'm2', question: 'Record 15000 salary bonus received yesterday.', tools: ['create_transaction'], call: { name: 'create_transaction', input: { amount_rupees: 15000, type: 'income', payee: 'Acme Technologies', category: null, date: '2026-11-19', note: 'Bonus' } }, answer: ['amount'], proposes: 'transaction' },
  { id: 'm3', question: 'Create a goal to save ₹50,000 for a laptop by June.', tools: ['create_goal'], call: { name: 'create_goal', input: { name: 'Laptop', target_rupees: 50000, deadline: '2027-06-30' } }, answer: ['target'], proposes: 'goal' },

  // Out of scope: no invented numbers
  { id: 'x1', question: 'What is my actual HDFC bank balance?', tools: [], call: none('budget_status'), answer: [], noFigures: true },
  { id: 'x2', question: 'Should I put my savings into crypto?', tools: [], call: none('goals_status'), answer: [], noFigures: true },
];
