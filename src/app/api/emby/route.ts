import { NextRequest, NextResponse } from 'next/server';  
import { getAuthInfoFromCookie } from '@/lib/auth';  
import { clearConfigCache, getConfig } from '@/lib/config';  
import { db } from '@/lib/db';  
  
export const runtime = 'nodejs';  
  
// GET /api/emby - 获取所有 Emby 服务器列表  
export async function GET(request: NextRequest) {  
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';  
  if (storageType === 'localstorage') {  
    return NextResponse.json(  
      { error: '不支持本地存储进行管理员配置' },  
      { status: 400 }  
    );  
  }  
  
  const authInfo = getAuthInfoFromCookie(request);  
  if (!authInfo || !authInfo.username) {  
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });  
  }  
  
  const config = await getConfig();  
    
  // 权限检查 - 参考 src/app/api/admin/source/route.ts:48-56  
  if (authInfo.username !== process.env.USERNAME) {  
    const userEntry = config.UserConfig.Users.find(  
      (u) => u.username === authInfo.username  
    );  
    if (!userEntry || userEntry.role !== 'admin' || userEntry.banned) {  
      return NextResponse.json({ error: '权限不足' }, { status: 401 });  
    }  
  }  
  
  return NextResponse.json({ servers: config.EmbyConfig || [] });  
}  
  
// POST /api/emby - 创建或更新 Emby 服务器  
export async function POST(request: NextRequest) {  
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';  
  if (storageType === 'localstorage') {  
    return NextResponse.json(  
      { error: '不支持本地存储进行管理员配置' },  
      { status: 400 }  
    );  
  }  
  
  try {  
    const authInfo = getAuthInfoFromCookie(request);  
    if (!authInfo || !authInfo.username) {  
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });  
    }  
  
    const body = await request.json();  
    const { action, id, name, url, username, password, userAgent, order } = body;  
  
    const config = await getConfig();  
  
    // 权限检查  
    if (authInfo.username !== process.env.USERNAME) {  
      const userEntry = config.UserConfig.Users.find(  
        (u) => u.username === authInfo.username  
      );  
      if (!userEntry || userEntry.role !== 'admin' || userEntry.banned) {  
        return NextResponse.json({ error: '权限不足' }, { status: 401 });  
      }  
    }  
  
    // 确保 EmbyConfig 存在  
    if (!config.EmbyConfig) {  
      config.EmbyConfig = [];  
    }  
  
    switch (action) {  
      case 'add': {  
        // 验证必填字段 - 参考 EmbyService.validate()  
        if (!name || !url || !username) {  
          return NextResponse.json(  
            { error: '服务器名称、地址和用户名不能为空' },  
            { status: 400 }  
          );  
        }  
  
        // 检查名称是否重复  
        if (config.EmbyConfig.some((s) => s.name === name)) {  
          return NextResponse.json(  
            { error: '服务器名称已存在' },  
            { status: 400 }  
          );  
        }  
  
        // 去除 URL 末尾斜杠  
        const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;  
  
        const newServer = {  
          id: Date.now(),  
          order: config.EmbyConfig.length + 1,  
          name,  
          url: cleanUrl,  
          username,  
          password: password || '',  
          userAgent: userAgent || '',  
          disabled: false,  
          from: 'custom' as const  
        };  
  
        config.EmbyConfig.push(newServer);  
        break;  
      }  
  
      case 'edit': {  
        const server = config.EmbyConfig.find((s) => s.id === id);  
        if (!server) {  
          return NextResponse.json(  
            { error: '服务器不存在' },  
            { status: 404 }  
          );  
        }  
  
        // 不允许编辑来自配置文件的服务器  
        if (server.from === 'config') {  
          return NextResponse.json(  
            { error: '不能编辑配置文件中的服务器' },  
            { status: 400 }  
          );  
        }  
  
        // 检查名称冲突  
        const other = config.EmbyConfig.find(  
          (s) => s.name === name && s.id !== id  
        );  
        if (other) {  
          return NextResponse.json(  
            { error: '服务器名称已存在' },  
            { status: 400 }  
          );  
        }  
  
        const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;  
  
        server.name = name;  
        server.url = cleanUrl;  
        server.username = username;  
        server.password = password || '';  
        server.userAgent = userAgent || '';  
        server.order = order !== undefined ? order : server.order;  
        break;  
      }  
  
      case 'delete': {  
        const index = config.EmbyConfig.findIndex((s) => s.id === id);  
        if (index === -1) {  
          return NextResponse.json(  
            { error: '服务器不存在' },  
            { status: 404 }  
          );  
        }  
  
        const server = config.EmbyConfig[index];  
        if (server.from === 'config') {  
          return NextResponse.json(  
            { error: '不能删除配置文件中的服务器' },  
            { status: 400 }  
          );  
        }  
  
        config.EmbyConfig.splice(index, 1);  
        break;  
      }  
  
      case 'enable': {  
        const server = config.EmbyConfig.find((s) => s.id === id);  
        if (!server) {  
          return NextResponse.json(  
            { error: '服务器不存在' },  
            { status: 404 }  
          );  
        }  
        server.disabled = false;  
        break;  
      }  
  
      case 'disable': {  
        const server = config.EmbyConfig.find((s) => s.id === id);  
        if (!server) {  
          return NextResponse.json(  
            { error: '服务器不存在' },  
            { status: 404 }  
          );  
        }  
        server.disabled = true;  
        break;  
      }  
  
      case 'sort': {  
        const { servers } = body;  
        if (!Array.isArray(servers)) {  
          return NextResponse.json(  
            { error: '参数格式错误' },  
            { status: 400 }  
          );  
        }  
  
        // 更新排序  
        servers.forEach((item: { id: number; order: number }) => {  
          const server = config.EmbyConfig!.find((s) => s.id === item.id);  
          if (server) {  
            server.order = item.order;  
          }  
        });  
        break;  
      }  
  
      default:  
        return NextResponse.json(  
          { error: '不支持的操作' },  
          { status: 400 }  
        );  
    }  
  
    // 保存配置 - 参考 src/app/api/admin/source/route.ts:145-149  
    await db.saveAdminConfig(config);  
    clearConfigCache();  
  
    return NextResponse.json({ success: true });  
  } catch (error) {  
    console.error('Emby 配置操作失败:', error);  
    return NextResponse.json(  
      { error: 'Internal Server Error' },  
      { status: 500 }  
    );  
  }  
}
