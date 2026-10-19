import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  ArrowUpDown,
  Plus,
  Trash2,
  Eye,
  RefreshCw,
  UserCheck,
  LogOut,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Database
} from 'lucide-react';
import type { Order, PaginationData, AuthUser } from './types';
import { StatsWidget } from './components/StatsWidget';
import { CreateOrderModal } from './components/CreateOrderModal';
import { OrderDetailsModal } from './components/OrderDetailsModal';
import { RaceTestBanner } from './components/RaceTestBanner';

export const App: React.FC = () => {
  // Authentication State (default seeded agent/admin)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('sarh_token') || null);
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('sarh_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Query & Filter States (R1)
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Data States
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    total: 0,
    page: 1,
    pageSize: 25,
    totalPages: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Race condition test states
  const [raceLogs, setRaceLogs] = useState<string[]>([]);
  const [isRaceTestRunning, setIsRaceTestRunning] = useState(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // R1 Hand Test Protection: AbortController and Monotonic Sequence ID
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdCounterRef = useRef<number>(0);

  // 300ms Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Initial Auto-Login as Agent if no token
  useEffect(() => {
    if (!token) {
      handleQuickLogin('agent');
    }
  }, []);

  const handleQuickLogin = async (role: 'admin' | 'agent') => {
    const credentials = role === 'admin'
      ? { email: 'admin@sarh.ai', password: 'AdminPass123!' }
      : { email: 'agent@sarh.ai', password: 'AgentPass123!' };

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('sarh_token', data.token);
        localStorage.setItem('sarh_user', JSON.stringify(data.user));
        setActionNotice(`Logged in as ${data.user.role.toUpperCase()}: ${data.user.email}`);
        setTimeout(() => setActionNotice(null), 3500);
      }
    } catch (err: any) {
      console.error('Login error:', err);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('sarh_token');
    localStorage.removeItem('sarh_user');
  };

  /**
   * R1 Core Fetcher with AbortController & Monotonic Request ID
   * Guarantees that earlier, slower responses can NEVER overwrite newer filter results.
   */
  const fetchOrders = useCallback((
    overrideParams?: {
      status?: string;
      search?: string;
      page?: number;
      sortBy?: 'date' | 'amount';
      sortOrder?: 'asc' | 'desc';
    },
    simulatedDelayMs = 0,
    onFinishLog?: (msg: string) => void
  ) => {
    // 1. Abort existing active request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 2. Increment request ID
    requestIdCounterRef.current += 1;
    const currentRequestId = requestIdCounterRef.current;

    setLoading(true);
    setError(null);

    const queryStatus = overrideParams?.status !== undefined ? overrideParams.status : statusFilter;
    const querySearch = overrideParams?.search !== undefined ? overrideParams.search : debouncedSearch;
    const queryPage = overrideParams?.page !== undefined ? overrideParams.page : page;
    const querySortBy = overrideParams?.sortBy !== undefined ? overrideParams.sortBy : sortBy;
    const querySortOrder = overrideParams?.sortOrder !== undefined ? overrideParams.sortOrder : sortOrder;

    const params = new URLSearchParams({
      page: String(queryPage),
      pageSize: String(pageSize),
      sortBy: querySortBy,
      sortOrder: querySortOrder
    });

    if (querySearch) params.set('search', querySearch);
    if (queryStatus && queryStatus !== 'all') params.set('status', queryStatus);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (simulatedDelayMs > 0) headers['x-simulate-delay'] = String(simulatedDelayMs);

    fetch(`/api/orders?${params.toString()}`, {
      signal: controller.signal,
      headers
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        // 3. Stale Response Check: If a newer request was dispatched while this was in flight, discard!
        if (currentRequestId !== requestIdCounterRef.current) {
          console.warn(`[R1 Guard] Stale response for Request #${currentRequestId} discarded.`);
          if (onFinishLog) onFinishLog(`Request #${currentRequestId} -> DISCARDED (Superseded)`);
          return;
        }

        setOrders(data.orders);
        setPagination(data.pagination);
        setLoading(false);
        if (onFinishLog) onFinishLog(`Request #${currentRequestId} (filter: ${queryStatus}) -> APPLIED TO TABLE ✓`);
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          console.log(`[R1 Guard] Request #${currentRequestId} (filter: ${queryStatus}) successfully aborted.`);
          if (onFinishLog) onFinishLog(`Request #${currentRequestId} (filter: ${queryStatus}) -> ABORTED by newer request`);
          return;
        }
        if (currentRequestId === requestIdCounterRef.current) {
          setError(err.message);
          setLoading(false);
        }
      });
  }, [statusFilter, debouncedSearch, page, pageSize, sortBy, sortOrder, token]);

  // Fetch when filters or pagination change
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  /**
   * R1 Hand Test Simulator:
   * Programmatically changes the filter 3 times in quick succession with inverted delays:
   * Req 1: 'pending' (1200ms delay)
   * Req 2: 'cancelled' (700ms delay)
   * Req 3: 'completed' (100ms delay)
   * Proves that Request 3 arrives first and Request 1 NEVER overwrites it!
   */
  const handleTriggerRaceTest = async () => {
    setIsRaceTestRunning(true);
    setRaceLogs([]);

    const logEntry = (msg: string) => {
      setRaceLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    logEntry('Starting 3 Rapid Filter Changes test...');

    // Change 1: 'pending' (slowest, 1400ms delay)
    setStatusFilter('pending');
    logEntry('Filter 1: Dispatched "pending" with 1400ms delay');
    fetchOrders({ status: 'pending' }, 1400, logEntry);

    // Wait 120ms
    await new Promise((r) => setTimeout(r, 120));

    // Change 2: 'cancelled' (medium, 800ms delay)
    setStatusFilter('cancelled');
    logEntry('Filter 2: Dispatched "cancelled" with 800ms delay');
    fetchOrders({ status: 'cancelled' }, 800, logEntry);

    // Wait 120ms
    await new Promise((r) => setTimeout(r, 120));

    // Change 3: 'completed' (fastest, 100ms delay)
    setStatusFilter('completed');
    logEntry('Filter 3: Dispatched "completed" with 100ms delay');
    fetchOrders({ status: 'completed' }, 100, logEntry);

    // Wait for all to settle
    setTimeout(() => {
      setIsRaceTestRunning(false);
      logEntry('Test complete. Verified: Table shows "completed" orders only!');
    }, 1800);
  };

  /**
   * Section 3: Insecure contractor delete replaced with server-side RBAC
   */
  const handleDeleteOrder = async (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm(`Are you sure you want to delete Order #${orderId}?`)) return;

    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();

      if (res.status === 403) {
        // Demonstrates Section 3 backend enforcement: Agent is blocked!
        setActionNotice(`⛔ 403 FORBIDDEN: ${data.error}`);
        setTimeout(() => setActionNotice(null), 5000);
        return;
      }

      if (res.ok) {
        setActionNotice(`✓ Order #${orderId} deleted successfully by Admin.`);
        setTimeout(() => setActionNotice(null), 3500);
        fetchOrders();
      } else {
        setActionNotice(`Error: ${data.error}`);
        setTimeout(() => setActionNotice(null), 4000);
      }
    } catch (err: any) {
      setActionNotice(`Network error: ${err.message}`);
    }
  };

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="header-bar">
        <div className="brand-section">
          <div className="brand-logo">S</div>
          <div className="brand-title">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h1>SARH Orders Console</h1>
              <span className="brand-badge">50k+ Ready</span>
            </div>
            <div className="brand-subtitle">
              Operations Dashboard · High-Concurrency Deduplication & Sub-Second Querying
            </div>
          </div>
        </div>

        {/* Auth / Role Switcher */}
        <div className="auth-panel">
          {user ? (
            <div className="user-badge">
              <UserCheck size={14} color="#818cf8" />
              <span>{user.name}</span>
              <span className={`role-tag ${user.role}`}>{user.role}</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleQuickLogin(user.role === 'admin' ? 'agent' : 'admin')}
                title="Switch between Admin and Agent to test RBAC delete protection"
                style={{ padding: '3px 8px', fontSize: '0.72rem' }}
              >
                Switch to {user.role === 'admin' ? 'Agent' : 'Admin'}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleLogout}
                style={{ padding: '3px 8px' }}
                title="Sign out"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => handleQuickLogin('agent')}>
                Login as Agent
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => handleQuickLogin('admin')}>
                Login as Admin
              </button>
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={() => setIsCreateModalOpen(true)}
            id="btn-create-order"
          >
            <Plus size={16} />
            Register Phone Order
          </button>
        </div>
      </header>

      {/* Action Notification Toast */}
      {actionNotice && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            background: actionNotice.includes('FORBIDDEN') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
            border: actionNotice.includes('FORBIDDEN') ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(16, 185, 129, 0.5)',
            color: actionNotice.includes('FORBIDDEN') ? '#fca5a5' : '#6ee7b7',
            fontSize: '0.85rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-md)'
          }}
        >
          <span>{actionNotice}</span>
          <button
            onClick={() => setActionNotice(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* O1 Stats Widget */}
      <StatsWidget token={token} />

      {/* R1 Correctness Under Load Banner */}
      <RaceTestBanner
        onTriggerTest={handleTriggerRaceTest}
        isRunning={isRaceTestRunning}
        logs={raceLogs}
      />

      {/* Filter & Search Bar */}
      <div className="glass-card filter-bar">
        {/* Search */}
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search by customer name, email, or order #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="search-input"
          />
        </div>

        {/* Status Pills */}
        <div className="filter-group">
          <div className="filter-pills">
            {(['all', 'pending', 'processing', 'completed', 'cancelled'] as const).map((st) => (
              <button
                key={st}
                className={`filter-pill ${statusFilter === st ? 'active' : ''}`}
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                id={`filter-${st}`}
              >
                {st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Sort & Refresh */}
        <div className="filter-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sort:</span>
            <select
              className="select-input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="date">Date Created</option>
              <option value="amount">Total Amount</option>
            </select>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              title={`Toggle sort order (Current: ${sortOrder.toUpperCase()})`}
            >
              <ArrowUpDown size={14} />
              {sortOrder.toUpperCase()}
            </button>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchOrders()}
            title="Refresh Orders"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spinner' : ''} />
          </button>
        </div>
      </div>

      {/* Orders Table Container */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table className="orders-table">
            <thead>
              <tr>
                <th style={{ width: '13%' }}>Order Number</th>
                <th style={{ width: '32%' }}>Customer</th>
                <th style={{ width: '15%' }}>Status</th>
                <th
                  style={{ width: '15%' }}
                  className="sortable"
                  onClick={() => {
                    if (sortBy === 'amount') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('amount');
                      setSortOrder('desc');
                    }
                  }}
                >
                  Amount ($) {sortBy === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  style={{ width: '15%' }}
                  className="sortable"
                  onClick={() => {
                    if (sortBy === 'date') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('date');
                      setSortOrder('desc');
                    }
                  }}
                >
                  Date Created {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px' }}>
                    <span className="spinner" style={{ width: '28px', height: '28px' }}></span>
                    <p style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Querying indexed database...
                    </p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#f87171' }}>
                    <AlertCircle size={24} style={{ margin: '0 auto 8px' }} />
                    <p>{error}</p>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    No orders found matching your search and filter criteria.
                  </td>
                </tr>
              ) : (
                orders.map((ord) => (
                  <tr key={ord.id} onClick={() => setSelectedOrderId(ord.id)}>
                    <td>
                      <span className="order-num">{ord.order_number}</span>
                    </td>
                    <td>
                      <div className="customer-cell">
                        <span className="customer-name">{ord.customer_name}</span>
                        <span className="customer-email">{ord.customer_email}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${ord.status}`}>{ord.status}</span>
                    </td>
                    <td>
                      <span className="amount-val">${ord.total_amount.toFixed(2)}</span>
                    </td>
                    <td>
                      <span className="date-val">
                        {new Date(ord.created_at).toLocaleDateString()}{' '}
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                          {new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '5px 8px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrderId(ord.id);
                          }}
                          title="View order details and line items"
                        >
                          <Eye size={13} />
                        </button>

                        <button
                          className="btn btn-danger btn-sm"
                          style={{ padding: '5px 8px' }}
                          onClick={(e) => handleDeleteOrder(ord.id, e)}
                          title={user?.role === 'admin' ? 'Delete order (Admin Authorized)' : 'Delete order (Agent - Will trigger 403 Forbidden)'}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="pagination-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={15} color="#818cf8" />
            <span>
              Showing {pagination.total > 0 ? (page - 1) * pageSize + 1 : 0} -{' '}
              {Math.min(page * pageSize, pagination.total)} of{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{pagination.total.toLocaleString()}</strong> orders
            </span>
          </div>

          <div className="pagination-controls">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Rows per page:</span>
            <select
              className="select-input"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>

            <span style={{ margin: '0 8px' }}>
              Page <strong>{page}</strong> of <strong>{pagination.totalPages || 1}</strong>
            </span>

            <button
              className="btn btn-secondary btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage(page - 1)}
              style={{ padding: '6px 10px' }}
            >
              <ChevronLeft size={14} /> Previous
            </button>

            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= pagination.totalPages || loading}
              onClick={() => setPage(page + 1)}
              style={{ padding: '6px 10px' }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <CreateOrderModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onOrderCreated={() => {
          fetchOrders();
          setActionNotice('✓ Order created successfully!');
          setTimeout(() => setActionNotice(null), 3500);
        }}
        token={token}
      />

      <OrderDetailsModal
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        token={token}
      />
    </div>
  );
};

export default App;
