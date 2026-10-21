import { STATUS_LABELS } from '@/lib/constants';
import type { Status } from '@/lib/types';
import { Badge } from './ui';

const TONES = {
  active: 'brand',
  trial: 'warn',
  paused: 'neutral',
  cancellation_planned: 'warn',
  cancelled: 'muted',
} as const satisfies Record<Status, 'brand' | 'warn' | 'neutral' | 'muted'>;

export function StatusBadge({ status }: { status: Status }) {
  return <Badge tone={TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}
