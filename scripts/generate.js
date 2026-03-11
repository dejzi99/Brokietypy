const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const promptText = `Przeanalizuj dzisiejsze mecze piłkarskie i wybierz 5 zdarzeń o najwyższym prawdopodobieństwie.
  Wymagania:
  1. Wybierz 3 mecze z Top 5 lig europejskich oraz 2 z lig niszowych.
  2. Typuj zdarzenia takie jak: Rzuty rożne (np. Powyżej 9.5), Liczba goli (Powyżej 2.5), Obie strzelą lub Faule.
  3. Uzasadnienie musi mieć 3-4 zdania i opierać się na formie, statystykach i brakach kadrowych.
  
  Zwróć odpowiedź WYŁĄCZNIE jako czysty kod JSON, bez formatowania markdown:
  {
    "mecze": [
      {
        "godzina": "20:45",
        "mecz": "Drużyna A - Drużyna B (Liga)",
        "typ": "Powyżej 10.5 rzutów rożnych",
        "kurs": "1.85",
        "analiza": "Twoja szczegółowa analiza..."
      }
    ]
  }`;

  try {
    // Wracamy do modelu, który u Ciebie działo poprawnie (flash)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    const resData = await response.json();

    if (resData.candidates && resData.candidates[0].content) {
      let rawText = resData.candidates[0].content.parts[0].text;
      
      try {
        // Próbujemy wyciągnąć JSON
        const start = rawText.indexOf('{');
        const end = rawText.lastIndexOf('}') + 1;
        const cleanJson = rawText.substring(start, end);
        JSON.parse(cleanJson); // Sprawdzamy czy to poprawny format
        
        fs.writeFileSync(filePath, cleanJson);
        console.log("✅ SUKCES! Analizy wygenerowane poprawnie.");
      } catch (parseError) {
        // Jeśli AI nie dało JSON-a (np. gada zwykłym tekstem), wysyłamy to na Twoją stronę!
        fs.writeFileSync(filePath, JSON.stringify({
          mecze: [{ 
            godzina: "INFO", 
            mecz: "Odpowiedź AI (Bez formatu JSON):", 
            typ: "?", 
            kurs: "-", 
            analiza: rawText 
          }]
        }));
      }
    } else {
      throw new Error(resData.error?.message || "Brak danych");
    }
  } catch (e) {
    fs.writeFileSync(filePath, JSON.stringify({
      mecze: [{ godzina: "BŁĄD", mecz: "Błąd skryptu", typ: "!", kurs: "0.00", analiza: e.message }]
    }));
  }
}
run();
