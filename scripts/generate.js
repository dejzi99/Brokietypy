const fs = require('fs');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ BŁĄD: Nie widzę klucza w Secrets!");
    process.exit(1);
  }

  // Używamy modelu 1.5-flash (najbardziej stabilny dla darmowych kont)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Podaj 3 mecze piłkarskie na dziś jako prosty tekst." }] }]
      })
    });

    const data = await response.json();

    // TO JEST KLUCZOWE: Pokaż nam wszystko, co przysłało Google
    console.log("--- START ODPOWIEDZI ---");
    console.log(JSON.stringify(data, null, 2));
    console.log("--- KONIEC ODPOWIEDZI ---");

    if (data.candidates && data.candidates[0].content) {
      const tekst = data.candidates[0].content.parts[0].text;
      if (!fs.existsSync('./public')) fs.mkdirSync('./public');
      fs.writeFileSync('./public/raport.json', JSON.stringify({ data: tekst }));
      console.log("✅ Sukces!");
    } else {
      console.log("❌ API nie zwróciło meczów. Sprawdź komunikat powyżej.");
    }
  } catch (e) {
    console.error("❌ Błąd krytyczny:", e.message);
  }
}
run();
