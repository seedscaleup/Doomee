import { runReminders } from '@/lib/cron';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return runReminders(request, 'soir');
}
