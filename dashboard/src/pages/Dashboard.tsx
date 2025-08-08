import { useState, useEffect } from 'react';
import axios from 'axios';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
} from 'chart.js';
import {
  CurrencyDollarIcon,
  ChartBarIcon,
  UsersIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import { format, parseISO } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface DashboardStats {
  total_customers: number;
  total_agents: number;
  total_events: number;
  unique_vendors: number;
  recent_activity: {
    events_last_24h: number;
    cost_last_24h: number;
    tokens_last_24h: number;
  };
  averages: {
    avg_cost_per_event: number;
    avg_tokens_per_event: number;
  };
}

interface CostSummary {
  summary: {
    total_cost: number;
    total_events: number;
    total_tokens: number;
  };
  by_vendor: Array<{
    vendor: string;
    total_cost: number;
    total_events: number;
  }>;
  top_customers: Array<{
    customer_id: string;
    customer_name: string;
    total_cost: number;
    total_events: number;
  }>;
  top_agents: Array<{
    agent_id: string;
    agent_name: string;
    total_cost: number;
    total_events: number;
  }>;
}

interface CostTrends {
  trends: Array<{
    date: string;
    total_cost: number;
    total_events: number;
    total_tokens: number;
  }>;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [costTrends, setCostTrends] = useState<CostTrends | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsResponse, summaryResponse, trendsResponse] = await Promise.all([
        axios.get('/api/dashboard/stats'),
        axios.get(`/api/dashboard/costs/summary?period=${period}`),
        axios.get('/api/dashboard/costs/trends?days=30'),
      ]);

      setStats(statsResponse.data);
      setCostSummary(summaryResponse.data);
      setCostTrends(trendsResponse.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const statCards = [
    {
      name: 'Total Cost',
      value: `$${costSummary?.summary.total_cost.toFixed(4) || '0.0000'}`,
      icon: CurrencyDollarIcon,
      change: '+12%',
      changeType: 'increase',
    },
    {
      name: 'API Events',
      value: costSummary?.summary.total_events.toLocaleString() || '0',
      icon: ChartBarIcon,
      change: '+19%',
      changeType: 'increase',
    },
    {
      name: 'Customers',
      value: stats?.total_customers.toString() || '0',
      icon: UsersIcon,
      change: '+5%',
      changeType: 'increase',
    },
    {
      name: 'Total Tokens',
      value: costSummary?.summary.total_tokens.toLocaleString() || '0',
      icon: CpuChipIcon,
      change: '+23%',
      changeType: 'increase',
    },
  ];

  // Prepare chart data
  const trendChartData = {
    labels: costTrends?.trends.map(trend => format(parseISO(trend.date), 'MMM dd')) || [],
    datasets: [
      {
        label: 'Daily Cost ($)',
        data: costTrends?.trends.map(trend => trend.total_cost) || [],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.1,
      },
    ],
  };

  const vendorChartData = {
    labels: costSummary?.by_vendor.map(v => v.vendor) || [],
    datasets: [
      {
        data: costSummary?.by_vendor.map(v => v.total_cost) || [],
        backgroundColor: [
          '#3B82F6',
          '#10B981',
          '#F59E0B',
          '#EF4444',
          '#8B5CF6',
        ],
      },
    ],
  };

  const customerChartData = {
    labels: costSummary?.top_customers.slice(0, 10).map(c => c.customer_name || c.customer_id) || [],
    datasets: [
      {
        label: 'Cost ($)',
        data: costSummary?.top_customers.slice(0, 10).map(c => c.total_cost) || [],
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex space-x-2">
          {['7d', '30d', '90d'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-sm font-medium rounded-md ${
                period === p
                  ? 'bg-primary-100 text-primary-900'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((item) => (
          <div key={item.name} className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <item.icon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">{item.name}</dt>
                    <dd className="text-lg font-medium text-gray-900">{item.value}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Cost Trends */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Cost Trends (30 days)</h2>
          <div className="h-64">
            <Line data={trendChartData} options={chartOptions} />
          </div>
        </div>

        {/* Vendor Breakdown */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Cost by Vendor</h2>
          <div className="h-64 flex items-center justify-center">
            <Doughnut data={vendorChartData} options={{ responsive: true, maintainAspectRatio: false }} />
          </div>
        </div>
      </div>

      {/* Top Customers Chart */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Top Customers by Cost</h2>
        <div className="h-64">
          <Bar data={customerChartData} options={chartOptions} />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Recent Activity (24 hours)</h3>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary-600">
                {stats?.recent_activity.events_last_24h || 0}
              </div>
              <div className="text-sm text-gray-500">API Events</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                ${(stats?.recent_activity.cost_last_24h || 0).toFixed(4)}
              </div>
              <div className="text-sm text-gray-500">Cost</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {(stats?.recent_activity.tokens_last_24h || 0).toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">Tokens</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;