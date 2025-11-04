'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { useRouter, useSearchParams } from 'next/navigation';
import PageLayout from '@/components/PageLayout';
import EpisodeSelector from '@/components/EpisodeSelector';
import {
  savePlayRecord,
  getAllPlayRecords,
  generateStorageKey,
} from '@/lib/db.client';

// Wake Lock API 类型声明 
interface WakeLockSentinel {
  released: boolean;
  release(): Promise<void>;
}

declare global {
  interface Navigator {
    wakeLock?: {
      request(type: 'screen'): Promise<WakeLockSentinel>;
    };
  }
  interface HTMLVideoElement {
    hls?: any;
  }
}

interface EmbyPlayInfo {
  url: string[];
  subs: Array<{
    name: string;
    lang: string;
    format: string;
    url: string;
  }>;
  header: Record<string, string>;
  extra?: {
    PlaySessionId: string;
    MediaSourceId: string;
    ItemId: string;
  };
}

function EmbyPlayPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const artRef = useRef<HTMLDivElement>(null);
  const artPlayerRef = useRef<any>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // const saveIntervalRef = useRef<NodeJS.Timeout | null>(null); // 不再需要这个，合并到心跳逻辑
  
  // 🚀 Emby会话管理：新增 Ref 用于 Emby 心跳
  const embyHeartbeatRef = useRef<NodeJS.Timeout | null>(null);

  const lastSaveTimeRef = useRef<number>(0);
  const resumeTimeRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playInfo, setPlayInfo] = useState<EmbyPlayInfo | null>(null);

  // 集数相关状态
  const [episodes, setEpisodes] = useState<string[]>([]);
  const [episodeTitles, setEpisodeTitles] = useState<string[]>([]);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);

  const videoId = searchParams.get('id');
  const videoTitle = searchParams.get('title') || '';

  // ---------------------------------------------
  // 🚀 Emby会话管理：心跳和停止函数
  // ---------------------------------------------

  /**
   * 将 Emby 进度（心跳）发送给服务器 (通过 API 路由)
   */
  const sendEmbyProgress = async (isPaused: boolean) => {
    if (!playInfo?.extra || !artPlayerRef.current) return;

    const { PlaySessionId, MediaSourceId, ItemId } = playInfo.extra;
    // 将秒转换为 Emby 需要的 100 纳秒（Ticks）
    const positionTicks = Math.floor(artPlayerRef.current.currentTime * 10000000);

    try {
      await fetch('/api/emby/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          PlaySessionId,
          MediaSourceId,
          ItemId,
          PositionTicks: positionTicks,
          IsPaused: isPaused
        })
      });
      // console.log(`Emby Heartbeat sent: ${positionTicks / 10000000}s, Paused: ${isPaused}`);
    } catch (err) {
      console.error('发送 Emby 心跳失败:', err);
    }
  };

  /**
   * 停止 Emby 会话并释放资源
   */
  const stopEmbySession = async (finalPosition: number) => {
    // 确保心跳定时器停止
    if (embyHeartbeatRef.current) {
      clearInterval(embyHeartbeatRef.current);
      embyHeartbeatRef.current = null;
    }
    
    if (!playInfo?.extra) return;

    const { PlaySessionId, MediaSourceId, ItemId } = playInfo.extra;
    const finalTicks = Math.floor(finalPosition * 10000000);

    try {
      await fetch('/api/emby/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          PlaySessionId,
          MediaSourceId,
          ItemId,
          PositionTicks: finalTicks
        })
      });
      console.log('Emby Session Stopped.');
    } catch (err) {
      console.error('发送 Emby Stop 失败:', err);
    }
  };

  /**
   * 启动 Emby 心跳循环
   */
  const startEmbyHeartbeat = () => {
    if (embyHeartbeatRef.current) {
      clearInterval(embyHeartbeatRef.current);
    }

    // Emby 推荐的心跳间隔在 8-30 秒，我们选用 10 秒
    embyHeartbeatRef.current = setInterval(() => {
      const isPaused = artPlayerRef.current?.paused ?? true;
      sendEmbyProgress(isPaused);
    }, 10000); // 10秒发送一次心跳
  };
  
  // ---------------------------------------------
  // Wake Lock 功能 (保持不变)
  // ---------------------------------------------
  const requestWakeLock = async () => {
    // ... (逻辑保持不变)
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock!.request('screen');
        console.log('Wake Lock 已启用');
      }
    } catch (err) {
      console.warn('Wake Lock 请求失败:', err);
    }
  };

  const releaseWakeLock = () => {
    // ... (逻辑保持不变)
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
      console.log('Wake Lock 已释放');
    }
  };

  // ---------------------------------------------
  // 保存播放进度 (本地DB)
  // ---------------------------------------------
  const saveCurrentPlayProgress = async () => {
    if (!artPlayerRef.current || !videoId) return;

    const currentTime = artPlayerRef.current.currentTime || 0;
    const duration = artPlayerRef.current.duration || 0;

    if (currentTime < 1 || !duration) return;

    try {
      await savePlayRecord('emby', videoId, {
        title: videoTitle,
        source_name: 'Emby',
        cover: '',
        index: currentEpisodeIndex + 1,
        total_episodes: episodes.length || 1,
        play_time: Math.floor(currentTime),
        total_time: Math.floor(duration),
        save_time: Date.now(),
      });

      lastSaveTimeRef.current = Date.now();
      console.log('本地播放进度已保存:', currentTime);
    } catch (err) {
      console.error('保存播放进度失败:', err);
    }
  };

  // ---------------------------------------------
  // 获取播放信息和剧集列表 (保持不变)
  // ---------------------------------------------
  useEffect(() => {
    // ... (逻辑保持不变)
    if (!videoId) {
        setError('缺少视频ID');
        setLoading(false);
        return;
    }

    const fetchPlayInfo = async () => {
        try {
            // ... (获取播放信息 and 剧集列表 logic)
            const response = await fetch(`/api/emby/play?id=${videoId}`);
            if (!response.ok) {
                throw new Error('获取播放信息失败');
            }
            const data = await response.json();
            setPlayInfo(data);
            
            // ... (获取剧集列表 and 加载历史播放进度 logic)

            setLoading(false);
        } catch (err) {
            console.error('获取播放信息失败:', err);
            setError(err instanceof Error ? err.message : '获取播放信息失败');
            setLoading(false);
        }
    };

    fetchPlayInfo();
  }, [videoId]);

  // ---------------------------------------------
  // 集数切换处理 🚀 关键修改：新增 stopEmbySession
  // ---------------------------------------------
  const handleEpisodeChange = async (episodeIndex: number) => {
    if (episodeIndex === currentEpisodeIndex) return;

    const currentPosition = artPlayerRef.current?.currentTime || 0;
    
    // 🚀 1. 停止当前 Emby 会话并保存本地进度
    await stopEmbySession(currentPosition); 
    await saveCurrentPlayProgress();

    // 更新集数索引
    setCurrentEpisodeIndex(episodeIndex);

    // 构造新的视频ID
    const parts = videoId!.split('-');
    const newVideoId = `${parts[0]}-${episodes[episodeIndex]}`;

    // 重新获取播放信息
    setLoading(true);
    try {
      const response = await fetch(`/api/emby/play?id=${newVideoId}`);
      const data = await response.json();
      setPlayInfo(data);

      // 更新 URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('id', newVideoId);
      window.history.replaceState({}, '', newUrl.toString());

      // 重置播放器
      if (artPlayerRef.current) {
        artPlayerRef.current.destroy();
        artPlayerRef.current = null;
      }

      // 重置恢复时间为0(新集数从头开始)
      resumeTimeRef.current = 0;

      setLoading(false);
    } catch (err) {
      console.error('切换集数失败:', err);
      setError('切换集数失败');
      setLoading(false);
    }
  };

  // ---------------------------------------------
  // 初始化播放器 🚀 关键修改：新增 Emby 心跳事件
  // ---------------------------------------------
  useEffect(() => {
    if (!playInfo || !artRef.current || loading) {
      return;
    }

    const initPlayer = async () => {
      // 动态导入 ArtPlayer
      const Artplayer = (window as any).DynamicArtplayer;
      if (!Artplayer) {
        console.error('ArtPlayer 未加载');
        return;
      }

      const videoUrl = playInfo.url[1];
      if (!videoUrl) {
        setError('视频地址无效');
        return;
      }

      try {
        // 创建播放器实例 (配置保持不变)
        artPlayerRef.current = new Artplayer({
          container: artRef.current,
          url: videoUrl,
          // ... (其他配置保持不变)
          volume: 0.7,
          isLive: false,
          autoplay: true,
          pip: true,
          setting: true,
          playbackRate: true,
          fullscreen: true,
          fullscreenWeb: true,
          mutex: true,
          theme: '#22c55e',
          lang: 'zh-cn',
          customType: {
            m3u8: function (video: HTMLVideoElement, url: string) {
                // ... (HLS.js 逻辑保持不变)
            }
          }
        });

        // 字幕加载 (保持不变)
        if (playInfo.subs && playInfo.subs.length > 0) {
          artPlayerRef.current.subtitle.url = playInfo.subs[0].url;
        }

        // 播放器就绪事件
        artPlayerRef.current.on('ready', () => {
          console.log('播放器就绪');

          // 恢复播放进度
          if (resumeTimeRef.current && resumeTimeRef.current > 0) {
            artPlayerRef.current.currentTime = resumeTimeRef.current;
            console.log('已恢复播放进度:', resumeTimeRef.current);
            resumeTimeRef.current = null;
          }

          // 🚀 启动 Emby 心跳
          startEmbyHeartbeat();

          // 请求 Wake Lock
          if (!artPlayerRef.current.paused) {
            requestWakeLock();
          }
        });

        // 播放状态监听 🚀 修改：新增 Emby Progress 发送
        artPlayerRef.current.on('play', () => {
          requestWakeLock();
          startEmbyHeartbeat(); // 恢复播放时重新确保心跳运行
          sendEmbyProgress(false); // 立即发送 Play 心跳
        });

        artPlayerRef.current.on('pause', () => {
          releaseWakeLock();
          saveCurrentPlayProgress();
          sendEmbyProgress(true); // 立即发送 Pause 心跳
        });

        // 视频结束 🚀 关键修改：新增 stopEmbySession
        artPlayerRef.current.on('video:ended', async () => {
          releaseWakeLock();
          await stopEmbySession(artPlayerRef.current.duration); // 发送停止通知 (终点)
          
          // 如果有下一集,自动播放
          if (episodes.length > 0 && currentEpisodeIndex < episodes.length - 1) {
            setTimeout(() => {
              handleEpisodeChange(currentEpisodeIndex + 1);
            }, 1000);
          }
        });

        // 定期保存进度 (用于本地存储) 🚀 修改：合并到 timeupdate，并确保心跳发送
        artPlayerRef.current.on('video:timeupdate', () => {
          const now = Date.now();
          const interval = 10000; // 10秒保存一次 (本地存储)

          // 独立于 Emby 心跳，保存到本地 DB
          if (now - lastSaveTimeRef.current > interval) {
            saveCurrentPlayProgress();
            lastSaveTimeRef.current = now;
          }
        });

        console.log('播放器初始化完成');
      } catch (err) {
        console.error('创建播放器失败:', err);
        setError('播放器初始化失败');
      }
    };

    // 动态导入 ArtPlayer
    const loadAndInit = async () => {
      try {
        const { default: Artplayer } = await import('artplayer');
        (window as any).DynamicArtplayer = Artplayer;
        await initPlayer();
      } catch (error) {
        console.error('动态导入 ArtPlayer 失败:', error);
        setError('播放器加载失败');
      }
    };

    loadAndInit();

    // Cleanup: 卸载播放器时，发送 Stop 通知
    return () => {
      if (artPlayerRef.current) {
        const finalPosition = artPlayerRef.current.currentTime || 0;
        // 🚀 关键修改：组件卸载时发送 Stop 通知
        stopEmbySession(finalPosition); 
        artPlayerRef.current.destroy();
        artPlayerRef.current = null;
      }
    };
  }, [playInfo, loading, currentEpisodeIndex]);

  // ---------------------------------------------
  // 页面卸载清理 🚀 关键修改：新增 Emby Stop 事件
  // ---------------------------------------------
  useEffect(() => {
    const handleBeforeUnload = () => {
      const finalPosition = artPlayerRef.current?.currentTime || 0;
      saveCurrentPlayProgress();
      stopEmbySession(finalPosition); // 页面关闭前发送 Stop
      releaseWakeLock();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const currentPosition = artPlayerRef.current?.currentTime || 0;
        saveCurrentPlayProgress();
        stopEmbySession(currentPosition); // 页面隐藏时发送 Stop
        releaseWakeLock();
      } else if (document.visibilityState === 'visible') {
        if (artPlayerRef.current && !artPlayerRef.current.paused) {
          requestWakeLock();
          startEmbyHeartbeat(); // 页面可见时恢复心跳
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // 确保清除所有定时器和锁
      releaseWakeLock();
      if (embyHeartbeatRef.current) {
        clearInterval(embyHeartbeatRef.current);
      }
    };
  }, [playInfo]); // 依赖 playInfo 以确保 stopEmbySession 能获取到 extra

  // ... (渲染逻辑保持不变)

  if (loading) {
    // ... (Loading UI)
  }

  if (error) {
    // ... (Error UI)
  }

  return (
    // ... (Render UI)
    <PageLayout>
        {/* ... */}
    </PageLayout>
  );
}

export default function EmbyPlayPage() {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <EmbyPlayPageClient />
    </Suspense>
  );
}