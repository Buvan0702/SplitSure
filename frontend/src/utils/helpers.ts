import { Alert } from 'react-native';
import { getApiErrorMessage } from '../services/api';
import type { ExpenseCategory } from '../types';

/**
 * Standard error handler for React Query mutation onError callbacks.
 * Usage: onError: (error) => handleApiError(error, 'Failed to create group')
 */
export function handleApiError(error: unknown, fallback: string): void {
  Alert.alert('Error', getApiErrorMessage(error, fallback));
}

/**
 * Format paise amount to display string (e.g., 15050 → "₹150.50")
 */
export function formatPaise(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const remainder = Math.abs(paise) % 100;
  const sign = paise < 0 ? '-' : '';
  return `${sign}₹${rupees}.${String(remainder).padStart(2, '0')}`;
}

/**
 * Shared expense category definitions.
 * Used by AddExpenseScreen and EditExpenseScreen.
 */
export const EXPENSE_CATEGORIES: Array<{ value: ExpenseCategory; label: string }> = [
  { value: 'food', label: 'Food' },
  { value: 'transport', label: 'Transport' },
  { value: 'accommodation', label: 'Hotel' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'misc', label: 'Entertainment' },
];

/**
 * Standardized React Query key factories.
 * Convention: [entity] or [entity, id] or [entity, id, sub-entity]
 */
export const QueryKeys = {
  groups: () => ['groups'] as const,
  group: (id: number) => ['group', id] as const,
  expenses: (groupId: number) => ['expenses', groupId] as const,
  expense: (groupId: number, expenseId: number) => ['expense', groupId, expenseId] as const,
  balances: (groupId: number) => ['balances', groupId] as const,
  homeBalances: () => ['home-balances'] as const,
  settlements: (groupId: number) => ['settlements', groupId] as const,
  audit: (groupId: number) => ['audit', groupId] as const,
  recentExpenses: (userId: number) => ['recent-expenses', userId] as const,
} as const;
