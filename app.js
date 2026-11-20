import { foods, foodByName, categories } from './foods.js';
import { meals, blank, dateKey, target, total, makeMenu } from './model.js';
import { listMeals, putMeal, removeMeal, replaceMeals, compressPhoto } from './storage.js';
import { recognize } from './vision.js';

const $ = selector => document.querySelector(selector);
const main = $('#main');
const editor = $('#editor');
const settingsKey = 'yufeng-calorie-settings';
const visionKey = 'yufeng-calorie-vision-key';
let settings = { ...blank };
let key = '';
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(settingsKey) ?? '{}'));
  key = localStorage.getItem(visionKey) ?? '';
} catch { /* 使用預設設定 */ }
let records = [];
let storageReady = false;
let page = 'today';
let selectedDate = dateKey();
let days = 7;
let toastTimer;

const paths = {
  today: '<path d="M3 10 12 3l9 7v10H3z"/><path d="M9 20v-6h6v6"/>',
  history: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2"/>',
  menu: '<path d="M5 3v6a3 3 0 0 0 6 0V3M8 3v18m11 0V3c-3 2-4 6-4 10h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m10 3-.6 2.5-2 .9L5 5.7 3 9l1.8 1.7v2.6L3 15l2 3.3 2.4-.7 2 .9.6 2.5h4l.6-2.5 2-.9 2.4.7 2-3.3-1.8-1.7v-2.6L21 9l-2-3.3-2.4.7-2-.9L14 3z"/>',
  bowl: '<path d="M3 11h18c-.7 5-4 8-9 8s-8.3-3-9-8Zm6 10h6M6 7c1.5-1.5 3.5-1.5 5 0m2 0 4-4"/>'
};
const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const num = value => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 1 }).format(value);
const kcal = value => num(Math.round(value)) + ' 大卡';
const dateLabel = date => new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(date + 'T12:00:00'));
const pageLabels = { today: '今日', history: '紀錄', menu: '菜單', settings: '設定' };
const photoPattern = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
const macroLine = t => '蛋白質 ' + num(t.protein) + ' g · 碳水 ' + num(t.carbs) + ' g · 脂肪 ' + num(t.fat) + ' g';
const daily = date => records.filter(meal => meal.date === date);
const dailyTotal = date => total(daily(date).flatMap(meal => meal.items));
const option = (label, value = label, current) => '<option value="' + escape(value) + '"' + (String(current) === String(value) ? ' selected' : '') + '>' + escape(label) + '</option>';
const heading = (title, detail = '', button = '') => '<header class="heading"><div><h1>' + title + '</h1>' + (detail ? '<p class="muted">' + detail + '</p>' : '') + '</div>' + button + '</header>';

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  toastTimer = setTimeout(() => { $('#toast').textContent = ''; }, 4200);
}
function go(next) {
  page = next;
  render();
  window.scrollTo(0, 0);
  main.focus();
}
function render() {
  $('#brand-date').textContent = dateLabel(dateKey());
  $('#nav').innerHTML = Object.entries(pageLabels).map(([name, label]) =>
    '<button type="button" data-page="' + name + '"' + (page === name ? ' aria-current="page"' : '') + '>' + icon(name) + label + '</button>'
  ).join('');
  ({ today: renderToday, history: renderHistory, menu: renderMenu, settings: renderSettings })[page]();
}
$('#nav').addEventListener('click', event => {
  const name = event.target.closest('[data-page]')?.dataset.page;
  if (name && name !== page) go(name);
});

