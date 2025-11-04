import { NextRequest, NextResponse } from 'next/server';    
import { getAuthInfoFromCookie } from '@/lib/auth';    
import { getConfig } from '@/lib/config';    
import { EmbyClient } from '@/lib/emby-client';    
    
export const runtime = 'nodejs';    
    
export async function GET(request: NextRequest) {    
  const authInfo = getAuthInfoFromCookie(request);    
  if (!authInfo || !authInfo.username) {    
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });    
  }    
    
  const { searchParams } = new URL(request.url);    
  const serverId = parseInt(searchParams.get('server') || '0');  
  const ids = searchParams.get('ids');  
  const folder = searchParams.get('folder');    
  const t = searchParams.get('t');    
  const wd = searchParams.get('wd');  
  const sort = searchParams.get('sort');  
  const pg = parseInt(searchParams.get('pg') || '1');    
    
  try {    
    const config = await getConfig();    
    const server = config.EmbyConfig?.find(s => s.id === serverId);    
    
    if (!server) {    
      return NextResponse.json({ error: '未找到 Emby 服务器' }, { status: 404 });    
    }    
    
    const client = new EmbyClient(server);    
    await client.authenticate();    
    
    let result;    
      
    // 首页推荐  
    if (ids === 'recommend') {  
      result = await client.getHomeContent();  
      return NextResponse.json(result);  
    }  
      
    // 获取详情  
    if (ids) {  
      result = await client.getItemDetail(ids);  
      return NextResponse.json(result);  
    }  
      
    // 获取文件夹内容 (您新增的功能)  
    if (folder) {    
      result = await client.getFolderItems(folder, pg);    
      return NextResponse.json(result);  
    }  
      
    // 搜索  
    if (wd) {    
      const quick = searchParams.get('quick') === 'true';  
      result = await client.search(wd, quick);    
      return NextResponse.json(result);  
    }  
      
    // 首页内容  
    if (t === '0') {  
      result = await client.getHomeContent();  
      return NextResponse.json(result);  
    }  
      
    // 分类列表  
    if (t) {    
      result = await client.getCategoryItems(t, pg, sort || undefined);    
      return NextResponse.json(result);  
    }  
      
    // 获取分类  
    const views = await client.getViews();    
    result = {    
      class: views.map((view, index) => ({    
        type_id: `${serverId}-${index}`,    
        type_name: view.Name    
      }))    
    };    
    
    return NextResponse.json(result);    
  } catch (error) {    
    console.error('Emby API 错误:', error);    
    return NextResponse.json(    
      { error: error instanceof Error ? error.message : '请求失败' },    
      { status: 500 }    
    );    
  }    
}