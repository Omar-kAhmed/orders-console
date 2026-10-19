import React, { useEffect, useState } from 'react';
import { X, Package, Calendar, Mail, User, Shield, Hash } from 'lucide-react';
import type { Order } from '../types';

interface OrderDetailsModalProps {
  orderId: number | null;
  onClose: () => void;
  token: string | null;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ orderId, onClose, token }) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    setLoading(true);
    setError(null);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`/api/orders/${orderId}`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Order) => {
        setOrder(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [orderId, token]);

  if (!orderId) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Package size={20} color="#818cf8" />
            <div>
              <h2 className="modal-title">
                {order ? order.order_number : `Order #${orderId}`}
              </h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Full Order Specification & Line Items
              </span>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '6px' }}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <span className="spinner" style={{ width: '28px', height: '28px' }}></span>
              <p style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading order details...</p>
            </div>
          ) : error ? (
            <div style={{ color: '#f87171', padding: '20px', textAlign: 'center' }}>
              Failed to load order: {error}
            </div>
          ) : order ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={16} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Customer</div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{order.customer_name}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Mail size={16} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Email</div>
                    <div style={{ fontSize: '0.85rem' }}>{order.customer_email}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Created At</div>
                    <div style={{ fontSize: '0.85rem' }}>{new Date(order.created_at).toLocaleString()}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={16} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Status</div>
                    <div>
                      <span className={`status-badge ${order.status}`}>{order.status}</span>
                    </div>
                  </div>
                </div>
              </div>

              {order.idempotency_key && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(99, 102, 241, 0.08)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  <Hash size={14} color="#818cf8" />
                  <span>Idempotency Key: <code style={{ color: '#a5b4fc' }}>{order.idempotency_key}</code></span>
                </div>
              )}

              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  Line Items ({order.items?.length || 0})
                </h4>
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items?.map((item) => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 500 }}>{item.item_name}</td>
                          <td>{item.quantity}</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>${item.unit_price.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#34d399' }}>
                            ${(item.total_price || (item.quantity * item.unit_price)).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', paddingTop: '10px' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Total Order Amount:</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#34d399' }}>
                  ${order.total_amount.toFixed(2)}
                </span>
              </div>
            </>
          ) : null}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
