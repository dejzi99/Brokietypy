const fs = require('fs');
const path = require('path');

async function run() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const apiSportsKey = process.env.APISPORTS_KEY; 
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');
  const historyPath = path.join(publicDir, 'historia.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const dzisiajPl = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  const dataDlaApi = new Date().toISOString().split('T')[0];

  let listaDoAnalizy = "";

  // Pomocnicza funkcja do obsługi powtórek (retry) dla API
  async function fetchWithRetry(url, options, maxRetries = 5) {
    let delay = 1000;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) return await response.json();
        // Jeśli błąd to 429 (Too Many Requests) lub 5xx (Server Error), ponawiamy
        if (response.status !== 429 && response.status < 500) {
            const errData = await response.json();
            throw new Error(errData.error?.message || `Błąd HTTP ${response.status}`);
        }
      } catch (e) {
        if (i === maxRetries - 1) throw e;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Wykładniczy backoff: 1s, 2s, 4s, 8s, 16s
    }
  }

  try {
    if (!apiSportsKey) {
        throw new Error("Brak klucza APISPORTS_KEY!");
    }

    console.log(`Pobieram mecze z bezpośredniego API-Sports na dzień: ${dataDlaApi}`);
    
    // Pobieranie meczów z API-Sports (też z retry na wszelki wypadek)
    const apiData = await fetchWithRetry(`https://v3.football.api-sports.io/fixtures?date=${dataDlaApi}`, {
      method: 'GET',
      headers: { 'x-apisports-key': apiSportsKey }
    });

    if (apiData.response && apiData.response.length > 0) {
        const szerokieLigi = [2, 3, 848, 15, 39, 40, 140, 135, 78, 61, 88, 94, 106, 71, 253, 203];
        let wybraneMecze = apiData.response.filter(match => szerokieLigi.includes(match.league.id));

        if (wybraneMecze.length === 0) {
            wybraneMecze = apiData.response; 
        }

        const prawdziweMecze = wybraneMecze.slice(0, 25).map(match => {
            const godzina = new Date(match.fixture.date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            return `ID: ${match.fixture.id} | ${godzina} | ${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name})`;
        });

        listaDoAnalizy = prawdziweMecze.join('\n');
    } else {
        throw new Error("API-Sports nie zwróciło żadnych meczów na dzisiaj.");
    }
  } catch (e) {
    console.log("Problem ze statystykami:", e.message);
  }

  let promptText = "";
  if (listaDoAnalizy) {
    promptText = `Jesteś elitarnym analitykiem bukmacherskim. Dzisiejsza data: ${dzisiajPl}.
    Oto PRAWDZIWA lista meczów na dziś:
    ${listaDoAnalizy}
    Wybierz 5 najciekawszych meczów. Zwróć odpowiedź WYŁĄCZNIE jako czysty JSON. 
    WAŻNE: Dla każdego meczu podaj "fixture_id" oraz tablicę "bukmacherzy" z kursami dla STS, Superbet i Fortuna.`;
  } else {
    promptText = `Dzisiejsza data: ${dzisiajPl}. Wygeneruj 5 realistycznych analiz meczów (symulacja). 
    Zwróć odpowiedź WYŁĄCZNIE jako JSON z tablicą "bukmacherzy".`;
  }

  promptText += `\n Struktura JSON: {"mecze": [{"fixture_id": "string", "data": "string", "godzina": "string", "mecz": "string", "typ": "string", "kurs": "string", "analiza": "string", "status": "oczekujący", "bukmacherzy": [{"nazwa": "string", "kurs": "string"}]}]}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiKey}`;
    
    // Używamy funkcji z powtórkami dla Gemini
    const resData = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });

    if (resData.candidates && resData.candidates[0].content) {
      let rawText = resData.candidates[0].content.parts[0].text;
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}') + 1;
      const cleanJson = rawText.substring(start, end);
      
      const generatedData = JSON.parse(cleanJson);
      
      fs.writeFileSync(filePath, JSON.stringify(generatedData, null, 2));
      
      let historia = [];
      if (fs.existsSync(historyPath)) {
          try {
              historia = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
          } catch (e) { historia = []; }
      }

      const dzisiejszyIndex = historia.findIndex(h => h.data === dzisiajPl);
      const nowyWpis = { data: dzisiajPl, mecze: generatedData.mecze };

      if (dzisiejszyIndex !== -1) {
          historia[dzisiejszyIndex] = nowyWpis;
      } else {
          historia.push(nowyWpis);
      }

      fs.writeFileSync(historyPath, JSON.stringify(historia, null, 2));
      console.log("✅ SUKCES! Raport i historia zaktualizowane.");
    } else {
      throw new Error("API Gemini zwróciło pustą odpowiedź.");
    }
  } catch (e) {
    console.error("Błąd krytyczny:", e.message);
    fs.writeFileSync(filePath, JSON.stringify({
      error: e.message,
      mecze: [{ data: dzisiajPl, godzina: "BŁĄD", mecz: "Błąd Analizy", typ: "-", kurs: "0.00", analiza: "API nie odpowiedziało po 5 próbach: " + e.message, status: "błąd" }]
    }));
  }
}
run();
