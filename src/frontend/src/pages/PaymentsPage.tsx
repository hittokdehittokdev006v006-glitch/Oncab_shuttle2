import React, { useState, useEffect, useCallback } from 'react';
import { paymentsAPI } from '../services/api';
import { Card, Table, Tr, Td, Pagination, SearchInput, Select, StatusBadge, ErrorState, Badge } from '../components/ui';
import { CreditCard, DollarSign, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface PaymentsPageProps {
  onNotify: (msg: string, type?: any) => void;
}

export const PaymentsPage: React.FC<PaymentsPageProps> = ({ onNotify }) => {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [gatewayFilter, setGatewayFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 15 });

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const resp = await paymentsAPI.list({
        page,
        limit: 15,
        search,
        status: statusFilter,
        payment_gateway: gatewayFilter,
      });
      setPayments(resp.data.data || []);
      setPagination(resp.data.pagination || { total: 0, pages: 1, limit: 15 });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, gatewayFilter]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, gatewayFilter]);

  const totalAmount = payments.reduce((sum, p) => ['captured', 'refunded', 'partial_refund'].includes(p.status) ? sum + Number(p.amount || 0) : sum, 0);

  const HEADERS = ['Transaction ID', 'Booking Ref', 'Passenger', 'Amount', 'Gateway', 'Payment Method', 'Status', 'Date'];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Payments & Transactions</h2>
          <p className="text-slate-400 text-sm">{pagination.total} transactions recorded</p>
        </div>
      </div>

      {/* Mini Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-slate-400 text-xs uppercase font-medium">Page Collected</div>
            <div className="text-xl font-bold text-white">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <div className="text-slate-400 text-xs uppercase font-medium">Total Inquiries</div>
            <div className="text-xl font-bold text-white">{pagination.total}</div>
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-slate-400 text-xs uppercase font-medium">Gateway Integrations</div>
            <div className="text-xl font-bold text-white">PayU / Cash</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search transaction ID, booking ref..."
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'paid', label: 'Paid / Success' },
            { value: 'pending', label: 'Pending' },
            { value: 'failed', label: 'Failed' },
            { value: 'refunded', label: 'Refunded' },
          ]}
          placeholder="All Statuses"
        />
        <Select
          value={gatewayFilter}
          onChange={setGatewayFilter}
          options={[
            { value: 'payu', label: 'PayU' },
            { value: 'wallet', label: 'Wallet' },
            { value: 'cash', label: 'Cash / Offline' },
          ]}
          placeholder="All Gateways"
        />
      </div>

      <Card padding={false}>
        {error ? (
          <ErrorState message={error} onRetry={fetchPayments} />
        ) : (
          <>
            <Table
              headers={HEADERS}
              loading={loading}
              empty={!loading && payments.length === 0}
              emptyMessage="No payments or transactions found"
            >
              {payments.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <div className="text-white text-sm font-mono font-medium">
                      {p.payu_txnid || p.transaction_id || p.payment_reference || `TXN-${p.id}`}
                    </div>
                  </Td>
                  <Td>
                    <div className="text-xs font-mono text-cyan-400 font-medium">
                      {p.booking?.booking_reference || p.booking_reference || '—'}
                    </div>
                  </Td>
                  <Td>
                    <div className="text-white text-sm">
                      {p.passenger?.name || p.booking?.passenger_name || 'Passenger'}
                    </div>
                    <div className="text-slate-500 text-xs">
                      {p.passenger?.mobile || p.booking?.passenger_mobile || '—'}
                    </div>
                  </Td>
                  <Td>
                    <span className="text-sm font-bold text-emerald-400 font-mono">
                      ₹{Number(p.amount || 0).toFixed(2)}
                    </span>
                  </Td>
                  <Td>
                    <span className="capitalize text-slate-300 text-xs px-2 py-1 bg-slate-800 rounded border border-slate-700">
                      {p.payment_gateway || 'online'}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-400 uppercase">
                      {p.payment_method || 'CARD / UPI'}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge status={p.payment_status || p.status || 'pending'} />
                  </Td>
                  <Td className="text-xs text-slate-400">
                    {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
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
    </div>
  );
};
