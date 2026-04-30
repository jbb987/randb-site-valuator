import { useMemo, useState } from 'react';
import CompanyPicker from '../crm-directory/CompanyPicker';
import { useCompanies } from '../../hooks/useCompanies';
import { useUsers } from '../../hooks/useUsers';
import {
  ALL_CONSTRUCTION_JOB_STATUSES,
  ALL_LINKED_COMPANY_ROLES,
  CONSTRUCTION_JOB_STATUS_LABELS,
  LINKED_COMPANY_ROLE_LABELS,
  type ConstructionJob,
  type ConstructionJobStatus,
  type LinkedCompany,
  type LinkedCompanyRole,
} from '../../types';

export interface JobFormValues {
  name: string;
  linkedCompanies: LinkedCompany[];
  projectManagerId: string;
  workerIds: string[];
  status: ConstructionJobStatus;
  startDate: string;          // YYYY-MM-DD or ''
  expectedEndDate: string;    // YYYY-MM-DD or ''
  actualEndDate: string;      // YYYY-MM-DD or ''
  address: string;
  budget: string;             // raw string for typing; parse on submit
  description: string;
}

export const EMPTY_JOB_FORM: JobFormValues = {
  name: '',
  linkedCompanies: [],
  projectManagerId: '',
  workerIds: [],
  status: 'planning',
  startDate: '',
  expectedEndDate: '',
  actualEndDate: '',
  address: '',
  budget: '',
  description: '',
};

export function jobToForm(job: ConstructionJob): JobFormValues {
  return {
    name: job.name,
    linkedCompanies: job.linkedCompanies,
    projectManagerId: job.projectManagerId,
    workerIds: job.workerIds,
    status: job.status,
    startDate: job.startDate ? new Date(job.startDate).toISOString().slice(0, 10) : '',
    expectedEndDate: job.expectedEndDate ? new Date(job.expectedEndDate).toISOString().slice(0, 10) : '',
    actualEndDate: job.actualEndDate ? new Date(job.actualEndDate).toISOString().slice(0, 10) : '',
    address: job.address ?? '',
    budget: job.budget != null ? String(job.budget) : '',
    description: job.description ?? '',
  };
}

interface Props {
  values: JobFormValues;
  onChange: (next: JobFormValues) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  saving?: boolean;
  submitLabel?: string;
}

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white px-3 py-2 text-sm transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none';

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-[#7A756E] block mb-1">
        {label}{required && <span className="text-[#ED202B] ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-[#7A756E] mt-1 block">{hint}</span>}
    </label>
  );
}

