// pm2 запуск: pm2 start ecosystem.config.cjs
// Переменные берутся из .env (pm2 читает его через dotenv ниже) или из
// окружения systemd. Секреты в этот файл НЕ вписываем.
module.exports = {
  apps: [
    {
      name: "service-acc",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
