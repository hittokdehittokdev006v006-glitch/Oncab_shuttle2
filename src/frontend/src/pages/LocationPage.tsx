import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bus, Clock3, LocateFixed, Navigation, RefreshCw, Search, UserRound, X } from 'lucide-react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { locationsAPI } from '../services/api';
import { Card, ErrorState, LoadingState } from '../components/ui';

type Position = [number, number];
type LocationFilter = 'All' | 'Live' | 'Upcoming' | 'Offline' | 'Inactive';

interface RouteStop {
  id: number;
  stop_name: string;
  stop_sequence: number;
  latitude: number | string | null;
  longitude: number | string | null;
}

interface Trip {
  id: number;
  schedule_code: string;
  status: string;
  trip_date: string | null;
  departure_time: string;
  route_id: number;
  route?: {
    id: number;
    route_name: string;
    route_code: string;
    origin_city: string;
    destination_city: string;
    status: string;
    stops?: RouteStop[];
  };
  driver?: { id: number; name: string; mobile: string } | null;
}

interface BusLocation {
  id: number;
  registration_number: string;
  model: string | null;
  vehicle_status: string;
  tracking_status: string;
  driver: { id: number; name: string; mobile: string; online_status: string } | null;
  location: {
    latitude: number;
    longitude: number;
    speed_kmh: number | null;
    heading: number | null;
    updated_at: string | null;
    age_seconds: number | null;
    is_live: boolean;
  } | null;
  current_trip: Trip | null;
  upcoming_trip: Trip | null;
  nearest_stop: { stop_id: number; stop_name: string; stop_sequence: number; distance_meters: number; route_index: number } | null;
  stops_passed_estimate: number;
}

interface RouteSummary {
  id: number;
  route_name: string;
  route_code: string;
  origin_city: string;
  destination_city: string;
  status: string;
  active_buses: number;
  upcoming_trips: number;
  trip_status: string;
  stops?: RouteStop[];
}

interface LocationDashboardData {
  generated_at: string;
  buses: BusLocation[];
  routes: RouteSummary[];
  summary: { total: number; live: number; upcoming: number; offline: number; inactive: number };
}

const DEFAULT_CENTER: Position = [22.5726, 88.3639];

const formatAge = (seconds: number | null | undefined) => {
  if (seconds == null) return 'No GPS ping';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
};

const formatTime = (time?: string | null) => time ? time.slice(0, 5) : 'Time not set';

const busColor = (status: string) => ['Live', 'Available'].includes(status) ? '#0f9f78'
  : status === 'Upcoming' ? '#d18b16'
    : status === 'Inactive' ? '#6b7280' : '#c34f52';

