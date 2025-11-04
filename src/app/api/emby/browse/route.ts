import { NextRequest, NextResponse } from 'next/server';  
import { getAuthInfoFromCookie } from '@/lib/auth';  
import { getConfig } from '@/lib/config';  
import { EmbyClient } from '@/lib/emby-client';  
  
export const runtime = 'nodejs';  
  
export async function GET(request: NextRequest) {  
  // 认证检查 - 参考 src/app/api/search/ws/route.ts:13-16  
  const authInfo = getAuthInfoFromCookie(request);  
  if (!authInfo || !authInfo.username) {  
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });  
  }  
  
  const { searchParams } = new URL(request.url);  
  const ids = searchParams.get('ids');  
  const wd = searchParams.get('wd');  
  const t = searchParams.get('t');  
  const sort = searchParams.get('sort');  
  const pg = parseInt(searchParams.get('pg') || '1');  
  const serverKey = searchParams.get('server'); // 可选:指定服务器  
  
  try {  
    const config = await getConfig();  
    const embyServers = (config.EmbyConfig || []).filter(s => !s.disabled);  
      
    if (embyServers.length === 0) {  
      return NextResponse.json({ error: '没有可用的 Emby 服务器' }, { status: 400 });  
    }  
  
    // 选择服务器:如果指定了 serverKey 则使用指定的,否则使用第一个  
    const targetServer = serverKey   
      ? embyServers.find(s => s.id.toString() === serverKey)  
      : embyServers[0];  
  
    if (!targetServer) {  
      return NextResponse.json({ error: '未找到指定的 Emby 服务器' }, { status: 404 });  
    }  
  
    const client = new EmbyClient(targetServer);  
      
    // 首次使用需要认证  
    await client.authenticate();  
  
    // 根据参数判断操作类型 - 参考 EmbyController.browse() 的逻辑  
    if (ids === 'recommend') {  
      // 首页推荐内容  
      const result = await client.getHomeContent();  
      return NextResponse.json(result);  
    } else if (ids) {  
      // 获取详情  
      const result = await client.getItemDetail(ids);  
      return NextResponse.json(result);  
    } else if (wd) {  
      // 搜索  
      const quick = searchParams.get('quick') === 'true';  
      const result = await client.search(wd, quick);  
      return NextResponse.json(result);  
    } else if (t === '0') {  
      // 首页内容  
      const result = await client.getHomeContent();  
      return NextResponse.json(result);  
    } else if (t) {  
      // 分类列表  
      const result = await client.getCategoryItems(t, pg, sort || undefined); 
      return NextResponse.json(result);  
    } else {  
      // 获取分类  
      const result = await client.getCategories();  
      return NextResponse.json(result);  
    }  
  } catch (error) {  
    console.error('Emby 浏览失败:', error);  
    return NextResponse.json(  
      { error: error instanceof Error ? error.message : 'Emby API 请求失败' },  
      { status: 500 }  
    );  
  }  
}
