import { foodByName } from './foods.js';

export const meals = ['早餐', '午餐', '晚餐', '點心'];
export const nutrients = ['kcal', 'protein', 'carbs', 'fat'];
export const blank = { sex: '', age: '', height: '', weight: '', activity: '1.2', mode: 'maintain', manual: '', start: '',
  endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini', seed: 1 };
export function dateKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-');
}
export function target(s) {
  const complete = ['male', 'female'].includes(s.sex) && [s.age, s.height, s.weight].every(x => +x > 0);
  const bmr = complete ? 10 * s.weight + 6.25 * s.height - 5 * s.age + (s.sex === 'male' ? 5 : -161) : null;
  const tdee = complete ? bmr * Number(s.activity) : null;
  const minimum = s.sex === 'male' ? 1500 : 1200;
  const calculated = complete ? s.mode === 'loss' ? Math.max(minimum, tdee - 500) : tdee + (s.mode === 'gain' ? 300 : 0) : 2000;
  const kcal = Math.round(+s.manual || Math.max(1, calculated));
  return { bmr, tdee, kcal, complete, minimum,
    warning: Boolean((complete && s.mode === 'loss' && tdee - 500 < minimum && !+s.manual) || (+s.manual && s.sex && kcal < minimum)) };
}
export function roundHalf(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(20000, Math.max(0.5, Math.round(n * 2) / 2));
}
export function itemEnergy(item) {
  const food = foodByName.get(item.name);
  if (food) return food.kcal * item.qty;
  return (Number(item.kcal) || 0) * item.qty;
}
export function total(items) {
  const result = Object.fromEntries(nutrients.map(key => [key, 0]));
  for (const item of items) {
    const food = foodByName.get(item.name);
    if (food) for (const key of nutrients) result[key] += food[key] * item.qty;
    else if (Number.isFinite(Number(item.kcal))) result.kcal += Number(item.kcal) * item.qty;
  }
  return result;
}

const combinations = [
  ['蛋餅/豆漿/芭樂','饅頭/水煮蛋/低脂鮮奶','飯糰/無糖優格','吐司/荷包蛋/全脂鮮奶','菜包/豆漿/香蕉','鹹豆漿/地瓜/茶葉蛋','鮭魚壽司/豆漿/蘋果'],
  ['白飯/舒肥雞/花椰菜','雞肉飯/燙青菜/蛤蜊湯','雞腿便當/地瓜葉','牛肉麵/高麗菜','水餃/燙青菜/味噌湯','白飯/滷牛腱/番茄炒蛋','魚排便當/空心菜','韓式拌飯/味噌湯'],
  ['白飯/鯖魚/高麗菜','白飯/清蒸鱸魚/地瓜葉','白飯/豬里肌/空心菜','皮蛋瘦肉粥/豆腐/花椰菜','廣東粥/滷豆干/燙青菜','陽春麵/烤雞/滷白菜','白飯/鮭魚/番茄炒蛋','乾麵/舒肥雞/高麗菜'],
  ['無糖優格/香蕉','芭樂/堅果','蘋果/低脂鮮奶','葡萄/無糖優格','橘子/起司','奇異果/堅果','西瓜/全脂鮮奶']
];
export function makeMenu(goal, seed) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const pools = combinations.map(group => {
    const copy = [...group];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  });
  return Array.from({ length: 7 }, (_, day) => pools.map((pool, i) => {
    const names = pool[day].split('/');
    const base = total(names.map(name => ({ name, qty: 1 }))).kcal;
    const ratio = goal * [0.24, 0.32, 0.31, 0.13][i] / base;
    const qty = roundHalf(ratio);
    return names.map(name => ({ name, qty }));
  }));
}
