import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, Edit2, Plus, Trash2, X } from 'lucide-react';
import { rateChartsAPI, routesAPI } from '../services/api';
import { Badge, Button, Card, ErrorState, LoadingState, Table, Td, Tr } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';

interface StopOption {
  id: number;
  stop_name: string;
  stop_sequence: number;
}

interface RouteOption {
  id: number;
  route_name: string;
  route_code: string;
  origin_city: string;
  destination_city: string;
  stops?: StopOption[];
}

interface RateChart {
  id: number;
  route_id: number;
  origin_stop_id: number | null;
  destination_stop_id: number | null;
  fare_amount: number;
  route?: RouteOption;
  origin_stop?: StopOption | null;
  destination_stop?: StopOption | null;
}

interface RateChartsPageProps {
  onNotify: (message: string, type?: any) => void;
}

const initialForm = { route_id: '', rate_type: 'route', origin_stop_id: '', destination_stop_id: '', fare_amount: '' };

export const RateChartsPage: React.FC<RateChartsPageProps> = ({ onNotify }) => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('rates.manage');
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [rates, setRates] = useState<RateChart[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [routeResponse, rateResponse] = await Promise.all([
        routesAPI.list({ limit: 100 }),
        rateChartsAPI.list(),
      ]);
      setRoutes(routeResponse.data.data || []);
      setRates(rateResponse.data.data || []);
    } catch (loadError: any) {
      setError(loadError.response?.data?.message || 'Unable to load rate charts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedRoute = routes.find((route) => String(route.id) === form.route_id);
  const stopOptions = useMemo(() => [...(selectedRoute?.stops || [])].sort((a, b) => a.stop_sequence - b.stop_sequence), [selectedRoute]);

  const updateForm = (field: keyof typeof form, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'route_id' ? { origin_stop_id: '', destination_stop_id: '' } : {}),
    }));
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const handleEdit = (rate: RateChart) => {
    setEditingId(rate.id);
    setForm({
      route_id: String(rate.route_id),
      rate_type: rate.origin_stop_id && rate.destination_stop_id ? 'stop' : 'route',
      origin_stop_id: rate.origin_stop_id ? String(rate.origin_stop_id) : '',
      destination_stop_id: rate.destination_stop_id ? String(rate.destination_stop_id) : '',
      fare_amount: String(rate.fare_amount),
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const fareAmount = Number(form.fare_amount);
    if (!form.route_id || !Number.isFinite(fareAmount) || fareAmount <= 0) {
      onNotify('Select a route and enter a fare greater than zero', 'error');
      return;
    }
    if (form.rate_type === 'stop' && (!form.origin_stop_id || !form.destination_stop_id)) {
      onNotify('Select both origin and destination stops', 'error');
      return;
    }
    if (form.rate_type === 'stop' && form.origin_stop_id === form.destination_stop_id) {
      onNotify('Origin and destination stops must be different', 'error');
      return;
    }

    const payload = {
      route_id: Number(form.route_id),
      origin_stop_id: form.rate_type === 'stop' ? Number(form.origin_stop_id) : null,
      destination_stop_id: form.rate_type === 'stop' ? Number(form.destination_stop_id) : null,
      fare_amount: fareAmount,
    };

    setSaving(true);
    try {
      if (editingId) {
        await rateChartsAPI.update(editingId, payload);
        onNotify('Rate chart updated');
      } else {
        await rateChartsAPI.create(payload);
        onNotify('Rate chart added');
      }
      resetForm();
      await loadData();
    } catch (saveError: any) {
      onNotify(saveError.response?.data?.message || 'Unable to save rate', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rate: RateChart) => {
    if (!window.confirm(`Delete this ${rate.origin_stop ? 'stop-pair' : 'route'} rate?`)) return;
    setDeletingId(rate.id);
    try {
      await rateChartsAPI.delete(rate.id);
      setRates((current) => current.filter((item) => item.id !== rate.id));
      if (editingId === rate.id) resetForm();
      onNotify('Rate chart deleted');
    } catch (deleteError: any) {
      onNotify(deleteError.response?.data?.message || 'Unable to delete rate', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <LoadingState message="Loading rate charts..." />;
  if (error && !routes.length) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Rate Charts</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Route fares and stop-to-stop prices used for fare quotes and bookings</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500"><CreditCard size={17} />{rates.length} configured rates</div>
      </header>

      {error && <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}

      {canManage && (
        <Card>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold">{editingId ? 'Edit fare' : 'Add fare'}</h2>
              {editingId && <button type="button" onClick={resetForm} aria-label="Cancel editing" className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1 text-xs font-medium text-slate-500">Route
                <select required value={form.route_id} onChange={(event) => updateForm('route_id', event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                  <option value="">Select route</option>
                  {routes.map((route) => <option key={route.id} value={route.id}>{route.route_code} · {route.route_name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-500">Fare applies to
                <select value={form.rate_type} onChange={(event) => setForm((current) => ({ ...current, rate_type: event.target.value, origin_stop_id: '', destination_stop_id: '' }))} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                  <option value="route">Whole route</option>
                  <option value="stop">Stop to stop</option>
                </select>
              </label>
              {form.rate_type === 'stop' && <>
                <label className="space-y-1 text-xs font-medium text-slate-500">Origin stop
                  <select required value={form.origin_stop_id} onChange={(event) => updateForm('origin_stop_id', event.target.value)} disabled={!selectedRoute} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                    <option value="">Select origin</option>
                    {stopOptions.map((stop) => <option key={stop.id} value={stop.id}>{stop.stop_sequence}. {stop.stop_name}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium text-slate-500">Destination stop
                  <select required value={form.destination_stop_id} onChange={(event) => updateForm('destination_stop_id', event.target.value)} disabled={!selectedRoute} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                    <option value="">Select destination</option>
                    {stopOptions.filter((stop) => String(stop.id) !== form.origin_stop_id).map((stop) => <option key={stop.id} value={stop.id}>{stop.stop_sequence}. {stop.stop_name}</option>)}
                  </select>
                </label>
              </>}
              <label className="space-y-1 text-xs font-medium text-slate-500">Fare per passenger (₹)
                <input required type="number" min="0.01" step="0.01" value={form.fare_amount} onChange={(event) => updateForm('fare_amount', event.target.value)} placeholder="0.00" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              {editingId && <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>}
              <Button type="submit" loading={saving} icon={editingId ? Edit2 : Plus}>{editingId ? 'Save changes' : 'Add rate'}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card padding={false}>
        <Table headers={['Route', 'Rate type', 'Origin', 'Destination', 'Fare per passenger', ...(canManage ? ['Actions'] : [])]} loading={false} empty={rates.length === 0} emptyMessage="No fares configured yet">
          {rates.map((rate) => (
            <Tr key={rate.id}>
              <Td><div className="font-medium">{rate.route?.route_name || `Route ${rate.route_id}`}</div><div className="text-xs text-slate-500">{rate.route?.route_code || ''}</div></Td>
              <Td><Badge color={rate.origin_stop_id ? 'blue' : 'green'}>{rate.origin_stop_id ? 'Stop to stop' : 'Whole route'}</Badge></Td>
              <Td className="text-sm">{rate.origin_stop?.stop_name || 'Route origin'}</Td>
              <Td className="text-sm">{rate.destination_stop?.stop_name || 'Route destination'}</Td>
              <Td className="font-semibold tabular-nums">₹{Number(rate.fare_amount).toFixed(2)}</Td>
              {canManage && <Td><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => handleEdit(rate)} aria-label="Edit rate"><Edit2 size={14} /></Button><Button variant="danger" size="sm" loading={deletingId === rate.id} onClick={() => handleDelete(rate)} aria-label="Delete rate"><Trash2 size={14} /></Button></div></Td>}
            </Tr>
          ))}
        </Table>
      </Card>
    </div>
  );
};
