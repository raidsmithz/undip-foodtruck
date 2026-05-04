module.exports = {
  apps: [
    {
      name: 'ufood-bot',
      script: './scripts/start.sh',
      interpreter: 'bash',
      cwd: '/home/ubuntu/undip-foodtruck',
      autorestart: true,
      max_restarts: 5,
      restart_delay: 3000,
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production', TZ: 'Asia/Jakarta' },
    },
  ],
};
