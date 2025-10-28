/**
 * Google Apps Script для обработки заявок с сайта IKEBER
 * Простая форма с 3 полями
 */

// Конфигурация
const CONFIG = {
  // ID Google таблицы
  SHEET_ID: '1nu7y3WvIs3CCwhV8CGgcly7d7ftevYvbPuZ_iMXyNHA',
  // Название листа для заявок
  SHEET_NAME: 'Заявки',
  // Telegram Bot Token
  TELEGRAM_BOT_TOKEN: '8363402937:AAFwcvzjyYOprHzpVNycSuOKsLKo3-RfsUY',
  // Telegram Chat ID для уведомлений
  TELEGRAM_CHAT_ID: '5809311119',
  // Email для уведомлений
  NOTIFICATION_EMAIL: 'nasrurrunas@gmail.com'
};


/**
 * Основная функция для обработки заявки из формы
 */
function doPost(e) {
  try {
    const data = e.parameter;
    
    if (!validateLeadData(data)) {
      return createResponse(400, { error: 'Не все обязательные поля заполнены или их формат неверен' });
    }
    
    const leadId = saveToGoogleSheets(data);
    sendNotifications(data, leadId);
    
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
    console.error('Ошибка обработки заявки:', error.stack);
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
  const requiredFields = ['name', 'phone'];
  
  for (const field of requiredFields) {
    if (!data[field] || data[field].trim() === '') return false;
  }
  
  const phoneRegex = /^[\d\s\-\+\(\)]{7,}$/;
  if (!phoneRegex.test(data.phone)) return false;
  
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
      const headers = ['ID', 'Дата', 'Имя', 'Телефон', 'Telegram', 'Тариф', 'Источник', 'IP адрес', 'Статус'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    const leadId = 'IKEBER-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    
    const rowData = [
      leadId, new Date(), data.name, data.phone, data.telegram || '',
      data.tariff || 'Не указан', data.source || 'Сайт', data.ipAddress || '', 'Новая'
    ];
    
    sheet.appendRow(rowData);
    return leadId;
    
  } catch (error) {
    console.error('Ошибка сохранения в Google Sheets:', error.stack);
    throw new Error('Не удалось сохранить заявку');
  }
}

/**
 * Отправка уведомлений (главная функция)
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
    } else {
      console.log('Email для уведомлений не настроен. Пропускаем отправку.');
    }
    
    console.log('Отправка уведомлений завершена.');
    
  } catch (error) {
    console.error('Ошибка в процессе отправки уведомлений:', error.stack);
  }
}

/**
 * Отправка уведомления в Telegram
 */
function sendTelegramNotification(data, leadId) {
  try {
    const message = `📥 <b>Новая заявка IKEBER</b> (${leadId})\n\n` +
                    `👤 <b>Имя:</b> ${data.name}\n` +
                    `📞 <b>Телефон:</b> <code>${data.phone}</code>\n` +
                    `📱 <b>Telegram:</b> ${data.telegram || 'Не указан'}\n` +
                    `💼 <b>Тариф:</b> ${data.tariff || 'Не указан'}\n\n` +
                    `🕒 <b>Время:</b> ${new Date().toLocaleString('ru-RU')}`;

    const payload = {
      'chat_id': String(CONFIG.TELEGRAM_CHAT_ID),
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
    const response = UrlFetchApp.fetch(url, options);
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200) {
      console.log('Telegram уведомление успешно отправлено.');
    } else {
      console.error(`Ошибка отправки в Telegram. Код: ${responseCode}, Ответ: ${responseText}`);
    }
    
  } catch (error) {
    console.error('Критическая ошибка при отправке Telegram уведомления:', error.stack);
  }
}

/**
 * Отправка email уведомления
 */
function sendEmailNotification(data, leadId) {
  try {
    const subject = `Новая заявка IKEBER - ${leadId}`;
    const htmlBody = `
      <h3>Новая заявка с сайта IKEBER</h3>
      <p><b>ID заявки:</b> ${leadId}</p>
      <p><b>Имя:</b> ${data.name}</p>
      <p><b>Телефон:</b> ${data.phone}</p>
      <p><b>Telegram:</b> ${data.telegram || 'Не указан'}</p>
      <p><b>Тариф:</b> ${data.tariff || 'Не указан'}</p>
      <hr>
      <p><b>Время получения:</b> ${new Date().toLocaleString('ru-RU')}</p>
      <p>
        <a href="https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}">
          Перейти к таблице с заявками
        </a>
      </p>
    `;
    
    MailApp.sendEmail({
      to: CONFIG.NOTIFICATION_EMAIL,
      subject: subject,
      htmlBody: htmlBody
    });
    console.log('Email уведомление успешно отправлено на:', CONFIG.NOTIFICATION_EMAIL);
  } catch (error) {
    console.error('Ошибка отправки Email уведомления:', error.stack);
  }
}

/**
 * Создание HTTP ответа
 */
function createResponse(statusCode, data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  // statusCode не является методом ContentService, он устанавливается неявно при возврате из doPost/doGet.
  // Для явного контроля нужно использовать HtmlOutput, но для JSON это не требуется.
  return output;
}


// =================================================================
// ТЕСТОВЫЕ ФУНКЦИИ
// =================================================================

/**
 * НОВАЯ ФУНКЦИЯ: Тестирование отправки ВСЕХ уведомлений (Telegram + Email)
 * Эта функция не записывает данные в таблицу.
 */
function testAllNotifications() {
  console.log('=== ТЕСТИРОВАНИЕ ВСЕХ УВЕДОМЛЕНИЙ ===');

  // 1. Создаем тестовые данные, как будто пришла заявка
  const testData = {
    name: 'Тестовый Клиент (Email+TG)',
    phone: '+7 (000) 000-00-00',
    telegram: '@testuser',
    tariff: 'Комплексный тест'
  };

  // 2. Создаем тестовый ID
  const leadId = 'TEST-ALL-' + new Date().getTime();

  // 3. Вызываем главную функцию отправки уведомлений
  console.log('Вызов основной функции sendNotifications...');
  sendNotifications(testData, leadId);

  console.log('=== ТЕСТИРОВАНИЕ ЗАВЕРШЕНО ===');
  console.log('Проверьте ваш Telegram чат и почтовый ящик ' + CONFIG.NOTIFICATION_EMAIL);
}


/**
 * Тестирование только Telegram уведомлений
 */
function testTelegramNotification() {
  console.log('=== ТЕСТИРОВАНИЕ ТОЛЬКО TELEGRAM УВЕДОМЛЕНИЙ ===');
  const testData = {
    name: 'Тестовый пользователь TG',
    phone: '+7 (999) 999-99-99',
    telegram: '@testuser',
    tariff: 'Тестовый TG'
  };
  const leadId = 'TEST-TG-' + Utilities.getUuid().substring(0, 8).toUpperCase();
  sendTelegramNotification(testData, leadId);
}

/**
 * Полный тест: запись в таблицу + все уведомления
 */
function testFullLeadProcessing() {
  console.log('=== ПОЛНЫЙ ТЕСТ ОБРАБОТКИ ЗАЯВКИ ===');
  const testData = {
    name: 'Полный Тест Клиент',
    phone: '+7 (999) 888-77-66',
    telegram: '@fulltest',
    tariff: 'Начальный',
    source: 'Полный тест'
  };
  
  try {
    const leadId = saveToGoogleSheets(testData);
    console.log('✅ Заявка сохранена с ID:', leadId);
    sendNotifications(testData, leadId);
  } catch (error) {
    console.error('❌ Ошибка полной обработки заявки:', error);
  }
}