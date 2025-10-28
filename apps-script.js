/**
 * Google Apps Script для обработки заявок с сайта IKEBER
 * Простая форма с 3 полями
 */

// Конфигурация
const CONFIG = {
  // ID Google таблицы (заменить на реальный ID)
  SHEET_ID: '1nu7y3WvIs3CCwhV8CGgcly7d7ftevYvbPuZ_iMXyNHA',
  // Название листа для заявок
  SHEET_NAME: 'Заявки',
  // Telegram Bot Token (опционально)
  TELEGRAM_BOT_TOKEN: 'YOUR_TELEGRAM_BOT_TOKEN',
  // Telegram Chat ID для уведомлений
  TELEGRAM_CHAT_ID: 'YOUR_TELEGRAM_CHAT_ID',
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
      return createResponse(400, { error: 'Не все обязательные поля заполнены' });
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
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .success { color: green; font-size: 24px; }
          </style>
        </head>
        <body>
          <div class="success">✅ Заявка успешно отправлена!</div>
          <p>Мы свяжемся с вами в ближайшее время</p>
          <script>
            // Закрываем окно через 2 секунды
            setTimeout(() => {
              window.close();
            }, 2000);
          </script>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Ошибка обработки заявки:', error);
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
  
  const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
  if (!phoneRegex.test(data.phone.replace(/\D/g, ''))) {
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
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    
    const leadId = 'IKEBER-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    
    const rowData = [
      leadId,
      new Date(),
      data.name,
      data.phone,
      data.email,
      data.tariff || 'Начальный',
      data.source || 'Сайт',
      data.ipAddress || '',
      'Новая'
    ];
    
    sheet.appendRow(rowData);
    return leadId;
    
  } catch (error) {
    console.error('Ошибка сохранения в Google Sheets:', error);
    throw new Error('Не удалось сохранить заявку');
  }
}

/**
 * Отправка уведомлений
 */
function sendNotifications(data, leadId) {
  try {
    if (CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_CHAT_ID) {
      sendTelegramNotification(data, leadId);
    }
    
    if (CONFIG.NOTIFICATION_EMAIL) {
      sendEmailNotification(data, leadId);
    }
    
  } catch (error) {
    console.error('Ошибка отправки уведомлений:', error);
  }
}

/**
 * Отправка уведомления в Telegram
 */
function sendTelegramNotification(data, leadId) {
  const message = `📥 *Новая заявка IKEBER* (${leadId})

👤 *Имя:* ${data.name}
📞 *Телефон:* \`${data.phone}\`
📧 *Email:* ${data.email}
💼 *Тариф:* ${data.tariff}

🕒 *Время:* ${new Date().toLocaleString('ru-RU')}`;

  const payload = {
    chat_id: CONFIG.TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'Markdown'
  };
  
  const options = {
    method: 'POST',
    payload: payload
  };
  
  UrlFetchApp.fetch(
    `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
    options
  );
}

/**
 * Отправка email уведомления
 */
function sendEmailNotification(data, leadId) {
  const subject = `Новая заявка IKEBER - ${leadId}`;
  const body = `
Новая заявка с сайта IKEBER:

ID заявки: ${leadId}
Имя: ${data.name}
Телефон: ${data.phone}
Email: ${data.email}
Тариф: ${data.tariff}

Время получения: ${new Date().toLocaleString('ru-RU')}

Ссылка на таблицу с заявками: https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}
  `;
  
  MailApp.sendEmail(CONFIG.NOTIFICATION_EMAIL, subject, body);
}

/**
 * Создание HTTP ответа
 */
function createResponse(statusCode, data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setStatusCode(statusCode);
}

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