# Деплой фронтенда через FTP

Да, можно отправлять файлы фронтенда через FTP. Вот инструкция по деплою:

## Файлы для деплоя

Следующие файлы нужно загрузить на хостинг через FTP:

```
frontend/
├── .htaccess              # Конфигурация Apache для SPA роутинга
├── index.html             # Главный файл приложения
├── config.js              # Конфигурация API
├── manifest.json          # PWA манифест
├── sw.js                  # Service Worker
├── privacy-policy.html    # Политика конфиденциальности
├── robots.txt             # SEO конфигурация
├── 404.html              # Страница 404
├── icons/                 # Иконки для PWA
│   ├── icon-192x192.png
│   ├── icon-512x512.png
│   └── ...
├── admin/                 # Админ панель (если нужна)
└── courier/               # Приложение курьера (если нужно)
```

## Инструкция по FTP деплою

### 1. Подготовка FTP клиента
- Используйте любой FTP клиент (FileZilla, WinSCP, Cyberduck и т.д.)
- Настройте подключение:
  - Хост: ваш домен (например, ftp.ggli.ru)
  - Порт: 21 (стандартный FTP) или 22 (SFTP)
  - Логин и пароль от хостинга

### 2. Загрузка файлов
1. Подключитесь к хостингу через FTP
2. Перейдите в папку `/demo/` (или создайте ее, если не существует)
3. Загрузите все файлы из папки `frontend` в папку `/demo/` на сервере
4. Убедитесь, что структура файлов сохранилась

### 3. Проверка прав доступа
После загрузки проверьте права доступа:
- `.htaccess` должен иметь права 644
- Все HTML/CSS/JS файлы - 644
- Папки - 755

### 4. Автоматизация деплоя (опционально)

#### Скрипт для автоматического деплоя через FTP (Node.js)
```javascript
const ftp = require('basic-ftp');

async function deploy() {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    
    try {
        await client.access({
            host: 'ftp.ggli.ru',
            user: 'ваш_логин',
            password: 'ваш_пароль',
            secure: false // true для FTPS
        });
        
        // Загружаем все файлы из папки frontend
        await client.uploadFromDir('./frontend', '/demo/');
        console.log('Деплой завершен успешно!');
        
    } catch(err) {
        console.error('Ошибка деплоя:', err);
    }
    
    client.close();
}

deploy();
```

#### Скрипт для Windows (PowerShell)
```powershell
# Установите модуль PSFTP если не установлен
# Install-Module -Name Posh-SSH

$FTPServer = "ftp.ggli.ru"
$FTPUser = "ваш_логин"
$FTPPass = "ваш_пароль"
$LocalPath = ".\frontend\*"
$RemotePath = "/demo/"

# Загрузка через WinSCP (если установлен)
& "C:\Program Files (x86)\WinSCP\WinSCP.com" `
    /command `
    "open ftp://$FTPUser`:$FTPPass@$FTPServer/" `
    "put $LocalPath $RemotePath" `
    "exit"
```

### 5. Проверка после деплоя

После загрузки проверьте:
1. Откройте `https://ggli.ru/demo/` - должна загрузиться главная страница
2. Проверьте навигацию между страницами
3. Убедитесь, что API запросы работают
4. Проверьте обновление страниц товаров

## Важные моменты

### Структура URL
- Главная страница: `https://ggli.ru/demo/`
- Страница товара: `https://ggli.ru/demo/product/название-товара`
- Профиль: `https://ggli.ru/demo/profile`
- О магазине: `https://ggli.ru/demo/about`

### Конфигурация API
Файл `config.js` содержит настройки для подключения к бэкенду:
```javascript
const API_BASE_URL = 'https://ikeber-price.vercel.app';
```

### Поддержка SPA роутинга
Файл `.htaccess` обеспечивает корректную работу SPA роутинга в подпапке `/demo/`.

## Альтернативные способы деплоя

1. **Git + SSH** - если хостинг поддерживает Git
2. **cPanel File Manager** - через веб-интерфейс хостинга
3. **rsync** - для Linux/Mac систем
4. **CI/CD пайплайны** - автоматический деплой при коммитах

## Устранение проблем

Если после деплоя возникли проблемы:
1. Проверьте права доступа к файлам
2. Убедитесь, что все файлы загружены полностью
3. Проверьте настройки `.htaccess`
4. Убедитесь, что папка `/demo/` существует на сервере