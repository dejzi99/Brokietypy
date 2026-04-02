const fs = require('fs');
const path = require('path');

async function run() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const apiSportsKey = process.env.APISPORTS_KEY; 
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');
  const historyPath = path.join(publicDir, 'historia.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const dzisiaj = new Date();
  const dzisiajPl = dzisiaj.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  const dataDlaApiFootball = dzisiaj.toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw' }).substring(0, 10);
  const jutro = new Date(dzisiaj);
  jutro.setDate(jutro.getDate() + 1);

  const getEspnDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}${month}${day}`;
  };

  async function fetchSports(url, options = {}, maxRetries = 3) {
    let delay = 1000;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) return await response.json();
      } catch (e) { if (i === maxRetries - 1) throw e; }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; 
    }
    return null;
  }

  // --- FUNKCJA ROZLICZAJĄCA (SETTLER) ---
  async function settleHistory() {
    if (!fs.existsSync(historyPath)) return;
    console.log("🔍 Sprawdzam wyniki oczekujących meczów...");
    let historia = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    let zmiana = false;

    for (let dzien of historia) {
      for (let m of dzien.mecze) {
        if (m.status === 'oczekujący' || m.status === 'NS') {
          if (m.sport === 'Pilka_Nozna' && m.fixture_id) {
            const res = await fetchSports(`https://v3.football.api-sports.io/fixtures?id=${m.fixture_id}`, {
              headers: { 'x-apisports-key': apiSportsKey }
            });
            if (res && res.response?.[0]) {
              const f = res.response[0];
              if (f.fixture.status.short === 'FT') {
                m.wynik = `${f.goals.home}-${f.goals.away}`;
                m.status = 'zakończony'; // AI lub Ty możesz to potem oznaczyć jako win/loss
                zmiana = true;
              }
            }
          } else if (m.sport === 'NBA' && m.fixture_id) {
            // Dla NBA sprawdzamy wynik na ESPN (uproszczone dla stabilności)
            const matchDate = m.data.split('.').reverse().join(''); // format YYYYMMDD
            const res = await fetchSports(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${matchDate}`);
            const event = res?.events?.find(e => e.id == m.fixture_id || e.name.includes(m.mecz.split(' vs ')[0]));
            if (event && event.status.type.state === 'post') {
              const s = event.competitions[0].competitors;
              m.wynik = `${s[0].score}-${s[1].score}`;
              m.status = 'zakończony';
              zmiana = true;
            }
          }
        }
      }
    }
    if (zmiana) fs.writeFileSync(historyPath, JSON.stringify(historia, null, 2));
  }

  try {
    await settleHistory();

    // --- POBIERANIE PIŁKI (ROZSZERZONE LIGI) ---
    console.log("⚽ Pobieram Piłkę Nożną...");
    const apiFootball = await fetchSports(`https://v3.football.api-sports.io/fixtures?date=${dataDlaApiFootball}&timezone=Europe/Warsaw`, {
      method: 'GET', headers: { 'x-apisports-key': apiSportsKey }
    });

    if (apiFootball && apiFootball.response) {
        // Dodano ID: 10 (Towarzyskie), 468 (Eliminacje MŚ Europa), 5 (Liga Narodów), 4 (ME), 1 (MŚ)
        const szerokieLigi = [1, 2, 3, 4, 5, 9, 10, 15, 30, 32, 34, 39, 40, 61, 71, 78, 88, 94, 106, 135, 140, 203, 253, 468, 848];
        let wybranePilka = apiFootball.response.filter(match => szerokieLigi.includes(match.league.id) && match.fixture.status.short === 'NS');
        if (wybranePilka.length < 10) wybranePilka = apiFootball.response.filter(match => match.fixture.status.short === 'NS'); 

        listaPilka = wybranePilka.slice(0, 40).map(match => {
            const godzina = new Date(match.fixture.date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            return `ID: ${match.fixture.id} | ${godzina} | ${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name})`;
        }).join('\n');
    }

    // --- POBIERANIE NBA ---
    console.log(`🏀 Pobieram NBA z ESPN...`);
    const [espnToday, espnTomorrow] = await Promise.all([
        fetchSports(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${getEspnDate(dzisiaj)}`),
        fetchSports(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${getEspnDate(jutro)}`)
    ]);

    let wybraneNBA = [];
    if (espnToday?.events) wybraneNBA = wybraneNBA.concat(espnToday.events.filter(e => e.status.type.state === 'pre'));
    if (espnTomorrow?.events) wybraneNBA = wybraneNBA.concat(espnTomorrow.events.filter(e => e.status.type.state === 'pre'));

    if (wybraneNBA.length > 0) {
        listaNBA = wybraneNBA.slice(0, 15).map(match => {
            const meczObj = new Date(match.date);
            const godzinaStr = meczObj.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            return `ID: ${match.id} | ${godzinaStr} | ${match.name}`;
        }).join('\n');
    }

    const promptText = `Jesteś elitarnym analitykiem. Dzisiejsza data: ${dzisiajPl}. 
    Analizuj TYLKO mecze z list:
    PIŁKA: ${listaPilka || 'Brak'}
    NBA: ${listaNBA || 'Brak'}
    ZASADY: 1. Wybierz dokładnie 3 z piłki i 2 z NBA. 2. Podaj konkretny typ (1, X, 2, over/under). 3. Napisz 3-4 zdania analizy.
    Zwróć TYLKO czysty JSON: {"mecze": [{"sport": "NBA/Pilka_Nozna", "fixture_id": "id", "mecz": "A vs B", "typ": "X", "kurs": "1.90", "analiza": "...", "status": "oczekujący", "data": "${dzisiajPl}", "godzina": "HH:MM"}]}`;

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    const response = await fetch(generateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });
    const resData = await response.json();
    const rawText = resData.candidates[0].content.parts[0].text;
    const cleanJson = rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1);
    const generatedData = JSON.parse(cleanJson);

    fs.writeFileSync(filePath, JSON.stringify(generatedData, null, 2));
    
    let historia = [];
    if (fs.existsSync(historyPath)) historia = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    historia.push({ data: dzisiajPl, mecze: generatedData.mecze });
    fs.writeFileSync(historyPath, JSON.stringify(historia.slice(-30), null, 2)); // Trzymaj ostatnie 30 dni

  } catch (e) {
    console.error("❌ Błąd:", e.message);
  }
}
run();
