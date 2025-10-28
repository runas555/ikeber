/**
 * Google Apps Script для обработки заявок с сайта IKEBER
 * Этот скрипт сохраняет заявки в Google Sheets и отправляет уведомления
 */

// Конфигурация
const CONFIG = {
  // ID Google таблицы (заменить на реальный ID)
  SHEET_ID: 'YOUR_GOOGLE_SHEET_ID_HERE',
  // Название листа для заявок
  SHEET_NAME: 'Заявки',
  // Telegram Bot Token (опционально)
  TELEGRAM_BOT_TOKEN: 'YOUR_TELEGRAM_BOT_TOKEN',
  // Telegram Chat ID для уведомлений
  TELEGRAM_CHAT_ID: 'YOUR_TELEGRAM_CHAT_ID',
  // Email для уведомлений
  NOTIFICATION_EMAIL: 'YOUR_EMAIL@example.com'
};

/**
 * Основная функция для обработки заявки
 * @param {Object} e - объект запроса с данными формы
 * @return {Object} - результат обработки
 */
function doPost(e) {
  try {
    // Парсим данные из POST запроса
    const data = JSON.parse(e.postData.contents);
    
    // Валидация обязательных полей
    if (!validateLeadData(data)) {
      return createResponse(400, { error: 'Не все обязательные поля заполнены' });
    }
    
    // Сохраняем заявку в Google Sheets
    const leadId = saveToGoogleSheets(data);
    
    // Отправляем уведомления
    sendNotifications(data, leadId);
    
    // Возвращаем успешный ответ
    return createResponse(200, { 
      success: true, 
      message: 'Заявка успешно отправлена', 
      leadId: leadId 
    });
    
  } catch (error) {
    console.error('Ошибка обработки заявки:', error);
    return createResponse(500, { error: 'Внутренняя ошибка сервера' });
  }
}

/**
 * Функция GET для тестирования (опционально)
 */
function doGet(e) {
  return createResponse(200, { 
    message: 'Сервис заявок IKEBER работает', 
    timestamp: new Date().toISOString() 
  });
}

/**
 * Валидация данных заявки
 * @param {Object} data - данные заявки
 * @return {boolean} - результат валидации
 */
function validateLeadData(data) {
  const requiredFields = ['name', 'phone', 'email', 'tariff'];
  
  for (const field of requiredFields) {
    if (!data[field] || data[field].trim() === '') {
      return false;
    }
  }
  
  // Базовая валидация email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return false;
  }
  
  // Базовая валидация телефона (только цифры, минимум 10 символов)
  const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
  if (!phoneRegex.test(data.phone.replace(/\D/g, ''))) {
    return false;
  }
  
  return true;
}

/**
 * Сохранение заявки в Google Sheets
 * @param {Object} data - данные заявки
 * @return {string} - ID заявки
 */
function saveToGoogleSheets(data) {
  try {
    // Открываем таблицу
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    
    // Если лист не существует, создаем его
    if (!sheet) {
      sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
      // Создаем заголовки
      const headers = [
        'ID', 'Дата', 'Имя', 'Телефон', 'Email', 'Тариф', 
        'Название бизнеса', 'Тип бизнеса', 'Количество товаров', 
        'Город', 'Источник', 'Комментарий', 'Статус', 'IP адрес'
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    
    // Генерируем ID заявки
    const leadId = 'IKEBER-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    
    // Получаем данные для сохранения
    const rowData = [
      leadId,
      new Date(),
      data.name,
      data.phone,
      data.email,
      data.tariff,
      data.businessName || '',
      data.businessType || '',
      data.productCount || '',
      data.city || '',
      data.source || 'Сайт',
      data.comment || '',
      'Новая',
      data.ipAddress || ''
    ];
    
    // Добавляем строку в таблицу
    sheet.appendRow(rowData);
    
    return leadId;
    
  } catch (error) {
    console.error('Ошибка сохранения в Google Sheets:', error);
    throw new Error('Не удалось сохранить заявку');
  }
}

/**
 * Отправка уведомлений
 * @param {Object} data - данные заявки
 * @param {string} leadId - ID заявки
 */
function sendNotifications(data, leadId) {
  try {
    // Отправляем уведомление в Telegram (если настроено)
    if (CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_CHAT_ID) {
      sendTelegramNotification(data, leadId);
    }
    
    // Отправляем email уведомление (если настроено)
    if (CONFIG.NOTIFICATION_EMAIL) {
      sendEmailNotification(data, leadId);
    }
    
  } catch (error) {
    console.error('Ошибка отправки уведомлений:', error);
    // Не прерываем выполнение из-за ошибки уведомлений
  }
}

/**
 * Отправка уведомления в Telegram
 * @param {Object} data - данные заявки
 * @param {string} leadId - ID заявки
 */
function sendTelegramNotification(data, leadId) {
  const message = `📥 *Новая заявка IKEBER* (${leadId})

👤 *Имя:* ${data.name}
📞 *Телефон:* \`${data.phone}\`
📧 *Email:* ${data.email}
💼 *Тариф:* ${data.tariff}

🏢 *Бизнес:* ${data.businessName || 'Не указано'}
📍 *Город:* ${data.city || 'Не указано'}
📦 *Товаров:* ${data.productCount || 'Не указано'}

💬 *Комментарий:* ${data.comment || 'Нет комментария'}

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
 * @param {Object} data - данные заявки
 * @param {string} leadId - ID заявки
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

Название бизнеса: ${data.businessName || 'Не указано'}
Тип бизнеса: ${data.businessType || 'Не указано'}
Количество товаров: ${data.productCount || 'Не указано'}
Город: ${data.city || 'Не указано'}

Комментарий: ${data.comment || 'Нет комментария'}

Время получения: ${new Date().toLocaleString('ru-RU')}

Ссылка на таблицу с заявками: https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}
  `;
  
  MailApp.sendEmail(CONFIG.NOTIFICATION_EMAIL, subject, body);
}

/**
 * Создание HTTP ответа
 * @param {number} statusCode - код статуса
 * @param {Object} data - данные ответа
 * @return {Object} - объект ответа
 */
function createResponse(statusCode, data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setStatusCode(statusCode);
}

/**
 * Функция для тестирования скрипта локально
 */
function testLeadProcessing() {
  const testData = {
    name: 'Иван Иванов',
    phone: '+7 (999) 123-45-67',
    email: 'test@example.com',
    tariff: 'Начальный',
    businessName: 'Тестовый магазин',
    businessType: 'Розничная торговля',
    productCount: '50',
    city: 'Москва',
    source: 'Тест',
    comment: 'Тестовая заявка'
  };
  
  const result = saveToGoogleSheets(testData);
  console.log('Тестовая заявка сохранена с ID:', result);
}