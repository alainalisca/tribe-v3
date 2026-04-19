# Recurring Sessions & Subscription Booking Feature

Three components have been built for the Tribe fitness app recurring sessions feature:

## 1. RecurringSessionToggle.tsx
**Location:** `/components/RecurringSessionToggle.tsx`

**Purpose:** Toggle and configure recurring sessions on the session creation page.

**Props:**
```typescript
{
  value: {
    is_recurring: boolean;
    recurrence_pattern: string;  // Format: "frequency_day1_day2_..." (e.g., "weekly_0_2_4")
    recurrence_end_date: string; // Format: "YYYY-MM-DD" or empty
  };
  onChange: (val: any) => void;
}
```

**Features:**
- Toggle to enable/disable recurring sessions
- Frequency selector: Weekly, Biweekly, Monthly (button-based, not dropdown)
- Day of week multi-select (Mon-Sun) for weekly/biweekly
- Optional end date picker
- Live preview text in English and Spanish

**Integration Example:**
```tsx
import RecurringSessionToggle from '@/components/RecurringSessionToggle';

const [recurringValue, setRecurringValue] = useState({
  is_recurring: false,
  recurrence_pattern: '',
  recurrence_end_date: '',
});

return (
  <RecurringSessionToggle 
    value={recurringValue} 
    onChange={setRecurringValue} 
  />
);
```

---

## 2. SubscribeButton.tsx
**Location:** `/components/SubscribeButton.tsx`

**Purpose:** Display and handle subscriptions to recurring sessions on instructor storefronts and session cards.

**Props:**
```typescript
{
  sessionId: string;
  instructorId: string;
  userId: string;
  isRecurring: boolean;
  recurrencePattern: string;
  price: number | null;
  currency: string;
}
```

**Features:**
- Returns `null` if session is not recurring (safe to always include)
- Green outlined button: "Subscribe to weekly sessions" / "Suscribirse a sesiones semanales"
- Bottom sheet dialog with subscription details
- Shows pricing info, auto-booking confirmation, and cancellation policy
- Follows instructor if not already following
- Inserts subscription record into `session_participants` table
- Shows "Subscribed" state after successful subscription
- Full English/Spanish support
- Toast notifications for success/error

**Integration Example:**
```tsx
import SubscribeButton from '@/components/SubscribeButton';

return (
  <SubscribeButton
    sessionId={session.id}
    instructorId={session.creator_id}
    userId={currentUserId}
    isRecurring={session.is_recurring}
    recurrencePattern={session.recurrence_pattern}
    price={session.price_cents ? session.price_cents / 100 : null}
    currency={session.currency}
  />
);
```

---

## 3. /subscriptions/page.tsx
**Location:** `/app/subscriptions/page.tsx`

**Purpose:** User-facing page showing all their active subscriptions with management options.

**Features:**
- Header with back button
- Fetches all subscriptions where user has `is_subscription = true`
- Displays sport, frequency, instructor, next session date, location, and price
- Shows next session date (calculated from recurrence pattern)
- Unsubscribe button with confirmation modal
- Empty state with call-to-action to explore sessions
- Full dark mode and bilingual support
- BottomNav integration
- Proper theme colors and Tribe design patterns

**Accessibility:**
- Responsive grid layout
- Card-based design with proper spacing
- Loading and error states
- Toast notifications

---

## Database Schema Requirements

### `sessions` table additions:
```sql
ALTER TABLE sessions ADD COLUMN is_recurring boolean DEFAULT false;
ALTER TABLE sessions ADD COLUMN recurrence_pattern varchar(255); -- e.g., "weekly_0_2_4"
ALTER TABLE sessions ADD COLUMN recurrence_end_date date;
```

### `session_participants` table additions:
```sql
ALTER TABLE session_participants ADD COLUMN is_subscription boolean DEFAULT false;
ALTER TABLE session_participants ADD COLUMN recurrence_pattern varchar(255);
ALTER TABLE session_participants ADD COLUMN subscription_status varchar(50); -- 'active', 'paused', 'cancelled'
```

---

## Usage Workflow

### For Session Creation:
1. Include `RecurringSessionToggle` in your create session form
2. Pass the toggle state to your session creation API
3. Store `is_recurring`, `recurrence_pattern`, and `recurrence_end_date` in the database

