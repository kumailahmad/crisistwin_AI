"use client";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Datum = { name: string; value: number; color: string };
const tip = { background: "#0b1a33", border: "1px solid #1b2f55", borderRadius: 8, color: "#dbe6f7" };

export function Donut({ data }: { data: Datum[] }) {
  return (
    <ResponsiveContainer><PieChart><Pie data={data} dataKey="value" innerRadius={44} outerRadius={70} paddingAngle={3} stroke="none">{data.map((e) => <Cell key={e.name} fill={e.color} />)}</Pie><Tooltip contentStyle={tip} /></PieChart></ResponsiveContainer>
  );
}
export function ColorBars({ data }: { data: Datum[] }) {
  return (
    <ResponsiveContainer><BarChart data={data}><CartesianGrid stroke="#1b2f55" vertical={false} /><XAxis dataKey="name" stroke="#8fa6c4" fontSize={11} /><YAxis allowDecimals={false} stroke="#8fa6c4" fontSize={11} /><Tooltip cursor={{ fill: "#0f2140" }} contentStyle={tip} /><Bar dataKey="value" radius={[6, 6, 0, 0]}>{data.map((c) => <Cell key={c.name} fill={c.color} />)}</Bar></BarChart></ResponsiveContainer>
  );
}
