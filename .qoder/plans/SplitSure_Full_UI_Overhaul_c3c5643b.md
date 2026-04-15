# SplitSure Full UI Overhaul and Feature Completion

## Current State

The app is **already feature-complete** on the backend (100%) and frontend (95%). All core features work in dev mode without paid services (`USE_DEV_OTP=true`, `USE_LOCAL_STORAGE=true`, Expo Push free). The main gaps are:

- **No light mode** — only dark theme exists in `frontend/src/utils/theme.ts`
- **No "Not Registered" status** — when adding a member by phone, the backend creates the user silently; no UI indication of registration status
- **Animations underutilized** — `react-native-reanimated` is installed but barely used
- **No local notification fallback** — push notifications use Expo Push API (free but requires physical device); no in-app notification system

## Architecture Decisions

- **Theme system**: Dual palette (dark/light) in `theme.ts` with React Context provider and async storage persistence
- **Not Registered detection**: Backend endpoint to check phone registration status; frontend shows badge on unregistered members
- **Notifications**: Keep Expo Push (free) + add in-app notification toasts for immediate feedback
- **No paid services**: All features use `USE_DEV_OTP=true`, `USE_LOCAL_STORAGE=true`, Docker PostgreSQL/Redis

---

## Task 1: Backend — Add Phone Registration Check and Notification Enhancements

**Files to modify:**
- `backend/app/api/v1/endpoints/users.py` — Add `POST /users/check-phone` endpoint that accepts a phone number and returns `{registered: bool, user_name: string|null}`
- `backend/app/api/v1/endpoints/groups.py` — When adding member by phone, include `is_registered` field in response; if phone not in system, return member with `registered: false` status instead of auto-creating user
- `backend/app/schemas/schemas.py` — Add `PhoneCheckResponse` schema, update `GroupMemberResponse` with `is_registered` field
- `backend/app/api/v1/__init__.py` — Ensure new endpoint is routed

**Notification enhancement:**
- `backend/app/api/v1/endpoints/groups.py` — When a member is added/invited, trigger push notification to that user (if they have a push token)
- `backend/app/services/push_service.py` — Add `notify_group_invite` function

**Scope:** Backend only. No paid services. All changes use existing PostgreSQL queries.

---

## Task 2: Frontend — Theme System with Dark/Light Mode

**Files to create/modify:**
- `frontend/src/utils/theme.ts` — Expand with full `LightColors` palette, create `ThemeContext` provider, add `useTheme()` hook, persist preference via AsyncStorage
- `frontend/src/components/ui.tsx` — Update all components (Button, Card, Input, Avatar, Badge) to consume theme context instead of hardcoded `Colors`
- `frontend/src/components/chrome.tsx` — Update navigation chrome to use theme colors
- `frontend/app/_layout.tsx` — Wrap app in `ThemeProvider`

**Light mode palette design:**
- Background: `#F5F6FA` (soft gray-white)
- Surface: `#FFFFFF` (pure white cards)
- Glass: `rgba(255,255,255,0.85)` (light glassmorphism)
- Primary: `#6063EE` (deeper purple for contrast)
- Text: `#1A1D2E` (near-black)
- Maintain same accent colors (mint green, amber, pink-red) with adjusted saturation

**Scope:** Theme infrastructure only. Screen updates in later tasks.

---

## Task 3: Frontend — Enhanced Animation System and Shared Components

**Files to create/modify:**
- `frontend/src/utils/animations.ts` — Create reusable animation presets using `react-native-reanimated`: `fadeInUp`, `scaleIn`, `slideFromRight`, `staggeredList`, `glassPulse`, `shimmerEffect`
- `frontend/src/components/ui.tsx` — Add new components:
  - `AnimatedCard` — Card with entrance animation
  - `AnimatedList` — FlatList with staggered item animations
  - `SkeletonLoader` — Shimmer skeleton using reanimated (leverage existing `react-native-skeleton-placeholder`)
  - `ThemeToggle` — Animated sun/moon toggle switch
  - `StatusBadge` — "Not Registered" / "Active" / "Pending" badges
  - `NotificationToast` — In-app notification banner with slide animation
  - `GlassModal` — Enhanced modal with blur backdrop and scale animation
- `frontend/src/components/chrome.tsx` — Animate tab bar transitions, add theme-aware styling

**Scope:** Component library and animation utilities. No screen changes yet.

---

## Task 4: Frontend — Update API Layer and Types for New Features

**Files to modify:**
- `frontend/src/services/api.ts` — Add `checkPhoneRegistration(phone)` API call, update group member types
- `frontend/src/types/index.ts` — Add `PhoneCheckResult`, update `GroupMember` with `is_registered` field, add `NotificationType` enum, add `ThemeMode` type
- `frontend/src/store/authStore.ts` — No major changes needed (already complete)

**Scope:** API and type definitions only.

---