function mealGroups(date) {
  const entries = daily(date);
  return meals.map(meal => '<section class="card meal-group"><div class="row"><h3>' + meal +
    '</h3><button type="button" data-add="' + meal + '" aria-label="新增' + meal + '">＋ 新增</button></div>' +
    entries.filter(row => row.meal === meal).map(row => '<button type="button" class="meal-entry" data-edit="' + escape(row.id) + '">' +
      (row.photo ? '<img class="thumb" src="' + row.photo + '" alt="餐點相片">' : '<span class="thumb">' + icon('bowl') + '</span>') +
      '<span>' + row.items.map(item => escape(item.name)).join('、') + '</span><span class="entry-kcal">' + kcal(total(row.items).kcal) + '</span></button>'
    ).join('') + '</section>').join('');
}
function macroCard(t) {
  const colors = ['#945643', '#9b793f', '#687250'];
  const entries = [['蛋白質', t.protein, 4], ['碳水化合物', t.carbs, 4], ['脂肪', t.fat, 9]];
  const energy = entries.reduce((sum, [,g,factor]) => sum + g * factor, 0);
  const ratios = entries.map(([,g,factor]) => energy ? 100 * g * factor / energy : 0);
  const gradient = energy ? 'conic-gradient(' + colors[0] + ' 0% ' + ratios[0] + '%, ' + colors[1] + ' ' + ratios[0] + '% ' +
    (ratios[0] + ratios[1]) + '%, ' + colors[2] + ' ' + (ratios[0] + ratios[1]) + '% 100%)' : '#eadfcb';
  return '<section class="card"><div class="row"><h2>三大營養素</h2><small>熱量佔比</small></div><div class="macro"><div class="ring" aria-hidden="true" style="background:' +
    gradient + '"></div><div class="legend">' + entries.map(([label, g], i) => '<div class="row"><span><i class="dot" style="background:' + colors[i] +
    '"></i>' + label + '</span><span>' + num(g) + ' g · ' + Math.round(ratios[i]) + '%</span></div>').join('') + '</div></div></section>';
}
function renderToday() {
  const date = dateKey();
  const t = dailyTotal(date);
  const goal = target(settings);
  const remaining = goal.kcal - Math.round(t.kcal);
  const percentage = Math.round(100 * t.kcal / goal.kcal);
  main.innerHTML = heading('今日飲食', '記錄餐點，掌握每日攝取', '<button class="primary" data-add="">＋ 記一餐</button>') +
    '<div class="stack"><section class="card hero"><div class="row"><span>今日已攝取</span><span>' + num(percentage) + '%</span></div><strong>' +
    num(Math.round(t.kcal)) + '<span>大卡</span></strong><div class="progress" role="progressbar" aria-label="今日熱量目標進度" aria-valuenow="' +
    Math.min(100, percentage) + '"><div style="width:' + Math.min(100, percentage) + '%"></div></div><div class="row"><span>目標 ' +
    kcal(goal.kcal) + '</span><span>' + (remaining < 0 ? '超標 ' : '剩餘 ') + kcal(Math.abs(remaining)) + '</span></div></section>' +
    macroCard(t) + '<div class="row section-title"><h2>餐點紀錄</h2><small>' + daily(date).length + ' 筆</small></div>' + mealGroups(date) +
    (!goal.complete && !+settings.manual ? '<button data-page="settings">設定每日熱量目標</button>' : '') + '</div>';
}
function trend() {
  const series = Array.from({ length: days }, (_, index) => {
    const date = dateKey(index - days + 1);
    return { date, kcal: dailyTotal(date).kcal };
  });
  const goal = target(settings).kcal;
  const active = point => !settings.start || point.date >= settings.start;
  const max = Math.max(goal, ...series.map(point => point.kcal)) * 1.1;
  const x = i => 40 + i * 264 / (days - 1);
  const y = value => 111 - value / max * 93;
  const firstGoal = series.findIndex(active);
  const grid = [0, max / 2, max].map(value => '<path d="M40 ' + y(value) + 'H304" stroke="#e4dac7"/><text x="36" y="' + (y(value) + 4) + '" text-anchor="end">' +
    Math.round(value) + '</text>').join('');
  const line = series.map((p, i) => x(i) + ',' + y(p.kcal)).join(' ');
  const markers = series.map((p, i) => '<circle cx="' + x(i) + '" cy="' + y(p.kcal) + '" r="' + (days === 7 ? 3.2 : 2) +
    '" fill="#584738"><title>' + p.date + ' · ' + kcal(p.kcal) + '</title></circle>').join('');
  const goalLine = firstGoal >= 0 ? '<path d="M' + x(firstGoal) + ' ' + y(goal) + 'H304" stroke="#9b793f" stroke-width="2" stroke-dasharray="5 4"/>' : '';
  return '<svg class="chart" viewBox="0 0 316 137" role="img" aria-label="近 ' + days + ' 日每日熱量折線與目標線">' + grid + goalLine +
    '<polyline points="' + line + '" fill="none" stroke="#584738" stroke-width="2"/>' + markers +
    '<text x="40" y="132">' + series[0].date.slice(5) + '</text><text x="304" y="132" text-anchor="end">' + dateKey().slice(5) + '</text></svg>';
}
function renderHistory() {
  const goal = target(settings).kcal;
  const week = Array.from({ length: 7 }, (_, i) => dateKey(i - 6)).filter(date => daily(date).length);
  const average = week.length ? week.reduce((sum, date) => sum + dailyTotal(date).kcal, 0) / week.length : 0;
  const hits = week.filter(date => (!settings.start || date >= settings.start) && Math.abs(dailyTotal(date).kcal - goal) <= goal * .1).length;
  main.innerHTML = heading('飲食紀錄') + '<div class="stack"><section class="card"><div class="row wrap"><h2>熱量趨勢</h2><div class="buttons">' +
    [7, 30].map(n => '<button type="button" data-days="' + n + '" aria-pressed="' + (n === days) + '"' +
    (n === days ? ' class="primary"' : '') + '>' + n + ' 日</button>').join('') + '</div></div>' + trend() +
    '<div class="chart-key"><span>每日攝取（大卡）</span><span>┄ 目標 ' + kcal(goal) + '</span></div></section>' +
    '<section class="card stack"><h2>近 7 日摘要</h2><div class="metrics"><div>週平均<strong>' + (week.length ? kcal(average) : '—') +
    '</strong></div><div>達標<strong>' + hits + ' 天</strong></div><div>有紀錄<strong>' + week.length +
    ' 天</strong></div></div><p class="note">週平均只計有紀錄的日期。達標為目前目標的 ±10%，從設定的開始日期起算。</p></section>' +
    '<label>瀏覽日期<input id="history-date" type="date" value="' + selectedDate + '"></label><div class="row"><h2>當日餐點</h2><small>' +
    kcal(dailyTotal(selectedDate).kcal) + '</small></div>' + mealGroups(selectedDate) +
    '<section class="card stack"><h2>紀錄備份</h2><p class="note">備份包含餐點與相片。</p><div class="buttons">' +
    '<button data-export>匯出 JSON</button><button data-import>匯入 JSON</button></div><input id="backup" type="file" accept=".json,application/json" hidden></section></div>';
}
function renderMenu() {
  const goal = target(settings).kcal;
  const menu = makeMenu(goal, settings.seed);
  main.innerHTML = heading('每週建議菜單', '每日目標 ' + kcal(goal)) + '<div class="stack"><div class="buttons no-print">' +
    '<button class="primary" data-regenerate>一鍵重新產生</button><button data-print>列印／另存 PDF</button></div>' +
    menu.map((day, i) => {
      const t = total(day.flat());
      return '<section class="card menu-day"><header><div class="row"><h2>' + (i === 0 ? '今天' : dateLabel(dateKey(i))) +
        '</h2><strong>' + kcal(t.kcal) + '</strong></div><small>' + macroLine(t) + '</small></header>' +
        day.map((items, j) => {
          const dish = total(items);
          return '<div class="menu-meal"><div class="row"><h3>' + meals[j] + '</h3><strong>' + kcal(dish.kcal) +
            '</strong></div><p>' + items.map(item => item.name + ' ' + item.qty + ' 份').join('、') + '</p><small>' + macroLine(dish) +
            '</small><button data-apply="' + i + ',' + j + '">套用' + (i === 0 ? '今日' : '') + meals[j] + '到紀錄</button></div>';
        }).join('') + '</section>';
    }).join('') + '</div>';
}
function renderSettings() {
  const s = settings;
  const fields = (name, label, type, attrs = '') => '<label>' + label + '<input type="' + type + '" name="' + name + '" value="' +
    escape(s[name]) + '" ' + attrs + '></label>';
  main.innerHTML = heading('設定') + '<form id="settings-form" class="stack"><section class="card stack"><h2>每日熱量目標</h2><div class="fields">' +
    '<label>性別<select name="sex">' + option('請選擇', '', s.sex) + option('女性', 'female', s.sex) + option('男性', 'male', s.sex) + '</select></label>' +
    fields('age', '年齡（歲）', 'number', 'min="1" max="130"') + fields('height', '身高（公分）', 'number', 'min="40" max="260" step="0.1"') +
    fields('weight', '體重（公斤）', 'number', 'min="10" max="700" step="0.1"') +
    '<label>活動量<select name="activity">' + [['靜態','1.2'],['輕度','1.375'],['中度','1.55'],['高度','1.725'],['非常活躍','1.9']].map(([text, value]) =>
      option(text, value, s.activity)).join('') + '</select></label><label>目標方向<select name="mode">' +
      option('維持', 'maintain', s.mode) + option('減重', 'loss', s.mode) + option('增重', 'gain', s.mode) + '</select></label>' +
    fields('manual', '手動目標（大卡）', 'number', 'min="1" max="20000" placeholder="留空使用計算值"') +
    fields('start', '目標開始日期', 'date') + '</div><div id="goal-preview" class="stack" aria-live="polite"></div><p class="note">開始日期用於歷史目標線與達標統計。</p></section>' +
    '<section class="card stack"><h2>AI 影像辨識</h2><p class="note">需自備 OpenAI 相容 API Key，使用會產生費用，由使用者承擔。本 App 不代收也不內建金鑰。啟動辨識時會將壓縮相片傳給你設定的服務。</p>' +
    fields('endpoint', 'API Base URL', 'url', 'required') + fields('model', '模型名稱', 'text', 'required maxlength="120"') +
    '<label>API Key<input type="password" name="apiKey" autocomplete="off" spellcheck="false"></label>' +
    '<p class="note">金鑰只儲存在此瀏覽器。清空欄位並儲存可移除金鑰。</p></section><button class="primary">儲存設定</button></form>';
  const form = $('#settings-form');
  form.elements.apiKey.value = key;
  const preview = () => {
    const g = target(Object.fromEntries(new FormData(form)));
    $('#goal-preview').innerHTML = '<div class="metrics"><div>基礎代謝 BMR<strong>' + (g.bmr === null ? '—' : kcal(g.bmr)) +
      '</strong></div><div>每日消耗 TDEE<strong>' + (g.tdee === null ? '—' : kcal(g.tdee)) + '</strong></div><div>每日目標<strong>' +
      kcal(g.kcal) + '</strong></div></div>' + (!g.complete ? '<p class="note">填寫性別、年齡、身高與體重即可計算個人目標。未設定時預設 2,000 大卡。</p>' : '') +
      (g.warning ? '<p class="note warning">每日 ' + kcal(g.minimum) + ' 為目前性別的熱量警戒值。系統會將自動減重目標限制在警戒值以上。</p>' : '');
  };
  preview();
  form.addEventListener('input', preview);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const { apiKey, ...fields } = Object.fromEntries(new FormData(form));
    try {
      const endpoint = new URL(fields.endpoint);
      if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
        (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)))) {
        toast('請輸入 HTTPS API 網址或本機開發網址，網址只需包含主機與路徑。');
        return;
      }
      if (!fields.model.trim()) { toast('請填寫模型名稱。'); return; }
      saveSettings({ ...settings, ...fields, model: fields.model.trim() });
      if (apiKey.trim()) localStorage.setItem(visionKey, apiKey.trim());
      else localStorage.removeItem(visionKey);
      key = apiKey.trim();
      toast('已儲存設定');
    } catch { toast('設定儲存失敗，請檢查網址及瀏覽器儲存空間。'); }
  });
}
function saveSettings(value) {
  localStorage.setItem(settingsKey, JSON.stringify(value));
  settings = value;
}

