declare module '@/lib/artplayer-plugin-chromecast' {
  interface ChromecastPluginOptions {
    icon?: string;
    sdk?: string;
    url?: string;
    mimeType?: string;
    onStateChange?: (state: 'connected' | 'connecting' | 'disconnected' | 'disconnecting') => void;
    onCastAvailable?: (available: boolean) => void;
    onCastStart?: () => void;
    onError?: (error: Error) => void;
  }

  interface ChromecastPlugin {
    name: 'artplayerPluginChromecast';
    getCastState: () => unknown; // <-- FIX 1: any -> unknown
    isCasting: () => boolean;
  }

  // ArtPlayer 的实例类型不确定时，用 unknown 替换 any
  function artplayerPluginChromecast(options?: ChromecastPluginOptions): (art: unknown) => Promise<ChromecastPlugin>; 
  export default artplayerPluginChromecast;
}
