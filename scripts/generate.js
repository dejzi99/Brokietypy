const fs = require('fs');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ BŁĄD: Brak klucza w Secrets!");
    process.exit(1);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Podaj 5 meczów piłkarskich na dziś w formacie JSON: {\"mecze\": [\"drużyna1 vs drużyna2\"]}" }] }],
        safetySettings: [
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    const data = await response.json();
    console.log("--- ODPOWIEDŹ GOOGLE ---");
    console.log(JSON.stringify(data, null, 2));

    if (data.candidates && data.candidates[0].content) {
      let tekst = data.candidates[0].content.parts[0].text;
      
      // Czyścimy tekst z ewentualnych znaczników ```json i ```
      const oczyszczonyJson = tekst.replace(/```json|```/g, "").trim();
      
      if (!fs.existsSync('./public')) fs.mkdirSync('./public');
      fs.writeFileSync('./public/raport.json', oczyszczonyJson);
      console.log("✅ SUKCES! Plik public/raport.json został zapisany.");
    } else {
      console.error("❌ Google nie przysłało danych. Sprawdź logi powyżej.");
      process.exit(1);
    }
  } catch (e) {
    console.error("❌ Błąd krytyczny:", e.message);
    process.exit(1);
  }
}
run();
