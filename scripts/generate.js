const fs = require('fs');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ BŁĄD: Brak klucza w Secrets!");
    process.exit(1);
  }

  // Używamy stabilnego adresu v1 i modelu gemini-1.5-flash (lub nowszego 2.0 jeśli dostępny)
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ 
          parts: [{ 
            text: "Znajdź 5 meczów piłkarskich na dziś (11 marca 2026) i podaj typy bukmacherskie jako JSON. Format: {\"mecze\": [{\"mecz\": \"A vs B\", \"typ\": \"1\", \"kurs\": \"1.50\"}]}. Podaj TYLKO czysty JSON." 
          }] 
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error("--- BŁĄD GOOGLE ---");
      console.error(JSON.stringify(data.error, null, 2));
      process.exit(1);
    }

    if (data.candidates && data.candidates[0].content) {
      let tekst = data.candidates[0].content.parts[0].text;
      
      // Usuwamy markdownowe ```json ... ``` jeśli AI je dodało
      const oczyszczonyJson = tekst.replace(/```json|```/g, "").trim();
      
      // Sprawdzamy czy to poprawny JSON zanim zapiszemy
      try {
        JSON.parse(oczyszczonyJson);
        if (!fs.existsSync('./public')) fs.mkdirSync('./public');
        fs.writeFileSync('./public/raport.json', oczyszczonyJson);
        console.log("✅ SUKCES! Plik public/raport.json został zapisany.");
      } catch (jsonErr) {
        console.error("❌ Otrzymany tekst nie jest poprawnym JSON-em:", tekst);
        process.exit(1);
      }
    } else {
      console.error("❌ Google nie zwróciło spodziewanej struktury danych:", JSON.stringify(data));
      process.exit(1);
    }
  } catch (e) {
    console.error("❌ Błąd krytyczny skryptu:", e.message);
    process.exit(1);
  }
}
run();
