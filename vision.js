import { foods, foodByName } from './foods.js';
import { roundHalf } from './model.js';

const prompt = '辨識相片中可能的食物。只回傳 JSON 物件 {"foods":[{"name":"辨識名稱","confidence":0.8,"match":"資料庫名稱","servings":1,"kcal":260}]}。'
  + '信心介於 0 與 1。match 請從下列名稱選擇最接近者，無對應時請留空字串。'
  + 'servings 為相對資料庫一份的估計倍數（例如 0.5、1、1.5），無資料庫對應時以 1 表示相片中看到的一份。'
  + 'kcal 為該項食物在相片中估計的熱量（大卡，整數）。資料庫名稱：'
  + foods.map(f => f.name).join('、');

export function parseRecognition(content) {
  const text = String(content ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const list = JSON.parse(text).foods;
  if (!Array.isArray(list)) throw new Error('辨識服務回傳的格式無法解析。');
  return list.slice(0, 12).map(item => {
    if (!item || typeof item !== 'object') return null;
    const match = typeof item.match === 'string' ? item.match.trim() : '';
    const detected = String(item.name ?? match).trim().slice(0, 80);
    const confidence = Math.min(1, Math.max(0, Number(item.confidence) || 0));
    const qty = roundHalf(item.servings, 1);
    const seenKcal = Math.round(Number(item.kcal));
    if (match && foodByName.has(match)) {
      return { name: match, detected, confidence, qty, custom: false };
    }
    if (detected && Number.isFinite(seenKcal) && seenKcal > 0) {
      return {
        name: detected,
        detected,
        confidence,
        qty,
        kcal: Number((Math.min(20000, Math.max(1, seenKcal)) / qty).toFixed(4)),
        custom: true
      };
    }
    return null;
  }).filter(Boolean);
}

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
          { type: 'text', text: prompt },
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
    return parseRecognition(body.choices[0].message.content);
  } catch {
    throw new Error('辨識服務回傳的格式無法解析。');
  }
}
