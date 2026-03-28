## Автодеплой на VPS через `git push` (bare repo + post-receive hook)

Идея: вы пушите в репозиторий на сервере, хук автоматически обновляет рабочую копию, собирает проект и перезапускает сервис.

### 1) Подготовка сервера (Ubuntu/Debian)

Установите Node.js 20+ и npm, а также git.
Для `better-sqlite3` часто нужны build-зависимости (на случай сборки из исходников):

```bash
sudo apt update
sudo apt install -y git build-essential python3 make g++
node -v
npm -v
```

### 2) Создайте директории

```bash
sudo mkdir -p /opt/tgcrypto/{repo.git,app}
sudo chown -R $USER:$USER /opt/tgcrypto
```

### 3) Инициализируйте bare-репозиторий

```bash
cd /opt/tgcrypto/repo.git
git init --bare
```

### 4) Настройте systemd сервис

Скопируйте файл `deploy/tgcrypto.service` в `/etc/systemd/system/tgcrypto.service` и проверьте путь к node:

```bash
which node
```

Если `node` не `/usr/bin/node`, замените `ExecStart` в сервисе.

Запуск:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tgcrypto
```

### 5) Создайте `.env`

```bash
cd /opt/tgcrypto/app
cp env.example .env
nano .env
mkdir -p data
```

### 6) Подключите post-receive hook

Скопируйте `deploy/post-receive` в `/opt/tgcrypto/repo.git/hooks/post-receive`:

```bash
cp /opt/tgcrypto/app/deploy/post-receive /opt/tgcrypto/repo.git/hooks/post-receive
chmod +x /opt/tgcrypto/repo.git/hooks/post-receive
```

Примечание: первый раз проще скопировать файл вручную после первого пуша (или вставить его содержимое на сервер).

Если вы пушите не от `root`, то для перезапуска сервиса в `post-receive` нужно разрешить deploy-пользователю `systemctl restart tgcrypto` без пароля (через sudoers).

### 7) Логи

```bash
journalctl -u tgcrypto -f
```

