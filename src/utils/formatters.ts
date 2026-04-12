
/**
 * Formats a number as a currency value
 * @param amount - Number to format (in cents if isCents is true)
 * @param currencySymbol - Currency symbol to use (default: $)
 * @param isCents - Whether the amount is in cents (default: true)
 * @returns Formatted currency string
 */
export const formatCurrency = (
  amount: number | null | undefined,
  currencySymbol: string = "$",
  isCents: boolean = true
): string => {
  if (amount === null || amount === undefined) return `${currencySymbol}0.00`;
  
  const value = isCents ? amount / 100 : amount;
  
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Formats a date string into a readable format
 * @param dateString - ISO date string to format
 * @param withTime - Whether to include time in the output (default: false)
 * @param format - Format style to use (default: 'medium')
 * @returns Formatted date string
 */
export const formatDate = (
  dateString: string | null | undefined | Date,
  withTime: boolean = false,
  format: 'short' | 'medium' | 'long' = 'medium'
): string => {
  if (!dateString) return "N/A";
  
  try {
    const date = dateString instanceof Date ? dateString : new Date(dateString);
    
    if (isNaN(date.getTime())) return "Invalid Date";
    
    const dateFormatOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: format === 'short' ? "numeric" : format === 'medium' ? "short" : "long",
      day: "numeric"
    };
    
    const timeFormatOptions: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit"
    };
    
    const options: Intl.DateTimeFormatOptions = {
      ...dateFormatOptions,
      ...(withTime ? timeFormatOptions : {})
    };
    
    return new Intl.DateTimeFormat("en-US", options).format(date);
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Error";
  }
};

/**
 * Formats a phone number to a standardized format
 * @param phone - Phone number to format
 * @returns Formatted phone number
 */
export const formatPhoneNumber = (phone: string | null | undefined): string => {
  if (!phone) return "";
  
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, "");
  
  // Check if it's a valid US phone number
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`;
  }
  
  // Return original if not matching expected format
  return phone;
};

/**
 * Formats a large number with commas
 * @param number - Number to format
 * @returns Formatted number with commas
 */
export const formatNumber = (number: number | null | undefined): string => {
  if (number === null || number === undefined) return "0";
  return new Intl.NumberFormat('en-US').format(number);
};

/**
 * Formats a percentage value
 * @param value - Number to format as percentage
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 */
export const formatPercentage = (
  value: number | null | undefined, 
  decimals: number = 1
): string => {
  if (value === null || value === undefined) return "0%";
  return `${value.toFixed(decimals)}%`;
};

/**
 * Formats file size in bytes to human-readable format
 * @param bytes - File size in bytes
 * @returns Human-readable file size
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Truncates text to a specific length and adds ellipsis
 * @param text - Text to truncate
 * @param length - Maximum length (default: 100)
 * @returns Truncated text with ellipsis if needed
 */
export const truncateText = (
  text: string | null | undefined, 
  length: number = 100
): string => {
  if (!text) return "";
  if (text.length <= length) return text;
  
  return text.substring(0, length) + "...";
};
