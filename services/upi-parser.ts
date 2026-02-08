import { UPIPaymentData } from '@/types/transaction';

/**
 * Parse UPI QR code data
 * Supports multiple formats:
 * - upi://pay?pa=merchant@upi&pn=MerchantName&am=100.00&cu=INR
 * - UPI://pay?pa=...
 * - Some variations with additional parameters
 */
export const parseUPIQRCode = (qrData: string): UPIPaymentData | null => {
  try {
    if (!qrData) return null;



    // BHARAT QR DETECTION: EMV format QRs (TLV encoded)
    // These start with digits, not "upi://"
    // Don't parse - let UPI apps handle EMV format directly
    const isUpiFormat = qrData.toLowerCase().startsWith('upi://') ||
      qrData.toLowerCase().startsWith('upi:');

    if (!isUpiFormat) {

      return null; // Signal to handle as raw QR
    }

    // Normalize the URL scheme to lowercase (only prefix)
    let normalizedData = qrData.trim();

    // Handle case-insensitive upi:// prefix
    if (normalizedData.toLowerCase().startsWith('upi://')) {
      normalizedData = 'upi://' + normalizedData.substring(6);
    } else if (normalizedData.toLowerCase().startsWith('upi:')) {
      // Some QR codes might have upi: without //
      normalizedData = 'upi://' + normalizedData.substring(4);
    } else {
      // Not a UPI QR code
      return null;
    }

    // Parse the URL
    const url = new URL(normalizedData);
    const params = url.searchParams;

    // Extract required UPI ID (pa = payee address)
    const upiId = params.get('pa');
    if (!upiId) {
      console.error('UPI QR code missing payee address (pa)');
      return null;
    }

    // Extract payee name (pn), default to "Unknown"
    let payeeName = params.get('pn') || 'Unknown';
    try {
      payeeName = decodeURIComponent(payeeName);
    } catch (e) {
      // Keep original if decode fails
    }

    // Clean up payee name: trim and normalize whitespace
    payeeName = extractMerchantName(payeeName, upiId);

    // Extract amount if present (am)
    const amountStr = params.get('am');
    let amount: number | undefined;
    if (amountStr) {
      const parsedAmount = parseFloat(amountStr);
      if (!isNaN(parsedAmount) && parsedAmount > 0) {
        amount = parsedAmount;
      }
    }

    // Extract transaction note if present (tn)
    let transactionNote: string | undefined;
    const tnValue = params.get('tn');
    if (tnValue) {
      try {
        transactionNote = decodeURIComponent(tnValue).trim();
      } catch (e) {
        transactionNote = tnValue.trim();
      }
    }

    // Extract ALL parameters PRESERVING ORIGINAL ENCODING
    // URLSearchParams decodes values, but we need the ORIGINAL encoded form!
    const rawParams: Record<string, string> = {};

    // Parse the query string manually to preserve encoding
    const queryString = url.search.substring(1); // Remove '?'
    queryString.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key && value) {
        rawParams[key] = value; // Store ENCODED value as-is from QR
      }
    });




    return {
      upiId,
      payeeName,
      amount,
      transactionNote,
      rawParams, // CRITICAL: Actually return rawParams!
    };
  } catch (error) {
    console.error('Failed to parse UPI QR code:', error);
    return null;
  }
};

/**
 * Smartly extract/derive merchant name
 */
export const extractMerchantName = (rawName: string, vpa?: string | null): string => {
  let name = rawName.trim().replace(/\s+/g, ' ');

  // 1. If name looks like a VPA, treat it as VPA for derivation
  if (name.includes('@') && !vpa) {
    vpa = name;
    name = 'Unknown';
  }

  // 2. Detect Generic Names
  const isGenericName = /^(merchant|google merchant|phonepe merchant|paytm merchant|bharatpe merchant|upi merchant|unknown)$/i.test(name);

  // 3. Try to derive from VPA if name is generic/unknown
  if ((isGenericName || name === 'Unknown') && vpa) {
    const vpaUsername = vpa.split('@')[0];
    // Convert "nandini.milk" -> "Nandini Milk"
    const derivedName = vpaUsername
      .replace(/[._-]/g, ' ') // Replace separators with spaces
      .replace(/[0-9]/g, '')  // Remove numbers (often phone nums)
      .trim();

    if (derivedName.length > 2) {
      // Capitalize Words
      name = derivedName.replace(/\b\w/g, l => l.toUpperCase());
    }
  }

  // 4. Clean up specific suffixes
  name = name.replace(/\s+(Merchant|Store|Shop)$/i, '');

  return name;
};

/**
 * Validate UPI ID format
 * Basic validation: should contain @ and have valid characters
 */
export const isValidUPIId = (upiId: string): boolean => {
  if (!upiId || typeof upiId !== 'string') return false;

  // UPI ID format: username@bankhandle
  const upiPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;
  return upiPattern.test(upiId.trim());
};

/**
 * Format UPI ID for display
 */
export const formatUPIId = (upiId: string): string => {
  if (!upiId) return '';
  return upiId.trim().toLowerCase();
};

