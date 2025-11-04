'use client';  
  
import { useState, useEffect } from 'react';  
import { Server, Plus, Edit2, Trash2, Eye, EyeOff } from 'lucide-react';  
import { AdminConfig } from '@/lib/admin.types';  
  
interface EmbyConfigProps {  
  config: AdminConfig | null;  
  refreshConfig: () => Promise<void>;  
}  
  
export default function EmbyConfig({ config, refreshConfig }: EmbyConfigProps) {  
  const [servers, setServers] = useState<any[]>([]);  
  const [isAdding, setIsAdding] = useState(false);  
  const [editingId, setEditingId] = useState<number | null>(null);  
  const [formData, setFormData] = useState({  
    name: '',  
    url: '',  
    username: '',  
    password: '',  
    userAgent: ''  
  });  
  const [showPassword, setShowPassword] = useState(false);  
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);  
  
  useEffect(() => {  
    if (config?.EmbyConfig) {  
      setServers([...config.EmbyConfig].sort((a, b) => a.order - b.order));  
    }  
  }, [config]);  
  
  const handleSubmit = async () => {  
    try {  
      const action = editingId ? 'edit' : 'add';  
      const response = await fetch('/api/emby', {  
        method: 'POST',  
        headers: { 'Content-Type': 'application/json' },  
        body: JSON.stringify({  
          action,  
          id: editingId,  
          ...formData  
        })  
      });  
  
      if (response.ok) {  
        setMessage({ type: 'success', text: `${action === 'add' ? '添加' : '更新'}成功` });  
        setIsAdding(false);  
        setEditingId(null);  
        setFormData({ name: '', url: '', username: '', password: '', userAgent: '' });  
        await refreshConfig();  
      } else {  
        const data = await response.json();  
        setMessage({ type: 'error', text: data.error || '操作失败' });  
      }  
    } catch (error) {  
      setMessage({ type: 'error', text: '网络错误' });  
    }  
  };  
  
  const handleDelete = async (id: number) => {  
    if (!confirm('确定要删除这个 Emby 服务器吗?')) return;  
  
    try {  
      const response = await fetch('/api/emby', {  
        method: 'POST',  
        headers: { 'Content-Type': 'application/json' },  
        body: JSON.stringify({ action: 'delete', id })  
      });  
  
      if (response.ok) {  
        setMessage({ type: 'success', text: '删除成功' });  
        await refreshConfig();  
      } else {  
        const data = await response.json();  
        setMessage({ type: 'error', text: data.error || '删除失败' });  
      }  
    } catch (error) {  
      setMessage({ type: 'error', text: '网络错误' });  
    }  
  };  
  
  const handleEdit = (server: any) => {  
    setEditingId(server.id);  
    setFormData({  
      name: server.name,  
      url: server.url,  
      username: server.username,  
      password: server.password,  
      userAgent: server.userAgent || ''  
    });  
    setIsAdding(true);  
  };  
  
  const handleToggleDisable = async (id: number, disabled: boolean) => {  
    try {  
      const response = await fetch('/api/emby', {  
        method: 'POST',  
        headers: { 'Content-Type': 'application/json' },  
        body: JSON.stringify({ action: disabled ? 'disable' : 'enable', id })  
      });  
  
      if (response.ok) {  
        await refreshConfig();  
      }  
    } catch (error) {  
      setMessage({ type: 'error', text: '操作失败' });  
    }  
  };  
  
  return (  
    <div className="space-y-4">  
      {/* 消息提示 */}  
      {message && (  
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'}`}>  
          {message.text}  
        </div>  
      )}  
  
      {/* 添加按钮 */}  
      {!isAdding && (  
        <button  
          onClick={() => setIsAdding(true)}  
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"  
        >  
          <Plus size={20} />  
          添加 Emby 服务器  
        </button>  
      )}  
  
      {/* 添加/编辑表单 */}  
      {isAdding && (  
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">  
          <h3 className="text-lg font-semibold mb-4">  
            {editingId ? '编辑 Emby 服务器' : '添加 Emby 服务器'}  
          </h3>  
          <div className="space-y-4">  
            <div>  
              <label className="block text-sm font-medium mb-2">服务器名称 *</label>  
              <input  
                type="text"  
                value={formData.name}  
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}  
                placeholder="例如: 我的 Emby"  
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"  
              />  
            </div>  
            <div>  
              <label className="block text-sm font-medium mb-2">服务器地址 *</label>  
              <input  
                type="text"  
                value={formData.url}  
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}  
                placeholder="http://example.com:8096"  
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"  
              />  
            </div>  
            <div>  
              <label className="block text-sm font-medium mb-2">用户名 *</label>  
              <input  
                type="text"  
                value={formData.username}  
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}  
                placeholder="Emby 用户名"  
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"  
              />  
            </div>  
            <div>  
              <label className="block text-sm font-medium mb-2">密码</label>  
              <div className="relative">  
                <input  
                  type={showPassword ? 'text' : 'password'}  
                  value={formData.password}  
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}  
                  placeholder="Emby 密码"  
                  className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"  
                />  
                <button  
                  type="button"  
                  onClick={() => setShowPassword(!showPassword)}  
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"  
                >  
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}  
                </button>  
              </div>  
            </div>  
            <div>  
              <label className="block text-sm font-medium mb-2">User-Agent (可选)</label>  
              <input  
                type="text"  
                value={formData.userAgent}  
                onChange={(e) => setFormData({ ...formData, userAgent: e.target.value })}  
                placeholder="自定义 User-Agent"  
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"  
              />  
            </div>  
            <div className="flex gap-2">  
              <button  
                onClick={handleSubmit}  
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"  
              >  
                {editingId ? '更新' : '添加'}  
              </button>  
              <button  
                onClick={() => {  
                  setIsAdding(false);  
                  setEditingId(null);  
                  setFormData({ name: '', url: '', username: '', password: '', userAgent: '' });  
                }}  
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"  
              >  
                取消  
              </button>  
            </div>  
          </div>  
        </div>  
      )}  
  
      {/* 服务器列表 */}  
      <div className="space-y-2">  
        {servers.map((server) => (  
          <div  
            key={server.id}  
            className={`bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 ${server.disabled ? 'opacity-50' : ''}`}  
          >  
            <div className="flex items-center justify-between">  
              <div className="flex items-center gap-3">  
                <Server size={20} className="text-blue-600" />  
                <div>  
                  <div className="font-medium">{server.name}</div>  
                  <div className="text-sm text-gray-500">{server.url}</div>  
                  <div className="text-xs text-gray-400">用户: {server.username}</div>  
                </div>  
              </div>  
              <div className="flex items-center gap-2">  
                <button  
                  onClick={() => handleToggleDisable(server.id, !server.disabled)}  
                  className={`px-3 py-1 rounded text-sm ${server.disabled ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-600 hover:bg-yellow-700'} text-white transition-colors`}  
                >  
                  {server.disabled ? '启用' : '禁用'}  
                </button>  
                <button  
                  onClick={() => handleEdit(server)}  
                  className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"  
                >  
                  <Edit2 size={18} />  
                </button>  
                {server.from === 'custom' && (  
                  <button  
                    onClick={() => handleDelete(server.id)}  
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"  
                  >  
                    <Trash2 size={18} />  
                  </button>  
                )}  
              </div>  
            </div>  
          </div>  
        ))}  
      </div>  
    </div>  
  );  
}
