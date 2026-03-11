const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const prompt = `
    Jesteś analitykiem finansowym i sportowym. Dzisiaj jest 11 marca 2026.
    Przygotuj raport JSON zawierający:
    1. 5 typów bukmacherskich na dziś (mecz, typ, kurs).
    2. Aktualna cena Bitcoina (BTC) w USD.
    3. Aktualna cena akcji UEC.us oraz kurs USD/PLN.
    4. Aktualna cena srebra za uncję w USD.
    5. Oblicz aktualną wartość inwestycji w UEC: użytkownik zainwestował 1000 PLN przy cenie zakupu 19.31 USD za akcję.
    
    Format wyjściowy (TYLKO CZYSTY JSON):
    {
      "mecze": [{"mecz": "...", "typ": "...", "kurs": "..."}],
      "krypto": {"btc_usd": "..."},
      "portfel": {
        "uec_price": "...",
        "usd_pln": "...",
        "srebro_usd": "...",
        "uec_wynik_pln": "zysk/strata w PLN"
      }
    }
  `;

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
      console.log("✅ Raport wygenerowany pomyślnie.");
    }
  } catch (e) {
    console.error("❌ Błąd:", e.message);
    process.exit(1);
  }
}
run();
