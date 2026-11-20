import { foods, foodByName } from './foods.js';

export async function recognize(photo, settings, key) {
  if (!key || !photo) throw new Error('請先加入相片並設定金鑰。');
  const url = new URL(settings.endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('請使用 HTTPS 的 API 網址，或本機開發網址。');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') + '/chat/completions';
  let response;
  try {
    response = await fetch(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(35000),
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: 'user', content: [
          { type: 'text', text: '辨識相片中可能的食物。只回傳 JSON 物件 {"foods":[{"name":"辨識名稱","confidence":0.8,"match":"資料庫名稱"}]}。信心介於 0 與 1，match 請從下列名稱選擇，無對應時留空：' + foods.map(f => f.name).join('、') },
          { type: 'image_url', image_url: { url: photo } }
        ] }]
      })
    });
  } catch {
    throw new Error('無法連線至辨識服務。請檢查網路、API 網址及跨來源存取設定。');
  }
  if (!response.ok) {
    const messages = {401: 'API 金鑰驗證失敗。', 403: 'API 金鑰缺少存取權限。', 429: '服務達到用量上限，請檢查額度。'};
    throw new Error(messages[response.status] || '辨識服務回應錯誤（' + response.status + '）。');
  }
  try {
    const body = await response.json();
    const content = body.choices[0].message.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(content).foods.slice(0, 12).filter(item => item && foodByName.has(item.match))
      .map(item => ({ name: item.match, detected: String(item.name ?? item.match).slice(0, 80),
        confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0)) }));
  } catch {
    throw new Error('辨識服務回傳的格式無法解析。');
  }
}
