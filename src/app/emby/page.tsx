'use client';  
  
import { useCallback, useEffect, useState } from 'react';  
import { useRouter } from 'next/navigation';  
import { Server, Search, Play } from 'lucide-react';  
import PageLayout from '@/components/PageLayout';  
import VideoCard from '@/components/VideoCard';  
  
interface EmbyServer {  
  id: number;  
  name: string;  
  url: string;  
}  
  
interface EmbyCategory {  
  type_id: string;  
  type_name: string;  
}  
  
interface EmbyItem {  
  vod_id: string;  
  vod_name: string;  
  vod_pic?: string;  
  vod_year?: string;  
  vod_remarks?: string;
  vod_tag?: string;
}  
  
export default function EmbyPage() {  
  const router = useRouter();  
    
  // 服务器和分类状态  
  const [servers, setServers] = useState<EmbyServer[]>([]);  
  const [activeServer, setActiveServer] = useState<number | null>(null);  
  const [categories, setCategories] = useState<EmbyCategory[]>([]);  
  const [activeCategory, setActiveCategory] = useState<string>('');  
    
  // 内容和加载状态  
  const [items, setItems] = useState<EmbyItem[]>([]);  
  const [loading, setLoading] = useState(false);  
  const [page, setPage] = useState(1);  
  const [hasMore, setHasMore] = useState(true);  
    
  // 搜索状态  
  const [searchMode, setSearchMode] = useState(false);  
  const [searchQuery, setSearchQuery] = useState('');  
  // 在现有状态声明后添加  
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{id: string, name: string}>>([]);  
  // 加载服务器列表  
  useEffect(() => {  
    const loadServers = async () => {  
      try {  
        const response = await fetch('/api/emby');  
        const data = await response.json();  
        const enabledServers = data.servers?.filter((s: any) => !s.disabled) || [];  
        setServers(enabledServers);  
        if (enabledServers.length > 0) {  
          setActiveServer(enabledServers[0].id);  
        }  
      } catch (error) {  
        console.error('加载 Emby 服务器失败:', error);  
      }  
    };  
    loadServers();  
  }, []);  
  
  // 加载分类列表  
  useEffect(() => {  
    if (!activeServer) return;  
      
    const loadCategories = async () => {  
      try {  
        const response = await fetch(`/api/emby/browse?server=${activeServer}`);  
        const data = await response.json();  
        setCategories(data.class || []);  
        if (data.class && data.class.length > 0) {  
          setActiveCategory(data.class[0].type_id);  
        }  
      } catch (error) {  
        console.error('加载分类失败:', error);  
      }  
    };  
    loadCategories();  
  }, [activeServer]);  
  
  // 加载内容列表  
 const loadItems = useCallback(async (reset: boolean = false) => {  
  if (!activeServer || (!activeCategory && !searchMode)) return;  
      
  setLoading(true);  
  try {  
    const currentPage = reset ? 1 : page;  
    let url = `/api/emby/browse?server=${activeServer}&pg=${currentPage}`;  
        
    if (searchMode && searchQuery) {  
      url += `&wd=${encodeURIComponent(searchQuery)}`;  
    } else if (activeCategory) {  
      // 检查是否是文件夹ID (包含两个'-')  
      const parts = activeCategory.split('-');  
      if (parts.length > 2) {  
        // 这是文件夹ID,使用 folder 参数  
        url += `&folder=${activeCategory}`;  
      } else {  
        // 这是分类ID,使用 t 参数  
        url += `&t=${activeCategory}`;  
      }  
    }  
        
    const response = await fetch(url);  
    const data = await response.json();  
        
    if (reset) {  
      setItems(data.list || []);  
      setPage(1);  
    } else {  
      setItems(prev => [...prev, ...(data.list || [])]);  
    }  
        
    setHasMore(data.pagecount ? currentPage < data.pagecount : false);  
    if (!reset) setPage(prev => prev + 1);  
  } catch (error) {  
    console.error('加载内容失败:', error);  
  } finally {  
    setLoading(false);  
  }  
}, [activeServer, activeCategory, searchMode, searchQuery, page]);
  
// 修改现有的 useEffect  
useEffect(() => {  
  if (activeServer) {  
    setItems([]);  
    setPage(1);  
    setBreadcrumbs([]); // 添加这一行  
    loadItems(true);  
  }  
}, [activeServer, activeCategory]);
  
  // 搜索处理  
  const handleSearch = () => {  
    setSearchMode(true);  
    setItems([]);  
    setPage(1);  
    loadItems(true);  
  };  
  
  // 返回分类浏览  
const handleBackToCategories = () => {  
  setSearchMode(false);  
  setSearchQuery('');  
  setItems([]);  
  setPage(1);  
  setBreadcrumbs([]); // 添加这一行  
  loadItems(true);  
};
  
// 播放或进入文件夹  
const handlePlay = (item: EmbyItem) => {  
  if (item.vod_tag === 'folder') {  
    // 进入文件夹  
    setBreadcrumbs(prev => [...prev, { id: item.vod_id, name: item.vod_name }]);  
    setActiveCategory(item.vod_id);  
    setItems([]);  
    setPage(1);  
    setSearchMode(false);  
    loadItems(true);  
  } else {  
    // 跳转到 Emby 专用播放页面  
    router.push(`/emby/play?id=${item.vod_id}&title=${encodeURIComponent(item.vod_name)}`);  
  }  
};
// 添加 handleBreadcrumbClick 函数  
const handleBreadcrumbClick = (index: number) => {  
  const newBreadcrumbs = breadcrumbs.slice(0, index + 1);  
  setBreadcrumbs(newBreadcrumbs);  
    
  if (index === -1) {  
    setActiveCategory(categories[0]?.type_id || '');  
  } else {  
    setActiveCategory(newBreadcrumbs[index].id);  
  }  
    
  setItems([]);  
  setPage(1);  
  loadItems(true);  
};    
  return (  
    <PageLayout>  
      <div className="container mx-auto px-4 py-6">  
        {/* 头部 */}  
        <div className="mb-6">  
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">  
            <Server size={28} />  
            Emby 媒体库  
          </h1>  
        </div>  
  
        {/* 服务器选择 */}  
        {servers.length > 1 && (  
          <div className="mb-4 flex gap-2 overflow-x-auto">  
            {servers.map(server => (  
              <button  
                key={server.id}  
                onClick={() => setActiveServer(server.id)}  
                className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${  
                  activeServer === server.id  
                    ? 'bg-blue-600 text-white'  
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'  
                }`}  
              >  
                {server.name}  
              </button>  
            ))}  
          </div>  
        )}  
  
        {/* 搜索栏 */}  
        <div className="mb-4 flex gap-2">  
          <input  
            type="text"  
            value={searchQuery}  
            onChange={(e) => setSearchQuery(e.target.value)}  
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}  
            placeholder="搜索 Emby 内容..."  
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"  
          />  
          <button  
            onClick={handleSearch}  
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"  
          >  
            <Search size={20} />  
            搜索  
          </button>  
          {searchMode && (  
            <button  
              onClick={handleBackToCategories}  
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"  
            >  
              返回  
            </button>  
          )}  
        </div>  

{/* 面包屑导航 */}  
{!searchMode && breadcrumbs.length > 0 && (  
  <div className="mb-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 overflow-x-auto">  
    <button  
      onClick={() => handleBreadcrumbClick(-1)}  
      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"  
    >  
      首页  
    </button>  
    {breadcrumbs.map((crumb, index) => (  
      <div key={crumb.id} className="flex items-center gap-2">  
        <span>/</span>  
        <button  
          onClick={() => handleBreadcrumbClick(index)}  
          className={`hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap ${  
            index === breadcrumbs.length - 1 ? 'font-semibold text-gray-900 dark:text-gray-100' : ''  
          }`}  
        >  
          {crumb.name}  
        </button>  
      </div>  
    ))}  
  </div>  
)}  
        {/* 分类选择 */}  
        {!searchMode && categories.length > 0 && (  
          <div className="mb-4 flex gap-2 overflow-x-auto">  
            {categories.map(cat => (  
              <button  
                key={cat.type_id}  
                onClick={() => setActiveCategory(cat.type_id)}  
                className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${  
                  activeCategory === cat.type_id  
                    ? 'bg-green-600 text-white'  
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'  
                }`}  
              >  
                {cat.type_name}  
              </button>  
            ))}  
          </div>  
        )}  
  
        {/* 内容网格 */}  
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">  
          {items.map(item => (  
            <div  
              key={item.vod_id}  
              onClick={() => handlePlay(item)}  
              className="cursor-pointer group"  
            >  
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800">  
                {item.vod_pic ? (  
                  <img  
                    src={item.vod_pic}  
                    alt={item.vod_name}  
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"  
                  />  
                ) : (  
                  <div className="w-full h-full flex items-center justify-center">  
                    <Play size={48} className="text-gray-400" />  
                  </div>  
                )}  
                {item.vod_remarks && (  
                  <div className="absolute top-2 right-2 px-2 py-1 bg-blue-600 text-white text-xs rounded">  
                    {item.vod_remarks}  
                  </div>  
                )}  
              </div>  
              <div className="mt-2">  
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">  
                  {item.vod_name}  
                </h3>  
                {item.vod_year && (  
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">  
                    {item.vod_year}  
                  </p>  
                )}  
              </div>  
            </div>  
          ))}  
        </div>  
  
        {/* 加载更多 */}  
        {hasMore && !loading && (  
          <div className="mt-6 text-center">  
            <button  
              onClick={() => loadItems(false)}  
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"  
            >  
              加载更多  
            </button>  
          </div>  
        )}  
  
        {/* 加载状态 */}  
        {loading && (  
          <div className="mt-6 text-center text-gray-500 dark:text-gray-400">  
            加载中...  
          </div>  
        )}  
  
        {/* 空状态 */}  
        {!loading && items.length === 0 && (  
          <div className="mt-12 text-center text-gray-500 dark:text-gray-400">  
            {searchMode ? '没有找到相关内容' : '暂无内容'}  
          </div>  
        )}  
      </div>  
    </PageLayout>  
  );  
}
