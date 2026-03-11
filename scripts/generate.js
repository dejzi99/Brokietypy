const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  // 1. Starter - to widziałeś przed chwilą
  fs.writeFileSync(filePath, JSON.stringify({ status: "Inicjalizacja...", mecze: [] }));

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Podaj 5 meczów na dziś. Format JSON: {\"mecze\": [{\"godzina\":\"12:00\",\"mecz\":\"A vs B\",\"typ\":\"1\",\"kurs\":\"1.50\",\"analiza\":\"...\"}]}" }] }]
      })
    });

    const resData = await response.json();
    
    // DEBUG: To pokaże nam błąd w logach Actions
    console.log("Odpowiedź z AI:", JSON.stringify(resData));

    if (resData.candidates && resData.candidates[0].content) {
      let tekst = resData.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
      fs.writeFileSync(filePath, tekst);
      console.log("✅ Sukces! Dane zapisane.");
    } else {
      console.log("⚠️ AI zwróciło pustą odpowiedź. Sprawdź logi powyżej.");
    }
  } catch (e) {
    console.error("❌ Błąd krytyczny:", e.message);
  }
}
run();
