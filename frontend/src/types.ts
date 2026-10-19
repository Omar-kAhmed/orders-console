export type OrderStatus = 'pending' | 'processing' | 'completed' | 'cancelled';

export interface OrderItem {
  id?: number;
  order_id?: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price?: number;
}

export interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  customer_email: string;
  status: OrderStatus;
  total_amount: number;
  created_at: string;
  idempotency_key?: string;
  items?: OrderItem[];
}

export interface PaginationData {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'agent';
}

export interface StatsData {
  totalOrders: number;
  statusCounts: Record<OrderStatus, number>;
  todayRevenue: number;
  todayOrdersCount: number;
  generatedAt: string;
}
