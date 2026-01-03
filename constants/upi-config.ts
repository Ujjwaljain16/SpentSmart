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
  rawParams?: Record<string, string>; // Original QR parameters
  rawQuery?: string; // Original raw query string
}): string => {
  const { upiId, payeeName, amount, transactionNote = '', rawParams } = params;

  // 1️⃣ EXACT MERHCANT REPLAY (Best Effort for Signed QRs)
  // If we have the exact original query string and it's a Merchant QR, use it AS-IS.
  if (rawParams && Object.keys(rawParams).length > 0) {
    const allParams = { ...rawParams };

    // Detect Merchant - CRITICAL FIX
    // ANY of these params indicate a merchant QR:
    const strongMerchantSignals = ['mid', 'tid', 'tr', 'orgid', 'sign'];
    const hasStrongSignal = strongMerchantSignals.some(k => allParams[k]);

    // Merchant indicators that can appear alone
    const hasMerchantCode = allParams['mc'] !== undefined;
    const hasMerchantMode = allParams['mode'] === '02';
    const hasMerchantPurpose = allParams['purpose'] === '00';

    // CRITICAL DISTINCTION:
    // - TRUE MERCHANT: Has strong signals (mid/tid/sign) → Preserve all params
    // - PSEUDO-MERCHANT: Has mc/mode/purpose but NO strong signals → Convert to P2P
    const isTrueMerchant = hasStrongSignal;
    const isPseudoMerchant = !hasStrongSignal && (hasMerchantCode || hasMerchantMode || hasMerchantPurpose);

    if (isPseudoMerchant) {
      // Personal VPA with merchant params - CONVERT TO P2P
      // PSPs reject "merchant format with personal VPA" as invalid
      console.log('⚠️ Pseudo-Merchant QR Detected - Converting to P2P payment');
      console.log('   Stripping: mc, mode, purpose (keeping only pa, pn, am, cu, tn)');
      // Fall through to P2P logic below
    } else if (isTrueMerchant) {
      // TRUE MERCHANT with strong signals - preserve everything
      console.log('🏪 True Merchant QR Detected - Preserving all params');

      let finalQueryString = '';

      if (params.rawQuery) {
        finalQueryString = params.rawQuery;
      } else {
        finalQueryString = Object.entries(allParams)
          .map(([k, v]) => `${k}=${v}`).join('&');
      }

      // Replace %20 with + for better PSP compatibility
      finalQueryString = finalQueryString.replace(/%20/g, '+');

      const isDynamicQR = !allParams['am'];

      if (isDynamicQR) {
        console.log('📋 Dynamic Merchant QR - User will enter amount in PSP app');
        return `upi://pay?${finalQueryString}`;
      }

      console.log('💰 Static Merchant QR - Amount pre-filled');
      return `upi://pay?${finalQueryString}`;
    }
  }

  // 2️⃣ PERSONAL P2P (Simple & Clean)
  // For Personal VPAs, we build a fresh, simple URL.
  // We explicitly STRIP everything except the basics to avoid "invalid mode" errors.

  console.log('👤 Personal P2P - Building simple trusted intent');

  const p2pParams = new URLSearchParams();
  p2pParams.append('pa', upiId);
  p2pParams.append('pn', payeeName || 'User');
  p2pParams.append('am', amount.toFixed(2));
  p2pParams.append('cu', UPI_CONFIG.currency);

  if (transactionNote) {
    p2pParams.append('tn', transactionNote.trim());
  }

  // Recommendations say: Generate a fresh 'tr' for P2P tracking
  // We'll use a simple timestamp-based ID
  const p2pRefId = `tx_${Date.now()}`;
  p2pParams.append('tr', p2pRefId);

  return `upi://pay?${p2pParams.toString()}`;

  // Manual entry (no QR) - build fresh URL
  console.log('🔨 Building manual entry URL');
  const formattedAmount = amount.toFixed(2);

  let queryString = `pa=${encodeURIComponent(upiId)}`;
  queryString += `&pn=${encodeURIComponent(payeeName)}`;
  queryString += `&am=${formattedAmount}`;
  queryString += `&cu=${UPI_CONFIG.currency}`;

  if (transactionNote && transactionNote.trim()) {
    queryString += `&tn=${encodeURIComponent(transactionNote.trim())}`;
  }

  const upiUrl = `upi://pay?${queryString}`;
  console.log('🔗 Manual entry URL:', upiUrl);

  console.log('📊 Payment Details:', {
    upiId,
    payeeName,
    amount: formattedAmount,
    note: transactionNote || 'none',
  });
  console.log('✅ URL is valid UPI format');

  return upiUrl;
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

/**
 * Build UPI URL for collecting payments with a callback
 */
export const buildUPICollectUrl = (params: {
  upiId: string;
  payeeName: string;
  amount?: number;
  transactionNote?: string;
  callbackUrl: string;
}): string => {
  const { upiId, payeeName, amount, transactionNote = '', callbackUrl } = params;

  const p2pParams = new URLSearchParams();
  p2pParams.append('pa', upiId);
  p2pParams.append('pn', payeeName);
  p2pParams.append('cu', UPI_CONFIG.currency);

  if (amount && amount > 0) {
    p2pParams.append('am', amount.toFixed(2));
  }

  if (transactionNote) {
    p2pParams.append('tn', transactionNote.trim());
  }

  // Add tr for reference
  const tr = `txn_${Date.now()}`;
  p2pParams.append('tr', tr);

  // Add url for callback
  const separator = callbackUrl.includes('?') ? '&' : '?';
  let finalCallback = `${callbackUrl}${separator}tr=${tr}`;
  if (transactionNote) {
    finalCallback += `&tn=${encodeURIComponent(transactionNote.trim())}`;
  }
  p2pParams.append('url', finalCallback);

  return `upi://pay?${p2pParams.toString()}`;
};

