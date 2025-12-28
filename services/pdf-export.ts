import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { documentDirectory, moveAsync } from 'expo-file-system/legacy';
import { format } from 'date-fns';

import { Transaction, CategoryType, MonthlyStats, CategoryInfo } from '@/types/transaction';
import { categoryListToRecord } from '@/constants/categories';
import { getCategories } from './category-storage';
import { getAllTransactions, getMonthlyStats, getAvailableMonths } from './storage';

/**
 * Generate SVG pie chart for category breakdown
 */
const generatePieChartSVG = (
  categoryTotals: Record<string, number>,
  categoryRecord: Record<string, CategoryInfo>,
  total: number
): string => {
  const radius = 80;
  const centerX = 100;
  const centerY = 100;

  if (Object.keys(categoryTotals).length === 0 || total === 0) {
    return '';
  }

  // Prepare data for pie chart
  const data = Object.entries(categoryTotals)
    .filter(([_, amount]) => amount > 0)
    .map(([key, amount]) => ({
      category: key,
      amount,
      percentage: (amount / total) * 100,
      color: categoryRecord[key]?.color || '#6B7280',
      label: categoryRecord[key]?.label || key,
    }))
    .sort((a, b) => b.amount - a.amount); // Sort by amount descending

  let currentAngle = -90; // Start from top
  const paths: string[] = [];
  const legendItems: string[] = [];

  data.forEach((item, index) => {
    const angle = (item.percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;

    // Convert angles to radians
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    // Calculate path coordinates
    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);

    const largeArcFlag = angle > 180 ? 1 : 0;

    const pathData = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

    paths.push(`<path d="${pathData}" fill="${item.color}" />`);

    // Legend item
    const legendY = 20 + (index * 25);
    legendItems.push(`
      <rect x="220" y="${legendY - 10}" width="12" height="12" fill="${item.color}" />
      <text x="240" y="${legendY}" font-size="12" fill="#666">${item.label}</text>
      <text x="350" y="${legendY}" font-size="12" fill="#333" text-anchor="end">₹${item.amount.toLocaleString('en-IN')}</text>
      <text x="380" y="${legendY}" font-size="12" fill="#666">${item.percentage.toFixed(1)}%</text>
    `);

    currentAngle = endAngle;
  });

  return `
    <svg width="400" height="${Math.max(200, 20 + data.length * 25)}" viewBox="0 0 400 ${Math.max(200, 20 + data.length * 25)}">
      <g>
        ${paths.join('')}
        ${legendItems.join('')}
      </g>
    </svg>
  `;
};

/**
 * Generate HTML content for PDF
 */
