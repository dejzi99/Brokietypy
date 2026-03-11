const fs = require('fs');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ BŁĄD: Brak klucza GEMINI_API_KEY w Secrets na GitHubie!");
    process.exit(1);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Znajdź 5 meczów piłkarskich na dziś i podaj je w formacie JSON." }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const data = await response.json();

    // Jeśli nie ma 'candidates', to znaczy, że Google zwróciło błąd
    if (!data.candidates) {
      console.log("--- PEŁNY KOMUNIKAT BŁĘDU OD GOOGLE ---");
      console.log(JSON.stringify(data, null, 2));
      console.log("---------------------------------------");
      process.exit(1);
    }

    const tekst = data.candidates[0].content.parts[0].text;
    
    if (!fs.existsSync('./public')) fs.mkdirSync('./public');
    fs.writeFileSync('./public/raport.json', tekst);
    console.log("✅ SUKCES! Raport zapisany.");

  } catch (e) {
    console.error("❌ KRYTYCZNY BŁĄD SKRYPTU:", e.message);
    process.exit(1);
  }
}

run();
