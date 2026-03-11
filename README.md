# ⚽ Value Bets AI — Instrukcja wdrożenia na Vercel

## Struktura projektu
```
bukmacher/
├── api/
│   ├── generate.js   ← generuje raport przez Claude (cron + ręczne wywołanie)
│   └── raport.js     ← zwraca raport z bazy danych
├── public/
│   └── index.html    ← strona frontendowa
├── package.json
├── vercel.json       ← konfiguracja crona (codziennie 17:05 CET)
└── README.md
```

---

## WDROŻENIE KROK PO KROKU

### Krok 1 — Załóż konto na Vercel
Wejdź na **vercel.com** → Sign Up → Continue with GitHub

### Krok 2 — Wgraj projekt
1. Wejdź na **github.com** → New repository → nazwa: `value-bets`
2. Wgraj wszystkie pliki z tego folderu
3. Na Vercel: "Add New Project" → wybierz repozytorium `value-bets`
4. Kliknij "Deploy" (bez zmian w ustawieniach)

### Krok 3 — Dodaj bazę danych (Vercel KV)
1. W dashboardzie Vercel wejdź w projekt → zakładka **Storage**
2. Kliknij **Create Database** → wybierz **KV (Redis)**
3. Nadaj nazwę `raport-db` → Create
4. Kliknij **Connect to Project** → wybierz swój projekt

Vercel automatycznie doda zmienne środowiskowe KV do projektu.

### Krok 4 — Dodaj zmienne środowiskowe
W projekcie Vercel: **Settings** → **Environment Variables** → dodaj:

| Nazwa | Wartość |
|-------|---------|
| `ANTHROPIC_API_KEY` | sk-ant-twój-klucz |
| `CRON_SECRET` | wymyśl dowolne hasło, np. `moje-tajne-haslo-123` |

### Krok 5 — Wygeneruj pierwszy raport ręcznie
Po wdrożeniu wejdź w przeglądarce na:
```
https://twoja-domena.vercel.app/api/generate?secret=moje-tajne-haslo-123
```

Poczekaj ~30 sekund — Claude przeszuka internet i wygeneruje raport.
Potem wejdź na stronę główną i sprawdź czy raport się pojawił!

### Krok 6 — Cron (automatyczny)
Raport będzie się generował automatycznie **codziennie o 17:00 CET**.
Skonfigurowane w pliku `vercel.json`.

---

## ROZWIĄZYWANIE PROBLEMÓW

**Strona pokazuje "Raport nie jest jeszcze gotowy"**
→ Wywołaj ręcznie: `/api/generate?secret=TWOJ_SECRET`

**Błąd 401 przy /api/generate**
→ Dodaj `?secret=TWOJ_SECRET` do URL lub usuń zmienną `CRON_SECRET` z Vercel

**Błąd Claude API**
→ Sprawdź czy `ANTHROPIC_API_KEY` jest poprawny i konto ma środki

**KV connection error**
→ Sprawdź czy baza KV jest podłączona do projektu w zakładce Storage
