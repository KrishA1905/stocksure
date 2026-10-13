// Data store backed by the real StockSure API (replaces the old mock store).
// It loads data for the signed-in role, maps backend shapes into the shapes
// the pages use, and refetches after every change. All business rules (stock,
// due dates, renewals, ownership) are enforced by the backend - this file
// never calculates authoritative values itself.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import { api } from './api';
import { fmtDate, toISO } from './dates';

export const ISSUE_DAYS = 15; // display only; the server sets real due dates
export const RENEWAL_DAYS = 15;
export const MAX_RENEWALS = 2; // mirrors server MAX_RENEWALS_PER_ISSUE (enforced there)

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

// ISO timestamp -> local calendar 'YYYY-MM-DD'
const cal = (iso) => (iso ? toISO(new Date(iso)) : null);

const UI_TO_CONDITION = { GOOD: 'USABLE', DAMAGED: 'DAMAGED', MAINTENANCE: 'MAINTENANCE', LOST: 'LOST' };

function mapLocation(loc) {
  return loc ? `${loc.laboratory} / ${loc.storageUnit}` : '—';
}

function mapAsset(a) {
  const status = a.isIssued ? 'ISSUED' : a.available ? 'AVAILABLE' : a.conditionStatus;
  return {
    id: a.id,
    assetId: a.assetTag,
    serial: a.serialNumber ?? '—',
    location: mapLocation(a.location),
    condition: a.conditionStatus,
    status,
    holder: a.holder?.student?.name ?? null,
    dueDate: a.holder ? cal(a.holder.dueDate) : null,
  };
}

function mapItem(i, itemAssets) {
  const count = (cond) => itemAssets.filter((a) => !a.isIssued && a.active !== false && a.conditionStatus === cond).length;
  const individual = i.trackingMode === 'INDIVIDUAL';
  return {
    id: i.id,
    code: i.itemCode,
    name: i.name,
    category: i.category,
    model: i.makeModel || '—',
    description: i.description || '',
    tracking: individual ? 'ASSET' : 'QUANTITY',
    total: i.totalQuantity,
    available: i.availableQuantity,
    issued: i.outstandingQuantity,
    unusable: i.unavailableQuantity,
    // Per-condition split is known for individual assets only.
    damaged: individual ? count('DAMAGED') : null,
    lost: individual ? count('LOST') : null,
    maintenance: individual ? count('MAINTENANCE') : null,
    location: mapLocation(i.location),
    active: i.active,
  };
}

const lineLabel = (l) => (l.asset ? `${l.item.name} ${l.asset.assetTag}` : l.item.name);

/** One UI row per issue LINE (the UI issues one item at a time). */
function mapIssueLines(issue) {
  const approved = issue.renewals.filter((r) => r.status === 'APPROVED').length;
  return issue.lines.map((l) => ({
    id: l.id, // issue line id (used for returns)
    issueId: issue.id, // backend issue id (used for renewals)
    studentId: issue.student.id,
    itemId: l.itemId,
    assetId: l.asset?.assetTag ?? null,
    itemLabel: lineLabel(l),
    quantity: l.quantity,
    outstanding: l.outstandingQuantity,
    issueDate: issue.issueCalendarDate,
    dueDate: issue.dueCalendarDate,
    purpose: issue.purpose,
    status: issue.status,
    renewalStatus: issue.renewals[0]?.status ?? null,
    renewalCount: approved,
    issuedBy: issue.issuedBy?.email ?? '—',
    returns: l.returns,
  }));
}

function mapRenewal(r) {
  return {
    id: r.id,
    issueId: r.issue.id,
    studentId: r.issue.student.id,
    itemLabel: r.issue.lines.map((l) => (l.asset ? `${l.item.name} ${l.asset.assetTag}` : l.item.name)).join(', '),
    requestDate: cal(r.requestedAt),
    reason: r.remarks || '',
    status: r.status,
    currentDue: cal(r.oldDueDate),
    newDue: cal(r.newDueDate),
    decidedBy: r.approvedBy?.email ?? null,
    decidedDate: cal(r.approvedAt),
    remarks: r.decisionRemarks || '',
  };
}

function mapStudent(s) {
  return {
    id: s.id,
    name: s.name,
    enrolment: s.enrollmentNo,
    programme: s.programme,
    semester: s.semester ? `Semester ${s.semester}` : '',
    email: s.user?.email ?? '',
  };
}

