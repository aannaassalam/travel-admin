import { formatMoney } from "@/lib/functions/format.lib";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

/**
 * Daily revenue (bars) with bookings (line). Loaded with next/dynamic
 * ssr:false from the dashboard — ResponsiveContainer needs the window.
 */
export default function TrendChart({
  data,
  currency,
  compact
}: {
  data: { date: string; revenue: number; bookings: number }[];
  currency: string;
  compact: boolean;
}) {
  const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  // Enough labels to read, never so many they collide.
  const interval = Math.max(0, Math.ceil(data.length / (compact ? 4 : 10)) - 1);
  return (
    <ResponsiveContainer width="100%" height={compact ? 220 : 280}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickFormatter={ddmm}
          interval={interval}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          yAxisId="money"
          tickFormatter={(v: number) => `${Math.round(v / 100)}`}
          tickLine={false}
          axisLine={false}
          width={compact ? 34 : 44}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          yAxisId="count"
          orientation="right"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={compact ? 22 : 30}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload;
            if (!active || !row) return null;
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="font-medium">{ddmm(row.date)}</p>
                <p className="tabular-nums">
                  Revenue {formatMoney(row.revenue, currency)}
                </p>
                <p className="tabular-nums">
                  {row.bookings} booking{row.bookings === 1 ? "" : "s"}
                </p>
              </div>
            );
          }}
        />
        <Bar
          yAxisId="money"
          dataKey="revenue"
          fill="var(--chart-1)"
          radius={[3, 3, 0, 0]}
          maxBarSize={28}
        />
        <Line
          yAxisId="count"
          dataKey="bookings"
          stroke="var(--chart-2)"
          strokeWidth={2}
          dot={false}
          type="monotone"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
