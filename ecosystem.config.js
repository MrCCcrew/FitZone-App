module.exports = {
  apps: [{
    name: 'fitzone',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: '/var/www/fitzone',
    instances: 1,
    autorestart: true,
    watch: false,
    kill_timeout: 5000,
    wait_ready: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
};