/** Student history timeline, derived from their own issues + renewals. */
function buildEvents(issues, renewals) {
  const events = [];
  for (const issue of issues) {
    const label = issue.lines.map(lineLabel).join(', ');
    events.push({
      id: `issue-${issue.id}`, type: 'ISSUE', issueId: issue.id, studentId: issue.student.id, itemLabel: label,
      date: issue.issueCalendarDate, at: issue.issueDate, by: issue.issuedBy?.email ?? '—',
      note: `${issue.lines.map((l) => `${l.quantity} × ${lineLabel(l)}`).join(', ')}. Due ${fmtDate(issue.dueCalendarDate)}`,
    });
    for (const l of issue.lines) {
      for (const r of l.returns) {
        events.push({
          id: `return-${r.id}`, type: 'RETURN', issueId: issue.id, studentId: issue.student.id, itemLabel: lineLabel(l),
          date: cal(r.returnDate), at: r.returnDate, by: r.receivedBy?.email ?? '—',
          note: `Returned ${r.quantity}. Condition: ${r.conditionStatus.toLowerCase()}${r.remarks ? `. ${r.remarks}` : ''}`,
        });
      }
    }
  }
  for (const r of renewals) {
    events.push({
      id: `renewal-${r.id}`, type: 'RENEWAL_REQUEST', issueId: r.issueId, studentId: r.studentId, itemLabel: r.itemLabel,
      date: r.requestDate, at: r.requestDate, by: 'You', note: r.reason || 'No reason given',
    });
    if (r.status !== 'PENDING') {
      events.push({
        id: `decision-${r.id}`, type: r.status === 'APPROVED' ? 'RENEWAL_APPROVED' : 'RENEWAL_REJECTED',
        issueId: r.issueId, studentId: r.studentId, itemLabel: r.itemLabel, date: r.decidedDate, at: r.decidedDate,
        by: r.decidedBy ?? 'Coordinator',
        note: r.status === 'APPROVED' ? `New due date ${fmtDate(r.newDue)}${r.remarks ? `. ${r.remarks}` : ''}` : r.remarks || 'Rejected',
      });
    }
  }
  return events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

const EMPTY = { items: [], assets: {}, assetIndex: {}, issues: [], renewals: [], students: [], events: [] };

export function StoreProvider({ children }) {
  const { user } = useAuth();
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!user) return setData(EMPTY);
    setLoading(true);
    setError(null);
    try {
      if (user.role === 'COORDINATOR') {
        const [items, assets, issues, renewals, students] = await Promise.all([
          api.getAll('/inventory'),
          api.getAll('/assets'),
          api.getAll('/issues'),
          api.getAll('/renewals'),
          api.getAll('/students'),
        ]);
        const byItem = {};
        const rawByItem = {};
        const assetIndex = {};
        for (const a of assets) {
          (byItem[a.item.id] ??= []).push(mapAsset(a));
          (rawByItem[a.item.id] ??= []).push(a);
          assetIndex[a.assetTag] = a.id;
        }
        setData({
          items: items.map((i) => mapItem(i, rawByItem[i.id] ?? [])),
          assets: byItem,
          assetIndex,
          issues: issues.flatMap(mapIssueLines),
          renewals: renewals.map(mapRenewal).sort((a, b) => b.id - a.id), // newest first
          students: students.map(mapStudent),
          events: [],
        });
      } else {
        const [issues, renewals] = await Promise.all([api.get('/issues/mine'), api.getAll('/renewals')]);
        const mappedRenewals = renewals.map(mapRenewal).sort((a, b) => b.id - a.id); // newest first
        const me = user.student ? [{ ...mapStudent(user.student), email: user.email }] : [];
        setData({
          ...EMPTY,
          issues: issues.flatMap(mapIssueLines),
          renewals: mappedRenewals,
          students: me,
          events: buildEvents(issues, mappedRenewals),
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // POST /api/issues  (one item per issue from this UI)
  const issueItem = async ({ studentId, itemId, assetId, quantity, purpose }) => {
    const line = { itemId };
    if (assetId) {
      line.assetId = data.assetIndex[assetId];
      if (!line.assetId) throw new Error('That asset does not exist.');
    } else {
      line.quantity = quantity;
    }
    const issue = await api.post('/issues', { studentId, purpose: purpose?.trim() || undefined, lines: [line] });
    await refresh();
    const l = issue.lines[0];
    const student = data.students.find((s) => s.id === studentId) ?? mapStudent(issue.student);
    return {
      student,
      itemLabel: lineLabel(l),
      quantity: l.quantity,
      issueDate: issue.issueCalendarDate,
      dueDate: issue.dueCalendarDate, // from the server
      issuedBy: issue.issuedBy?.email ?? user.email,
    };
  };

  // POST /api/returns   (issueId here is the UI row id = issue LINE id)
  const returnItem = async ({ issueId, quantityReturned, condition, remarks }) => {
    const res = await api.post('/returns', {
      issueLineId: issueId,
      quantity: quantityReturned,
      conditionStatus: UI_TO_CONDITION[condition] ?? condition,
      remarks: remarks?.trim() || undefined,
    });
    await refresh();
    return { remaining: res.issueLine.outstandingQuantity };
  };

  // POST /api/renewals   (the dialog passes the UI row id -> map to the backend issue)
  const requestRenewal = async ({ issueId, reason }) => {
    const row = data.issues.find((i) => i.id === issueId);
    const r = await api.post('/renewals', { issueId: row ? row.issueId : issueId, remarks: reason?.trim() || undefined });
    await refresh();
    return mapRenewal(r);
  };

  // PATCH /api/renewals/:id
  const decideRenewal = async ({ renewalId, decision, remarks = '' }) => {
    if (decision === 'REJECT' && !remarks.trim()) throw new Error('Please enter a remark explaining the rejection.');
    const r = await api.patch(`/renewals/${renewalId}`, {
      status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      remarks: remarks.trim() || undefined,
    });
    await refresh();
    return { newDue: cal(r.newDueDate) }; // the server's new due date
  };

  /** Issue summary for a backend issue id (renewal screens). */
  const issueOf = useCallback(
    (backendIssueId) => {
      const rows = data.issues.filter((i) => i.issueId === backendIssueId);
      if (!rows.length) return null;
      return { ...rows[0], id: backendIssueId, itemLabel: rows.map((r) => r.itemLabel).join(', '), outstanding: rows.reduce((s, r) => s + r.outstanding, 0) };
    },
    [data.issues]
  );

  const value = useMemo(
    () => ({ ...data, loading, error, refresh, issueOf, issueItem, returnItem, requestRenewal, decideRenewal }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, loading, error, refresh, issueOf]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