function openEditor(date, meal, existing, preset = []) {
  if (!storageReady) { toast('目前無法存取餐點資料，請重新載入或檢查瀏覽器設定。'); return; }
  const items = (existing?.items ?? preset).map(item => ({ ...item }));
  let photo = existing?.photo ?? '';
  let suggestions = [];
  let busy = false;
  let photoVersion = 0;
  editor.innerHTML = '<form><div class="row"><h2 id="editor-title">' + (existing ? '編輯餐點' : '記一餐') +
    '</h2><button type="button" data-close aria-label="關閉">關閉</button></div><div class="fields"><label>日期<input type="date" name="date" required value="' +
    date + '"></label><label>餐別<select name="meal">' + meals.map(m => option(m, m, meal)).join('') +
    '</select></label></div><section class="stack"><h3>餐點相片 <small>選填</small></h3><div class="buttons">' +
    '<button type="button" data-file="camera">拍照</button><button type="button" data-file="album">選擇相片</button></div>' +
    '<input id="camera" type="file" accept="image/*" capture="environment" hidden><input id="album" type="file" accept="image/*" hidden>' +
    '<div id="photo-preview" class="stack"></div><p id="editor-status" class="note" role="status"></p></section>' +
    '<section class="stack"><h3>選擇食物</h3><div class="fields"><label>搜尋食物<input id="food-search" type="search" placeholder="例如：滷肉飯"></label>' +
    '<label>分類<select id="category">' + option('所有分類', '') + categories.map(c => option(c)).join('') + '</select></label></div>' +
    '<div id="food-list" class="food-list" aria-label="食物建議清單"></div></section><section><h3>本餐食物</h3><div id="selected-items"></div></section>' +
    '<label>備註<textarea name="note" rows="2" maxlength="500">' + escape(existing?.note) + '</textarea></label>' +
    '<div class="editor-actions row"><strong id="meal-total" aria-live="polite"></strong><div class="buttons">' +
    (existing ? '<button type="button" class="danger" data-delete>刪除</button>' : '') + '<button class="primary" id="save-meal">儲存餐點</button></div></div></form>';
  const form = editor.querySelector('form');
  const status = message => { form.querySelector('#editor-status').textContent = message; };
  const previewPhoto = () => {
    form.querySelector('#photo-preview').innerHTML = photo ? '<img class="editor-photo" src="' + photo + '" alt="餐點相片預覽">' +
      '<div class="buttons"><button type="button" data-clear-photo>移除相片</button>' +
      (key ? '<button type="button" data-ai>AI 辨識</button>' : '') + '</div>' : '';
  };
  const showFoods = () => {
    const q = form.querySelector('#food-search').value.trim().toLowerCase();
    const category = form.querySelector('#category').value;
    const matches = foods.filter(f => (!category || f.category === category) && (f.name + ' ' + f.aliases).toLowerCase().includes(q));
    const ranked = [...new Set([...suggestions.map(s => foodByName.get(s.name)).filter(f => matches.includes(f)), ...matches])];
    form.querySelector('#food-list').innerHTML = ranked.map(f => {
      const suggestion = suggestions.find(s => s.name === f.name);
      return '<button type="button" data-food="' + escape(f.name) + '"><span>' + f.name +
        '<small>' + f.portion + ' · ' + kcal(f.kcal) + '</small>' +
        (suggestion ? '<small>AI 建議：' + escape(suggestion.detected) + '（' + Math.round(suggestion.confidence * 100) + '%）</small>' : '') +
        '</span><span aria-hidden="true">＋</span></button>';
    }).join('') || '<p class="empty">找不到符合條件的食物。</p>';
  };
  const updateTotal = () => { form.querySelector('#meal-total').textContent = kcal(total(items).kcal); };
  const showItems = () => {
    form.querySelector('#selected-items').innerHTML = items.map((item, i) => {
      const f = foodByName.get(item.name);
      const presets = [0.5, 1, 1.5, 2];
      const custom = !presets.includes(item.qty);
      return '<div class="selected-item"><span>' + f.name + '<small>' + f.portion + '</small></span>' +
        '<label>份量<select data-portion="' + i + '" aria-label="' + f.name + '份量">' +
        presets.map(p => option(p + ' 份', p, item.qty)).join('') + option('自訂', 'custom', custom ? 'custom' : item.qty) +
        '</select></label><button type="button" data-remove="' + i + '" aria-label="移除' + f.name + '">移除</button>' +
        '<label class="custom-portion"' + (custom ? '' : ' hidden') + '>自訂份數<input type="number" min="0.000001" max="20000" step="any" required' +
        (custom ? '' : ' disabled') + ' data-qty="' + i + '" value="' + item.qty + '"></label></div>';
    }).join('') || '<p class="note">請從清單加入至少一項食物。</p>';
    updateTotal();
  };
  const isOpen = () => editor.open && editor.contains(form);
  const setBusy = value => {
    busy = value;
    form.querySelector('#save-meal').disabled = value;
    const ai = form.querySelector('[data-ai]');
    if (ai) ai.disabled = value;
    const deletion = form.querySelector('[data-delete]');
    if (deletion) deletion.disabled = value;
  };
  previewPhoto();
  showFoods();
  showItems();
  form.addEventListener('input', event => {
    const field = event.target;
    if (field.id === 'food-search' || field.id === 'category') showFoods();
    if (field.matches('[data-qty]')) {
      items[Number(field.dataset.qty)].qty = field.validity.valid ? Number(field.value) : 0;
      updateTotal();
    }
  });
  form.addEventListener('change', async event => {
    const field = event.target;
    if (field.matches('[data-portion]')) {
      const i = Number(field.dataset.portion);
      const input = form.querySelector('[data-qty="' + i + '"]');
      const custom = field.value === 'custom';
      input.disabled = !custom;
      input.parentElement.hidden = !custom;
      if (custom) input.focus();
      else input.value = field.value;
      items[i].qty = Number(input.value);
      updateTotal();
    }
    if (field.type !== 'file' || !field.files[0]) return;
    const file = field.files[0];
    field.value = '';
    const version = ++photoVersion;
    setBusy(true);
    status('正在壓縮相片…');
    try {
      const compressed = await compressPhoto(file);
      if (!isOpen() || version !== photoVersion) return;
      photo = compressed;
      suggestions = [];
      showFoods();
      previewPhoto();
      status('相片已加入。');
    } catch {
      if (isOpen() && version === photoVersion) status('無法讀取這張相片，請改選瀏覽器支援的圖片。');
    } finally {
      if (isOpen() && version === photoVersion) setBusy(false);
    }
  });
  form.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    const d = button.dataset;
    if ('close' in d) editor.close();
    if (d.file) form.querySelector('#' + d.file).click();
    if ('clearPhoto' in d) {
      photoVersion++;
      photo = '';
      suggestions = [];
      showFoods();
      previewPhoto();
      status('');
      setBusy(false);
    }
    if (d.food) {
      const found = items.find(i => i.name === d.food);
      if (found) found.qty = Math.min(20000, Number((found.qty + 1).toPrecision(10)));
      else items.push({ name: d.food, qty: 1 });
      showItems();
      status('已加入' + d.food);
    }
    if ('remove' in d) {
      items.splice(Number(d.remove), 1);
      showItems();
    }
    if ('ai' in d && !busy) {
      const version = photoVersion;
      setBusy(true);
      status('正在辨識相片…');
      try {
        const results = await recognize(photo, settings, key);
        if (!isOpen() || version !== photoVersion) return;
        suggestions = results;
        form.querySelector('#food-search').value = '';
        form.querySelector('#category').value = '';
        showFoods();
        status(results.length ? 'AI 建議已排在食物清單上方，請點選確認。' : '沒有找到可對應的食物，可以手動搜尋。');
      } catch (error) {
        if (isOpen() && version === photoVersion) status(error.message + ' 你仍可手動搜尋食物。');
      } finally {
        if (isOpen() && version === photoVersion) setBusy(false);
      }
    }
    if ('delete' in d && !busy && confirm('確定刪除這筆餐點？')) {
      setBusy(true);
      try {
        await removeMeal(existing.id);
        records = records.filter(m => m.id !== existing.id);
        if (isOpen()) editor.close();
        render();
        toast('已刪除餐點');
      } catch { toast('刪除失敗，請再試一次。'); }
      finally { setBusy(false); }
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    if (!items.length || items.some(item => !(item.qty > 0))) { toast('請加入食物並填寫有效份量。'); return; }
    const values = new FormData(form);
    const mealRecord = {
      id: existing?.id ?? (globalThis.crypto?.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('-')),
      date: values.get('date'), meal: values.get('meal'), note: values.get('note').trim(), photo,
      items: items.map(item => ({ ...item }))
    };
    if (!validDate(mealRecord.date)) { toast('請輸入有效日期。'); return; }
    setBusy(true);
    try {
      await putMeal(mealRecord);
      records = [...records.filter(m => m.id !== mealRecord.id), mealRecord];
      if (isOpen()) editor.close();
      if (page === 'history') selectedDate = mealRecord.date;
      render();
      toast('已儲存餐點');
    } catch { toast('餐點儲存失敗，請檢查瀏覽器儲存空間。'); }
    finally { setBusy(false); }
  });
  editor.showModal();
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
function backupRows(value) {
  if (value?.version !== 1 || !Array.isArray(value.meals)) throw new Error();
  const ids = new Set();
  return value.meals.map(row => {
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) || !validDate(row.date) ||
      !meals.includes(row.meal) || typeof row.note !== 'string' || row.note.length > 500 ||
      typeof row.photo !== 'string' || (row.photo && !photoPattern.test(row.photo)) ||
      !Array.isArray(row.items) || !row.items.length || !row.items.every(item => item && foodByName.has(item.name) &&
        Number.isFinite(item.qty) && item.qty > 0 && item.qty <= 20000)) throw new Error();
    ids.add(row.id);
    return { id: row.id, date: row.date, meal: row.meal, note: row.note, photo: row.photo,
      items: row.items.map(({name, qty}) => ({name, qty})) };
  });
}
function exportBackup() {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, meals: records })], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'calorie-backup-' + dateKey() + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function currentMeal() {
  const hour = new Date().getHours();
  return meals[hour < 10 ? 0 : hour < 14 ? 1 : hour < 17 ? 3 : 2];
}
main.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const d = button.dataset;
  if (d.page) go(d.page);
  if ('add' in d) openEditor(page === 'history' ? selectedDate : dateKey(), d.add || currentMeal());
  if (d.edit) {
    const row = records.find(record => record.id === d.edit);
    if (row) openEditor(row.date, row.meal, row);
  }
  if (d.days) { days = Number(d.days); renderHistory(); main.querySelector('[data-days="' + days + '"]').focus(); }
  if ('export' in d && storageReady) exportBackup();
  if ('import' in d && storageReady) $('#backup').click();
  if ('regenerate' in d) {
    try {
      saveSettings({ ...settings, seed: (settings.seed + 1) >>> 0 });
      renderMenu();
      main.querySelector('[data-regenerate]').focus();
      toast('已產生新菜單');
    } catch { toast('無法儲存菜單，請檢查瀏覽器儲存空間。'); }
  }
  if ('print' in d) window.print();
  if (d.apply) {
    const [day, meal] = d.apply.split(',').map(Number);
    openEditor(dateKey(day), meals[meal], null, makeMenu(target(settings).kcal, settings.seed)[day][meal]);
  }
});
main.addEventListener('change', async event => {
  const field = event.target;
  if (field.id === 'history-date' && validDate(field.value)) { selectedDate = field.value; renderHistory(); $('#history-date').focus(); }
  if (field.id !== 'backup' || !field.files[0]) return;
  const file = field.files[0];
  field.value = '';
  let rows;
  try { rows = backupRows(JSON.parse(await file.text())); }
  catch { toast('無法匯入，請選擇本 App 匯出的有效 JSON 備份。'); return; }
  if (!confirm('匯入將覆蓋所有現有餐點與相片。確定匯入 ' + rows.length + ' 筆紀錄？')) return;
  try {
    await replaceMeals(rows);
    records = rows;
    render();
    toast('已匯入備份');
  } catch { toast('匯入失敗，請檢查瀏覽器儲存空間。'); }
});
render();
listMeals().then(rows => {
  records = rows;
  storageReady = true;
  if (page !== 'settings') render();
}).catch(() => toast('無法開啟本機資料庫，請檢查瀏覽器儲存設定。'));
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => toast('離線功能初始化失敗，請重新載入。'));
}
