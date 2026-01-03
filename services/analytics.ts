import { getAllTransactions, getMonthlyStats, getCurrentMonthKey } from './storage';
import { Transaction, CategoryType } from '@/types/transaction';
import { startOfWeek, startOfMonth, endOfWeek, endOfMonth, subWeeks, subMonths } from 'date-fns';

export interface PeriodInsights {
    balance: number;
    totalIncome: number;
    totalExpense: number;
    trend: {
        percent: number;
        direction: 'up' | 'down' | 'neutral';
    };
    categoryBreakdown: {
        category: CategoryType;
        amount: number;
        percent: number;
        count: number;
    }[];
    topPayees: {
        name: string;
        upiId: string;
        amount: number;
        count: number;
    }[];
}

export type Period = 'week' | 'month' | 'year';

/**
 * Calculate insights for a given period
 */
export async function calculateInsights(period: Period = 'week'): Promise<PeriodInsights> {
    const allTransactions = await getAllTransactions();
    const now = new Date();

    // Define period boundaries
    let periodStart: Date;
    let periodEnd: Date;
    let prevPeriodStart: Date;
    let prevPeriodEnd: Date;

    switch (period) {
        case 'week':
            periodStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
            periodEnd = endOfWeek(now, { weekStartsOn: 1 });
            prevPeriodStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
            prevPeriodEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
            break;
        case 'month':
            periodStart = startOfMonth(now);
            periodEnd = endOfMonth(now);
            prevPeriodStart = startOfMonth(subMonths(now, 1));
            prevPeriodEnd = endOfMonth(subMonths(now, 1));
            break;
        case 'year':
            periodStart = new Date(now.getFullYear(), 0, 1);
            periodEnd = new Date(now.getFullYear(), 11, 31);
            prevPeriodStart = new Date(now.getFullYear() - 1, 0, 1);
            prevPeriodEnd = new Date(now.getFullYear() - 1, 11, 31);
            break;
    }

    // Filter transactions for current and previous period
    const currentPeriodTxs = allTransactions.filter(
        (tx) => tx.timestamp >= periodStart.getTime() && tx.timestamp <= periodEnd.getTime()
    );
    const prevPeriodTxs = allTransactions.filter(
        (tx) => tx.timestamp >= prevPeriodStart.getTime() && tx.timestamp <= prevPeriodEnd.getTime()
    );

    // Calculate income and expense
    const currentIncome = currentPeriodTxs.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
    const currentExpense = currentPeriodTxs.filter(tx => tx.type !== 'income').reduce((sum, tx) => sum + tx.amount, 0);
    const balance = currentIncome - currentExpense;

    const prevIncome = prevPeriodTxs.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
    const prevExpense = prevPeriodTxs.filter(tx => tx.type !== 'income').reduce((sum, tx) => sum + tx.amount, 0);
    const prevBalance = prevIncome - prevExpense;

    // Calculate trend (based on expense for now as it's more useful for a tracker)
    let trend: { percent: number; direction: 'up' | 'down' | 'neutral' };
    if (prevExpense === 0) {
        trend = { percent: 0, direction: 'neutral' };
    } else {
        const percent = Math.abs(((currentExpense - prevExpense) / prevExpense) * 100);
        trend = {
            percent: Math.round(percent),
            direction: currentExpense > prevExpense ? 'up' : currentExpense < prevExpense ? 'down' : 'neutral',
        };
    }

    // Category breakdown (Expenses only)
    const categoryMap = new Map<CategoryType, { amount: number; count: number }>();
    currentPeriodTxs.filter(tx => tx.type !== 'income').forEach((tx) => {
        const existing = categoryMap.get(tx.category) || { amount: 0, count: 0 };
        categoryMap.set(tx.category, {
            amount: existing.amount + tx.amount,
            count: existing.count + 1,
        });
    });

    const categoryBreakdown = Array.from(categoryMap.entries())
        .map(([category, data]) => ({
            category,
            amount: data.amount,
            percent: currentExpense > 0 ? Math.round((data.amount / currentExpense) * 100) : 0,
            count: data.count,
        }))
        .sort((a, b) => b.amount - a.amount); // Sort by amount descending

    // Top payees (Expenses only)
    const payeeMap = new Map<string, { name: string; amount: number; count: number; upiId: string }>();
    currentPeriodTxs.filter(tx => tx.type !== 'income').forEach((tx) => {
        const key = tx.payeeName.toLowerCase();
        const existing = payeeMap.get(key) || { name: tx.payeeName, amount: 0, count: 0, upiId: tx.upiId };
        payeeMap.set(key, {
            name: tx.payeeName,
            amount: existing.amount + tx.amount,
            count: existing.count + 1,
            upiId: tx.upiId,
        });
    });

    const topPayees = Array.from(payeeMap.values())
        .sort((a, b) => b.amount - a.amount) // Sort by amount
        .slice(0, 3); // Top 3

    return {
        balance,
        totalIncome: currentIncome,
        totalExpense: currentExpense,
        trend,
        categoryBreakdown,
        topPayees,
    };
}

