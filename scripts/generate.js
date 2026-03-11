const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  // Ustawiamy sztywną datę dla polskiej strefy czasowej, żeby AI się nie gubiło
  const today = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });

  // PROMPT "ŁOWCA ANOMALII": Skupiony na dzisiejszym dniu i dziwnych ruchach kursów
  const promptText = `Jesteś zaawansowanym systemem detekcji anomalii rynkowych i sportowych.
  Dzisiejsza data to dokładnie: ${today}.
  
  Twoim zadaniem jest znalezienie 5 meczów, które odbywają się DOKŁADNIE DZISIAJ (${today}). Bezwzględnie zignoruj mecze z wczoraj i z jutra.
  
  Wymagania:
  1. Znajdź 3 mecze z bardzo egzotycznych lub niszowych lig (np. Azja, Afryka, Ameryka Południowa, niższe klasy rozgrywkowe). Szukaj w nich potężnych "anomalii kursowych", nagłych spadków kursów lub podejrzanych trendów statystycznych, które mogą sugerować ukrytą przewagę.
  2. Znajdź 2 mecze z Top 5 lig europejskich z wartościowymi zdarzeniami (np. rzuty rożne, faule, żółte kartki).
  3. Analiza (3-4 zdania) musi brzmieć wysoce analitycznie: opisz dlaczego system wykrył tu anomalię, wspomnij o dziwnych ruchach na rynku, brakach kadrowych lub ukrytych statystykach.
  
  Zwróć odpowiedź WYŁĄCZNIE jako czysty kod JSON, bez żadnych znaczników markdown:
  {
    "mecze": [
      {
        "godzina": "15:30",
        "mecz": "Nazwa Drużyny A - Drużyna B (Nazwa Ligi Egzotycznej)",
        "typ": "Powyżej 2.5 gola",
        "kurs": "2.10",
        "analiza": "System wykrył potężną anomalię i nagły spadek kursów na ten rynek. Wynika to prawdopodobnie z..."
      }
    ]
  }`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
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
        const start = rawText.indexOf('{');
        const end = rawText.lastIndexOf('}') + 1;
        const cleanJson = rawText.substring(start, end);
        JSON.parse(cleanJson); // Weryfikacja formatu
        
        fs.writeFileSync(filePath, cleanJson);
        console.log(`✅ SUKCES! Analiza na dzień ${today} wygenerowana (w tym egzotyka).`);
      } catch (parseError) {
        fs.writeFileSync(filePath, JSON.stringify({
          mecze: [{ godzina: "INFO", mecz: "Problem z formatem danych", typ: "?", kurs: "-", analiza: rawText }]
        }));
      }
    } else {
      throw new Error(resData.error?.message || "Brak danych z Google");
    }
  } catch (e) {
    fs.writeFileSync(filePath, JSON.stringify({
      mecze: [{ godzina: "BŁĄD", mecz: "Błąd skryptu", typ: "!", kurs: "0.00", analiza: e.message }]
    }));
  }
}
run();