const generateHTML = (
  transactions: Transaction[],
  monthlyStats: MonthlyStats[],
  title: string,
  categoryRecord: Record<string, CategoryInfo>
): string => {
  const now = format(new Date(), 'MMMM d, yyyy');

  const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  // Category totals - dynamic based on transactions
  const categoryTotals: Record<string, number> = {};

  transactions.forEach((tx) => {
    if (!categoryTotals[tx.category]) {
      categoryTotals[tx.category] = 0;
    }
    categoryTotals[tx.category] += tx.amount;
  });

  const transactionRows = transactions
    .map((tx) => {
      const category = categoryRecord[tx.category] || { label: tx.category, color: '#6B7280' };
      const dateStr = format(new Date(tx.timestamp), 'MMM d, yyyy');
      return `
        <tr>
          <td>${dateStr}</td>
          <td>
            <span class="category-badge" style="background-color: ${category.color}20; color: ${category.color}">
              ${category.label}
            </span>
          </td>
          <td>${tx.reason || '-'}</td>
          <td>${tx.payeeName}</td>
          <td class="amount">₹${tx.amount.toLocaleString('en-IN')}</td>
        </tr>
      `;
    })
    .join('');

  const categoryRows = Object.entries(categoryTotals)
    .filter(([_, amount]) => amount > 0)
    .map(([key, amount]) => {
      const category = categoryRecord[key] || { label: key, color: '#6B7280' };
      const percentage = totalAmount > 0 ? ((amount / totalAmount) * 100).toFixed(1) : '0';
      return `
        <tr>
          <td>
            <span class="category-badge" style="background-color: ${category.color}20; color: ${category.color}">
              ${category.label}
            </span>
          </td>
          <td class="amount">₹${amount.toLocaleString('en-IN')}</td>
          <td>${percentage}%</td>
        </tr>
      `;
    })
    .join('');

  const pieChartSVG = generatePieChartSVG(categoryTotals, categoryRecord, totalAmount);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 12px;
          color: #333;
          line-height: 1.5;
          padding: 40px;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #14B8A6;
        }
        
        .header h1 {
          font-size: 24px;
          color: #14B8A6;
          margin-bottom: 8px;
        }
        
        .header p {
          color: #666;
          font-size: 14px;
        }
        
        .summary-cards {
          display: flex;
          gap: 20px;
          margin-bottom: 30px;
        }
        
        .summary-card {
          flex: 1;
          background: #f8f9fa;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
        }
        
        .summary-card h3 {
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 8px;
        }
        
        .summary-card .value {
          font-size: 24px;
          font-weight: 700;
          color: #333;
        }
        
        .summary-card .value.highlight {
          color: #14B8A6;
        }
        
        .section {
          margin-bottom: 30px;
        }
        
        .section h2 {
          font-size: 16px;
          color: #333;
          margin-bottom: 15px;
          padding-bottom: 8px;
          border-bottom: 1px solid #eee;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
        }
        
        th {
          background: #f8f9fa;
          padding: 12px;
          text-align: left;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #666;
          border-bottom: 2px solid #eee;
        }
        
        td {
          padding: 12px;
          border-bottom: 1px solid #eee;
        }
        
        .amount {
          text-align: right;
          font-weight: 600;
          font-family: 'SF Mono', monospace;
        }
        
        .category-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
        }

        .chart-container {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
          background: #f8f9fa;
          border-radius: 8px;
          padding: 20px;
        }

        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #eee;
          text-align: center;
          color: #999;
          font-size: 11px;
        }
        
        @media print {
          body {
            padding: 20px;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>UPI Tracker</h1>
        <p>${title} • Generated on ${now}</p>
      </div>
      
      <div class="summary-cards">
        <div class="summary-card">
          <h3>Total Spent</h3>
          <div class="value highlight">₹${totalAmount.toLocaleString('en-IN')}</div>
        </div>
        <div class="summary-card">
          <h3>Transactions</h3>
          <div class="value">${transactions.length}</div>
        </div>
      </div>
      
      ${categoryRows ? `
      <div class="section">
        <h2>Category Breakdown</h2>
        ${pieChartSVG ? `<div class="chart-container">${pieChartSVG}</div>` : ''}
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th style="text-align: right">Amount</th>
              <th>Percentage</th>
            </tr>
          </thead>
          <tbody>
            ${categoryRows}
          </tbody>
        </table>
      </div>
      ` : ''}
      
      <div class="section">
        <h2>All Transactions</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Reason</th>
              <th>Payee</th>
              <th style="text-align: right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${transactionRows || '<tr><td colspan="5" style="text-align: center; color: #999;">No transactions</td></tr>'}
          </tbody>
        </table>
      </div>
      
      <div class="footer">
        <p>This report was generated by UPI Tracker. All data is stored locally on your device.</p>
      </div>
    </body>
    </html>
  `;
};

/**
 * Export all transactions to PDF
 */
export const exportToPDF = async (monthKey?: string): Promise<void> => {
  try {
    let transactions: Transaction[];
    let title: string;
    
    if (monthKey) {
      // Export specific month
      const allTransactions = await getAllTransactions();
      transactions = allTransactions.filter((tx) => tx.monthKey === monthKey);
      title = `Expense Report - ${format(new Date(monthKey + '-01'), 'MMMM yyyy')}`;
    } else {
      // Export all
      transactions = await getAllTransactions();
      title = 'Complete Expense Report';
    }

    const months = await getAvailableMonths();
    const monthlyStatsPromises = months.map((month) => getMonthlyStats(month));
    const monthlyStats = await Promise.all(monthlyStatsPromises);

    // Load categories
    const categories = await getCategories();
    const categoryRecord = categoryListToRecord(categories);

    const html = generateHTML(transactions, monthlyStats, title, categoryRecord);

    // Generate PDF
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    // Create a better filename
    const timestamp = format(new Date(), 'yyyy-MM-dd');
    const newFileName = monthKey
      ? `UPI_Tracker_${monthKey}.pdf`
      : `UPI_Tracker_All_${timestamp}.pdf`;
    
    const newUri = `${documentDirectory}${newFileName}`;

    // Move the file to a better location
    await moveAsync({
      from: uri,
      to: newUri,
    });

    // Check if sharing is available
    const isAvailable = await Sharing.isAvailableAsync();
    
    if (isAvailable) {
      await Sharing.shareAsync(newUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share Expense Report',
        UTI: 'com.adobe.pdf',
      });
    } else {
      console.log('Sharing not available, file saved to:', newUri);
    }
  } catch (error) {
    console.error('Error exporting PDF:', error);
    throw error;
  }
};

/**
 * Export transactions for a specific month
 */
export const exportMonthToPDF = async (monthKey: string): Promise<void> => {
  return exportToPDF(monthKey);
};

