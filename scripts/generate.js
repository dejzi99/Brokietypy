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

  // Funkcja wysyłająca powiadomienie na Telegram
  async function sendTelegramMessage(message) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      
      if (!botToken || !chatId) {
          console.log("⚠️ Brak kluczy Telegram (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID). Pomijam wysyłanie wiadomości.");
          return;
      }

      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      try {
          const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
          });
          if (res.ok) {
              console.log("✅ Wysłano powiadomienie na Telegram!");
          } else {
              console.log("❌ Błąd Telegrama:", await res.text());
          }
      } catch (e) {
          console.error("❌ Problem z połączeniem z Telegramem:", e.message);
      }
  }

  try {
    if (!apiSportsKey) throw new Error("Brak klucza APISPORTS_KEY!");

    console.log(`Pobieram mecze z API-Sports na dzień: ${dataDlaApi} (Strefa: Europe/Warsaw)`);
    
    const apiData = await fetchSports(`https://v3.football.api-sports.io/fixtures?date=${dataDlaApi}&timezone=Europe/Warsaw`, {
      method: 'GET',
      headers: { 'x-apisports-key': apiSportsKey }
    });

    if (apiData && apiData.response && apiData.response.length > 0) {
        // Dodane ID dla reprezentacji: 1 (MŚ), 4 (Euro), 5 (Liga Narodów), 9 (Copa America), 10 (Towarzyskie), 30/32/34 (Kwalifikacje)
        const szerokieLigi = [1, 2, 3, 4, 5, 9, 10, 15, 30, 32, 34, 39, 40, 61, 71, 78, 88, 94, 106, 135, 140, 203, 253, 848];
        let wybraneMecze = apiData.response.filter(match => szerokieLigi.includes(match.league.id));
        
        if (wybraneMecze.length === 0) wybraneMecze = apiData.response; 

        // Priorytet na samej górze: Liga Mistrzów (2) oraz wszystkie główne mecze reprezentacyjne!
        const topLigi = [1, 2, 3, 4, 5, 9, 10, 30, 32, 34, 39, 61, 78, 135, 140];
        wybraneMecze.sort((a, b) => {
            const aTop = topLigi.includes(a.league.id) ? 0 : 1;
            const bTop = topLigi.includes(b.league.id) ? 0 : 1;
            return aTop - bTop;
        });

        listaDoAnalizy = wybraneMecze.slice(0, 45).map(match => {
            const godzina = new Date(match.fixture.date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            return `ID: ${match.fixture.id} | ${godzina} | ${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name}) | Status: ${match.fixture.status.short}`;
        }).join('\n');

    } else {
        console.log("API-Sports nie zwróciło meczów na dzisiaj.");
    }
  } catch (e) {
    console.log("Problem z danymi sportowymi:", e.message);
  }

  // Wzmocniony prompt - tylko jeden kurs i długa analiza!
  const promptText = `Jesteś elitarnym analitykiem bukmacherskim. Dzisiejsza data: ${dzisiajPl}.
  Oto PRAWDZIWA i JEDYNA lista meczów na dzisiaj:
  ${listaDoAnalizy || 'BRAK MECZÓW.'}
  
  ZASADY ABSOLUTNE:
  1. ZABRANIAM wymyślania meczów, których nie ma na powyższej liście.
  2. Wybierz 5 najciekawszych meczów (status NS). Priorytet: Liga Mistrzów i topowe ligi.
  3. Jeśli lista to "BRAK MECZÓW", zwróć JSON z pustą tablicą "mecze": [].
  4. Pole "analiza" MUSI być szczegółowe. Napisz krótki akapit (3-4 zdania), wspominając np. o formie, kontuzjach, taktyce i uzasadnieniu typu.
  5. Zwróć WYŁĄCZNIE czysty JSON. Podaj jeden uśredniony "kurs".
  
  Struktura: {"mecze": [{"fixture_id": "123", "data": "${dzisiajPl}", "godzina": "21:00", "mecz": "Drużyna A vs B", "typ": "Wynik", "kurs": "1.80", "analiza": "Szczegółowy opis z argumentami...", "status": "oczekujący"}]}`;

  let cleanJson = null;

  try {
      if (!geminiKey) throw new Error("Brak klucza GEMINI_API_KEY w Secrets!");

      const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`;
      const modelsRes = await fetch(modelsUrl);
      const modelsData = await modelsRes.json();

      let availableModels = [];
      if (modelsData.models && Array.isArray(modelsData.models)) {
          availableModels = modelsData.models
              .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
              .map(m => m.name.replace('models/', ''));
      }

      const preferredOrder = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-1.0-pro", "gemini-2.0-flash"];
      let modelsToTry = [];
      
      for (const pref of preferredOrder) {
          if (availableModels.includes(pref)) modelsToTry.push(pref);
      }
      for (const am of availableModels) {
          if (!modelsToTry.includes(am)) modelsToTry.push(am);
      }

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
                  console.log(`⚠️ Model ${model} odrzucił zapytanie. Szukam dalej...`);
              }
          } catch (e) {
              lastError = e.message;
              console.log(`❌ Błąd przy modelu ${model}: ${e.message}`);
          }
      }

      if (!cleanJson) throw new Error("Wszystkie modele mają zablokowane limity. Ostatni błąd: " + lastError);

      const generatedData = JSON.parse(cleanJson);
      fs.writeFileSync(filePath, JSON.stringify(generatedData, null, 2));
      
      // Zapis do historii
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

      // FORMOWANIE I WYSYŁANIE WIADOMOŚCI TELEGRAM
      if (generatedData.mecze && generatedData.mecze.length > 0) {
          let tgMessage = `🔥 <b>NOWE TYPY NA DZIŚ (${dzisiajPl})</b> 🔥\n\n`;
          generatedData.mecze.forEach(m => {
              if(m.status !== 'błąd') {
                  tgMessage += `⚽ <b>${m.mecz}</b>\n⏰ ${m.godzina}\n🎯 Typ: <b>${m.typ}</b>\n📈 Kurs: ${m.kurs}\n\n`;
              }
          });
          tgMessage += `Więcej szczegółów i pełne analizy na stronie! 💸`;
          
          await sendTelegramMessage(tgMessage);
      }

  } catch (e) {
      console.error("Błąd krytyczny:", e.message);
      fs.writeFileSync(filePath, JSON.stringify({
          error: e.message,
          mecze: [{ data: dzisiajPl, mecz: "Błąd Analizy AI", analiza: "Szczegóły awarii: " + e.message, status: "błąd" }]
      }));
  }
}

run();