/**
 * Get quick stats for display
 */
export async function getQuickStats() {
    const monthKey = getCurrentMonthKey();
    const monthStats = await getMonthlyStats(monthKey);
    const weekInsights = await calculateInsights('week');

    return {
        monthTotal: monthStats?.totalExpense || 0,
        weekTotal: weekInsights.totalExpense,
        weekTrend: weekInsights.trend,
        topCategory: weekInsights.categoryBreakdown[0]?.category || 'other',
    };
}

/**
 * Get daily spending trend for charts
 */
export async function getDailyTrend(days: number = 7): Promise<{ day: string; amount: number; date: Date }[]> {
    const allTransactions = await getAllTransactions();
    const now = new Date();

    // Create array of last N days
    const dailyData: { day: string; amount: number; date: Date }[] = [];

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);

        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);

        // Filter transactions for this day (Expenses only for trend)
        const dayTransactions = allTransactions.filter(
            (tx) => tx.timestamp >= date.getTime() && tx.timestamp < nextDay.getTime() && tx.type !== 'income'
        );

        // Sum amounts for this day
        const dayAmount = dayTransactions.reduce((sum, tx) => sum + tx.amount, 0);

        // Format day name (Mon, Tue, etc)
        const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);

        dailyData.push({
            day: dayName,
            amount: dayAmount,
            date,
        });
    }

    return dailyData;
}

/**
 * Get all transactions for a specific category
 */
export async function getTransactionsByCategory(category: CategoryType): Promise<Transaction[]> {
    const allTransactions = await getAllTransactions();
    return allTransactions
        .filter(tx => tx.category === category)
        .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get month-over-month comparison for all categories
 */
export async function getMonthlyComparison() {
    const allTransactions = await getAllTransactions();
    const now = new Date();

    const currentMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const currentTxs = allTransactions.filter(tx => tx.timestamp >= currentMonthStart.getTime() && tx.type !== 'income');
    const lastTxs = allTransactions.filter(tx => tx.timestamp >= lastMonthStart.getTime() && tx.timestamp <= lastMonthEnd.getTime() && tx.type !== 'income');

    const categories: CategoryType[] = ['food', 'utility', 'college', 'rent', 'other'];
    const comparison: any = {};

    categories.forEach(cat => {
        const currentAmount = currentTxs.filter(tx => tx.category === cat).reduce((sum, tx) => sum + tx.amount, 0);
        const lastAmount = lastTxs.filter(tx => tx.category === cat).reduce((sum, tx) => sum + tx.amount, 0);

        let percent = 0;
        let trend: 'up' | 'down' | 'neutral' = 'neutral';

        if (lastAmount > 0) {
            percent = Math.round(Math.abs(((currentAmount - lastAmount) / lastAmount) * 100));
            trend = currentAmount > lastAmount ? 'up' : currentAmount < lastAmount ? 'down' : 'neutral';
        }

        comparison[cat] = {
            currentMonth: currentAmount,
            lastMonth: lastAmount,
            percent,
            trend
        };
    });

    return comparison;
}
