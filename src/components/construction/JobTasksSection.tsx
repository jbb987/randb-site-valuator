import { useMemo, useState } from 'react';
import { useUsers } from '../../hooks/useUsers';
import { useJobTasks } from '../../hooks/useJobTasks';
import { useAuth } from '../../hooks/useAuth';
import type { JobPermissions } from '../../hooks/useJobPermissions';
import { TASK_STATUS_ORDER } from '../../lib/constructionTasks';
import {
  ALL_JOB_TASK_STATUSES,
  JOB_TASK_STATUS_LABELS,
  type ConstructionJob,
  type JobTask,
  type JobTaskStatus,
} from '../../types';

interface Props {
  job: ConstructionJob;
  perms: JobPermissions;
}

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white px-3 py-2 text-sm transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none';

function nextStatus(s: JobTaskStatus): JobTaskStatus {
  // Click cycle: todo → in-progress → done → todo
  if (s === 'todo') return 'in-progress';
  if (s === 'in-progress') return 'done';
  return 'todo';
}

function StatusPill({ status }: { status: JobTaskStatus }) {
  const styles: Record<JobTaskStatus, string> = {
    'todo':         'bg-stone-100 text-[#7A756E]',
    'in-progress':  'bg-[#3B82F6]/10 text-[#3B82F6]',
    'done':         'bg-[#10B981]/10 text-[#10B981]',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${styles[status]}`}>
      {JOB_TASK_STATUS_LABELS[status]}
    </span>
  );
}

function formatDate(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function JobTasksSection({ job, perms }: Props) {
  const { user } = useAuth();
  const { users } = useUsers();
  const { tasks, loading, create, update, remove } = useJobTasks(job.id);

  // Inline-add row state
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftAssignee, setDraftAssignee] = useState('');
  const [draftDue, setDraftDue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // Members eligible for task assignment: PM + workers.
  const eligibleAssignees = useMemo(() => {
    const ids = new Set<string>([job.projectManagerId, ...(job.workerIds ?? [])]);
    return users.filter((u) => ids.has(u.id));
  }, [users, job.projectManagerId, job.workerIds]);

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const so = TASK_STATUS_ORDER[a.status] - TASK_STATUS_ORDER[b.status];
      if (so !== 0) return so;
      // Inside a status group: nearest due date first, then created order
      const ad = a.dueDate ?? Number.POSITIVE_INFINITY;
      const bd = b.dueDate ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return a.createdAt - b.createdAt;
    });
  }, [tasks]);

  function resetDraft() {
    setDraftTitle('');
    setDraftAssignee('');
    setDraftDue('');
    setError(null);
  }

  async function handleCreate() {
    if (!user) return;
    if (!draftTitle.trim()) {
      setError('Task title is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const dueMs = draftDue ? Date.parse(draftDue) : NaN;
      await create({
        title: draftTitle.trim(),
        status: 'todo',
        ...(draftAssignee && { assigneeId: draftAssignee }),
        ...(Number.isFinite(dueMs) && { dueDate: dueMs }),
        createdBy: user.uid,
      });
      resetDraft();
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(t: JobTask) {
    if (!perms.canUpdateTaskStatus(t.assigneeId)) return;
    try {
      await update(t.id, { status: nextStatus(t.status) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task.');
    }
  }

  async function handleDelete(t: JobTask) {
    if (!perms.canDeleteTasks) return;
    if (!window.confirm(`Delete task "${t.title}"?`)) return;
    try {
      await remove(t.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task.');
    }
  }

  return (
    <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-heading font-semibold text-[#201F1E]">
          Tasks
          {tasks.length > 0 && (
            <span className="text-[#7A756E] font-normal ml-2">
              · {tasks.filter((t) => t.status !== 'done').length} open
            </span>
          )}
        </h3>
        {perms.canCreateTasks && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-sm font-medium text-[#ED202B] border border-[#ED202B] px-3 py-1.5 rounded-lg hover:bg-[#ED202B]/5 transition"
          >
            + Add task
          </button>
        )}
      </div>

      {/* Inline add row */}
      {adding && (
        <div className="rounded-lg border border-[#D8D5D0] bg-stone-50 p-3 mb-3 space-y-2">
          <input
            type="text"
            autoFocus
            className={inputClass}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Task title…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') {
                setAdding(false);
                resetDraft();
              }
            }}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              className={inputClass}
              value={draftAssignee}
              onChange={(e) => setDraftAssignee(e.target.value)}
            >
              <option value="">— Assignee (optional) —</option>
              {eligibleAssignees.map((u) => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </select>
            <input
              type="date"
              className={inputClass}
              value={draftDue}
              onChange={(e) => setDraftDue(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                resetDraft();
              }}
              disabled={submitting}
              className="px-3 py-1.5 text-sm font-medium text-[#201F1E] hover:text-[#ED202B] transition disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={submitting || !draftTitle.trim()}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-[#ED202B] hover:bg-[#9B0E18] transition disabled:opacity-40"
            >
              {submitting ? 'Saving…' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-sm text-[#7A756E]">Loading…</p>
      ) : sorted.length === 0 && !adding ? (
        <p className="text-sm text-[#7A756E]">
          No tasks yet.{perms.canCreateTasks && ' Click + Add task to create the first one.'}
        </p>
      ) : (
        <ul className="divide-y divide-[#F0EEEB]">
          {sorted.map((t) => {
            const assignee = t.assigneeId ? userById.get(t.assigneeId) : undefined;
            const canToggle = perms.canUpdateTaskStatus(t.assigneeId);
            const isDone = t.status === 'done';
            const overdue = !isDone && t.dueDate && t.dueDate < Date.now();
            return (
              <li key={t.id} className="py-2.5 flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleStatus(t)}
                  disabled={!canToggle}
                  title={canToggle ? 'Click to advance status' : 'Only the assignee or PM can update this'}
                  aria-label={`Mark ${JOB_TASK_STATUS_LABELS[t.status]}`}
                  className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition ${
                    isDone
                      ? 'bg-[#10B981] border-[#10B981] text-white'
                      : t.status === 'in-progress'
                        ? 'bg-[#3B82F6]/10 border-[#3B82F6]'
                        : 'bg-white border-[#D8D5D0] hover:border-[#ED202B]'
                  } ${canToggle ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  {isDone && (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {t.status === 'in-progress' && (
                    <span className="h-2 w-2 rounded-full bg-[#3B82F6]" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm ${isDone ? 'line-through text-[#7A756E]' : 'text-[#201F1E]'}`}>
                      {t.title}
                    </span>
                    <StatusPill status={t.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#7A756E] mt-0.5">
                    {assignee && <span>{assignee.email}</span>}
                    {t.dueDate && (
                      <span className={overdue ? 'text-[#ED202B] font-medium' : ''}>
                        Due {formatDate(t.dueDate)}{overdue && ' (overdue)'}
                      </span>
                    )}
                    {isDone && t.completedAt && (
                      <span>Completed {formatDate(t.completedAt)}</span>
                    )}
                  </div>
                </div>
                {perms.canDeleteTasks && (
                  <button
                    type="button"
                    onClick={() => handleDelete(t)}
                    className="text-xs text-[#7A756E] hover:text-[#ED202B] transition shrink-0"
                  >
                    Delete
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="text-sm text-[#ED202B] mt-2" role="alert">
          {error}
        </p>
      )}

      {/* Status legend (small print at bottom — only shows once user has tasks) */}
      {sorted.length > 0 && (
        <p className="text-[11px] text-[#7A756E]/80 mt-3">
          Click the box to cycle: {ALL_JOB_TASK_STATUSES.map((s) => JOB_TASK_STATUS_LABELS[s]).join(' → ')} → To do.
        </p>
      )}
    </section>
  );
}
