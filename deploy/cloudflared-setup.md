# Cloudflare Tunnel — публичный HTTPS для приложения в VM

Туннель прокидывает входящий трафик `https://app.ВАШ-ДОМЕН` → `http://localhost:3000`
внутри VM. Открытые порты и белый IP не нужны. SSL — бесплатный, от Cloudflare.

> Требуется домен, добавленный в Cloudflare (бесплатный план). Поддомен 3-го
> уровня (`app.ВАШ-ДОМЕН`) получает SSL автоматически. Если домена нет — см. конец.

## Шаги (в VM, Ubuntu 24.04)

```bash
# 1. Установить cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# 2. Войти в аккаунт Cloudflare (откроется ссылка — выбрать ваш домен)
cloudflared tunnel login

# 3. Создать туннель
cloudflared tunnel create service-acc

# 4. Привязать поддомен (создаст DNS-запись автоматически)
cloudflared tunnel route dns service-acc app.ВАШ-ДОМЕН

# 5. Конфиг: скопировать пример и подставить TUNNEL_ID / пользователя / домен
mkdir -p ~/.cloudflared
cp deploy/cloudflared/config.yml.example ~/.cloudflared/config.yml
nano ~/.cloudflared/config.yml

# 6. Проверить вручную
cloudflared tunnel run service-acc

# 7. Автозапуск как сервис (держится сам, стартует с системой)
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

## Bitrix24

- URL приложения в настройках приложения Bitrix24 = `https://app.ВАШ-ДОМЕН`.
- В `.env`: `BITRIX_ALLOWED_DOMAIN=energyteam.bitrix24.ru` (домен портала, не приложения).

## Если своего домена нет

- Быстрый тест без домена: `cloudflared tunnel --url http://localhost:3000` выдаёт
  случайный `https://*.trycloudflare.com`. **Для Bitrix24 не годится** — адрес
  меняется при каждом запуске.
- Для постоянного адреса нужен домен в Cloudflare (можно дешёвый/бесплатный,
  затем добавить его в Cloudflare и указать их DNS-серверы).

## Важно: это ВХОДЯЩИЙ трафик

Туннель не влияет на то, с какого IP приложение делает ИСХОДЯЩИЕ запросы
(в reg.ru, Яндекс). Исходящие уходят через сеть VM = ваш домашний IP.
Если нужен другой фиксированный IP — это отдельная задача (NetBird / exit-node).
