const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error("❌ Brak klucza!"); process.exit(1); }

  // Używamy wersji v1 i modelu gemini-1.5-flash (najstabilniejszy w 2026)
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    // 1. Sprawdź, gdzie jesteśmy
    const rootDir = process.cwd();
    const publicDir = path.join(rootDir, 'public');
    
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
      console.log("📁 Folder public stworzony ręcznie.");
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Dzisiaj jest 11 marca 2026. Znajdź 3 mecze piłkarskie na dziś i podaj JSON: {\"mecze\": [\"drużyna A vs B\"]}" }] }]
      })
    });

    const data = await response.json();

    if (data.candidates && data.candidates[0].content) {
      const tekst = data.candidates[0].content.parts[0].text;
      const oczyszczonyJson = tekst.replace(/```json|```/g, "").trim();
      
      // 2. Zapisz bezpośrednio
      const finalPath = path.join(publicDir, 'raport.json');
      fs.writeFileSync(finalPath, oczyszczonyJson);
      
      console.log(`✅ SUKCES! Plik zapisany w: ${finalPath}`);
    } else {
      console.error("❌ Google nie wysłało meczów. Odpowiedź:", JSON.stringify(data));
      process.exit(1);
    }
  } catch (e) {
    console.error("❌ Krytyczny błąd:", e.message);
    process.exit(1);
  }
}
run();
