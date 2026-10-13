import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useStore } from '@/lib/store';
import { fmtDate } from '@/lib/dates';
import { LoadError } from '@/components/Field';

const selectCls =
  'h-12 rounded-none border border-ink/70 bg-transparent px-3 text-lg font-semibold uppercase outline-none focus:border-ink';

// Small bordered label. Filled = unavailable, outlined = fine.
const Tag = ({ children, filled }) => (
  <span className={`inline-block border border-ink px-2 py-0.5 text-sm font-bold uppercase ${filled ? 'bg-ink text-paper' : ''}`}>
    {children}
  </span>
);

const Stat = ({ label, value }) => (
  <div className="border border-ink/35">
    <div className="grunge px-3 py-1.5 font-display text-sm uppercase tracking-wide">{label}</div>
    <div className="px-3 py-3 font-display text-4xl leading-none">{value}</div>
  </div>
);

export default function Inventory() {
  const { items, assets: allAssets, loading, error, refresh } = useStore();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [selected, setSelected] = useState(null);

  const categories = useMemo(() => ['ALL', ...new Set(items.map((i) => i.category))], [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) =>
      (category === 'ALL' || i.category === category) &&
      (type === 'ALL' || i.tracking === type) &&
      (!q || `${i.code} ${i.name} ${i.model} ${i.location}`.toLowerCase().includes(q)));
  }, [items, query, category, type]);

  const assets = selected ? allAssets[selected.id] ?? [] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <h1 className="font-display text-5xl leading-[0.9] sm:text-7xl xl:text-8xl">Inventory</h1>
        <p className="mb-2 text-base font-bold uppercase leading-tight">{filtered.length} of {items.length} items</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/70" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, name, model, location"
            className="h-12 rounded-none border-ink/70 bg-transparent pl-10 text-lg font-semibold placeholder:font-semibold placeholder:text-ink/60"
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
          {categories.map((c) => <option key={c} value={c}>{c === 'ALL' ? 'All categories' : c}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
          <option value="ALL">All types</option>
          <option value="ASSET">Individual assets</option>
          <option value="QUANTITY">Quantity items</option>
        </select>
      </div>

      {error && <LoadError error={error} onRetry={refresh} />}

      {/* Table */}
      <div className="overflow-x-auto border border-ink/35 p-4 md:p-6">
        <Table>
          <TableHeader>
            <TableRow className="border-ink/30 hover:bg-transparent">
              {['Item', 'Category', 'Type', 'Location', 'Total', 'Available', 'Issued', 'Unusable'].map((h) => (
                <TableHead key={h} className="text-base font-bold text-ink">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-12 text-center font-display text-2xl uppercase">
                  {loading ? 'Loading inventory…' : 'No items match your filters'}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((i) => {
              const unusable = i.unusable;
              return (
                <TableRow key={i.id} onClick={() => setSelected(i)} className="cursor-pointer border-ink/20 hover:bg-ink/5">
                  <TableCell className="py-4">
                    <div className="text-xl font-bold uppercase leading-tight">{i.name}</div>
                    <div className="text-base">{i.code} · {i.model}</div>
                  </TableCell>
                  <TableCell className="text-lg font-semibold uppercase">{i.category}</TableCell>
                  <TableCell><Tag>{i.tracking === 'ASSET' ? 'Asset' : 'Quantity'}</Tag></TableCell>
                  <TableCell className="text-lg font-semibold uppercase">{i.location}</TableCell>
                  <TableCell className="text-lg font-semibold">{i.total}</TableCell>
                  <TableCell className="text-lg font-bold">{i.available}</TableCell>
                  <TableCell className="text-lg font-semibold">{i.issued}</TableCell>
                  <TableCell>{unusable > 0 ? <Tag filled>{unusable}</Tag> : <span className="text-lg font-semibold">0</span>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-ink bg-paper sm:max-w-3xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-4xl uppercase leading-none">{selected.name}</DialogTitle>
                <DialogDescription className="text-base font-semibold uppercase text-ink/70">
                  {selected.code} · {selected.model} · {selected.location}
                </DialogDescription>
              </DialogHeader>

              <p className="text-lg">{selected.description}</p>

              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                <Stat label="Total" value={selected.total} />
                <Stat label="Available" value={selected.available} />
                <Stat label="Issued" value={selected.issued} />
                {selected.tracking === 'ASSET' ? (
                  <>
                    <Stat label="Damaged" value={selected.damaged} />
                    <Stat label="Lost" value={selected.lost} />
                    <Stat label="Maint." value={selected.maintenance} />
                  </>
                ) : (
                  <Stat label="Unusable" value={selected.unusable} />
                )}
              </div>

              {selected.tracking === 'ASSET' ? (
                <div className="overflow-x-auto border border-ink/35 p-3">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-ink/30 hover:bg-transparent">
                        {['Asset ID', 'Serial', 'Condition', 'Status', 'Held by', 'Due'].map((h) => (
                          <TableHead key={h} className="text-sm font-bold text-ink">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assets.map((a) => (
                        <TableRow key={a.assetId} className="border-ink/20 hover:bg-ink/5">
                          <TableCell className="text-lg font-bold">{a.assetId}</TableCell>
                          <TableCell className="text-base">{a.serial}</TableCell>
                          <TableCell className="text-base font-semibold uppercase">{a.condition}</TableCell>
                          <TableCell><Tag filled={a.status !== 'AVAILABLE'}>{a.status}</Tag></TableCell>
                          <TableCell className="text-base font-semibold uppercase">{a.holder ?? '—'}</TableCell>
                          <TableCell className="text-base font-semibold uppercase">{a.dueDate ? fmtDate(a.dueDate) : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="border border-ink/35 p-4 text-base font-semibold uppercase">
                  Tracked by quantity. Stock counts above update automatically on every issue, return and adjustment.
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
