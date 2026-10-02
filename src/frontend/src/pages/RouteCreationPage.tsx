import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit2, Trash2, MapPin, ChevronRight, X, AlertCircle } from 'lucide-react';
import { routesAPI } from '../services/api';
import { Card, Table, Tr, Td, Pagination, SearchInput, Button, Select, StatusBadge, Modal, Input, ConfirmDialog, ErrorState, Badge } from '../components/ui';

interface RouteStopItem {
  id?: number;
  stop_name: string;
  latitude: string;
  longitude: string;
  stop_sequence: number | string;
  address: string;
}

interface PlaceResult {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

const StopPlaceSearch: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: PlaceResult) => void;
}> = ({ value, onChange, onSelect }) => {
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const skipQuery = useRef('');

  useEffect(() => {
    const query = value.trim();
    if (query === skipQuery.current) {
      skipQuery.current = '';
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSuggestions([]);
    setSearching(false);
    if (!searchActive || query.length < 3) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=50`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Place search failed');
        const data = await response.json();
        const places = (data.features || []).flatMap((feature: any) => {
          const [longitude, latitude] = feature.geometry?.coordinates || [];
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

          const properties = feature.properties || {};
          const name = properties.name || properties.street || properties.city || query;
          const address = [
            properties.name,
            properties.street,
            properties.housenumber,
            properties.city || properties.district,
            properties.state,
            properties.country,
          ].filter(Boolean).join(', ');

          return [{ name, address, latitude, longitude }];
        });
        setSuggestions(places);
      } catch (error: any) {
        if (error.name !== 'AbortError') setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [value, searchActive]);

  const choosePlace = (place: PlaceResult) => {
    skipQuery.current = place.name;
    setSearchActive(false);
    setSuggestions([]);
    onSelect(place);
  };

  return (
    <div className="relative flex-1 min-w-[160px]">
      <input
        type="text"
        autoComplete="off"
        placeholder="Search stop or station name"
        value={value}
        onChange={(event) => {
          setSearchActive(true);
          onChange(event.target.value);
        }}
        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
      />
      {(searching || suggestions.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded border border-slate-700 bg-slate-900 shadow-xl">
          {searching && <div className="px-3 py-2 text-xs text-slate-400">Searching map places...</div>}
          {suggestions.map((place, index) => (
            <button
              key={`${place.latitude}-${place.longitude}-${index}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choosePlace(place)}
              className="block w-full border-b border-slate-800 px-3 py-2 text-left last:border-0 hover:bg-slate-800"
            >
              <span className="block text-xs font-medium text-white">{place.name}</span>
              {place.address && <span className="mt-0.5 block text-[10px] text-slate-400">{place.address}</span>}
            </button>
          ))}
          <div className="px-3 py-1.5 text-[10px] text-slate-500">
            Search results © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a>
          </div>
        </div>
      )}
    </div>
  );
};

interface Stop {
  id: number;
  stop_name: string;
  stop_sequence: number;
  stop_code: string;
  address: string;
  latitude?: number;
  longitude?: number;
}

interface Route {
  id: number;
  route_name: string;
  route_code: string;
  origin_city: string;
  destination_city: string;
  total_distance: number;
  estimated_duration: number;
  description?: string;
  status: string;
  stops?: Stop[];
  created_at: string;
}

interface RouteCreationPageProps {
  onNotify: (msg: string, type?: any) => void;
  showStops?: boolean;
}

