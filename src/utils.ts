import { dashboardData } from './data';

export function parseDate(str: string | null) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export function diffInDays(a: Date | null, b: Date | null) {
  if (!a || !b) return null;
  const diffMs = b.getTime() - a.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

export function formatCurrency(value: number | null) {
  if (value == null || isNaN(value)) return "–";
  return "$" + value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatPercent(value: number | null) {
  if (value == null || isNaN(value)) return "–";
  return (value * 100).toFixed(1) + "%";
}

export function formatCount(value: number | null) {
  if (value == null || isNaN(value)) return "–";
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatMiles(value: number | null) {
  if (value == null || isNaN(value)) return "–";
  return formatCount(Math.round(value)) + " mi";
}

export function formatDays(value: number | null) {
  if (value == null || isNaN(value)) return "–";
  return value.toFixed(1) + " days";
}

export function classifyStatus(metricKey: string, value: number | null) {
  const t = dashboardData.statusThresholds;
  if (value == null || isNaN(value)) return "good";
  switch (metricKey) {
    case "delayRate":
      if (value <= t.delayRate.goodMax) return "good";
      if (value <= t.delayRate.warningMax) return "warning";
      return "bad";
    case "avgDeliveryDays":
      if (value <= t.avgDeliveryDays.goodMax) return "good";
      if (value <= t.avgDeliveryDays.warningMax) return "warning";
      return "bad";
    case "routeEfficiency":
      if (value >= t.routeEfficiency.goodMin) return "good";
      if (value >= t.routeEfficiency.warningMin) return "warning";
      return "bad";
    case "costPerMile":
      if (value <= t.costPerMile.goodMax) return "good";
      if (value <= t.costPerMile.warningMax) return "warning";
      return "bad";
    case "costPerShipment":
      if (value <= t.costPerShipment.goodMax) return "good";
      if (value <= t.costPerShipment.warningMax) return "warning";
      return "bad";
    default:
      return "good";
  }
}

export function buildMonthKey(dateStr: string | null) {
  const d = parseDate(dateStr);
  if (!d) return "Unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return y + "-" + m;
}

export function deriveShipmentFields(shipments: any[]) {
  return shipments.map(s => {
    const shipDate = parseDate(s.ship_date);
    const deliveryDate = parseDate(s.delivery_date);
    const promisedDate = parseDate(s.promised_delivery_date);
    const deliveryDays = diffInDays(shipDate, deliveryDate);
    
    let late_flag = 0;
    let on_time_flag = 0;
    let delay_days = 0;

    if (deliveryDate && promisedDate) {
      late_flag = deliveryDate > promisedDate ? 1 : 0;
      on_time_flag = deliveryDate <= promisedDate ? 1 : 0;
      delay_days = deliveryDate > promisedDate ? diffInDays(promisedDate, deliveryDate) || 0 : 0;
    }

    const freight = Number(s.freight_cost || 0);
    const fuel = Number(s.fuel_cost || 0);
    const handling = Number(s.handling_cost || 0);
    const total_logistics_cost = freight + fuel + handling;
    
    const actualMiles = Number(s.actual_miles || 0);
    const plannedMiles = Number(s.planned_miles || 0);
    
    const transportation_cost_per_mile = actualMiles > 0 ? total_logistics_cost / actualMiles : null;
    const route_efficiency = (actualMiles > 0 && plannedMiles > 0) ? (plannedMiles / actualMiles) : null;
    const month_key = buildMonthKey(s.ship_date);

    return {
      ...s,
      delivery_time_days: deliveryDays,
      late_flag,
      on_time_flag,
      delay_days,
      total_logistics_cost,
      transportation_cost_per_mile,
      route_efficiency,
      month_key
    };
  });
}

export function aggregateKPIs(shipments: any[]) {
  let totalShipments = 0;
  let sumDeliveryDays = 0;
  let sumDelayDays = 0;
  let sumMiles = 0;
  let sumPlannedMiles = 0;
  let sumCost = 0;
  let lateCount = 0;
  let onTimeCount = 0;

  shipments.forEach(s => {
    totalShipments += 1;
    if (s.delivery_time_days != null) sumDeliveryDays += s.delivery_time_days;
    if (s.delay_days != null) sumDelayDays += s.delay_days;
    const aMiles = Number(s.actual_miles || 0);
    const pMiles = Number(s.planned_miles || 0);
    sumMiles += aMiles;
    sumPlannedMiles += pMiles;
    sumCost += Number(s.total_logistics_cost || 0);
    lateCount += s.late_flag || 0;
    onTimeCount += s.on_time_flag || 0;
  });

  const avgDeliveryDays = totalShipments > 0 ? (sumDeliveryDays / totalShipments) : null;
  const avgDelayDays = lateCount > 0 ? (sumDelayDays / lateCount) : 0;
  const transportationCostPerMile = sumMiles > 0 ? (sumCost / sumMiles) : null;
  const routeEfficiency = (sumMiles > 0 && sumPlannedMiles > 0) ? (sumPlannedMiles / sumMiles) : null;
  const delayRate = totalShipments > 0 ? (lateCount / totalShipments) : 0;
  const costPerShipment = totalShipments > 0 ? (sumCost / totalShipments) : null;
  const onTimeRate = totalShipments > 0 ? (onTimeCount / totalShipments) : 0;

  return {
    totalShipments,
    totalMiles: sumMiles,
    totalCost: sumCost,
    avgDeliveryDays,
    avgDelayDays,
    transportationCostPerMile,
    routeEfficiency,
    delayRate,
    costPerShipment,
    onTimeRate
  };
}

export function groupByRegion(shipments: any[]) {
  const groups: Record<string, any[]> = {};
  shipments.forEach(s => {
    const region = s.region || "Unknown";
    if (!groups[region]) groups[region] = [];
    groups[region].push(s);
  });
  const result: Record<string, any> = {};
  Object.keys(groups).forEach(region => {
    result[region] = aggregateKPIs(groups[region]);
  });
  return result;
}
