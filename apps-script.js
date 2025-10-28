/**
 * Google Apps Script для обработки заявок с сайта IKEBER
 * Простая форма с 3 полями
 * 
 * ИСПРАВЛЕНИЯ:
 * 1. В функции sendTelegramNotification исправлена отправка запроса к Telegram API (добавлен contentType: 'application/json' и JSON.stringify).
 * 2. Режим разметки изменен с Markdown на HTML для большей надежности.
 * 3. Улучшена обработка ошибок в sendTelegramNotification.
 */

// Конфигурация
const CONFIG = {
  // ID Google таблицы (заменить на реальный ID)
  SHEET_ID: '1nu7y3WvIs3CCwhV8CGgcly7d7ftevYvbPuZ_iMXyNHA',
  // Название листа для заявок
  SHEET_NAME: 'Заявки',
  // Telegram Bot Token (заменить на реальный токен)
  TELEGRAM_BOT_TOKEN: '8363402937:AAFwcvzjyYOprHzpVNycSuOKsLKo3-RfsUY',
  // Telegram Chat ID для уведомлений (заменить на реальный ID)
  TELEGRAM_CHAT_ID: '5809311119',
  // Email для уведомлений
  NOTIFICATION_EMAIL: 'nasrurrunas@gmail.com'
};


/**
 * Основная функция для обработки заявки из формы
 */
