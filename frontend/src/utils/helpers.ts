import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

/** Convert paise to rupee display string */
export function formatRupees(paise: number, decimals = 2): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Format date smartly — "Today", "Yesterday", or "12 Jan 2025" */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return `Today, ${format(date, 'HH:mm')}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, 'HH:mm')}`;
  return format(date, 'dd MMM yyyy');
}

/** Short relative time */
export function timeAgo(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

/** Mask phone for display */
export function maskPhone(phone: string): string {
  if (phone.length < 10) return phone;
  return phone.slice(0, -6) + '••••' + phone.slice(-2);
}

/** Get display name with fallback */
export function displayName(user: { name?: string | null; phone: string }): string {
  return user.name || user.phone;
}

/** Generate UPI deep link */
export function buildUPILink(upiId: string, name: string, amountPaise: number, note: string): string {
  const amount = (amountPaise / 100).toFixed(2);
  const encodedNote = encodeURIComponent(note);
  const encodedName = encodeURIComponent(name);
  return `upi://pay?pa=${upiId}&pn=${encodedName}&am=${amount}&tn=${encodedNote}&cu=INR`;
}

/** Clamp a number between min/max */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Debounce function */
export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
