# 日日飲食｜御風堂

日日飲食是手機優先的繁體中文 PWA。用內建的台灣食物資料記錄餐點、查看每日攝取與歷史趨勢，並依每日目標安排一週菜單。純 HTML、CSS 和 JavaScript，免建置。

## 功能

- 拍照或從相簿選取相片，也可以直接記錄食物。每餐支援多項食物、預設及自訂份數、備註、編輯與刪除。
- 內建 124 項台灣常見食物，可搜尋與分類篩選。相片縮至最長邊 800 像素，以 JPEG 品質 0.7 儲存。
- 今日儀表板顯示攝取、目標、剩餘或超標熱量，以及三大營養素的重量與熱量佔比。設定以 Mifflin–St Jeor 公式估算 BMR、TDEE 與目標，也能手動覆寫。
- 任選日期查閱與新增餐點，查看近 7 或 30 日熱量折線。週平均以有紀錄的日期計算，達標定義為目前目標的 ±10%，並依設定的開始日期起算。
- 依目標生成七天台灣菜單，可重新產生、將每餐帶入表單後確認儲存，或列印／另存 PDF。
- 餐點與相片存在 IndexedDB，設定存在 localStorage。JSON 備份包含餐點與相片，匯入會在確認後整批覆蓋紀錄。備份含私人飲食紀錄，請自行保管。
- 首次透過 localhost 或 HTTPS 開啟並完成 Service Worker 安裝後，核心功能可離線運作。

## 本機啟動

在專案根目錄執行：

```sh
python3 -m http.server 8000
```

用瀏覽器開啟 `http://localhost:8000/`。直接用 `file://` 開啟可能無法載入 ES modules 或啟用 Service Worker。手機跨裝置開啟時，若要使用 PWA 安裝及離線支援，請使用手機信任的 HTTPS 網址。Android 可由瀏覽器選單選擇安裝或加到主畫面；iOS 可在 Safari 的分享選單選擇「加入主畫面」。

## 靜態部署方式

- **GitHub Pages**：把網頁檔放在儲存庫根目錄，於 Pages 設定選擇對應分支和根目錄作為來源。資源使用相對路徑，可放在專案子路徑。[GitHub Pages 發佈來源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- **Vercel**：匯入專案並使用靜態網站設定，框架選擇 Other，建置指令留空，將輸出目錄設為包含 `index.html` 的目錄。[Vercel 建置設定](https://vercel.com/docs/builds/configure-a-build)
- **自家主機**：將網頁、程式、樣式、manifest 與圖示一起放在同一個靜態網站目錄，以 HTTPS 提供。Service Worker 的範圍是 `sw.js` 所在目錄，更新核心資源時請同步遞增 `sw.js` 的快取版本。

## 選用 AI 影像辨識

在設定輸入 OpenAI 相容 API Base URL、自備 API Key 與支援圖像輸入的模型。預設網址為 `https://api.openai.com/v1`，模型為 `gpt-4o-mini`。服務需允許瀏覽器跨來源呼叫 `/chat/completions`。API Key 只存在本機瀏覽器的 localStorage，專案不內建金鑰，備份也不包含金鑰。點選「AI 辨識」時，瀏覽器會把壓縮後的相片與金鑰送至所設定的服務。API 費用由使用者承擔，本 App 不代收。辨識結果需手動選取及儲存，沒有設定金鑰時使用本機搜尋。

## 資料與免責

食物值參照衛福部食品藥物管理署食品營養成分資料庫的常見食材值，以日常份量、常見食譜及烹調用油換算近似值。複合料理和便當會因配菜、用油與份量而異。數值為估算，非實驗室實測。[食藥署食品營養成分資料庫](https://www.fda.gov.tw/tc/site.aspx?sid=271)

熱量與營養素皆為估算，僅供生活記錄參考，不能取代醫療、營養師或任何處方建議。
