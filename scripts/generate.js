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

  // Funkcja pobierająca z automatycznymi powtórkami
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
        const szerokieLigi = [2, 3, 848, 15, 39, 40, 140, 135, 78, 61, 88, 94, 106, 71, 253, 203];
        let wybraneMecze = apiData.response.filter(match => szerokieLigi.includes(match.league.id));
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

  const promptText = `Jesteś elitarnym analitykiem bukmacherskim. Dzisiejsza data: ${dzisiajPl}.
  Lista meczów:
  ${listaDoAnalizy || 'Brak danych z API, wygeneruj 5 realistycznych analiz (symulacja).'}
  
  Wybierz 5 typów. Zwróć WYŁĄCZNIE JSON. Podaj fixture_id i bukmacherów (STS, Superbet, Fortuna).
  Struktura: {"mecze": [{"fixture_id": "123", "data": "${dzisiajPl}", "godzina": "21:00", "mecz": "Drużyna A vs B", "typ": "Wynik", "kurs": "1.80", "analiza": "Opis", "status": "oczekujący", "bukmacherzy": [{"nazwa": "STS", "kurs": "1.75"}, {"nazwa": "Superbet", "kurs": "1.80"}, {"nazwa": "Fortuna", "kurs": "1.78"}]}]}`;

  let cleanJson = null;

  try {
      if (!geminiKey) throw new Error("Brak klucza GEMINI_API_KEY w Secrets!");

      console.log("Krok 1: Pytam serwery Google o listę dostępnych modeli dla Twojego klucza API...");
      
      const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`;
      const modelsRes = await fetch(modelsUrl);
      const modelsData = await modelsRes.json();

      if (modelsData.error) {
          throw new Error(`Błąd odczytu klucza API z Google: ${modelsData.error.message}. Upewnij się, że poprawnie zapisałeś klucz.`);
      }

      let selectedModel = "";
      if (modelsData.models && Array.isArray(modelsData.models)) {
          // Filtrujemy tylko te modele, które potrafią generować tekst
          const availableModels = modelsData.models
              .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
              .map(m => m.name.replace('models/', ''));

          console.log("Modele do których masz dostęp na nowym kluczu:", availableModels.join(", "));

          // Wybieramy najlepszy dostępny na koncie
          if (availableModels.includes("gemini-1.5-flash")) selectedModel = "gemini-1.5-flash";
          else if (availableModels.includes("gemini-1.5-pro")) selectedModel = "gemini-1.5-pro";
          else if (availableModels.includes("gemini-2.0-flash")) selectedModel = "gemini-2.0-flash";
          else if (availableModels.includes("gemini-pro")) selectedModel = "gemini-pro";
          else if (availableModels.length > 0) selectedModel = availableModels[0]; // Bierzemy cokolwiek co zadziała
      }

      if (!selectedModel) {
          throw new Error("Twój nowy klucz API nie posiada uprawnień do żadnego modelu generującego tekst.");
      }

      console.log(`Krok 2: Używam pewnego modelu prosto z Twojej listy: ${selectedModel}`);
      const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${geminiKey}`;

      const response = await fetch(generateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
      });

      const resData = await response.json();

      if (response.ok && resData.candidates && resData.candidates[0].content) {
          console.log(`✅ Sukces! Wygenerowano analizy.`);
          let rawText = resData.candidates[0].content.parts[0].text;
          const start = rawText.indexOf('{');
          const end = rawText.lastIndexOf('}') + 1;
          cleanJson = rawText.substring(start, end);
      } else {
          throw new Error(resData.error?.message || "Odpowiedź nie zawierała danych JSON.");
      }

      if (!cleanJson) throw new Error("Błąd przy parsowaniu danych z AI.");

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
