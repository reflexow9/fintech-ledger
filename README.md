# Fintech-leder
# Ledger — Personal Fintech Dashboard

Expense and income tracking with a 30-day spending forecast. TypeScript monorepo: the domain
types are declared once and imported by both the Node API and the React client, so a contract
change breaks the build instead of production.

```
packages/shared/   domain model + REST contract (imported by BOTH runtimes)
server/            Express + TypeScript
client/            React + Recharts + Tailwind
```

## Running it

Requires Node 20+.

```bash
npm run setup     # install + build the shared types package
npm run dev       # API on :4000, web on :5173
```

Open http://localhost:5173. Sign-in is automatic (mock JWT), and two workspaces are seeded with
180 days of transactions.

| Command | What it does |
|---|---|
| `npm run dev` | Both processes together |
| `npm test` | Vitest over the forecast + CSV services (21 tests) |
| `npm run typecheck` | Strict `tsc --noEmit` across all three packages |
| `npm run build` | Production build |

## What it does

- **KPIs with period-over-period deltas** against an equal-length preceding window — not "last
  calendar month". Months are 28–31 days, which bakes a 10% error into every delta before any
  real change is measured.
- **Cash-flow chart** — income and expenses as gradient areas, then past the `TODAY` rule, a
  30-day forecast as a dashed line with its 95% prediction band.
- **Spending forecast** — dense daily buckets → day-of-week seasonality → OLS → a prediction
  interval that widens with the horizon. Thin history falls back to a moving average; almost no
  history returns an honest "insufficient data". R² is shown on screen.
- **Ledger** — server-side pagination, sorting, and fuzzy search ("starbcks" finds Starbucks).
- **CSV import** — three steps: upload → column mapping (auto-matched) → validation review. The
  review step hits the same endpoint with `dryRun`, so the preview cannot promise something the
  commit then refuses.
- **Manual entry** — the **Add** button in the top bar.

## Key decisions

**Money is integer minor units**, never a float. `{ minorUnits: 6420, currency: 'USD' }`.
IEEE-754 drift in a ledger surfaces months later as a reconciliation that is off by cents.

**The sign lives in `type`**, not in the number. A malformed import can flip a sign; it cannot
silently turn an expense into income.

**Colour follows sentiment, not direction.** The server returns `direction` and `sentiment` as
separate fields. Expenses falling renders green. Colouring by direction paints a 20% cost
reduction red.

**One amount parser** for manual entry and CSV alike. Two parsers would eventually disagree
about what `1 234,56` means, and that disagreement only ever surfaces as a total off by a
factor of a hundred.

**No `any` anywhere.** `unknown` appears exactly where data crosses a trust boundary
(`req.body`, `req.query`, `response.json()`), each narrowed by an explicit guard.

## Production swaps

| Mock | Replace with |
|---|---|
| `decodeMockJwt` | `jsonwebtoken.verify` against a JWKS — `authenticate`'s signature is unchanged |
| `createInMemoryRepository` | Prisma/Postgres behind the same interface — one line in `app.ts` |
| In-process fuzzy search | Postgres `pg_trgm` + GIN index |


# Ukrainan version

Облік витрат і доходів із прогнозом. TypeScript-монорепо: доменні типи оголошені
один раз і імпортуються і Node-API, і React-клієнтом, тож зміна контракту ламає збірку, а не
продакшн.

```
packages/shared/   доменна модель + REST-контракт (спільні для обох рантаймів)
server/            Express + TypeScript
client/            React + Recharts + Tailwind
```

## Запуск

Потрібен Node 20+.

```bash
npm run setup     # install + збірка спільних типів
npm run dev       # API :4000 + web :5173
```

Далі http://localhost:5173. Вхід автоматичний (mock JWT), два воркспейси вже засіяні 180 днями
транзакцій.

| Команда             | Що робить                                    |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Обидва процеси разом                         |
| `npm test`          | Vitest по прогнозу та CSV-сервісах (21 тест) |
| `npm run typecheck` | Строгий `tsc --noEmit` по всіх трьох пакетах |
| `npm run build`     | Продакшн-збірка                              |

## Що вміє

- **KPI з дельтами** до попереднього періоду рівної довжини (не «минулий календарний місяць» —
  у місяців різна кількість днів, і це вносить 10% похибки ще до будь-яких реальних змін).
- **Графік грошового потоку** — доходи й витрати площами, далі за лінією `TODAY` прогноз на
  30 днів пунктиром із 95% інтервалом.
- **Прогноз витрат** — денні кошики → індекси днів тижня → OLS → інтервал передбачення, що
  розширюється з горизонтом. Мало історії — ковзне середнє, зовсім мало — чесне «недостатньо
  даних». R² показується на екрані.
- **Реєстр** — пагінація, сортування і нечіткий пошук на сервері («starbcks» знаходить
  Starbucks).
- **Імпорт CSV** — 3 кроки: завантаження → зіставлення колонок (визначається автоматично) →
  перевірка. Крок перевірки б'є в той самий ендпоінт із `dryRun`, тож попередній перегляд не
  може пообіцяти те, що коміт відхилить.
- **Ручне додавання** — кнопка **Add** у верхній панелі.

## Ключові рішення

**Гроші — цілі мінорні одиниці**, не float. `{ minorUnits: 6420, currency: 'USD' }`. Дрейф
IEEE-754 у реєстрі виявляється через півроку як звірка, що не сходиться на копійки.

**Знак живе в `type`**, а не в числі. Зіпсований імпорт може перевернути знак — але не може
тихо перетворити витрату на дохід.

**Колір за сентиментом, не за напрямком.** Сервер повертає `direction` і `sentiment` окремо.
Витрати, що падають, — зелені. Розфарбовування за напрямком малює 20% скорочення витрат
червоним.

**Один парсер сум** на ручне введення і CSV. Два парсери зрештою розійдуться у тому, що означає
`1 234,56`, і виявиться це як підсумок, помилковий у сто разів.

**Ніяких `any`.** `unknown` є рівно там, де дані переходять межу довіри (`req.body`,
`req.query`, `response.json()`), і кожен звужується явним гардом.

## Заміни для продакшну

| Мок                        | На що міняти                                                              |
| -------------------------- | ------------------------------------------------------------------------- |
| `decodeMockJwt`            | `jsonwebtoken.verify` проти JWKS — сигнатура `authenticate` не змінюється |
| `createInMemoryRepository` | Prisma/Postgres за тим самим інтерфейсом — один рядок в `app.ts`          |
| Нечіткий пошук у пам'яті   | Postgres `pg_trgm` + GIN-індекс                                           |
