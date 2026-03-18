const fs = require('fs');
const path = require('path');

async function run() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const apiSportsKey = process.env.APISPORTS_KEY; 
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');
  // NOWOŚĆ: Ścieżka do naszego archiwum
  const historyPath = path.join(publicDir, 'historia.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const dzisiajPl = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  const dataDlaApi = new Date().toISOString().split('T')[0];

  let listaDoAnalizy = "";

  try {
    if (!apiSportsKey) {
        throw new Error("Brak klucza APISPORTS_KEY!");
    }

    console.log(`Pobieram mecze z bezpośredniego API-Sports na dzień: ${dataDlaApi}`);
    
    const responseAPI = await fetch(`https://v3.football.api-sports.io/fixtures?date=${dataDlaApi}`, {
      method: 'GET',
      headers: {
        'x-apisports-key': apiSportsKey
      }
    });

    const apiData = await responseAPI.json();

    if (apiData.errors && Object.keys(apiData.errors).length > 0) {
        throw new Error("Błąd konta API-Sports: " + JSON.stringify(apiData.errors));
    }

    if (apiData.response && apiData.response.length > 0) {
        const szerokieLigi = [2, 3, 848, 15, 39, 40, 140, 135, 78, 61, 88, 94, 106, 71, 253, 203];
        let wybraneMecze = apiData.response.filter(match => szerokieLigi.includes(match.league.id));

        if (wybraneMecze.length === 0) {
            wybraneMecze = apiData.response; 
        }

        const prawdziweMecze = wybraneMecze.slice(0, 25).map(match => {
            const godzina = new Date(match.fixture.date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            // DODANE: Pobieramy też ID meczu (fixture.id), będzie nam potrzebne do sprawdzania wyników jutro!
            return `ID: ${match.fixture.id} | ${godzina} | ${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name})`;
        });

        listaDoAnalizy = prawdziweMecze.join('\n');
        console.log("Znaleziono mecze na żywo! Ilość: ", prawdziweMecze.length);
    } else {
        throw new Error("API-Sports nie zwróciło żadnych meczów na dzisiaj.");
    }
  } catch (e) {
    console.log("Problem ze statystykami:", e.message);
  }

  let promptText = "";

  if (listaDoAnalizy) {
    promptText = `Jesteś elitarnym analitykiem. Dzisiejsza data: ${dzisiajPl}.
    Oto PRAWDZIWA lista meczów na dziś:
    ${listaDoAnalizy}
    
    Wybierz 5 najciekawszych meczów. ZABRANIAM wymyślania innych meczów.
    Zwróć odpowiedź WYŁĄCZNIE jako czysty JSON. 
    WAŻNE: Dla każdego wybranego meczu wyciągnij jego ID z listy powyżej i dodaj do obiektu jako "fixture_id".`;
  } else {
    promptText = `Jesteś systemem symulacji analitycznych. Dzisiejsza data: ${dzisiajPl}.
    Z powodu awarii bazy wygeneruj 5 WYSOCE REALISTYCZNYCH analiz (symulacji).
    Zwróć odpowiedź WYŁĄCZNIE jako czysty JSON. Ustaw "fixture_id" jako "0".`;
  }

  promptText += `\n
  Wymagana struktura JSON:
  {
    "mecze": [
      {
        "fixture_id": "123456",
        "data": "${dzisiajPl}",
        "godzina": "21:00",
        "mecz": "Drużyna A vs Drużyna B (Nazwa Ligi)",
        "typ": "Powyżej 10.5 rzutów rożnych",
        "kurs": "1.85",
        "analiza": "Twoja analiza...",
        "status": "oczekujący"
      }
    ]
  }`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const responseGemini = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });

    const resData = await responseGemini.json();

    if (resData.candidates && resData.candidates[0].content) {
      let rawText = resData.candidates[0].content.parts[0].text;
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}') + 1;
      const cleanJson = rawText.substring(start, end);
      
      const generatedData = JSON.parse(cleanJson);
      
      // 1. Zapisz dla dzisiejszej strony (żeby nic nie popsuć)
      fs.writeFileSync(filePath, JSON.stringify(generatedData, null, 2));
      
      // 2. MODUŁ PAMIĘCI (Zapis do historii)
      let historia = [];
      if (fs.existsSync(historyPath)) {
          try {
              const rawHistory = fs.readFileSync(historyPath, 'utf8');
              historia = JSON.parse(rawHistory);
          } catch (e) {
              historia = [];
          }
      }

      // Sprawdzamy, czy dzisiaj już dodaliśmy raport (zapobieganie dublowaniu)
      const dzisiejszyIndex = historia.findIndex(h => h.data === dzisiajPl);
      const nowyWpis = { data: dzisiajPl, mecze: generatedData.mecze };

      if (dzisiejszyIndex !== -1) {
          historia[dzisiejszyIndex] = nowyWpis; // Nadpisz tylko dzisiejszy wpis
      } else {
          historia.push(nowyWpis); // Dodaj nowy dzień na koniec bazy
      }

      // Zapisz zaktualizowaną historię
      fs.writeFileSync(historyPath, JSON.stringify(historia, null, 2));

      console.log("✅ SUKCES! Raport dzisiejszy oraz ARCHIWUM zostały zaktualizowane.");
    } else {
      throw new Error("API Gemini nie zwróciło odpowiedzi.");
    }
  } catch (e) {
    fs.writeFileSync(filePath, JSON.stringify({
      mecze: [{ data: dzisiajPl, godzina: "BŁĄD", mecz: "Błąd Analizy", typ: "-", kurs: "0.00", analiza: e.message, status: "błąd" }]
    }));
  }
}
run();
