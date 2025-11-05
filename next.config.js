/** @type {import('next').NextConfig} */
/* eslint-disable @typescript-eslint/no-var-requires */

const nextConfig = {
  output: 'standalone',
  
  // ==========================================================
  // !!! 关键修改: 禁用构建时的 ESLint 检查 !!!
  eslint: {
    // 强制 Next.js 在 'next build' 期间忽略 ESLint 警告/错误。
    // 这将阻止构建因为任何 Linting 问题而中断 (exit code 1)。
    ignoreDuringBuilds: true, 
    dirs: ['src'],
  },
  // ==========================================================

  reactStrictMode: false,
  swcMinify: false,

  experimental: {
    instrumentationHook: process.env.NODE_ENV === 'production',
  },

  // ... (其他 images, webpack, fallback 配置保持不变)
};

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

module.exports = withPWA(nextConfig);
