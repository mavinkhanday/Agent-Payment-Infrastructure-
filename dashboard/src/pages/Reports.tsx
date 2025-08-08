import { useState } from 'react';
import axios from 'axios';
import { ArrowDownTrayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const Reports = () => {
  const [loading, setLoading] = useState(false);

  const handleExportUsage = async (format: 'csv' | 'json') => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/reports/export/usage?format=${format}`, {
        responseType: format === 'csv' ? 'blob' : 'json',
      });

      if (format === 'csv') {
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'usage-report.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success('Usage report exported successfully');
      } else {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'usage-report.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success('Usage report exported successfully');
      }
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCosts = async (groupBy: 'customer' | 'agent' | 'vendor' | 'model', format: 'csv' | 'json') => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/reports/export/costs?group_by=${groupBy}&format=${format}`, {
        responseType: format === 'csv' ? 'blob' : 'json',
      });

      if (format === 'csv') {
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cost-summary-by-${groupBy}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success('Cost report exported successfully');
      } else {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cost-summary-by-${groupBy}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success('Cost report exported successfully');
      }
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed');
    } finally {
      setLoading(false);
    }
  };

  const reportSections = [
    {
      title: 'Usage Reports',
      description: 'Export detailed usage events with timestamps, costs, and metadata',
      reports: [
        {
          name: 'Complete Usage Report',
          description: 'All usage events with full details',
          actions: [
            { label: 'Export CSV', action: () => handleExportUsage('csv') },
            { label: 'Export JSON', action: () => handleExportUsage('json') },
          ],
        },
      ],
    },
    {
      title: 'Cost Summary Reports',
      description: 'Aggregated cost data grouped by different dimensions',
      reports: [
        {
          name: 'Cost by Customer',
          description: 'Total costs aggregated by customer',
          actions: [
            { label: 'Export CSV', action: () => handleExportCosts('customer', 'csv') },
            { label: 'Export JSON', action: () => handleExportCosts('customer', 'json') },
          ],
        },
        {
          name: 'Cost by Agent',
          description: 'Total costs aggregated by AI agent',
          actions: [
            { label: 'Export CSV', action: () => handleExportCosts('agent', 'csv') },
            { label: 'Export JSON', action: () => handleExportCosts('agent', 'json') },
          ],
        },
        {
          name: 'Cost by Vendor',
          description: 'Total costs aggregated by AI vendor (OpenAI, Anthropic, etc.)',
          actions: [
            { label: 'Export CSV', action: () => handleExportCosts('vendor', 'csv') },
            { label: 'Export JSON', action: () => handleExportCosts('vendor', 'json') },
          ],
        },
        {
          name: 'Cost by Model',
          description: 'Total costs aggregated by AI model (GPT-4, Claude-3, etc.)',
          actions: [
            { label: 'Export CSV', action: () => handleExportCosts('model', 'csv') },
            { label: 'Export JSON', action: () => handleExportCosts('model', 'json') },
          ],
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="mt-2 text-gray-600">Export your usage data and cost summaries for analysis and billing</p>
      </div>

      {/* Report Sections */}
      {reportSections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-2">{section.title}</h2>
            <p className="text-sm text-gray-600 mb-6">{section.description}</p>
            
            <div className="space-y-6">
              {section.reports.map((report, reportIndex) => (
                <div key={reportIndex} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <DocumentTextIcon className="h-6 w-6 text-gray-400" />
                      </div>
                      <div className="ml-4">
                        <h3 className="text-lg font-medium text-gray-900">{report.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">{report.description}</p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {report.actions.map((action, actionIndex) => (
                        <button
                          key={actionIndex}
                          onClick={action.action}
                          disabled={loading}
                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                          {loading ? 'Exporting...' : action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Invoice Generator */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-2">Customer Invoices</h2>
          <p className="text-sm text-gray-600 mb-6">Generate monthly invoice data for specific customers</p>
          
          <div className="max-w-md">
            <div className="space-y-4">
              <div>
                <label htmlFor="customer-id" className="block text-sm font-medium text-gray-700">
                  Customer ID
                </label>
                <input
                  type="text"
                  id="customer-id"
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="Enter customer ID"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="month" className="block text-sm font-medium text-gray-700">
                    Month
                  </label>
                  <select
                    id="month"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(0, i).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label htmlFor="year" className="block text-sm font-medium text-gray-700">
                    Year
                  </label>
                  <select
                    id="year"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  >
                    <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
                    <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option>
                  </select>
                </div>
              </div>
              
              <button
                type="button"
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <DocumentTextIcon className="h-4 w-4 mr-2" />
                {loading ? 'Generating...' : 'Generate Invoice'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-blue-900 mb-2">Tips for Using Reports</h2>
          <ul className="text-sm text-blue-800 space-y-2">
            <li>• CSV files can be opened in Excel or Google Sheets for further analysis</li>
            <li>• JSON files are ideal for programmatic processing or importing into other systems</li>
            <li>• Cost summary reports show aggregated data, while usage reports show individual events</li>
            <li>• Use date filters in the Usage tab to limit report scope before exporting</li>
            <li>• Invoice data includes usage breakdown by vendor and model for transparent billing</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Reports;