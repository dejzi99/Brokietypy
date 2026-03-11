const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  // Ustalamy ścieżkę absolutną do folderu głównego
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  // 1. Gwarantujemy istnienie folderu i pliku (nawet pustego)
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify({ status: "Aktualizacja...", data: new Date() }));
  console.log(`📁 Plik przygotowany w: ${filePath}`);

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Podaj 3 mecze na dziś jako JSON: {\"mecze\": []}" }] }]
      })
    });

    const data = await response.json();

    if (data.candidates && data.candidates[0].content) {
      let tekst = data.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
      fs.writeFileSync(filePath, tekst);
      console.log("✅ Dane z AI zapisane do raportu.");
    } else {
      console.log("⚠️ Brak danych z AI, zostawiam plik tymczasowy.");
    }
  } catch (e) {
    console.error("❌ Błąd:", e.message);
  }
}
run();