const createVehicleIcon = (bus: BusLocation, selected: boolean) => L.divIcon({
  className: 'location-bus-marker',
  html: `<div style="width:36px;height:36px;border:3px solid white;border-radius:50%;background:${busColor(bus.tracking_status)};color:white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 9px #0005;${selected ? 'outline:3px solid #122c3b;' : ''}"><span style="font:700 11px system-ui">BUS</span></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const createStopIcon = (sequence: number) => L.divIcon({
  className: 'location-stop-marker',
  html: `<div style="width:23px;height:23px;border:2px solid white;border-radius:50%;background:#1f5367;color:white;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px #0005;font:700 10px system-ui">${sequence}</div>`,
  iconSize: [23, 23],
  iconAnchor: [11, 11],
});

const MapViewport: React.FC<{ buses: BusLocation[]; selectedBus: BusLocation | null; focusStops: RouteStop[] }> = ({ buses, selectedBus, focusStops }) => {
  const map = useMap();
  const busPositionsKey = JSON.stringify(buses
    .filter((bus) => bus.location)
    .map((bus) => [bus.location!.latitude, bus.location!.longitude]));
  const stopPositionsKey = JSON.stringify(focusStops
    .map((stop) => [Number(stop.latitude), Number(stop.longitude)]));
  const selectedBusId = selectedBus?.id;
  const selectedLatitude = selectedBus?.location?.latitude;
  const selectedLongitude = selectedBus?.location?.longitude;

  useEffect(() => {
    if (selectedLatitude != null && selectedLongitude != null) {
      map.setView([selectedLatitude, selectedLongitude], Math.max(map.getZoom(), 14));
      return;
    }
    const busBounds = JSON.parse(busPositionsKey) as Position[];
    const stopBounds = (JSON.parse(stopPositionsKey) as Position[])
      .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude));
    const bounds = [...busBounds, ...stopBounds];
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    else if (bounds.length === 1) map.setView(bounds[0], 13);
  }, [busPositionsKey, map, selectedBusId, selectedLatitude, selectedLongitude, stopPositionsKey]);

  useEffect(() => {
    const centerOnBus = (event: Event) => {
      const { latitude, longitude } = (event as CustomEvent<{ latitude: number; longitude: number }>).detail;
      map.setView([latitude, longitude], 15);
    };
    window.addEventListener('location-map-center', centerOnBus);
    return () => window.removeEventListener('location-map-center', centerOnBus);
  }, [map]);

  return null;
};

export const LocationPage: React.FC<{ onNotify: (message: string, type?: any) => void }> = ({ onNotify }) => {
  const [data, setData] = useState<LocationDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LocationFilter>('All');
  const [routeFilter, setRouteFilter] = useState('');
  const [selectedBusId, setSelectedBusId] = useState<number | null>(null);
  const [roadPath, setRoadPath] = useState<Position[]>([]);
  const [roadPathMessage, setRoadPathMessage] = useState('');

  const fetchDashboard = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      setError('');
      const response = await locationsAPI.dashboard();
      const next = response.data.data as LocationDashboardData;
      setData(next);
      setSelectedBusId((current) => current && next.buses.some((bus) => bus.id === current) ? current : null);
    } catch (fetchError: any) {
      setError(fetchError.response?.data?.message || 'Unable to load live locations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = window.setInterval(() => fetchDashboard(true), 30000);
    return () => window.clearInterval(interval);
  }, [fetchDashboard]);

  const filteredBuses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.buses || []).filter((bus) => {
      const trip = bus.current_trip || bus.upcoming_trip;
      const matchesSearch = !query || [bus.registration_number, bus.model, bus.driver?.name, trip?.schedule_code,
        trip?.route?.route_name, trip?.route?.route_code].some((value) => String(value || '').toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'All'
        || (statusFilter === 'Offline' ? ['Offline', 'Stale', 'No GPS'].includes(bus.tracking_status) : bus.tracking_status === statusFilter);
      const matchesRoute = !routeFilter || String(trip?.route_id || '') === routeFilter;
      return matchesSearch && matchesStatus && matchesRoute;
    });
  }, [data, routeFilter, search, statusFilter]);

  const selectedBus = filteredBuses.find((bus) => bus.id === selectedBusId) || null;
  const selectedTrip = selectedBus?.current_trip || selectedBus?.upcoming_trip || null;
  const selectedRoute = (data?.routes || []).find((route) => String(route.id) === routeFilter) || null;
  const focusStops = selectedTrip?.route?.stops || selectedRoute?.stops || [];
  const focusKey = `${selectedBus?.id || ''}:${selectedTrip?.id || selectedRoute?.id || ''}`;
  const focusStopCoordinates = JSON.stringify(focusStops.map((stop) => [stop.latitude, stop.longitude]));

  useEffect(() => {
    const coordinates = (JSON.parse(focusStopCoordinates) as Array<[string | number | null, string | number | null]>)
      .filter(([latitude, longitude]) => latitude != null && longitude != null && latitude !== '' && longitude !== '')
      .map(([latitude, longitude]) => [Number(latitude), Number(longitude)] as Position)
      .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude)
        && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180);
    if (coordinates.length < 2) {
      setRoadPath([]);
      setRoadPathMessage(focusStopCoordinates !== '[]' ? 'Route stops need coordinates to draw its road path.' : '');
      return;
    }

    const controller = new AbortController();
    const osrmCoordinates = coordinates.map(([latitude, longitude]) => `${longitude},${latitude}`).join(';');
    setRoadPath([]);
    setRoadPathMessage('Loading road path...');
    fetch(`https://router.project-osrm.org/route/v1/driving/${osrmCoordinates}?overview=full&geometries=geojson&steps=false`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Road route service unavailable');
        return response.json();
      })
      .then((result) => {
        const line = result.routes?.[0]?.geometry?.coordinates;
        if (!Array.isArray(line) || line.length < 2) throw new Error('No road path for this route');
        setRoadPath(line.map(([longitude, latitude]: [number, number]): Position => [latitude, longitude]));
        setRoadPathMessage('');
      })
      .catch((routeError: any) => {
        if (routeError.name !== 'AbortError') setRoadPathMessage(routeError.message || 'Unable to load road path');
      });
    return () => controller.abort();
  }, [focusKey, focusStopCoordinates]);

  const visibleRoutes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.routes || []).map((route) => ({
      ...route,
      visible_buses: filteredBuses.filter((bus) => Number((bus.current_trip || bus.upcoming_trip)?.route_id) === route.id).length,
    })).filter((route) => {
      const matchesRoute = !routeFilter || String(route.id) === routeFilter;
      const matchesSearch = !query || [route.route_name, route.route_code, route.origin_city, route.destination_city]
        .some((value) => String(value || '').toLowerCase().includes(query)) || route.visible_buses > 0;
      const matchesStatus = statusFilter === 'All'
        || (statusFilter === 'Live' && route.active_buses > 0)
        || (statusFilter === 'Upcoming' && route.upcoming_trips > 0)
        || (statusFilter === 'Offline' && route.active_buses === 0 && route.upcoming_trips === 0)
        || (statusFilter === 'Inactive' && route.status !== 'Active');
      return matchesRoute && matchesSearch && matchesStatus;
    });
  }, [data, filteredBuses, routeFilter, search, statusFilter]);

  const selectStatus = (status: LocationFilter) => setStatusFilter(status);
  const statusButtons: Array<{ label: LocationFilter; value: number; color: string }> = [
    { label: 'All', value: data?.summary.total || 0, color: '#1f5367' },
    { label: 'Live', value: data?.summary.live || 0, color: '#0f9f78' },
    { label: 'Upcoming', value: data?.summary.upcoming || 0, color: '#d18b16' },
    { label: 'Offline', value: data?.summary.offline || 0, color: '#c34f52' },
    { label: 'Inactive', value: data?.summary.inactive || 0, color: '#6b7280' },
  ];

  if (loading && !data) return <LoadingState message="Loading live bus locations..." />;
  if (error && !data) return <ErrorState message={error} onRetry={() => fetchDashboard()} />;

  return (
    <div className="space-y-4 text-slate-800 dark:text-slate-100">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-xl font-bold">Location</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Live fleet positions, assigned trips, and route activity</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Updated {data?.generated_at ? new Date(data.generated_at).toLocaleTimeString() : 'just now'} · 30 sec refresh
          </span>
          <button type="button" onClick={() => fetchDashboard(true)} disabled={refreshing} title="Sync bus locations" aria-label="Sync bus locations" className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Sync
          </button>
        </div>
      </header>

      {error && <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {statusButtons.map((item) => (
          <button key={item.label} type="button" onClick={() => selectStatus(item.label)} className={`flex min-h-16 items-center justify-between gap-2 border-b-2 bg-white px-3 py-2 text-left shadow-sm transition dark:bg-slate-900 ${statusFilter === item.label ? 'border-teal-600' : 'border-transparent hover:border-slate-300 dark:hover:border-slate-700'}`}>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.label} buses</span>
            <span className="text-xl font-bold tabular-nums" style={{ color: item.color }}>{item.value}</span>
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-2 border-y border-slate-200 py-3 dark:border-slate-800 md:flex-row md:items-center">
        <label className="relative min-w-0 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bus, driver, trip, route" className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
        </label>
        <select value={routeFilter} onChange={(event) => setRouteFilter(event.target.value)} aria-label="Filter by route" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
          <option value="">All routes</option>
          {(data?.routes || []).map((route) => <option key={route.id} value={route.id}>{route.route_name}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LocationFilter)} aria-label="Filter by bus status" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
          {(['All', 'Live', 'Upcoming', 'Offline', 'Inactive'] as LocationFilter[]).map((status) => <option key={status} value={status}>{status} buses</option>)}
        </select>
        <span className="whitespace-nowrap text-xs tabular-nums text-slate-500 dark:text-slate-400">{filteredBuses.length} buses</span>
      </section>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative h-[55vh] min-h-[390px] overflow-hidden rounded-md border border-slate-300 dark:border-slate-700">
          <MapContainer center={DEFAULT_CENTER} zoom={11} className="z-0 h-full w-full">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.de/{z}/{x}/{y}.png" />
            <MapViewport buses={filteredBuses} selectedBus={selectedBus} focusStops={focusStops} />
            {filteredBuses.filter((bus) => bus.location).map((bus) => (
              <Marker key={bus.id} position={[bus.location!.latitude, bus.location!.longitude]} icon={createVehicleIcon(bus, bus.id === selectedBusId)} eventHandlers={{ click: () => setSelectedBusId(bus.id) }}>
                <Popup>
                  <div className="min-w-44 text-sm">
                    <strong>{bus.registration_number}</strong>
                    <div>{bus.current_trip?.route?.route_name || bus.upcoming_trip?.route?.route_name || bus.tracking_status}</div>
                    <div>{bus.driver?.name || 'No driver assigned'}</div>
                    <div>{formatAge(bus.location?.age_seconds)}</div>
                    <button type="button" onClick={() => setSelectedBusId(bus.id)} className="mt-2 font-semibold text-teal-700">View bus details</button>
                  </div>
                </Popup>
              </Marker>
            ))}
            {focusStops.filter((stop) => stop.latitude != null && stop.longitude != null
              && Number.isFinite(Number(stop.latitude)) && Number.isFinite(Number(stop.longitude))
              && Math.abs(Number(stop.latitude)) <= 90 && Math.abs(Number(stop.longitude)) <= 180)
              .map((stop) => (
                <Marker key={`stop-${stop.id}`} position={[Number(stop.latitude), Number(stop.longitude)]} icon={createStopIcon(stop.stop_sequence)}>
                  <Popup><strong>Stop {stop.stop_sequence}</strong><br />{stop.stop_name}</Popup>
                </Marker>
              ))}
            {roadPath.length > 1 && <Polyline positions={roadPath} pathOptions={{ color: '#0c8f75', weight: 5, opacity: 0.85 }} />}
          </MapContainer>
          <div className="absolute left-3 top-3 z-[1000] flex items-center gap-3 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow dark:border-slate-700 dark:bg-slate-900/95">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />Live</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Upcoming</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-600" />Offline</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-500" />Inactive</span>
          </div>
          {filteredBuses.every((bus) => !bus.location) && <div className="absolute inset-x-4 bottom-4 z-[1000] mx-auto w-fit rounded bg-white/95 px-3 py-2 text-xs text-slate-600 shadow dark:bg-slate-900/95 dark:text-slate-300">No GPS positions are available for the selected buses yet.</div>}
        </div>

        <aside className="space-y-4">
          {selectedBus && (
            <Card className="border-t-2 border-t-teal-600" padding={false}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-bold"><Bus size={16} className="text-teal-600" />{selectedBus.registration_number}</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{selectedBus.model || 'Bus'} · {selectedBus.tracking_status}</div>
                </div>
                <button type="button" aria-label="Close bus details" onClick={() => setSelectedBusId(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
              </div>
              <div className="space-y-3 p-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><div className="text-slate-500">Driver</div><div className="mt-1 flex items-center gap-1.5 font-semibold"><UserRound size={13} />{selectedBus.driver?.name || 'Not assigned'}</div></div>
                  <div><div className="text-slate-500">Speed</div><div className="mt-1 font-semibold">{selectedBus.location?.speed_kmh == null ? '—' : `${selectedBus.location.speed_kmh} km/h`}</div></div>
                  <div><div className="text-slate-500">Last GPS ping</div><div className="mt-1 flex items-center gap-1.5 font-semibold"><Clock3 size={13} />{formatAge(selectedBus.location?.age_seconds)}</div></div>
                  <div><div className="text-slate-500">Vehicle state</div><div className="mt-1 font-semibold">{selectedBus.vehicle_status}</div></div>
                </div>
                {selectedBus.current_trip ? (
                  <TripDetail trip={selectedBus.current_trip} bus={selectedBus} roadPathMessage={roadPathMessage} />
                ) : selectedBus.upcoming_trip ? (
                  <div className="border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
                    <div className="font-semibold text-amber-600">Upcoming trip</div>
                    <div className="mt-1">{selectedBus.upcoming_trip.route?.route_name || 'Route'} · {selectedBus.upcoming_trip.schedule_code}</div>
                    <div className="mt-1 text-slate-500">{selectedBus.upcoming_trip.trip_date || 'Date not set'} at {formatTime(selectedBus.upcoming_trip.departure_time)}</div>
                  </div>
                ) : <div className="border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800">No active or upcoming trip assigned.</div>}
                <button type="button" onClick={() => selectedBus.location && setMapLocation(selectedBus.location.latitude, selectedBus.location.longitude)} className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700 dark:text-teal-400"><LocateFixed size={14} />Center bus on map</button>
              </div>
            </Card>
          )}
          <Card padding={false}>
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-bold">Visible routes</h2></div>
              <div className="max-h-[55vh] overflow-y-auto">
                {visibleRoutes.length ? visibleRoutes.map((route) => (
                  <button key={route.id} type="button" onClick={() => setRouteFilter(String(route.id))} className="flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${route.status !== 'Active' ? 'bg-slate-400' : route.active_buses ? 'bg-emerald-500' : route.upcoming_trips ? 'bg-amber-500' : 'bg-slate-300'}`} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{route.route_name}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{route.origin_city} → {route.destination_city}</span></span>
                    <span className="text-right text-[10px] text-slate-500"><span className="block">{route.status === 'Active' ? route.trip_status : route.status}</span><span className="block">{route.active_buses} live · {route.upcoming_trips} next</span></span>
                  </button>
                )) : <div className="p-4 text-center text-xs text-slate-500">No routes match the filters.</div>}
              </div>
          </Card>

          <Card padding={false}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-bold">Buses</h2><span className="text-xs text-slate-500">{filteredBuses.length}</span></div>
            <div className="max-h-72 overflow-y-auto">
              {filteredBuses.length ? filteredBuses.map((bus) => (
                <button key={bus.id} type="button" onClick={() => setSelectedBusId(bus.id)} className={`flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2 text-left dark:border-slate-800 ${selectedBusId === bus.id ? 'bg-teal-50 dark:bg-teal-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: busColor(bus.tracking_status) }}><Bus size={15} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{bus.registration_number}</span><span className="block truncate text-[10px] text-slate-500">{(bus.current_trip || bus.upcoming_trip)?.route?.route_name || bus.driver?.name || 'No trip'}</span></span>
                  <span className="text-right"><span className="block text-[10px] font-semibold">{bus.tracking_status}</span><span className="block text-[10px] text-slate-500">{formatAge(bus.location?.age_seconds)}</span></span>
                </button>
              )) : <div className="p-4 text-center text-xs text-slate-500">No buses match the filters.</div>}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
};

const TripDetail: React.FC<{ trip: Trip; bus: BusLocation; roadPathMessage: string }> = ({ trip, bus, roadPathMessage }) => {
  const stops = trip.route?.stops || [];
  const closestIndex = bus.nearest_stop?.route_index ?? -1;
  return (
    <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
      <div className="flex items-start gap-2"><Navigation size={14} className="mt-0.5 text-teal-700" /><div className="min-w-0"><div className="truncate text-xs font-semibold">{trip.route?.route_name || 'Active route'}</div><div className="mt-1 text-[10px] text-slate-500">{trip.schedule_code} · {trip.status}</div></div></div>
      {bus.nearest_stop && <div className="mt-2 rounded bg-teal-50 px-2.5 py-2 text-[11px] text-teal-900 dark:bg-teal-950/40 dark:text-teal-200"><span className="font-semibold">Nearest stop estimate:</span> {bus.nearest_stop.stop_name} · {bus.nearest_stop.distance_meters} m</div>}
      {roadPathMessage && <div className="mt-2 text-[10px] text-slate-500">{roadPathMessage}</div>}
      <div className="mt-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500"><span>Route stops</span><span>GPS-based estimate</span></div>
      <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
        {stops.map((stop, index) => {
          const isClosest = index === closestIndex;
          const passed = closestIndex >= 0 && index < closestIndex;
          return <div key={stop.id} className="flex items-center gap-2 py-1 text-xs"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isClosest ? 'bg-teal-700 text-white' : passed ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{passed ? '✓' : stop.stop_sequence}</span><span className={`min-w-0 flex-1 truncate ${isClosest ? 'font-semibold' : ''}`}>{stop.stop_name}</span><span className="shrink-0 text-[10px] text-slate-500">{isClosest ? 'Nearest' : passed ? 'Passed*' : 'Ahead'}</span></div>;
        })}
        {!stops.length && <div className="py-2 text-xs text-slate-500">No route stops configured.</div>}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">*Passed stops are estimated from the latest GPS position, not a driver arrival confirmation.</p>
    </div>
  );
};

function setMapLocation(_latitude: number, _longitude: number) {
  window.dispatchEvent(new CustomEvent('location-map-center', { detail: { latitude: _latitude, longitude: _longitude } }));
}
