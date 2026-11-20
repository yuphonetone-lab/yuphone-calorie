const db = new Promise((resolve, reject) => {
  const request = indexedDB.open('yufeng-calorie', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('meals', { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function transaction(mode, operation) {
  const database = await db;
  return new Promise((resolve, reject) => {
    const tx = database.transaction('meals', mode);
    const request = operation(tx.objectStore('meals'));
    tx.oncomplete = () => resolve(request?.result);
    tx.onabort = () => reject(tx.error);
  });
}
export const listMeals = () => transaction('readonly', store => store.getAll());
export const putMeal = meal => transaction('readwrite', store => store.put(meal));
export const removeMeal = id => transaction('readwrite', store => store.delete(id));
export const replaceMeals = meals => transaction('readwrite', store => {
  store.clear();
  for (const meal of meals) store.put(meal);
});

export async function compressPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 800 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } finally {
    URL.revokeObjectURL(url);
  }
}
