const fs = require('fs');
const path = require('path');

async function run() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const apiSportsKey = process.env.APISPORTS_KEY; 
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');
  const historyPath = path.join(publicDir, 'historia.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  // Wymuszenie strefy czasowej polskiej (Warszawa), aby Github nie mylił dni
  const dzisiajPl = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  const dataDlaApi = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw' }).substring(0, 10);

  let listaDoAnalizy = "";

  async function fetchSports(url, options, maxRetries = 3) {
    let delay = 1000;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) return await response.json();
      } catch (e) {
        if (i === maxRetries - 1) throw e;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; 
    }
    return null;
  }

  try {
    if (!apiSportsKey) throw new Error("Brak klucza APISPORTS_KEY!");

    console.log(`Pobieram mecze z API-Sports na dzień: ${dataDlaApi}`);
    const apiData = await fetchSports(`https://v3.football.api-sports.io/fixtures?date=${dataDlaApi}`, {
      method: 'GET',
      headers: { 'x-apisports-key': apiSportsKey }
    });

    if (apiData && apiData.response && apiData.response.length > 0) {
        // Przywrócona logika: bierzemy mecze z dzisiaj z głównych lig
        const szerokieLigi = [2, 3, 848, 15, 39, 40, 140, 135, 78, 61, 88, 94, 106, 71, 253, 203];
        let wybraneMecze = apiData.response.filter(match => szerokieLigi.includes(match.league.id));
        
        // Jeśli nie ma meczów z głównych lig na dzisiaj, bierzemy jakiekolwiek dzisiejsze
        if (wybraneMecze.length === 0) wybraneMecze = apiData.response; 

        listaDoAnalizy = wybraneMecze.slice(0, 25).map(match => {
            const godzina = new Date(match.fixture.date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            return `ID: ${match.fixture.id} | ${godzina} | ${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name})`;
        }).join('\n');

    } else {
        console.log("API-Sports nie zwróciło meczów na dzisiaj.");
    }
  } catch (e) {
    console.log("Problem z danymi sportowymi:", e.message);
  }

  // Wzmocniony prompt - surowy zakaz wymyślania meczów
  const promptText = `Jesteś elitarnym analitykiem bukmacherskim. Dzisiejsza data: ${dzisiajPl}.
  Oto PRAWDZIWA lista meczów na dzisiaj:
  ${listaDoAnalizy || 'Brak danych z API, wygeneruj 5 realistycznych analiz (symulacja).'}
  
  ABSOLUTNY ZAKAZ wymyślania meczów, których nie ma na powyższej liście (chyba że lista jest pusta). Wybierz 5 najciekawszych typów WYŁĄCZNIE z podanych meczów. Zwróć WYŁĄCZNIE JSON. Podaj fixture_id i bukmacherów (STS, Superbet, Fortuna).
  Struktura: {"mecze": [{"fixture_id": "123", "data": "${dzisiajPl}", "godzina": "21:00", "mecz": "Drużyna A vs B", "typ": "Wynik", "kurs": "1.80", "analiza": "Opis", "status": "oczekujący", "bukmacherzy": [{"nazwa": "STS", "kurs": "1.75"}, {"nazwa": "Superbet", "kurs": "1.80"}, {"nazwa": "Fortuna", "kurs": "1.78"}]}]}`;

  let cleanJson = null;

  try {
      if (!geminiKey) throw new Error("Brak klucza GEMINI_API_KEY w Secrets!");

      console.log("Krok 1: Pobieram listę modeli dla Twojego klucza...");
      
      const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`;
      const modelsRes = await fetch(modelsUrl);
      const modelsData = await modelsRes.json();

      if (modelsData.error) {
          throw new Error(`Błąd odczytu klucza API z Google: ${modelsData.error.message}`);
      }

      let availableModels = [];
      if (modelsData.models && Array.isArray(modelsData.models)) {
          availableModels = modelsData.models
              .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
              .map(m => m.name.replace('models/', ''));
      }

      if (availableModels.length === 0) {
          throw new Error("Twój nowy klucz API nie posiada uprawnień do generowania tekstu.");
      }

      // Sortujemy modele, żeby zacząć od najbardziej darmowych/stabilnych
      const preferredOrder = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-1.0-pro", "gemini-2.0-flash"];
      let modelsToTry = [];
      
      for (const pref of preferredOrder) {
          if (availableModels.includes(pref)) modelsToTry.push(pref);
      }
      for (const am of availableModels) {
          if (!modelsToTry.includes(am)) modelsToTry.push(am);
      }

      console.log("Krok 2: Będę testował modele po kolei:", modelsToTry.join(", "));
      let lastError = "Nieznany błąd";

      for (const model of modelsToTry) {
          try {
              console.log(`>>> Próbuję użyć modelu: ${model}...`);
              const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
              
              const response = await fetch(generateUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
              });

              const resData = await response.json();

              if (response.ok && resData.candidates && resData.candidates[0].content) {
                  console.log(`✅ SUKCES! Model ${model} ma wolne limity i zadziałał!`);
                  let rawText = resData.candidates[0].content.parts[0].text;
                  const start = rawText.indexOf('{');
                  const end = rawText.lastIndexOf('}') + 1;
                  cleanJson = rawText.substring(start, end);
                  break; 
              } else {
                  lastError = resData.error?.message || "Błąd limitu";
                  console.log(`⚠️ Model ${model} odrzucił zapytanie (Prawdopodobnie brak limitów). Szukam dalej... Odrzucenie: ${lastError}`);
              }
          } catch (e) {
              lastError = e.message;
              console.log(`❌ Błąd przy modelu ${model}: ${e.message}`);
          }
      }

      if (!cleanJson) throw new Error("Wszystkie modele mają zablokowane limity. Ostatni błąd: " + lastError);

      const generatedData = JSON.parse(cleanJson);
      fs.writeFileSync(filePath, JSON.stringify(generatedData, null, 2));
      
      let historia = [];
      if (fs.existsSync(historyPath)) {
          try { historia = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch (e) { historia = []; }
      }

      const dzisiejszyIndex = historia.findIndex(h => h.data === dzisiajPl);
      const nowyWpis = { data: dzisiajPl, mecze: generatedData.mecze };

      if (dzisiejszyIndex !== -1) {
          historia[dzisiejszyIndex] = nowyWpis;
      } else {
          historia.push(nowyWpis);
      }

      fs.writeFileSync(historyPath, JSON.stringify(historia, null, 2));
      console.log("✅ Raport i Historia zapisane poprawnie.");

  } catch (e) {
      console.error("Błąd krytyczny:", e.message);
      fs.writeFileSync(filePath, JSON.stringify({
          error: e.message,
          mecze: [{ data: dzisiajPl, mecz: "Błąd Analizy AI", analiza: "Szczegóły awarii: " + e.message, status: "błąd" }]
      }));
  }
}

run();