export const RouteCreationPage: React.FC<RouteCreationPageProps> = ({ onNotify, showStops }) => {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 15 });
  const [showModal, setShowModal] = useState(false);
  const [editRoute, setEditRoute] = useState<Route | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Route | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

  // Form matching screenshot exactly:
  // Route Name, Route Code, Origin City, Destination City, Total Distance (km), Estimated Duration (minutes), Status, Description, Route Stops
  const [form, setForm] = useState({
    route_name: '',
    route_code: '',
    origin_city: '',
    destination_city: '',
    total_distance: '',
    estimated_duration: '',
    status: 'Active',
    description: '',
  });

  const [stopsList, setStopsList] = useState<RouteStopItem[]>([
    { stop_name: '', latitude: '', longitude: '', stop_sequence: 1, address: '' },
  ]);

  const fetchRoutes = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const resp = await routesAPI.list({ page, limit: 15, search, status: statusFilter });
      setRoutes(resp.data.data || []);
      setPagination(resp.data.pagination || { total: 0, pages: 1, limit: 15 });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load routes');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const openCreate = () => {
    setEditRoute(null);
    setForm({
      route_name: '',
      route_code: '',
      origin_city: '',
      destination_city: '',
      total_distance: '',
      estimated_duration: '',
      status: 'Active',
      description: '',
    });
    setStopsList([{ stop_name: '', latitude: '', longitude: '', stop_sequence: 1, address: '' }]);
    setShowModal(true);
  };

  const openEdit = (r: Route) => {
    setEditRoute(r);
    setForm({
      route_name: r.route_name || '',
      route_code: r.route_code || '',
      origin_city: r.origin_city || '',
      destination_city: r.destination_city || '',
      total_distance: r.total_distance ? String(r.total_distance) : '',
      estimated_duration: r.estimated_duration ? String(r.estimated_duration) : '',
      status: r.status || 'Active',
      description: r.description || '',
    });
    if (r.stops && r.stops.length > 0) {
      setStopsList(
        [...r.stops].sort((a, b) => a.stop_sequence - b.stop_sequence).map((s, idx) => ({
          id: s.id,
          stop_name: s.stop_name || '',
          latitude: s.latitude != null ? String(s.latitude) : '',
          longitude: s.longitude != null ? String(s.longitude) : '',
          stop_sequence: s.stop_sequence || idx + 1,
          address: s.address || '',
        }))
      );
    } else {
      setStopsList([{ stop_name: '', latitude: '', longitude: '', stop_sequence: 1, address: '' }]);
    }
    setShowModal(true);
  };

  const handleStopChange = (index: number, field: keyof RouteStopItem, value: string) => {
    setStopsList((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addStopRow = () => {
    setStopsList((prev) => [
      ...prev,
      { stop_name: '', latitude: '', longitude: '', stop_sequence: prev.length + 1, address: '' },
    ]);
  };

  const removeStopRow = (index: number) => {
    if (stopsList.length <= 1) {
      setStopsList([{ stop_name: '', latitude: '', longitude: '', stop_sequence: 1, address: '' }]);
      return;
    }
    setStopsList((prev) => prev
      .filter((_, idx) => idx !== index)
      .map((stop, idx) => ({ ...stop, stop_sequence: idx + 1 })));
  };

  const handlePlaceSelect = (index: number, place: PlaceResult) => {
    setStopsList((prev) => prev.map((stop, stopIndex) => stopIndex === index
      ? {
          ...stop,
          stop_name: place.name,
          latitude: String(place.latitude),
          longitude: String(place.longitude),
          address: place.address,
        }
      : stop));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.route_name || !form.route_code || !form.origin_city || !form.destination_city) {
      onNotify('Please fill in Route Name, Code, Origin and Destination cities', 'error');
      return;
    }

    setSaving(true);
    try {
      const validStops = stopsList
        .filter((s) => s.stop_name.trim().length > 0)
        .map((s, idx) => ({
          id: s.id,
          stop_name: s.stop_name.trim(),
          latitude: s.latitude ? parseFloat(s.latitude) : null,
          longitude: s.longitude ? parseFloat(s.longitude) : null,
          stop_sequence: s.stop_sequence ? parseInt(String(s.stop_sequence)) : idx + 1,
          address: s.address || null,
        }));

      const payload = {
        ...form,
        total_distance: form.total_distance ? parseFloat(form.total_distance) : 0,
        estimated_duration: form.estimated_duration ? parseInt(form.estimated_duration) : 0,
        stops: validStops,
      };

      if (editRoute) {
        await routesAPI.update(editRoute.id, payload);
        onNotify('Bus Route updated successfully');
      } else {
        await routesAPI.create(payload);
        onNotify('Bus Route created successfully');
      }
      setShowModal(false);
      fetchRoutes();
    } catch (err: any) {
      onNotify(err.response?.data?.message || 'Failed to save route', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await routesAPI.delete(deleteTarget.id);
      onNotify('Bus Route deleted successfully');
      setDeleteTarget(null);
      fetchRoutes();
    } catch (err: any) {
      onNotify(err.response?.data?.message || 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const HEADERS = ['ID', 'Route Name', 'Code', 'Origin City', 'Destination City', 'Total Distance (km)', 'Estimated Duration (min)', 'Stops', 'Status', 'Actions'];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Bus Routes Management</h2>
          <p className="text-slate-400 text-sm">{pagination.total} bus routes configured</p>
        </div>
        <Button onClick={openCreate} icon={Plus}>
          Add Route
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search route name, code, origin, destination..."
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'Active', label: 'Active' },
            { value: 'Inactive', label: 'Inactive' },
          ]}
          placeholder="All Statuses"
        />
      </div>

      {/* Selected Route Stops Detail Card */}
      {selectedRoute && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-medium">{selectedRoute.route_name} — Stops</h3>
              <p className="text-slate-400 text-xs">
                {selectedRoute.origin_city} → {selectedRoute.destination_city} ({selectedRoute.total_distance} km, ~{selectedRoute.estimated_duration} mins)
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedRoute(null)}>
              Close
            </Button>
          </div>
          <div className="space-y-2">
            {(selectedRoute.stops || [])
              .sort((a, b) => a.stop_sequence - b.stop_sequence)
              .map((stop, idx, arr) => (
                <div key={stop.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{
                        background: idx === 0 ? '#10b981' : idx === arr.length - 1 ? '#ef4444' : '#6366f1',
                      }}
                    >
                      {stop.stop_sequence}
                    </div>
                    {idx < arr.length - 1 && (
                      <div className="w-0.5 h-6 my-0.5" style={{ background: 'rgba(99, 102, 241, 0.3)' }} />
                    )}
                  </div>
                  <div className="flex-1 py-1">
                    <div className="text-white text-sm font-medium">{stop.stop_name}</div>
                    <div className="text-slate-400 text-xs">
                      {stop.address ? `${stop.address} • ` : ''}Seq #{stop.stop_sequence}
                      {stop.latitude && stop.longitude ? ` (${stop.latitude}, ${stop.longitude})` : ''}
                    </div>
                  </div>
                </div>
              ))}
            {(!selectedRoute.stops || selectedRoute.stops.length === 0) && (
              <p className="text-slate-500 text-sm text-center py-4">No stops configured for this route</p>
            )}
          </div>
        </Card>
      )}

      {/* Routes Table */}
      <Card padding={false}>
        {error ? (
          <ErrorState message={error} onRetry={fetchRoutes} />
        ) : (
          <>
            <Table
              headers={HEADERS}
              loading={loading}
              empty={!loading && routes.length === 0}
              emptyMessage="No bus routes found"
            >
              {routes.map((route) => (
                <Tr key={route.id}>
                  <Td className="text-slate-400 font-mono text-xs">{route.id}</Td>
                  <Td>
                    <div className="text-white font-medium text-sm">{route.route_name}</div>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
                      {route.route_code}
                    </span>
                  </Td>
                  <Td className="text-slate-300 text-xs">{route.origin_city}</Td>
                  <Td className="text-slate-300 text-xs">{route.destination_city}</Td>
                  <Td className="text-slate-300 text-xs">{route.total_distance || 0} km</Td>
                  <Td className="text-slate-300 text-xs">{route.estimated_duration || 0} min</Td>
                  <Td>
                    <button
                      onClick={() => setSelectedRoute(route)}
                      className="hover:opacity-80 transition-opacity"
                    >
                      <Badge color="blue">{route.stops?.length || 0} stops</Badge>
                    </button>
                  </Td>
                  <Td>
                    <StatusBadge status={route.status} />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(route)}>
                        <Edit2 size={13} className="text-slate-300" />
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(route)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
            <Pagination
              page={page}
              pages={pagination.pages}
              total={pagination.total}
              limit={pagination.limit}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Add / Edit Bus Route Modal matching Screenshot 1 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-6 my-8 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">
                {editRoute ? 'Edit Bus Route' : 'Add Bus Route'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="space-y-4 pt-4">
              {/* Route Name */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Route Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Mumbai-Pune Express"
                  value={form.route_name}
                  onChange={(e) => setForm({ ...form, route_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Route Code */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Route Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., MUM_PUN_001"
                  value={form.route_code}
                  onChange={(e) => setForm({ ...form, route_code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Origin City & Destination City */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Origin City <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Origin City"
                    value={form.origin_city}
                    onChange={(e) => setForm({ ...form, origin_city: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Destination City <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Destination City"
                    value={form.destination_city}
                    onChange={(e) => setForm({ ...form, destination_city: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Total Distance (km) & Estimated Duration (minutes) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Total Distance (km)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Total Distance (km)"
                    value={form.total_distance}
                    onChange={(e) => setForm({ ...form, total_distance: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Estimated Duration (minutes)
                  </label>
                  <input
                    type="number"
                    placeholder="Estimated Duration (minutes)"
                    value={form.estimated_duration}
                    onChange={(e) => setForm({ ...form, estimated_duration: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Optional route description or route guidelines..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Route Stops inline row builder matching screenshot */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-200 mb-2 uppercase tracking-wide">
                  Route Stops
                </label>
                <div className="space-y-2">
                  {stopsList.map((stop, index) => (
                    <div key={index} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <StopPlaceSearch
                        value={stop.stop_name}
                        onChange={(value) => handleStopChange(index, 'stop_name', value)}
                        onSelect={(place) => handlePlaceSelect(index, place)}
                      />
                      <input
                        type="text"
                        placeholder="Latitude"
                        value={stop.latitude}
                        onChange={(e) => handleStopChange(index, 'latitude', e.target.value)}
                        className="w-24 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="Longitude"
                        value={stop.longitude}
                        onChange={(e) => handleStopChange(index, 'longitude', e.target.value)}
                        className="w-24 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                      <input
                        type="number"
                        placeholder="Sequence"
                        value={stop.stop_sequence}
                        onChange={(e) => handleStopChange(index, 'stop_sequence', e.target.value)}
                        className="w-20 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="Address"
                        value={stop.address}
                        onChange={(e) => handleStopChange(index, 'address', e.target.value)}
                        className="flex-1 min-w-[120px] px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeStopRow(index)}
                        className="p-1.5 bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 rounded transition-colors"
                        title="Remove stop"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={addStopRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded transition-colors"
                  >
                    + Add Stop
                  </button>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <Button variant="ghost" type="button" onClick={() => setShowModal(false)}>
                  Close
                </Button>
                <Button type="submit" loading={saving}>
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Route"
        message={`Are you sure you want to delete route "${deleteTarget?.route_name}" (${deleteTarget?.route_code})?`}
        loading={deleting}
      />
    </div>
  );
};
