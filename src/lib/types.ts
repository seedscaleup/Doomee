export type Role = 'admin' | 'direction' | 'manager' | 'collaborateur';
export type PlanStatus = 'draft' | 'submitted' | 'closed';
export type ResultStatus = 'done' | 'partial' | 'not_done';
export type Priority = 'high' | 'medium' | 'low';
export type Lang = 'fr' | 'en';

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
  department_id: string | null;
  job_title: string | null;
  status: 'active' | 'inactive';
  phone: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_color: string;
  language: Lang;
  notification_prefs: Record<string, boolean>;
  created_at: string;
  department?: { id: string; name: string; manager_id: string | null } | null;
}

export interface Attachment {
  id: string;
  result_id: string;
  file_path: string;
  file_name: string | null;
  file_type: string | null;
  kind: 'proof' | 'receipt';
}

export interface Result {
  id: string;
  action_id: string;
  status: ResultStatus;
  actual_result: string | null;
  quantity: number | null;
  actual_minutes: number | null;
  budget_used: number | null;
  difficulty: string | null;
  justification: string | null;
  completed_on_time: boolean;
  submitted_at: string;
  attachments?: Attachment[];
}

export interface Action {
  id: string;
  plan_id: string;
  title: string;
  description: string | null;
  expected_result: string | null;
  priority: Priority;
  deadline: string | null;
  estimated_minutes: number;
  planned_budget: number | null;
  is_unplanned: boolean;
  created_at: string;
  project: { id: string; name: string; client_name: string | null } | null;
  category: { id: string; name: string } | null;
  result: Result | null;
}

export interface Plan {
  id: string;
  user_id: string;
  plan_date: string;
  status: PlanStatus;
  submitted_at: string | null;
  closed_at: string | null;
  difficulties: string | null;
  actions: Action[];
}

export interface Option {
  id: string;
  name: string;
}
