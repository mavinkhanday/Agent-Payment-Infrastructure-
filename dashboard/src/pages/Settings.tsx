import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  KeyIcon, 
  PlusIcon, 
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
  ClipboardDocumentIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

interface ApiKey {
  id: string;
  key_name: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

const Settings = () => {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewKeyForm, setShowNewKeyForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/auth/api-keys');
      setApiKeys(response.data.api_keys);
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const createApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) {
      toast.error('API key name is required');
      return;
    }

    try {
      const response = await axios.post('/api/auth/api-keys', {
        key_name: newKeyName.trim(),
      });
      
      toast.success('API key created successfully');
      setApiKeys(prev => [response.data.api_key, ...prev]);
      setNewKeyName('');
      setShowNewKeyForm(false);
      
      // Show the new key temporarily
      setVisibleKeys(prev => new Set(prev).add(response.data.api_key.id));
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to create API key';
      toast.error(message);
    }
  };

  const deactivateApiKey = async (keyId: string, keyName: string) => {
    if (!confirm(`Are you sure you want to deactivate the API key "${keyName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await axios.delete(`/api/auth/api-keys/${keyId}`);
      toast.success('API key deactivated successfully');
      setApiKeys(prev => prev.map(key => 
        key.id === keyId ? { ...key, is_active: false } : key
      ));
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to deactivate API key';
      toast.error(message);
    }
  };

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyId)) {
        newSet.delete(keyId);
      } else {
        newSet.add(keyId);
      }
      return newSet;
    });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const maskApiKey = (key: string) => {
    return `${key.substring(0, 8)}...${key.substring(key.length - 8)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-gray-600">Manage your account settings and API keys</p>
      </div>

      {/* Account Information */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Account Information</h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="mt-1 text-sm text-gray-900">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Company</dt>
              <dd className="mt-1 text-sm text-gray-900">{user?.company_name}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900">API Keys</h2>
              <p className="text-sm text-gray-600">Use these keys to authenticate with the AI Cost Tracker API</p>
            </div>
            <button
              onClick={() => setShowNewKeyForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create API Key
            </button>
          </div>

          {/* New API Key Form */}
          {showNewKeyForm && (
            <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <form onSubmit={createApiKey}>
                <div className="flex items-end space-x-4">
                  <div className="flex-1">
                    <label htmlFor="key-name" className="block text-sm font-medium text-gray-700">
                      API Key Name
                    </label>
                    <input
                      type="text"
                      id="key-name"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      placeholder="e.g., Production Key, Development Key"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <button
                      type="submit"
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewKeyForm(false);
                        setNewKeyName('');
                      }}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* API Keys List */}
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <KeyIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No API keys</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by creating your first API key.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className={`border rounded-lg p-4 ${
                    key.is_active ? 'border-gray-200 bg-white' : 'border-gray-300 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-medium text-gray-900">{key.key_name}</h3>
                        {!key.is_active && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                        <span>Created: {format(parseISO(key.created_at), 'MMM dd, yyyy')}</span>
                        {key.last_used_at && (
                          <span>Last used: {format(parseISO(key.last_used_at), 'MMM dd, yyyy HH:mm')}</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center space-x-2">
                        <code className="px-2 py-1 text-xs bg-gray-100 rounded font-mono">
                          {visibleKeys.has(key.id) ? key.api_key : maskApiKey(key.api_key)}
                        </code>
                        <button
                          onClick={() => toggleKeyVisibility(key.id)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {visibleKeys.has(key.id) ? (
                            <EyeSlashIcon className="h-4 w-4" />
                          ) : (
                            <EyeIcon className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => copyToClipboard(key.api_key)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <ClipboardDocumentIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {key.is_active && (
                      <button
                        onClick={() => deactivateApiKey(key.id, key.key_name)}
                        className="inline-flex items-center px-3 py-1.5 border border-red-300 text-sm font-medium rounded text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        <TrashIcon className="h-4 w-4 mr-1" />
                        Deactivate
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Integration Guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-blue-900 mb-4">Quick Integration Guide</h2>
          <div className="space-y-4 text-sm text-blue-800">
            <div>
              <h3 className="font-medium">1. Install the SDK</h3>
              <code className="block mt-1 p-2 bg-blue-100 rounded text-xs">
                npm install ai-cost-tracker-sdk
              </code>
            </div>
            <div>
              <h3 className="font-medium">2. Initialize with your API key</h3>
              <code className="block mt-1 p-2 bg-blue-100 rounded text-xs">
                {`import { CostTracker, TrackedOpenAI } from 'ai-cost-tracker-sdk';

const tracker = new CostTracker({
  apiKey: 'your-api-key-here',
  apiUrl: '${window.location.origin}',
  agentId: 'my-agent',
  customerId: 'customer-123'
});`}
              </code>
            </div>
            <div>
              <h3 className="font-medium">3. Wrap your OpenAI client</h3>
              <code className="block mt-1 p-2 bg-blue-100 rounded text-xs">
                {`const openai = new OpenAI({ apiKey: 'your-openai-key' });
const trackedOpenAI = new TrackedOpenAI(openai, tracker);

// Use it exactly like the regular OpenAI client
const completion = await trackedOpenAI.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});`}
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;