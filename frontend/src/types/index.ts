// ─── Auth ────────────────────────────────────────────────────────────────────
export interface User {
  id: number;
  phone: string;
  name: string | null;
  email: string | null;
  upi_id: string | null;
  avatar_url: string | null;
  is_paid_tier: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

// ─── Group ───────────────────────────────────────────────────────────────────
export type MemberRole = 'admin' | 'member';

export interface GroupMember {
  id: number;
  user: User;
  role: MemberRole;
  joined_at: string;
  is_registered?: boolean;  // Whether the member has completed registration
}

export interface Group {
  id: number;
  name: string;
  description: string | null;
  created_by: number;
  is_archived: boolean;
  created_at: string;
  members: GroupMember[];
}

export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface Invitation {
  id: number;
  group_id: number;
  group_name: string;
  inviter_id: number;
  inviter_name: string;
  inviter_phone: string;
  invitee_user_id: number | null;
  invitee_phone: string | null;
  invitee_email: string | null;
  status: InvitationStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
  token_expires_at: string | null;
  is_link_invite: boolean;
}

export interface InvitationCreateResponse {
  invitation: Invitation;
  delivery_channel: 'in_app' | 'link';
  invite_url: string | null;
}

export interface InvitationActionResponse {
  invitation: Invitation;
  group: Group | null;
}

export interface InvitationLinkValidation {
  invitation: Invitation;
  is_valid: boolean;
  reason: 'already_used' | 'rejected' | 'expired' | null;
}

// ─── Expense ─────────────────────────────────────────────────────────────────
export type SplitType = 'equal' | 'exact' | 'percentage';
export type ExpenseCategory = 'food' | 'transport' | 'accommodation' | 'utilities' | 'misc';

export interface Split {
  id: number;
  user: User;
  split_type: SplitType;
  amount: number; // paise
  percentage: number | null;
}

export interface ProofAttachment {
  id: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploader: User;
  uploaded_at: string;
  presigned_url: string | null;
}

export interface Expense {
  id: number;
  group_id: number;
  paid_by_user: User;
  amount: number; // paise
  description: string;
  category: ExpenseCategory;
  split_type: SplitType;
  is_deleted: boolean;
  is_disputed: boolean;
  is_settled: boolean;
  dispute_note: string | null;
  splits: Split[];
  proof_attachments: ProofAttachment[];
  created_at: string;
  updated_at: string;
}

// ─── Settlement ──────────────────────────────────────────────────────────────
export type SettlementStatus = 'pending' | 'confirmed' | 'disputed';

export interface SettlementInstruction {
  payer_id: number;
  payer_name: string;
  receiver_id: number;
  receiver_name: string;
  amount: number; // paise
  receiver_upi_id: string | null;
  upi_deep_link: string | null;
}

export interface BalanceSummary {
  user: User;
  net_balance: number; // paise
  settlement_instructions: SettlementInstruction[];
}

export interface GroupBalances {
  group_id: number;
  balances: BalanceSummary[];
  total_expenses: number;
  optimized_settlements: SettlementInstruction[];
}

export interface Settlement {
  id: number;
  group_id: number;
  payer: User;
  receiver: User;
  amount: number; // paise
  status: SettlementStatus;
  dispute_note: string | null;
  resolution_note: string | null;
  created_at: string;
  confirmed_at: string | null;
}

// ─── Audit ───────────────────────────────────────────────────────────────────
export type AuditEventType =
  | 'expense_created' | 'expense_edited' | 'expense_deleted'
  | 'settlement_initiated' | 'settlement_confirmed' | 'settlement_disputed'
  | 'dispute_resolved' | 'member_added' | 'member_removed'
  | 'group_created' | 'group_updated';

export interface AuditLog {
  id: number;
  event_type: AuditEventType;
  entity_id: number | null;
  actor: User;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  food: '🍔',
  transport: '🚗',
  accommodation: '🏠',
  utilities: '💡',
  misc: '📦',
};

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  food: '#FF6B6B',
  transport: '#4ECDC4',
  accommodation: '#6C63FF',
  utilities: '#FFD93D',
  misc: '#A8A8A8',
};

// ─── Phone Registration ──────────────────────────────────────────────────────
export interface PhoneCheckResult {
  registered: boolean;
  user_id: number | null;
  phone: string | null;
  user_name: string | null;
}

// ─── Theme ───────────────────────────────────────────────────────────────────
export type ThemeMode = 'dark' | 'light';

// ─── Notifications ───────────────────────────────────────────────────────────
export type NotificationType = 'group_invite' | 'settlement_initiated' | 'settlement_confirmed' | 'settlement_disputed' | 'expense_created' | 'member_added' | 'general';

export interface InAppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}
