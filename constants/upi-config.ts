/**
 * UPI Configuration and Intent URLs
 */

export const UPI_CONFIG = {
  currency: 'INR',
};

/**
 * Build universal UPI intent URL - lets user choose their preferred app
 */
export const buildUPIUrl = (params: {
  upiId: string;
  payeeName: string;
  amount: number;
  transactionNote?: string;
}): string => {
  const { upiId, payeeName, amount, transactionNote } = params;
  
  const queryParams = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: amount.toString(),
    cu: UPI_CONFIG.currency,
  });

  if (transactionNote) {
    queryParams.set('tn', transactionNote);
  }

  return `upi://pay?${queryParams.toString()}`;
};

/**
 * Parse UPI QR code data
 * Format: upi://pay?pa=merchant@upi&pn=MerchantName&am=100.00&cu=INR
 */
export const parseUPIQRCode = (qrData: string): {
  upiId: string;
  payeeName: string;
  amount?: number;
  transactionNote?: string;
} | null => {
  try {
    // Handle both upi:// and UPI:// prefixes
    const normalizedData = qrData.toLowerCase().startsWith('upi://')
      ? qrData
      : qrData.toLowerCase().startsWith('upi:')
      ? 'upi://' + qrData.substring(4)
      : null;

    if (!normalizedData) {
      return null;
    }

    const url = new URL(normalizedData);
    const params = url.searchParams;

    const upiId = params.get('pa');
    const payeeName = params.get('pn') || 'Unknown';
    const amountStr = params.get('am');
    const transactionNote = params.get('tn') || undefined;

    if (!upiId) {
      return null;
    }

    return {
      upiId,
      payeeName: decodeURIComponent(payeeName),
      amount: amountStr ? parseFloat(amountStr) : undefined,
      transactionNote: transactionNote ? decodeURIComponent(transactionNote) : undefined,
    };
  } catch (error) {
    console.error('Failed to parse UPI QR code:', error);
    return null;
  }
};

