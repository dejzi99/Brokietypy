const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ BŁĄD: Brak klucza GEMINI_API_KEY!");
    process.exit(1);
  }

  // Używamy najnowszego modelu Gemini 2.0 Flash
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    // 1. GWARANTUJEMY ISTNIENIE FOLDERU
    const dir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log("📁 Stworzono folder public");
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Znajdź 5 najciekawszych meczów piłkarskich na dziś i podaj typy jako JSON. Format: {\"mecze\": [{\"mecz\": \"A vs B\", \"typ\": \"1\"}]}" }] }],
        // Wyłączamy filtry, żeby nie blokowało "hazardu/sportu"
        safetySettings: [{ category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }]
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error("❌ Błąd z Google API:", JSON.stringify(data.error, null, 2));
      process.exit(1);
    }

    if (data.candidates && data.candidates[0].content) {
      let tekst = data.candidates[0].content.parts[0].text;
      const oczyszczonyJson = tekst.replace(/```json|```/g, "").trim();
      
      // ZAPIS PLIKU
      const filePath = path.join(dir, 'raport.json');
      fs.writeFileSync(filePath, oczyszczonyJson);
      
      console.log("✅ SUKCES: Plik raport.json został zapisany w folderze public!");
      console.log("Zawartość folderu public:", fs.readdirSync(dir));
    } else {
      console.error("❌ Google nie zwróciło treści. Pełna odpowiedź:", JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (e) {
    console.error("❌ Błąd krytyczny:", e.message);
    process.exit(1);
  }
}

run();
