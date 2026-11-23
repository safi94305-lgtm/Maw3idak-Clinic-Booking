/** يسجل حجوزات النموذج في Google Sheets ويرسل تنبيهًا إلى مالك البوت على Telegram. */
function doPost(e) {
  const p = e && e.parameter ? e.parameter : {};
  const name = String(p.name || '').trim();
  const phone = String(p.phone || '').trim();
  const service = String(p.service || '').trim();
  const slot = String(p.slot || '').trim();
  if (!name || !phone || !service || !slot) {
    return ContentService.createTextOutput('بيانات الحجز ناقصة');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    let spreadsheetId = props.getProperty('SPREADSHEET_ID');
    let spreadsheet;
    if (spreadsheetId) {
      spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    } else {
      spreadsheet = SpreadsheetApp.create('حجوزات مركز العناية الطبي');
      props.setProperty('SPREADSHEET_ID', spreadsheet.getId());
    }
    let sheet = spreadsheet.getSheetByName('الحجوزات');
    if (!sheet) sheet = spreadsheet.getSheets()[0].setName('الحجوزات');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['وقت الاستلام', 'اسم العميل', 'رقم الهاتف', 'الخدمة', 'الموعد المطلوب', 'رابط الصفحة']);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    }
    sheet.appendRow([new Date(), name, phone, service, slot, String(p.source || '')]);
    sendTelegramBookingNotice_(props, {name, phone, service, slot});
    return ContentService.createTextOutput('تم تسجيل الحجز');
  } finally {
    lock.releaseLock();
  }
}

/** شغّلها بعد إرسال /start إلى البوت؛ تعرض Chat ID في سجل التنفيذ. */
function getTelegramChatId() {
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('أضف TELEGRAM_BOT_TOKEN إلى Script Properties أولًا.');
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates');
  const data = JSON.parse(response.getContentText());
  if (!data.ok) throw new Error('Telegram رفض الطلب. تحقق من التوكن.');
  if (!data.result.length) throw new Error('لم يصل تحديث بعد. افتح البوت في Telegram واضغط Start ثم أرسل /start، وبعدها شغّل الدالة مجددًا.');
  const update = data.result[data.result.length - 1];
  const chat = (update.message && update.message.chat) || (update.channel_post && update.channel_post.chat);
  if (!chat || !chat.id) throw new Error('لم أجد محادثة في آخر تحديث. أرسل /start للبوت ثم أعد المحاولة.');
  Logger.log('TELEGRAM_CHAT_ID=' + chat.id);
  return chat.id;
}

function sendTelegramBookingNotice_(props, booking) {
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) {
    Logger.log('لم يتم إرسال Telegram: أضف TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID في Script Properties.');
    return;
  }
  const message = [
    '📅 طلب حجز جديد',
    'الاسم: ' + booking.name,
    'الهاتف: ' + booking.phone,
    'الخدمة: ' + booking.service,
    'الوقت المطلوب: ' + booking.slot
  ].join('\n');
  try {
    const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({chat_id: chatId, text: message}),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() >= 300) Logger.log('فشل تنبيه Telegram: ' + response.getContentText());
  } catch (error) {
    Logger.log('تعذر إرسال تنبيه Telegram: ' + error);
  }
}
