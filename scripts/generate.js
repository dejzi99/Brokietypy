const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  // Ustalamy ścieżkę do folderu public o szczebel wyżej niż ten skrypt
  const publicDir = path.resolve(__dirname, '../public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Podaj 3 mecze piłkarskie na dziś w formacie JSON: {\"mecze\": []}" }] }]
      })
    });

    const data = await response.json();

    if (data.candidates && data.candidates[0].content) {
      let tekst = data.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
      fs.writeFileSync(filePath, tekst);
      console.log(`✅ PLIK STWORZONY W: ${filePath}`);
    } else {
      // JEŚLI AI ZAWIEDZIE - TWÓRZ PLIK AWARYJNY, żeby git add nie wywalił błędu
      const emergencyData = JSON.stringify({ error: "AI nie odpowiedziało", data: new Date() });
      fs.writeFileSync(filePath, emergencyData);
      console.log("⚠️ Stworzono plik awaryjny (brak danych z AI).");
    }
  } catch (e) {
    console.error("❌ Błąd:", e.message);
    process.exit(1);
  }
}
run();
