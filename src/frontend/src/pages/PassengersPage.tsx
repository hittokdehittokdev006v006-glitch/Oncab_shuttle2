import React, { useState, useEffect, useCallback } from 'react';
import { passengersAPI } from '../services/api';
import { Card, Table, Tr, Td, Pagination, SearchInput, Button, Select, StatusBadge, Modal, Input, ConfirmDialog, ErrorState, Badge } from '../components/ui';
import { Plus, Edit2, Trash2, ShieldBan, ShieldCheck, Phone, Mail } from 'lucide-react';

interface PassengersPageProps { onNotify: (msg: string, type?: any) => void; }

export const PassengersPage: React.FC<PassengersPageProps> = ({ onNotify }) => {
  const [passengers, setPassengers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 15 });
  const [showModal, setShowModal] = useState(false);
  const [editPassenger, setEditPassenger] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', mobile: '', email: '', city_id: '', sex: 'Male' });

  const fetch = useCallback(async () => {
    try { setLoading(true); setError(''); const r = await passengersAPI.list({ page, limit: 15, search }); setPassengers(r.data.data); setPagination(r.data.pagination); }
    catch (e: any) { setError(e.response?.data?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => { setPage(1); }, [search]);

  const openCreate = () => { setEditPassenger(null); setForm({ name: '', mobile: '', email: '', city_id: '', sex: 'Male' }); setShowModal(true); };
  const openEdit = (p: any) => { setEditPassenger(p); setForm({ name: p.name || '', mobile: p.mobile || '', email: p.email || '', city_id: p.city_id ? String(p.city_id) : '', sex: p.sex || 'Male' }); setShowModal(true); };
  const f = (k: keyof typeof form) => (v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editPassenger) { await passengersAPI.update(editPassenger.id, form); onNotify('Passenger updated'); }
      else { await passengersAPI.create(form); onNotify('Passenger created'); }
      setShowModal(false); fetch();
    } catch (e: any) { onNotify(e.response?.data?.message || 'Save failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await passengersAPI.delete(deleteTarget.id); onNotify('Passenger deactivated'); setDeleteTarget(null); fetch(); }
    catch (e: any) { onNotify(e.response?.data?.message || 'Failed', 'error'); }
    finally { setDeleting(false); }
  };

  const handleToggleBlock = async (p: any) => {
    try { await passengersAPI.toggleBlock(p.id); onNotify(p.block_status === 'Block' ? 'Passenger unblocked' : 'Passenger blocked'); fetch(); }
    catch { onNotify('Failed', 'error'); }
  };

  const HEADERS = ['Passenger', 'Contact', 'City', 'Bookings', 'Spent', 'Status', 'Actions'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h2 className="text-white font-semibold">Passenger Management</h2><p className="text-slate-500 text-sm">{pagination.total} passengers</p></div>
        <Button onClick={openCreate}><Plus size={14} />Add Passenger</Button>
      </div>
      <div className="flex gap-3"><SearchInput value={search} onChange={setSearch} placeholder="Search name, mobile, email..." /></div>
      <Card padding={false}>
        {error ? <ErrorState message={error} onRetry={fetch} /> : (
          <>
            <Table headers={HEADERS} loading={loading} empty={!loading && passengers.length === 0} emptyMessage="No passengers found">
              {passengers.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>{(p.name || '?').charAt(0).toUpperCase()}</div>
                      <div><div className="text-white text-sm">{p.name || 'Unnamed user'}</div><div className="text-slate-500 text-xs">{p.sex || '—'}</div></div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5 text-xs text-slate-300 mb-0.5"><Phone size={11} />{p.mobile}</div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500"><Mail size={11} />{p.email || '—'}</div>
                  </Td>
                  <Td className="text-xs text-slate-300">{p.city || p.city_id || '—'}</Td>
                  <Td><Badge color="blue">{p.total_bookings || 0}</Badge></Td>
                  <Td className="text-emerald-400 text-sm font-medium">₹{(p.total_spent || 0).toLocaleString()}</Td>
                  <Td><StatusBadge status={p.block_status || 'Unblock'} /></Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Edit2 size={13} /></Button>
                      <Button variant={p.block_status === 'Block' ? 'secondary' : 'danger'} size="sm" onClick={() => handleToggleBlock(p)}>
                        {p.block_status === 'Block' ? <ShieldCheck size={13} /> : <ShieldBan size={13} />}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(p)}><Trash2 size={13} /></Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
            <Pagination page={page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} />
          </>
        )}
      </Card>
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editPassenger ? 'Edit Passenger' : 'Add Passenger'}
        footer={<><Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave} loading={saving}>{editPassenger ? 'Update' : 'Add'}</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Full Name" value={form.name} onChange={f('name')} required className="col-span-2" />
          <Input label="Mobile" value={form.mobile} onChange={f('mobile')} required />
          <Input label="Email" type="email" value={form.email} onChange={f('email')} />
          <Input label="City ID" type="number" value={form.city_id} onChange={f('city_id')} />
          <div className="space-y-1.5"><label className="block text-xs font-medium text-slate-400">Gender</label>
            <Select value={form.sex} onChange={f('sex')} options={[{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }]} /></div>
        </div>
      </Modal>
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Deactivate Passenger" message={`Deactivate "${deleteTarget?.name || deleteTarget?.mobile}"? This blocks their account without deleting it.`} loading={deleting} />
    </div>
  );
};