## Task 5: Frontend — Overhaul Core Screens (Home, Login, Profile)

**Files to modify:**
- `frontend/src/screens/LoginScreen.tsx` — Add theme support, enhance splash animation with Reanimated shared values, add particle/glow effects, smooth OTP input transitions
- `frontend/src/screens/HomeScreen.tsx` — Theme-aware colors, animated hero card with value counter animation, staggered group card entrance, animated sparkline charts, pull-to-refresh with custom animation
- `frontend/src/screens/ProfileScreen.tsx` — Add dark/light theme toggle (animated sun/moon), theme-aware styling, animated avatar, settings section polish

**Scope:** 3 screens. Use new theme context and animation components from Tasks 2-3.

---

## Task 6: Frontend — Overhaul Group and Member Screens

**Files to modify:**
- `frontend/src/screens/GroupsScreen.tsx` — Theme support, animated group list with staggered entrance, create group modal polish, search animation
- `frontend/src/screens/GroupDetailScreen.tsx` — Theme support, "Not Registered" badges next to unregistered members, animated member list, expense list with entrance animations, invite link sharing UI polish, notification trigger on invite

**Key feature:** When viewing members, show a "Not Registered" badge (red/amber) next to phone numbers that aren't registered in the system. When an invite is sent, show in-app toast confirmation.

**Scope:** 2 screens. Integrates phone check API from Task 1.

---

## Task 7: Frontend — Overhaul Expense Screens

**Files to modify:**
- `frontend/src/screens/AddExpenseScreen.tsx` — Theme support, animated amount input (counter effect), smooth category selector transitions, split mode toggle animation, proof upload zone with drag feedback
- `frontend/src/screens/EditExpenseScreen.tsx` — Same theme and animation treatment as AddExpense
- `frontend/src/screens/ExpenseDetailScreen.tsx` — Theme support, animated split breakdown visualization, proof gallery with image preview, dispute flow with animated modal

**Scope:** 3 screens.

---

## Task 8: Frontend — Overhaul Settlement, Balance, Audit, Activity Screens

**Files to modify:**
- `frontend/src/screens/SettlementsScreen.tsx` — Theme support, animated transaction cards, UPI app selector polish, settlement flow modals with glass effect, status transitions
- `frontend/src/screens/BalancesScreen.tsx` — Theme support, animated balance bars, member balance cards with entrance animation
- `frontend/src/screens/AuditScreen.tsx` — Theme support, timeline-style audit entries with animated connections, event type icons
- `frontend/src/screens/ActivityScreen.tsx` — Theme support, animated activity feed, staggered list

**Scope:** 4 screens.

---

## Task 9: Frontend — Tab Layout and Navigation Polish

**Files to modify:**
- `frontend/app/_layout.tsx` — Ensure ThemeProvider wraps everything, animated screen transitions
- `frontend/app/(tabs)/_layout.tsx` — Theme-aware floating tab dock, animated tab indicator, glassmorphic tab bar background
- All tab files (`index.tsx`, `groups.tsx`, `activity.tsx`, `profile.tsx`) — Ensure theme context passes through correctly
- `frontend/app/join/[token].tsx` — Theme support for invite join screen

**Scope:** Navigation and layout files.

---

## Task 10: Verification and Integration Testing

- Verify Docker environment starts correctly (`docker-compose up`)
- Test backend health endpoint and new phone check endpoint
- Build frontend and verify all 12 screens render in both dark and light modes
- Verify "Not Registered" badge appears for unregistered phone numbers
- Verify theme toggle persists across app restarts
- Verify animations run smoothly without performance issues
- Confirm zero paid service dependencies

---

## Dependency Order

```
Task 1 (Backend) ──────────────────────────────┐
Task 2 (Theme System) ─────────┐               │
Task 3 (Animation + Components)┤               │
                                ├─→ Task 5 (Core Screens)
Task 4 (API + Types) ──────────┤   Task 6 (Group Screens) ←── Task 1
                                ├─→ Task 7 (Expense Screens)
                                ├─→ Task 8 (Settlement/Balance/Audit/Activity)
                                └─→ Task 9 (Navigation/Layout)
                                            │
                                            v
                                    Task 10 (Verification)
```

Tasks 1, 2, 3, 4 can run in parallel. Tasks 5-9 depend on 2, 3, 4. Task 6 also depends on Task 1. Task 10 depends on all.

## Key Constraints

- **Zero paid services**: Everything runs on `USE_DEV_OTP=true`, `USE_LOCAL_STORAGE=true`, Docker PostgreSQL/Redis, Expo Push (free)
- **No new backend dependencies**: All changes use existing SQLAlchemy/FastAPI patterns
- **No new frontend packages**: All animation/UI needs are covered by already-installed packages (`reanimated`, `expo-blur`, `expo-linear-gradient`, `skeleton-placeholder`, `toast-message`)
- **Backward compatible**: All existing features continue to work unchanged
