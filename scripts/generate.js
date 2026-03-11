const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const prompt = `Jesteś profesjonalnym analitykiem sportowym. 
  Znajdź 5 najciekawszych meczów piłkarskich na dziś (${new Date().toLocaleDateString()}).
  Podaj dane w formacie JSON (tylko czysty JSON):
  {
    "mecze": [
      {
        "godzina": "18:00",
        "mecz": "Drużyna A vs Drużyna B",
        "typ": "1 (lub X lub 2)",
        "kurs": "1.85",
        "analiza": "Krótkie uzasadnienie jednym zdaniem"
      }
    ]
  }`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();
    if (data.candidates && data.candidates[0].content) {
      const tekst = data.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
      fs.writeFileSync(filePath, tekst);
      console.log("✅ Typy wygenerowane.");
    }
  } catch (e) {
    console.error("❌ Błąd:", e.message);
  }
}
run();
