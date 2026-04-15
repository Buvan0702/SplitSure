export const UPI_APPS = [
  { name: 'GPay', icon: 'G', color: '#1A73E8', scheme: 'gpay://' },
  { name: 'PhonePe', icon: 'P', color: '#5F259F', scheme: 'phonepe://' },
  { name: 'Paytm', icon: 'Y', color: '#00BAF2', scheme: 'paytmmp://' },
];

export function buildUpiIntent(baseLink: string, appScheme: string): string {
  if (!baseLink.startsWith('upi://')) {
    return baseLink;
  }
  return baseLink.replace(/^upi:\/\//, appScheme);
}
