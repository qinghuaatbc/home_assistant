module.exports = {
  apps: [{
    name: 'home-assistant',
    script: 'dist/main.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
    },
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 5000,
    exp_backoff_restart_delay: 10000,
    max_memory_restart: '500M',
    error_file: '~/home_assistant/logs/err.log',
    out_file: '~/home_assistant/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
  }]
}
