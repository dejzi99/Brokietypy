const fs = require('fs');
const path = require('path');

async function run() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const apiSportsKey = process.env.APISPORTS_KEY;
  const historyPath = path.join(process.cwd(), 'public', 'historia.json');

  if (!fs.existsSync(historyPath)) {
      console.log("Brak pliku historia.json. Nie ma czego weryfikować.");
      return;
  }

  let historia = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  let oczekujaceMecze = [];

  // Szukamy meczów, które wiszą jako "oczekujący"
  historia.forEach(dzien => {
      dzien.mecze.forEach(m => {
          if (m.status === "oczekujący" && m.fixture_id && m.fixture_id !== "0") {
              oczekujaceMecze.push(m);
          }
      });
  });

  if (oczekujaceMecze.length === 0) {
      console.log("Brak oczekujących meczów. Wszystko rozliczone!");
      return;
  }

  console.log(`Znalazłem ${oczekujaceMecze.length} meczów do weryfikacji. Pobieram oficjalne statystyki...`);

  let statystykiDlaGemini = [];

  for (let m of oczekujaceMecze) {
      try {
          // Pobieramy dokładne dane pomeczowe z API-Sports
          const res = await fetch(`https://v3.football.api-sports.io/fixtures?id=${m.fixture_id}`, {
              headers: { 'x-apisports-key': apiSportsKey }
          });
          const data = await res.json();
          
          if (data.response && data.response.length > 0) {
              const matchData = data.response[0];
              const statusMeczu = matchData.fixture.status.short; // FT (Full Time)

              // Sprawdzamy, czy mecz na pewno się już skończył
              if (['FT', 'AET', 'PEN'].includes(statusMeczu)) {
                  const home = matchData.teams.home.name;
                  const away = matchData.teams.away.name;
                  const goalsHome = matchData.goals.home;
                  const goalsAway = matchData.goals.away;
                  
                  let statsString = `Wynik meczu: ${home} ${goalsHome} - ${goalsAway} ${away}. `;
                  
                  // Wyciągamy szczegóły: rożne, kartki
                  if (matchData.statistics && matchData.statistics.length === 2) {
                      const getStat = (stats, name) => {
                          const s = stats.find(x => x.type === name);
                          return s ? (s.value !== null ? s.value : 0) : 0;
                      };
                      const homeCorners = getStat(matchData.statistics[0].statistics, "Corner Kicks");
                      const awayCorners = getStat(matchData.statistics[1].statistics, "Corner Kicks");
                      statsString += `Łącznie rzutów rożnych w meczu: ${homeCorners + awayCorners}.`;
                  }

                  statystykiDlaGemini.push({
                      id: m.fixture_id,
                      mecz: m.mecz,
                      typ: m.typ,
                      rzeczywiste_statystyki_po_meczu: statsString
                  });
              } else {
                  console.log(`Mecz ${m.mecz} jeszcze trwa lub jest opóźniony (Status: ${statusMeczu}).`);
              }
          }
      } catch (e) {
          console.log(`Błąd pobierania statystyk dla ID ${m.fixture_id}: ${e.message}`);
      }
      
      // Mała pauza, żeby nie zablokować darmowego API-Sports (0.5 sekundy)
      await new Promise(r => setTimeout(r, 500));
  }

  if (statystykiDlaGemini.length === 0) {
      console.log("Żaden z oczekujących meczów jeszcze się nie zakończył.");
      return;
  }

  // WYSYŁAMY DANE DO SĘDZIEGO GEMINI
  const promptText = `Jesteś systemem automatycznie rozliczającym kupony bukmacherskie.
  Oto lista zagranych typów oraz RZECZYWISTYCH oficjalnych statystyk po zakończeniu tych meczów:
  ${JSON.stringify(statystykiDlaGemini, null, 2)}
  
  Twoim zadaniem jest ocenić, czy dany "typ" jest wygrany czy przegrany, na podstawie "rzeczywiste_statystyki_po_meczu".
  Zwróć wynik jako czysty kod JSON w formacie:
  {
      "wyniki": [
          { "id": "12345", "status": "wygrana" },
          { "id": "67890", "status": "przegrana" }
      ]
  }
  Używaj WYŁĄCZNIE słów "wygrana" lub "przegrana" w polu status.`;

  try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const responseGemini = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
      });
      
      const resData = await responseGemini.json();
      let rawText = resData.candidates[0].content.parts[0].text;
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}') + 1;
      const werdykt = JSON.parse(rawText.substring(start, end));

      // Zapisujemy wyroki sędziego do pliku historia.json
      let zaktualizowano = 0;
      historia.forEach(dzien => {
          dzien.mecze.forEach(m => {
              const rozliczenie = werdykt.wyniki.find(w => w.id == m.fixture_id);
              if (rozliczenie) {
                  m.status = rozliczenie.status; // Podmieniamy status z "oczekujący" na "wygrana" lub "przegrana"
                  zaktualizowano++;
              }
          });
      });

      fs.writeFileSync(historyPath, JSON.stringify(historia, null, 2));
      console.log(`✅ SĘDZIA ZAKOŃCZYŁ PRACĘ! Zweryfikowano i rozliczono ${zaktualizowano} meczów.`);

  } catch (e) {
      console.log("Błąd Gemini podczas werdyktu:", e.message);
  }
}
run();