export default function JobForm({ values, onChange, onSubmit, onCancel, saving, submitLabel = 'Save' }: Props) {
  const { companies } = useCompanies();
  const { users, loading: usersLoading } = useUsers();

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  // Validation
  const valid = useMemo(() => {
    if (values.name.trim().length === 0) return false;
    if (values.linkedCompanies.length === 0) return false;
    if (values.linkedCompanies.filter((l) => l.isPrimary).length !== 1) return false;
    if (!values.projectManagerId) return false;
    return true;
  }, [values]);

  function patch(p: Partial<JobFormValues>) {
    onChange({ ...values, ...p });
  }

  // Companies
  function addCompany(companyId: string | null) {
    if (!companyId) return;
    if (values.linkedCompanies.some((l) => l.companyId === companyId)) return;
    const isFirst = values.linkedCompanies.length === 0;
    patch({
      linkedCompanies: [
        ...values.linkedCompanies,
        { companyId, role: 'client', isPrimary: isFirst },
      ],
    });
  }

  function removeCompany(companyId: string) {
    const next = values.linkedCompanies.filter((l) => l.companyId !== companyId);
    // If we removed the primary, promote the first remaining (if any)
    if (next.length > 0 && !next.some((l) => l.isPrimary)) {
      next[0] = { ...next[0], isPrimary: true };
    }
    patch({ linkedCompanies: next });
  }

  function updateCompanyRole(companyId: string, role: LinkedCompanyRole) {
    patch({
      linkedCompanies: values.linkedCompanies.map((l) =>
        l.companyId === companyId ? { ...l, role } : l,
      ),
    });
  }

  function setPrimary(companyId: string) {
    patch({
      linkedCompanies: values.linkedCompanies.map((l) => ({
        ...l,
        isPrimary: l.companyId === companyId,
      })),
    });
  }

  // Workers
  const [workerPickerOpen, setWorkerPickerOpen] = useState(false);
  const availableWorkers = useMemo(() => {
    const taken = new Set([values.projectManagerId, ...values.workerIds]);
    return users.filter((u) => !taken.has(u.id));
  }, [users, values.projectManagerId, values.workerIds]);

  function addWorker(uid: string) {
    if (values.workerIds.includes(uid)) return;
    patch({ workerIds: [...values.workerIds, uid] });
    setWorkerPickerOpen(false);
  }

  function removeWorker(uid: string) {
    patch({ workerIds: values.workerIds.filter((w) => w !== uid) });
  }

  return (
    <div className="space-y-5">
      {/* Project name + status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Field label="Project name" required>
            <input
              type="text"
              className={inputClass}
              value={values.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. Eagle Pass Solar Farm"
            />
          </Field>
        </div>
        <Field label="Status" required>
          <select
            className={inputClass}
            value={values.status}
            onChange={(e) => patch({ status: e.target.value as ConstructionJobStatus })}
          >
            {ALL_CONSTRUCTION_JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONSTRUCTION_JOB_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Linked companies */}
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-[#7A756E] mb-1">
          Companies <span className="text-[#ED202B]">*</span>
          <span className="ml-2 normal-case text-[10px] text-[#7A756E]/80">
            One client, plus any GCs/subs. Mark exactly one as primary.
          </span>
        </div>
        {values.linkedCompanies.length > 0 && (
          <ul className="space-y-2 mb-2">
            {values.linkedCompanies.map((l) => {
              const c = companyById.get(l.companyId);
              return (
                <li key={l.companyId} className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-[#D8D5D0] bg-stone-50">
                  <span className="font-medium text-sm text-[#201F1E] mr-1 min-w-0 truncate">
                    {c?.name ?? '(missing company)'}
                  </span>
                  <select
                    className="text-xs border border-[#D8D5D0] rounded-md px-2 py-1 bg-white focus:outline-none focus:border-[#ED202B]"
                    value={l.role}
                    onChange={(e) => updateCompanyRole(l.companyId, e.target.value as LinkedCompanyRole)}
                  >
                    {ALL_LINKED_COMPANY_ROLES.map((r) => (
                      <option key={r} value={r}>{LINKED_COMPANY_ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <label className="text-xs flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="primary-company"
                      checked={l.isPrimary}
                      onChange={() => setPrimary(l.companyId)}
                      className="accent-[#ED202B]"
                    />
                    Primary
                  </label>
                  <button
                    type="button"
                    onClick={() => removeCompany(l.companyId)}
                    className="ml-auto text-xs text-[#7A756E] hover:text-[#ED202B]"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <CompanyPicker
          value={null}
          onChange={addCompany}
          placeholder="+ Add company"
        />
      </div>

      {/* Team */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Project manager" required>
          <select
            className={inputClass}
            value={values.projectManagerId}
            onChange={(e) => patch({ projectManagerId: e.target.value })}
            disabled={usersLoading}
          >
            <option value="">— Select PM —</option>
            {users
              .filter((u) => !values.workerIds.includes(u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
          </select>
        </Field>
        <Field label="Workers">
          <div className="space-y-1">
            {values.workerIds.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {values.workerIds.map((uid) => {
                  const u = users.find((x) => x.id === uid);
                  return (
                    <li
                      key={uid}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#ED202B]/10 text-xs text-[#201F1E]"
                    >
                      {u?.email ?? uid}
                      <button
                        type="button"
                        onClick={() => removeWorker(uid)}
                        className="text-[#7A756E] hover:text-[#ED202B]"
                        aria-label="Remove worker"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setWorkerPickerOpen((o) => !o)}
                className={`${inputClass} text-left text-[#7A756E]`}
                disabled={usersLoading || availableWorkers.length === 0}
              >
                {availableWorkers.length === 0 ? 'No more users to add' : '+ Add worker'}
              </button>
              {workerPickerOpen && availableWorkers.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-lg border border-[#D8D5D0] shadow-lg max-h-60 overflow-y-auto">
                  <ul>
                    {availableWorkers.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => addWorker(u.id)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[#ED202B]/5 transition"
                        >
                          {u.email}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </Field>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Start date">
          <input
            type="date"
            className={inputClass}
            value={values.startDate}
            onChange={(e) => patch({ startDate: e.target.value })}
          />
        </Field>
        <Field label="Expected end">
          <input
            type="date"
            className={inputClass}
            value={values.expectedEndDate}
            onChange={(e) => patch({ expectedEndDate: e.target.value })}
          />
        </Field>
        <Field label="Actual end">
          <input
            type="date"
            className={inputClass}
            value={values.actualEndDate}
            onChange={(e) => patch({ actualEndDate: e.target.value })}
          />
        </Field>
      </div>

      {/* Address + budget */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Field label="Address">
            <input
              type="text"
              className={inputClass}
              value={values.address}
              onChange={(e) => patch({ address: e.target.value })}
              placeholder="e.g. Eagle Pass, TX"
            />
          </Field>
        </div>
        <Field label="Budget (USD)">
          <input
            type="number"
            inputMode="decimal"
            className={inputClass}
            value={values.budget}
            onChange={(e) => patch({ budget: e.target.value })}
            placeholder="4200000"
            min={0}
          />
        </Field>
      </div>

      {/* Description */}
      <Field label="Description">
        <textarea
          className={`${inputClass} min-h-[88px]`}
          value={values.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="Short scope summary…"
        />
      </Field>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#D8D5D0]">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[#201F1E] bg-white border border-[#D8D5D0] hover:bg-stone-50 transition disabled:opacity-40"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!valid || saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#ED202B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9B0E18] transition disabled:opacity-40"
        >
          {saving ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving…
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </div>
  );
}

/** Convert form values into a Firestore-shaped partial. Caller adds id/createdAt/updatedAt/createdBy. */
export function formToPartialJob(values: JobFormValues): Omit<ConstructionJob, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'linkedCompanyIds'> {
  const dateMs = (s: string): number | undefined => {
    if (!s) return undefined;
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : undefined;
  };
  const budget = values.budget.trim() ? Number(values.budget) : undefined;
  return {
    name: values.name.trim(),
    linkedCompanies: values.linkedCompanies,
    projectManagerId: values.projectManagerId,
    workerIds: values.workerIds,
    status: values.status,
    ...(dateMs(values.startDate) !== undefined && { startDate: dateMs(values.startDate)! }),
    ...(dateMs(values.expectedEndDate) !== undefined && { expectedEndDate: dateMs(values.expectedEndDate)! }),
    ...(dateMs(values.actualEndDate) !== undefined && { actualEndDate: dateMs(values.actualEndDate)! }),
    ...(values.address.trim() && { address: values.address.trim() }),
    ...(budget !== undefined && Number.isFinite(budget) && { budget }),
    ...(values.description.trim() && { description: values.description.trim() }),
  };
}