function doPost(e) {
  try {
    // Получаем данные из формы (application/x-www-form-urlencoded)
    const data = e.parameter;
    
    if (!validateLeadData(data)) {
      return createResponse(400, { error: 'Не все обязательные поля заполнены или их формат неверен' });
    }
    
    const leadId = saveToGoogleSheets(data);
    sendNotifications(data, leadId);
    
    // Возвращаем HTML страницу с сообщением об успехе
    return HtmlService.createHtmlOutput(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Заявка отправлена</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f4f4f4; }
            .container { background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: inline-block; }
            .success { color: #28a745; font-size: 24px; font-weight: bold; }
            p { color: #333; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success">✅ Заявка успешно отправлена!</div>
            <p>Мы свяжемся с вами в ближайшее время.</p>
          </div>
          <script>
            setTimeout(() => { window.close(); }, 3000);
          </script>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Ошибка обработки заявки:', error);
    Logger.log('Полная ошибка: ' + error.stack);
    return createResponse(500, { error: 'Внутренняя ошибка сервера' });
  }
}

/**
 * Функция GET для тестирования
 */
function doGet(e) {
  return createResponse(200, {
    message: 'Сервис заявок IKEBER работает',
    timestamp: new Date().toISOString()
  });
}

/**
 * Валидация данных заявки
 */
function validateLeadData(data) {
  const requiredFields = ['name', 'phone', 'email'];
  
  for (const field of requiredFields) {
    if (!data[field] || data[field].trim() === '') {
      return false;
    }
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return false;
  }
  
  const phoneRegex = /^[\d\s\-\+\(\)]{7,}$/; // Сделал менее строгим, чтобы пропускать разные форматы
  if (!phoneRegex.test(data.phone)) {
    return false;
  }
  
  return true;
}

/**
 * Сохранение заявки в Google Sheets
 */
function saveToGoogleSheets(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
      const headers = ['ID', 'Дата', 'Имя', 'Телефон', 'Email', 'Тариф', 'Источник', 'IP адрес', 'Статус'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    const leadId = 'IKEBER-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    
    const rowData = [
      leadId,
      new Date(),
      data.name,
      data.phone,
      data.email,
      data.tariff || 'Не указан',
      data.source || 'Сайт',
      data.ipAddress || '',
      'Новая'
    ];
    
    sheet.appendRow(rowData);
    return leadId;
    
  } catch (error) {
    console.error('Ошибка сохранения в Google Sheets:', error);
    Logger.log('Полная ошибка сохранения: ' + error.stack);
    throw new Error('Не удалось сохранить заявку');
  }
}

/**
 * Отправка уведомлений
 */
function sendNotifications(data, leadId) {
  try {
    console.log('Начало отправки уведомлений для заявки:', leadId);
    
    const hasTelegramConfig = CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN' &&
                             CONFIG.TELEGRAM_CHAT_ID && CONFIG.TELEGRAM_CHAT_ID !== 'YOUR_TELEGRAM_CHAT_ID';
    
    if (hasTelegramConfig) {
      console.log('Отправка Telegram уведомления...');
      sendTelegramNotification(data, leadId);
    } else {
      console.log('Telegram конфигурация не настроена. Пропускаем отправку в Telegram.');
    }
    
    if (CONFIG.NOTIFICATION_EMAIL) {
      console.log('Отправка email уведомления...');
      sendEmailNotification(data, leadId);
    }
    
    console.log('Уведомления отправлены');
    
  } catch (error) {
    console.error('Ошибка отправки уведомлений:', error);
    Logger.log('Полная ошибка уведомлений: ' + error.stack);
  }
}

/**
 * Отправка уведомления в Telegram (ИСПРАВЛЕННАЯ ВЕРСИЯ)
 */
function sendTelegramNotification(data, leadId) {
  try {
    console.log('Создание сообщения для Telegram...');
    
    const message = `📥 <b>Новая заявка IKEBER</b> (${leadId})\n\n` +
                    `👤 <b>Имя:</b> ${data.name}\n` +
                    `📞 <b>Телефон:</b> <code>${data.phone}</code>\n` +
                    `📧 <b>Email:</b> ${data.email}\n` +
                    `💼 <b>Тариф:</b> ${data.tariff || 'Не указан'}\n\n` +
                    `🕒 <b>Время:</b> ${new Date().toLocaleString('ru-RU')}`;

    console.log('Сообщение создано:', message);
    
    const payload = {
      'chat_id': String(CONFIG.TELEGRAM_CHAT_ID), // Убедимся, что это строка
      'text': message,
      'parse_mode': 'HTML'
    };
    
    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };
    
    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
    console.log('Отправка запроса на URL:', url);
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    console.log(`Ответ от Telegram API. Код: ${responseCode}`);
    console.log(`Тело ответа: ${responseText}`);
    
    if (responseCode !== 200) {
      throw new Error(`Telegram API вернул ошибку: ${responseCode} - ${responseText}`);
    }
    
    console.log('Telegram уведомление успешно отправлено');
    
  } catch (error) {
    console.error('Ошибка отправки Telegram уведомления:', error);
    // Не пробрасываем ошибку дальше, чтобы не сломать весь процесс
  }
}

/**
 * Отправка email уведомления
 */
function sendEmailNotification(data, leadId) {
  try {
    const subject = `Новая заявка IKEBER - ${leadId}`;
    const body = `
      Новая заявка с сайта IKEBER:

      ID заявки: ${leadId}
      Имя: ${data.name}
      Телефон: ${data.phone}
      Email: ${data.email}
      Тариф: ${data.tariff || 'Не указан'}

      Время получения: ${new Date().toLocaleString('ru-RU')}

      Ссылка на таблицу с заявками: https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}
    `;
    
    MailApp.sendEmail(CONFIG.NOTIFICATION_EMAIL, subject, body);
    console.log('Email уведомление отправлено на:', CONFIG.NOTIFICATION_EMAIL);
  } catch (error) {
    console.error('Ошибка отправки Email уведомления:', error);
  }
}

/**
 * Создание HTTP ответа
 */
function createResponse(statusCode, data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
    // setStatusCode is not a function of TextOutput, this is handled by the server response itself.
}

// Функции для тестирования остаются без изменений.
// Просто запустите testTelegramNotification() из редактора, чтобы проверить отправку.

/**
 * Функция для тестирования
 */
function testLeadProcessing() {
  const testData = {
    name: 'Иван Иванов',
    phone: '+7 (999) 123-45-67',
    email: 'test@example.com',
    tariff: 'Начальный'
  };
  
  const result = saveToGoogleSheets(testData);
  console.log('Тестовая заявка сохранена с ID:', result);
}

/**
 * Тестирование Telegram уведомлений
 */
function testTelegramNotification() {
  console.log('=== ТЕСТИРОВАНИЕ TELEGRAM УВЕДОМЛЕНИЙ ===');
  
  const hasTelegramConfig = CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN' &&
                           CONFIG.TELEGRAM_CHAT_ID && CONFIG.TELEGRAM_CHAT_ID !== 'YOUR_TELEGRAM_CHAT_ID';
  
  if (!hasTelegramConfig) {
    console.error('❌ Telegram конфигурация не настроена!');
    console.log('TELEGRAM_BOT_TOKEN:', CONFIG.TELEGRAM_BOT_TOKEN);
    console.log('TELEGRAM_CHAT_ID:', CONFIG.TELEGRAM_CHAT_ID);
    return;
  }
  
  console.log('✅ Telegram конфигурация настроена');
  
  const testData = {
    name: 'Тестовый пользователь',
    phone: '+7 (999) 999-99-99',
    email: 'test@ikeber.ru',
    tariff: 'Тестовый'
  };
  
  const leadId = 'TEST-' + Utilities.getUuid().substring(0, 8).toUpperCase();
  
  sendTelegramNotification(testData, leadId);
}

/**
 * Полная тестовая заявка
 */
function testFullLeadProcessing() {
  console.log('=== ПОЛНЫЙ ТЕСТ ОБРАБОТКИ ЗАЯВКИ ===');
  
  const testData = {
    name: 'Тестовый клиент',
    phone: '+7 (999) 888-77-66',
    email: 'client@test.ru',
    tariff: 'Начальный',
    source: 'Тест'
  };
  
  try {
    console.log('Обработка тестовой заявки...');
    const leadId = saveToGoogleSheets(testData);
    console.log('✅ Заявка сохранена с ID:', leadId);
    
    sendNotifications(testData, leadId);
    console.log('✅ Уведомления отправлены');
    
  } catch (error) {
    console.error('❌ Ошибка обработки заявки:', error);
  }
}