import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPlans, fetchVisibleProfiles } from './queries';
import { computeMetrics, groupBy, type Metrics } from './metrics';
import { workdaysBetween } from './dates';
import type { Plan, Profile } from './types';

export interface MemberStats {
  profile: Profile;
  plans: Plan[];
  m: Metrics;
}

/** Charge l'équipe visible (selon la RLS) et ses indicateurs sur la période. */
export async function loadTeam(supabase: SupabaseClient, from: string, to: string) {
  const profiles = (await fetchVisibleProfiles(supabase, { activeOnly: true })).filter((p) => p.department_id || !['admin', 'direction'].includes(p.role));
  const plans = await fetchPlans(supabase, { userIds: profiles.map((p) => p.id), from, to });
  const expected = workdaysBetween(from, to).length || 1;
  const byUser = groupBy(plans, (p) => p.user_id);
  const members: MemberStats[] = profiles.map((p) => ({ profile: p, plans: byUser[p.id] ?? [], m: computeMetrics(byUser[p.id] ?? [], expected) }));
  const global = computeMetrics(plans, expected * profiles.length);

  const deptGroups = groupBy(members, (x) => x.profile.department?.name ?? '—');
  const departments = Object.entries(deptGroups)
    .map(([name, list]) => {
      const dm = computeMetrics(list.flatMap((x) => x.plans), expected * list.length);
      const difficulties = list.flatMap((x) => x.plans.flatMap((p) => p.actions.filter((a) => a.result?.justification || a.result?.difficulty))).length;
      return { name, count: list.length, m: dm, difficulties };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { profiles, plans, members, global, departments, expected };
}
