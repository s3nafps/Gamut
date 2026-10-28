import { Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';

const TICKET_COLORS: Record<string, string> = {
  waiting_repair: 'orange',
  in_repair: 'blue',
  waiting_parts: 'yellow',
  waiting_retest: 'violet',
  closed: 'green',
  scrapped: 'dark',
};
const UNIT_COLORS: Record<string, string> = {
  passed: 'green',
  in_repair: 'orange',
  waiting_retest: 'violet',
  scrapped: 'dark',
};

export function TicketStatusBadge({ status, size = 'lg' }: { status: string; size?: string }) {
  const { t } = useTranslation();
  return (
    <Badge color={TICKET_COLORS[status] ?? 'gray'} size={size} variant="filled">
      {t(`status.ticket.${status}`)}
    </Badge>
  );
}

export function UnitStatusBadge({ status, size = 'lg' }: { status: string; size?: string }) {
  const { t } = useTranslation();
  return (
    <Badge color={UNIT_COLORS[status] ?? 'gray'} size={size} variant="filled">
      {t(`status.unit.${status}`)}
    </Badge>
  );
}

export function ResultBadge({ result, size = 'md' }: { result: 'pass' | 'fail'; size?: string }) {
  const { t } = useTranslation();
  return (
    <Badge color={result === 'pass' ? 'green' : 'red'} size={size} variant="filled">
      {t(result === 'pass' ? 'quality.pass' : 'quality.fail')}
    </Badge>
  );
}
