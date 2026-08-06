import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CashFlowPoint, CurrencyCode, SpendForecast } from '@fintech/shared';
import { CHART, ChartTooltip, axisProps, currencyTick, dateTick } from './chart-theme';
import { formatMoney, formatPercent } from '../../lib/format';

interface CashFlowChartProps {
  readonly history: readonly CashFlowPoint[];
  readonly forecast: SpendForecast;
  readonly currency: CurrencyCode;
}

interface Row {
  readonly date: string;
  readonly income?: number;
  readonly expenses?: number;
  readonly projected?: number;
  readonly bandLower?: number;
  readonly bandSpan?: number;
}

export function CashFlowChart({ history, forecast, currency }: CashFlowChartProps): JSX.Element {
  const rows = useMemo<Row[]>(() => {
    const actuals: Row[] = history.map((point) => ({
      date: point.date,
      income: point.income,
      expenses: point.expenses,
    }));

    const projections: Row[] = forecast.points.map((point) => ({
      date: point.date,
      projected: point.projected / 100,
      bandLower: point.lowerBound / 100,
      bandSpan: (point.upperBound - point.lowerBound) / 100,
    }));

    const last = actuals.at(-1);
    const seam = projections[0];
    if (last?.expenses !== undefined && seam) {
      projections[0] = { ...seam, projected: last.expenses };
    }

    return [...actuals, ...projections];
  }, [history, forecast]);

  const boundaryDate = history.at(-1)?.date;
  const forecastEnd = forecast.points.at(-1)?.date;

  return (
    <section className="panel p-4" aria-label="Cash flow and 30-day expense forecast">
      <header className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div>
          <h2 className="display text-[15px] font-semibold">Cash flow</h2>
          <p className="eyebrow mt-1">Settled income vs expenses · 30-day projection</p>
        </div>
        <ForecastConfidence forecast={forecast} currency={currency} />
      </header>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="grad-income" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.inflow} stopOpacity={0.32} />
                <stop offset="100%" stopColor={CHART.inflow} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="grad-expenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.outflow} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CHART.outflow} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke={CHART.grid} strokeDasharray="0" vertical={false} />
            <XAxis dataKey="date" tickFormatter={dateTick} minTickGap={36} {...axisProps} />
            <YAxis tickFormatter={currencyTick(currency)} width={58} {...axisProps} />

            {boundaryDate && forecastEnd && (
              <ReferenceArea
                x1={boundaryDate}
                x2={forecastEnd}
                fill={CHART.forecast}
                fillOpacity={0.045}
                strokeOpacity={0}
              />
            )}
            {boundaryDate && (
              <ReferenceLine
                x={boundaryDate}
                stroke={CHART.forecast}
                strokeDasharray="2 3"
                label={{
                  value: 'TODAY',
                  position: 'insideTopRight',
                  fill: CHART.forecast,
                  fontSize: 9.5,
                  fontFamily: 'IBM Plex Mono, monospace',
                  letterSpacing: '0.14em',
                }}
              />
            )}

            <Area
              type="monotone"
              dataKey="income"
              name="Income"
              stroke={CHART.inflow}
              strokeWidth={1.75}
              fill="url(#grad-income)"
              connectNulls={false}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
            <Area
              type="monotone"
              dataKey="expenses"
              name="Expenses"
              stroke={CHART.outflow}
              strokeWidth={1.75}
              fill="url(#grad-expenses)"
              connectNulls={false}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />

            <Area
              dataKey="bandLower"
              stackId="band"
              stroke="none"
              fill="transparent"
              legendType="none"
              isAnimationActive={false}
            />
            <Area
              dataKey="bandSpan"
              name="95% range"
              stackId="band"
              stroke="none"
              fill={CHART.forecast}
              fillOpacity={0.12}
              legendType="none"
              isAnimationActive={false}
            />

            <Line
              type="monotone"
              dataKey="projected"
              name="Projected spend"
              stroke={CHART.forecast}
              strokeWidth={1.75}
              strokeDasharray="5 4"
              dot={false}
              connectNulls={false}
            />

            <Tooltip
              cursor={{ stroke: CHART.grid, strokeWidth: 1 }}
              content={
                <ChartTooltip currency={currency} hiddenKeys={['bandLower', 'bandSpan']} />
              }
            />
            <Legend
              verticalAlign="bottom"
              height={28}
              iconType="plainline"
              wrapperStyle={{
                fontSize: 11,
                fontFamily: 'IBM Plex Mono, monospace',
                color: 'var(--graphite)',
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ForecastConfidence({
  forecast,
  currency,
}: {
  forecast: SpendForecast;
  currency: CurrencyCode;
}): JSX.Element {
  const label =
    forecast.method === 'linear-regression'
      ? 'Trend fit'
      : forecast.method === 'moving-average'
        ? 'Moving average'
        : 'Not enough history';

  const quality =
    forecast.rSquared >= 0.6 ? 'strong' : forecast.rSquared >= 0.3 ? 'moderate' : 'weak';

  return (
    <div className="text-right">
      <div className="figure text-[15px]" style={{ color: 'var(--gold)' }}>
        {formatMoney(forecast.projectedTotal, { compact: true })}
      </div>
      <div className="eyebrow mt-0.5">
        next {forecast.horizonDays}d · {label}
        {forecast.method === 'linear-regression' && (
          <>
            {' '}
            · R² {formatPercent(forecast.rSquared * 100, 0)} ({quality})
          </>
        )}
      </div>
    </div>
  );
}
