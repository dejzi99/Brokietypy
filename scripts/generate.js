const fs = require('fs');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  // 1. Zapisujemy cokolwiek na start, żeby plik istniał
  const dataStartowa = { data: new Date().toISOString(), status: "brak danych" };
  fs.writeFileSync('public/raport.json', JSON.stringify(dataStartowa));

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Podaj 3 mecze piłkarskie na dziś w formacie JSON: {\"mecze\": []}" }] }]
      })
    });

    const resData = await response.json();

    if (resData.candidates && resData.candidates[0].content) {
      let tekst = resData.candidates[0].content.parts[0].text;
      // Usuwamy ewentualne znaczniki ```json
      const czystyJson = tekst.replace(/```json|```/g, "").trim();
      
      // Nadpisujemy plik realnymi danymi
      fs.writeFileSync('public/raport.json', czystyJson);
      console.log("✅ Dane z AI zapisane.");
    }
  } catch (e) {
    console.log("⚠️ Błąd AI, ale plik i tak został stworzony.");
  }
}
run();