### For Session Display:
1. Include `SubscribeButton` on session cards and instructor storefronts
2. Pass the required props from session and user data
3. Component handles all subscription logic internally

### For User Subscriptions:
1. Link to `/subscriptions` from user profile
2. Page automatically loads and displays all active subscriptions
3. Users can view details or unsubscribe from each session

---

## Translations Required

These translations should be added to your translation files:

### English Additions:
```typescript
'recurringSession': 'Recurring Session',
'frequency': 'Frequency',
'weekly': 'Weekly',
'biweekly': 'Biweekly',
'monthly': 'Monthly',
'daysOfWeek': 'Days of Week',
'endDateOptional': 'End Date (Optional)',
'subscribeToWeeklySessions': 'Subscribe to weekly sessions',
'confirmSubscription': 'Confirm Subscription',
'automaticBooking': 'Automatic Booking',
'youllAutomaticallyBeAdded': 'You\'ll automatically be added to future sessions in this series',
'costPerSession': 'Cost Per Session',
'unsubscribeAnytime': 'Unsubscribe Anytime',
'youCanCancelAnytime': 'You can cancel your subscription anytime from your profile',
'mySubscriptions': 'My Subscriptions',
'noSubscriptionsYet': 'No Subscriptions Yet',
'subscribeToRecurringSessions': 'Subscribe to recurring sessions to train regularly with the same instructor.',
'instructor': 'Instructor',
'next': 'Next',
'cancelSubscription': 'Cancel Subscription',
'youWillNoLongerReceive': 'You will no longer receive automatic invitations to future sessions.',
'unsubscribed': 'Unsubscribed successfully',
```

### Spanish Additions:
```typescript
'sesionRecurrente': 'Sesión Recurrente',
'frecuencia': 'Frecuencia',
'semanal': 'Semanal',
'quincenal': 'Biweekly',
'mensual': 'Mensual',
'diasDeLaSemana': 'Días de la Semana',
'fechaDeTerminoOpcional': 'Fecha de Término (Opcional)',
'suscribirseASesionesSemanales': 'Suscribirse a sesiones semanales',
'confirmarSuscripcion': 'Confirmar Suscripción',
'reservaAutomatica': 'Reserva Automática',
'serasAnadidoAutomaticamente': 'Serás añadido automáticamente a futuras sesiones de esta serie',
'costoPorSesion': 'Costo por Sesión',
'desuscribiseEnCualquierMomento': 'Desuscribirse en Cualquier Momento',
'puedesCancelarTuSuscripcion': 'Puedes cancelar tu suscripción desde tu perfil cuando quieras',
'misSuscripciones': 'Mis Suscripciones',
'sinSuscripciones': 'Sin Suscripciones',
'subscribeteASesionesRecurrentes': 'Suscríbete a sesiones recurrentes para entrenar regularmente con el mismo instructor.',
'instructor': 'Instructor',
'proxima': 'Próxima',
'cancelarSuscripcion': 'Cancelar Suscripción',
'dejarasDeRecibir': 'Dejarás de recibir invitaciones automáticas a futuras sesiones.',
'desuscrito': 'Suscripción cancelada',
```

---

## Future Enhancements (Not Implemented)

- **Cron Job**: Backend cron job to automatically create session instances and add subscribers
- **Pause/Resume**: Allow users to temporarily pause subscriptions without cancelling
- **Subscription Pricing**: Different pricing models (fixed per session, monthly pass, etc.)
- **Payment Integration**: Automatic billing on scheduled sessions
- **Notification Reminders**: Notify subscribers before upcoming sessions
- **Calendar Sync**: Export subscription calendar to Google Calendar / Apple Calendar
- **Instructor Dashboard**: View and manage subscription metrics

---

## Theme Variables Used

- `bg-theme-page`: Page background
- `bg-theme-card`: Card backgrounds
- `text-theme-primary`: Primary text
- `border-theme`: Theme borders
- `bg-tribe-green`: Primary accent color (#9EE551)
- `text-tribe-green`: Green text
- Dark mode variants: `dark:bg-[#6B7178]`, `dark:bg-[#52575D]`, etc.

All components follow Tribe's existing design system and dark mode implementation.
