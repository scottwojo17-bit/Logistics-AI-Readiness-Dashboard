import { Search, Download, Loader2, FileText, Upload } from 'lucide-react';
import React, { useState, useMemo, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Papa from 'papaparse';
import { dashboardData } from './data';
import { 
  deriveShipmentFields, 
  aggregateKPIs, 
  groupByRegion, 
  classifyStatus, 
  formatDays, 
  formatCurrency, 
  formatPercent, 
  formatCount, 
  formatMiles 
} from './utils';

export default function App() {
  const [regionFilter, setRegionFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [shipmentsData, setShipmentsData] = useState(dashboardData.shipments);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const enrichedShipments = useMemo(() => {
  return deriveShipmentFields(shipmentsData);
}, [shipmentsData]);

  const filterOptions = useMemo(() => {
    const regions = Array.from(new Set(enrichedShipments.map(s => s.region || "Unknown"))).sort();
    const months = Array.from(new Set(enrichedShipments.map(s => s.month_key || "Unknown"))).sort();
    const modes = Array.from(new Set(enrichedShipments.map(s => s.mode || "Unknown"))).sort();
    return { regions, months, modes };
  }, [enrichedShipments]);

  const filteredShipments = useMemo(() => {
    return enrichedShipments.filter(s => {
      if (regionFilter !== 'all' && s.region !== regionFilter) return false;
      if (monthFilter !== 'all' && s.month_key !== monthFilter) return false;
      if (modeFilter !== 'all' && s.mode !== modeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const haystack = [
          s.shipment_id, s.route, s.origin, s.destination, s.region, s.state, s.city
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [enrichedShipments, regionFilter, monthFilter, modeFilter, searchQuery]);

  const overallKPIs = useMemo(() => aggregateKPIs(filteredShipments), [filteredShipments]);
  const regionAgg = useMemo(() => groupByRegion(filteredShipments), [filteredShipments]);

  const resetFilters = () => {
    setRegionFilter('all');
    setMonthFilter('all');
    setModeFilter('all');
    setSearchQuery('');
  };

  const handleDownloadPdf = async () => {
    const element = document.getElementById('dashboard-content');
    if (!element) return;
    
    try {
      setIsGeneratingPdf(true);
      // Small delay to ensure state updates (like loader) are painted
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true,
        backgroundColor: '#050814' 
      });
      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('logistics-dashboard.pdf');
    } catch (error) {
      console.error('Failed to generate PDF', error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadCsv = () => {
    const headers = [
      "Shipment ID", "Order ID", "Region", "State", "City", "Route", "Origin", "Destination", 
      "Mode", "Ship Date", "Delivery Date", "Promised Delivery Date", "Delivery Time (days)", 
      "Delay Days", "Late Flag", "Planned Miles", "Actual Miles", "Freight Cost", "Fuel Cost", 
      "Handling Cost", "Total Logistics Cost", "Cost Per Mile", "Route Efficiency", "Delay Reason"
    ];

    const escapeCsv = (val: any) => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows = [];
    csvRows.push(headers.join(','));

    for (const s of filteredShipments) {
      const row = [
        s.shipment_id,
        s.order_id,
        s.region,
        s.state,
        s.city,
        s.route,
        s.origin,
        s.destination,
        s.mode,
        s.ship_date,
        s.delivery_date,
        s.promised_delivery_date,
        s.delivery_time_days,
        s.delay_days,
        s.late_flag ? 'Yes' : 'No',
        s.planned_miles,
        s.actual_miles,
        s.freight_cost,
        s.fuel_cost,
        s.handling_cost,
        s.total_logistics_cost,
        s.transportation_cost_per_mile?.toFixed(2) || '',
        s.route_efficiency?.toFixed(2) || '',
        s.delay_reason
      ].map(escapeCsv);
      csvRows.push(row.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "filtered_shipments.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedData = results.data.map((row: any) => ({
          shipment_id: row["Shipment ID"] || row.shipment_id,
          order_id: row["Order ID"] || row.order_id,
          region: row["Region"] || row.region,
          state: row["State"] || row.state,
          city: row["City"] || row.city,
          route: row["Route"] || row.route,
          origin: row["Origin"] || row.origin,
          destination: row["Destination"] || row.destination,
          mode: row["Mode"] || row.mode,
          ship_date: row["Ship Date"] || row.ship_date,
          delivery_date: row["Delivery Date"] || row.delivery_date,
          promised_delivery_date: row["Promised Delivery Date"] || row.promised_delivery_date,
          planned_miles: parseFloat(row["Planned Miles"] || row.planned_miles) || 0,
          actual_miles: parseFloat(row["Actual Miles"] || row.actual_miles) || 0,
          freight_cost: parseFloat(row["Freight Cost"] || row.freight_cost) || 0,
          fuel_cost: parseFloat(row["Fuel Cost"] || row.fuel_cost) || 0,
          handling_cost: parseFloat(row["Handling Cost"] || row.handling_cost) || 0,
          delay_reason: row["Delay Reason"] || row.delay_reason || ""
        }));
        
        if (parsedData.length > 0) {
          setShipmentsData(parsedData);
          resetFilters();
        } else {
          alert("No valid data found in the CSV file.");
        }
      },
      error: (error) => {
        console.error("Error parsing CSV:", error);
        alert("Failed to parse CSV file.");
      }
    });
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const networkStatus = useMemo(() => {
    const delayStatus = classifyStatus("delayRate", overallKPIs.delayRate);
    const avgDeliveryStatus = classifyStatus("avgDeliveryDays", overallKPIs.avgDeliveryDays);
    
    if (delayStatus === "bad" || avgDeliveryStatus === "bad") return { label: "Network · Critical", color: "text-red-400 border-red-400/90" };
    if (delayStatus === "warning" || avgDeliveryStatus === "warning") return { label: "Network · At Risk", color: "text-orange-400 border-orange-400/90" };
    return { label: "Network · On Track", color: "text-emerald-400 border-emerald-400/90" };
  }, [overallKPIs]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#141b33_0,#050814_55%)] text-slate-50 p-4 sm:p-6 font-sans flex justify-center">
      <div id="dashboard-content" className="w-full max-w-[1480px] flex flex-col gap-5 p-2 rounded-2xl">
        
        {/* HERO HEADER */}
       <header className="grid grid-cols-1 lg:grid-cols-[2.2fr_2.3fr] gap-5 items-start">

  {/* LEFT HERO PANEL */}
  <section className="bg-gradient-to-br from-[#0b1324] to-[#0f1a33] border border-slate-800 rounded-2xl p-6 shadow-[0_18px_40px_rgba(0,0,0,0.6)]">
    
    <div className="mb-4">
      <span className="text-xs tracking-widest uppercase text-cyan-400 border border-cyan-500/40 px-3 py-1 rounded-full">
        Logistics Control Center
      </span>
    </div>

    <h1 className="text-3xl font-semibold text-slate-100 leading-tight">
      Network Delivery Performance
    </h1>

    <p className="mt-3 text-slate-400 text-sm max-w-md">
      Five core KPIs driving cost, speed, and reliability across the U.S. shipment network.
    </p>

    <div className="mt-5 flex flex-col gap-3">

      <div className="flex items-center gap-2 border border-slate-700 rounded-full px-4 py-2 w-fit">
        <span className="h-2 w-2 bg-cyan-400 rounded-full"></span>
        <span className="text-sm text-slate-300">
          Real-time shipment lens · Region & month filters
        </span>
      </div>

      <div className="flex items-center gap-2 border border-slate-700 rounded-full px-4 py-2 w-fit">
        <span className="h-2 w-2 bg-blue-400 rounded-full"></span>
        <span className="text-sm text-slate-300">
          Delay, efficiency, and cost trade-offs
        </span>
      </div>

    </div>

    <div className="mt-6 grid grid-cols-3 gap-6 text-sm text-slate-400">

      <div>
        <p className="uppercase text-xs text-slate-500 mb-1">Network Baseline</p>
        <p className="text-slate-200">Rolling 90 days</p>
      </div>

      <div>
        <p className="uppercase text-xs text-slate-500 mb-1">Filters</p>
        <p className="text-slate-200">
          {regionFilter} · {monthFilter} · {modeFilter}
        </p>
      </div>

      <div>
        <p className="uppercase text-xs text-slate-500 mb-1">Routing Focus</p>
        <p className="text-slate-200">Route efficiency & delay rate</p>
      </div>

    </div>

  </section>


  {/* RIGHT FILTER PANEL */}
  <section className="bg-[#0a0f1e]/95 rounded-2xl border border-slate-800 p-4 flex flex-col gap-3 shadow-[0_18px_40px_rgba(0,0,0,0.6)] self-start">

    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-slate-300 text-sm">
        <span className="h-2 w-2 bg-blue-400 rounded-full"></span>
        Live Filters
      </div>

      <span className={`text-xs px-3 py-1 rounded-full border ${networkStatus.color}`}>
  {networkStatus.label}
</span>
    </div>

    {/* FILTER CONTROLS */}
    <div className="flex flex-wrap items-center gap-3 mt-2">

      <select
        value={regionFilter}
        onChange={(e) => setRegionFilter(e.target.value)}
        className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm"
      >
        <option value="all">All U.S. Regions</option>
        <option value="West">West</option>
        <option value="Southwest">Southwest</option>
        <option value="Midwest">Midwest</option>
        <option value="Southeast">Southeast</option>
        <option value="Northeast">Northeast</option>
      </select>

      <select
        value={monthFilter}
        onChange={(e) => setMonthFilter(e.target.value)}
        className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm"
      >
        <option value="All">All Months</option>
      </select>

      <select
        value={modeFilter}
        onChange={(e) => setModeFilter(e.target.value)}
        className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm"
      >
        <option value="All">All Modes</option>
        <option value="Truckload">Truckload</option>
        <option value="LTL">LTL</option>
      </select>

      <button
        onClick={handleResetFilters}
        className="bg-cyan-500 text-black px-4 py-2 rounded-lg text-sm font-medium"
      >
        Reset View
      </button>

      <button
        onClick={() => fileInputRef.current?.click()}
        className="border border-slate-600 text-slate-200 px-4 py-2 rounded-lg text-sm"
      >
        Upload CSV
      </button>

      <button
        onClick={handleExportCSV}
        className="border border-slate-600 text-slate-200 px-4 py-2 rounded-lg text-sm"
      >
        Save CSV
      </button>

      <button
        onClick={handleExportPDF}
        className="border border-slate-600 text-slate-200 px-4 py-2 rounded-lg text-sm"
      >
        Save PDF
      </button>

    </div>

  </section>

</header>

{/* HERO KPI STRIP */}
<section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
  <KPICard
    title="Average Delivery Time"
    subtitle="Door-to-door transit"
    value={formatDays(overallKPIs.avgDeliveryDays)}
    insight={`On-time: ${formatPercent(overallKPIs.onTimeRate)}`}
    status={classifyStatus("avgDeliveryDays", overallKPIs.avgDeliveryDays)}
    progress={Math.min(100, ((overallKPIs.avgDeliveryDays ?? 0) / 7) * 100)}
  />

  <KPICard
    title="Transportation Cost / Mile"
    subtitle="Network cost intensity"
    value={formatCurrency(overallKPIs.transportationCostPerMile)}
    insight={`Total cost: ${formatCurrency(overallKPIs.totalCost)}`}
    status={classifyStatus("costPerMile", overallKPIs.transportationCostPerMile)}
    progress={Math.min(100, ((overallKPIs.transportationCostPerMile ?? 0) / 4) * 100)}
  />

  <KPICard
    title="Route Efficiency"
    subtitle="Planned vs actual miles"
    value={
      overallKPIs.routeEfficiency != null
        ? overallKPIs.routeEfficiency.toFixed(2)
        : "–"
    }
    insight="Network efficiency vs planned"
    status={classifyStatus("routeEfficiency", overallKPIs.routeEfficiency)}
    progress={Math.min(100, ((overallKPIs.routeEfficiency ?? 0) / 1.4) * 100)}
  />

  <KPICard
    title="Delay Rate"
    subtitle="Late shipments share"
    value={formatPercent(overallKPIs.delayRate)}
    insight={`Late shipments: ${formatCount(
      Math.round((overallKPIs.delayRate ?? 0) * (overallKPIs.totalShipments ?? 0))
    )}`}
    status={classifyStatus("delayRate", overallKPIs.delayRate)}
    progress={Math.min(100, ((overallKPIs.delayRate ?? 0) / 0.25) * 100)}
  />

  <KPICard
    title="Cost per Shipment"
    subtitle="End-to-end logistics cost"
    value={formatCurrency(overallKPIs.costPerShipment)}
    insight={`Shipments: ${formatCount(overallKPIs.totalShipments ?? 0)}`}
    status={classifyStatus("costPerShipment", overallKPIs.costPerShipment)}
    progress={Math.min(100, ((overallKPIs.costPerShipment ?? 0) / 1000) * 100)}
  />
</section>

{/* MAIN GRID */}
        <section className="grid grid-cols-1 xl:grid-cols-[2.1fr_1.3fr] gap-3.5 items-start">
          
          <div className="grid grid-rows-[auto_auto] gap-3.5">
            {/* MAP PANEL */}
            <section className="bg-[#0e1424] rounded-2xl border border-slate-800 p-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.6)] flex flex-col gap-2.5">
              <div className="flex justify-between items-baseline">
                <div>
                  <div className="text-xs uppercase tracking-widest text-slate-400">U.S. Regional Performance Map</div>
                  <div className="text-[11px] text-slate-400">Click a region to filter all KPIs, charts, and shipment detail.</div>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="px-2 py-1 rounded-full border border-emerald-500/90 text-[10px] text-emerald-400">Green: On Track</div>
                  <div className="px-2 py-1 rounded-full border border-slate-400/50 text-[10px] text-slate-400">Amber: At Risk</div>
                  <div className="px-2 py-1 rounded-full border border-red-400/90 text-[10px] text-red-400">Red: Critical</div>
                </div>
              </div>
              
              <div className="flex-1 grid grid-cols-1 md:grid-cols-[1.7fr_1fr] gap-3 items-stretch mt-1">
                <div className="bg-[radial-gradient(circle_at_0_0,rgba(99,179,237,0.3),transparent_60%),#050814] rounded-xl border border-blue-400/30 p-2.5 relative overflow-hidden min-h-[200px]">
                  <div className="absolute left-3 top-2 text-[10px] uppercase tracking-[0.18em] text-slate-400 opacity-90">5 U.S. regions · Delay rate as color</div>
                  <USMap regionAgg={regionAgg} selectedRegion={regionFilter} onSelectRegion={r => setRegionFilter(r === regionFilter ? 'all' : r)} />
                  <div className="absolute right-2.5 bottom-2.5 text-[10px] text-slate-400 flex flex-col gap-1 bg-slate-900/90 rounded-xl p-1.5 border border-slate-400/50 backdrop-blur-md">
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-gradient-to-r from-emerald-500 to-teal-400"></span><span>Low delay</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-gradient-to-r from-orange-400 to-yellow-400"></span><span>At risk</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-gradient-to-r from-red-400 to-red-500"></span><span>High delay</span></div>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2">
                  {dashboardData.metadata.regions.map(r => {
                    const k = regionAgg[r] || aggregateKPIs([]);
                    const delayStatus = classifyStatus("delayRate", k.delayRate);
                    const isSelected = regionFilter === r;
                    
                    return (
                      <div 
                        key={r}
                        onClick={() => setRegionFilter(r === regionFilter ? 'all' : r)}
                        className={`bg-[#10182b] rounded-xl border p-2.5 grid grid-cols-[1.4fr_1.1fr] gap-1 cursor-pointer transition-all hover:-translate-y-[1px] hover:shadow-[0_14px_32px_rgba(15,23,42,0.8)]
                          ${isSelected ? 'border-teal-400/90 shadow-[0_0_0_1px_rgba(79,209,197,0.8),0_18px_40px_rgba(15,23,42,0.9)]' : 'border-slate-800 hover:border-blue-400/80'}
                        `}
                      >
                        <div>
                          <div className="text-xs font-semibold">{r}</div>
                          <div className="text-[10px] text-slate-400 uppercase tracking-widest">Lead KPI · Delay Rate</div>
                          <div className="text-[13px] font-semibold">{formatPercent(k.delayRate)}</div>
                          <div className="text-[10px] text-slate-400">Avg delivery {formatDays(k.avgDeliveryDays)} · Cost/shipment {formatCurrency(k.costPerShipment)}</div>
                        </div>
                        <div className={`justify-self-end self-center text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-widest
                          ${delayStatus === 'good' ? 'border-emerald-500/80 text-emerald-400' : delayStatus === 'warning' ? 'border-orange-400/90 text-orange-400' : 'border-red-400/90 text-red-400'}
                        `}>
                          {delayStatus === 'good' ? 'On Track' : delayStatus === 'warning' ? 'At Risk' : 'Critical'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* ANALYTICS GRID */}
            <section className="bg-[#0e1424] rounded-2xl border border-slate-800 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.6)] grid grid-cols-1 md:grid-cols-[2.1fr_1.4fr] gap-3">
              <div>
                <div className="flex justify-between items-baseline">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-slate-400">Regional KPI Stack</div>
                    <div className="text-[11px] text-slate-400">Delivery, delay, cost, and efficiency by region.</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-1.5">
                  <RegionBarChart title="Avg Delivery Time" metricKey="avgDeliveryDays" formatter={formatDays} regionAgg={regionAgg} />
                  <RegionBarChart title="Delay Rate" metricKey="delayRate" formatter={formatPercent} regionAgg={regionAgg} />
                  <RegionBarChart title="Cost / Shipment" metricKey="costPerShipment" formatter={formatCurrency} regionAgg={regionAgg} />
                  <RegionBarChart title="Cost / Mile" metricKey="transportationCostPerMile" formatter={formatCurrency} regionAgg={regionAgg} />
                  <RegionBarChart title="Route Efficiency" metricKey="routeEfficiency" formatter={v => v != null ? v.toFixed(2) : "–"} regionAgg={regionAgg} />
                  <RegionBarChart title="Avg Delay Days" metricKey="avgDelayDays" formatter={formatDays} regionAgg={regionAgg} />
                </div>
              </div>
              
              <div className="bg-[#10182b] rounded-xl border border-slate-800 p-2 flex flex-col gap-1.5">
                <div className="flex justify-between gap-1.5 items-center">
                  <div className="text-xs uppercase tracking-widest text-slate-400">Shipment Detail</div>
                  <div className="flex-1 flex items-center gap-1.5 bg-[#050814] rounded-full px-2 py-1 border border-slate-800 text-[11px] text-slate-400">
                    <Search className="w-3 h-3" />
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Filter by shipment, route, origin, or destination..." 
                      className="flex-1 text-[11px] border-none outline-none bg-transparent text-slate-50"
                    />
                  </div>
                </div>
                <div className="max-h-[220px] overflow-y-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead className="uppercase tracking-widest text-slate-400 bg-slate-900/70 sticky top-0">
                      <tr>
                        <th className="p-1 text-left border-b border-slate-800/80">Shipment</th>
                        <th className="p-1 text-left border-b border-slate-800/80">Region</th>
                        <th className="p-1 text-left border-b border-slate-800/80">Route</th>
                        <th className="p-1 text-left border-b border-slate-800/80">Delivery Time</th>
                        <th className="p-1 text-left border-b border-slate-800/80">Delay</th>
                        <th className="p-1 text-left border-b border-slate-800/80">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredShipments.map(s => (
                        <tr key={s.shipment_id} className="even:bg-slate-900/50 hover:bg-sky-400/20">
                          <td className="p-1 border-b border-slate-800/80">{s.shipment_id}</td>
                          <td className="p-1 border-b border-slate-800/80">{s.region}</td>
                          <td className="p-1 border-b border-slate-800/80">{s.route}</td>
                          <td className="p-1 border-b border-slate-800/80">{formatDays(s.delivery_time_days)}</td>
                          <td className="p-1 border-b border-slate-800/80">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${s.late_flag ? 'border-red-400/90 text-red-400' : s.on_time_flag ? 'border-emerald-500/95 text-emerald-400' : 'border-slate-400/70'}`}>
                              {s.late_flag ? 'Late' : s.on_time_flag ? 'On-time' : 'N/A'}
                            </span>
                          </td>
                          <td className="p-1 border-b border-slate-800/80">{formatCurrency(s.total_logistics_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>

          {/* INSIGHT SIDEBAR */}
          <aside className="grid grid-rows-[minmax(0,1.1fr)_minmax(0,1.2fr)] gap-3">
            <section className="bg-[#0e1424] rounded-2xl border border-slate-800 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.6)] flex flex-col gap-2">
              <div>
                <div className="text-xs uppercase tracking-widest text-slate-400">Regional Ranking</div>
                <div className="text-[11px] text-slate-400">Sorted by delay rate with delivery time as a tie-breaker.</div>
              </div>
              <div className="flex flex-col gap-1.5 text-[11px]">
                {dashboardData.metadata.regions.map(r => ({ region: r, kpis: regionAgg[r] || aggregateKPIs([]) }))
                  .sort((a, b) => {
                    const da = a.kpis.delayRate || 0;
                    const db = b.kpis.delayRate || 0;
                    if (da === db) return (a.kpis.avgDeliveryDays || 0) - (b.kpis.avgDeliveryDays || 0);
                    return db - da;
                  })
                  .map(row => {
                    const s = classifyStatus("delayRate", row.kpis.delayRate);
                    return (
                      <div key={row.region} className={`grid grid-cols-[minmax(0,1.4fr)_auto] gap-1.5 items-center p-1.5 rounded-xl bg-[#10182b] border-l-4 ${s === 'bad' ? 'border-red-400' : s === 'warning' ? 'border-orange-400' : 'border-emerald-400'}`}>
                        <div className="flex flex-col gap-px">
                          <div className="text-[11px] font-medium">{row.region}</div>
                          <div className="text-[10px] text-slate-400">Delay {formatPercent(row.kpis.delayRate)} · Avg delivery {formatDays(row.kpis.avgDeliveryDays)}</div>
                        </div>
                        <div className="text-[11px] font-semibold text-right">
                          {formatCurrency(row.kpis.costPerShipment)} / shipment
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </section>

            <section className="bg-[#0e1424] rounded-2xl border border-slate-800 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.6)] flex flex-col gap-2">
              <div className="flex justify-between items-baseline">
                <div>
                  <div className="text-xs uppercase tracking-widest text-slate-400">Exception Summary</div>
                  <div className="text-[11px] text-slate-400">Where cost and service performance are under the most pressure.</div>
                </div>
                <div className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-slate-400/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                  <span>Critical hotspot</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 text-[11px]">
                {(() => {
                  const rows = dashboardData.metadata.regions.map(r => ({ region: r, kpis: regionAgg[r] || aggregateKPIs([]) }));
                  const highestCost = [...rows].sort((a,b) => (b.kpis.costPerShipment || 0) - (a.kpis.costPerShipment || 0))[0];
                  const worstDelay = [...rows].sort((a,b) => (b.kpis.delayRate || 0) - (a.kpis.delayRate || 0))[0];
                  const lateShipments = filteredShipments.filter(s => s.late_flag === 1);
                  const recent = lateShipments[0];

                  return (
                    <>
                      {highestCost && (
                        <div className="grid grid-cols-[minmax(0,1.4fr)_auto] gap-1.5 items-center p-1.5 rounded-xl bg-[#10182b] border-l-4 border-orange-400">
                          <div className="flex flex-col gap-px">
                            <div className="text-[11px] font-medium">Biggest cost issue · {highestCost.region}</div>
                            <div className="text-[10px] text-slate-400">Cost per shipment {formatCurrency(highestCost.kpis.costPerShipment)} · {formatMiles(highestCost.kpis.totalMiles)} miles</div>
                          </div>
                          <div className="text-[11px] font-semibold text-right">{formatCurrency(highestCost.kpis.totalCost)}</div>
                        </div>
                      )}
                      {worstDelay && (
                        <div className="grid grid-cols-[minmax(0,1.4fr)_auto] gap-1.5 items-center p-1.5 rounded-xl bg-[#10182b] border-l-4 border-red-400">
                          <div className="flex flex-col gap-px">
                            <div className="text-[11px] font-medium">Biggest service issue · {worstDelay.region}</div>
                            <div className="text-[10px] text-slate-400">Delay rate {formatPercent(worstDelay.kpis.delayRate)} · Avg delay {formatDays(worstDelay.kpis.avgDelayDays)}</div>
                          </div>
                          <div className="text-[11px] font-semibold text-right">{formatDays(worstDelay.kpis.avgDeliveryDays)}</div>
                        </div>
                      )}
                      {recent && (
                        <div className="grid grid-cols-[minmax(0,1.4fr)_auto] gap-1.5 items-center p-1.5 rounded-xl bg-[#10182b] border-l-4 border-red-400">
                          <div className="flex flex-col gap-px">
                            <div className="text-[11px] font-medium">Top exception · {recent.shipment_id}</div>
                            <div className="text-[10px] text-slate-400">{recent.route} · Late by {formatDays(recent.delay_days)} ({recent.delay_reason || "N/A"})</div>
                          </div>
                          <div className="text-[11px] font-semibold text-right">{formatCurrency(recent.total_logistics_cost)}</div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </section>
          </aside>
        </section>

      {/* FORECAST SECTION */}
<section className="mt-4 bg-[#0e1424] rounded-2xl border border-slate-800 p-4">
  <div className="text-sm text-slate-400">
    <strong className="text-slate-200">AI Forecast Module</strong>
    <p className="mt-2">
      Live routing forecasts require a Google Maps + Gemini API key.
    </p>
    <p className="mt-2">
      This logistics control tower demonstrates how shipment performance data
      can be transformed into operational KPIs, regional diagnostics, and
      network performance insights used by logistics and operations teams.
    </p>
  </div>
</section>
        {/* FOOTER */}
        <footer className="mt-1.5 text-[10px] text-slate-400 flex justify-between gap-2.5 opacity-85">
          <div className="max-w-[60%]">
            <strong>Metric definitions.</strong> Average Delivery Time = delivered days from ship date; Transportation Cost per Mile = total logistics cost ÷ actual miles; Route Efficiency = planned ÷ actual miles; Delay Rate = late shipments ÷ total; Cost per Shipment = total logistics cost ÷ shipments.
          </div>
          <div>
            Source: Shipment-level operations data. U.S. regions follow standard five-region grouping.
          </div>
        </footer>
      </div>
    </div>
  );
}

function KPICard({ title, subtitle, value, insight, status, progress }: any) {
  const borderColor = status === 'good' ? 'border-emerald-500/85' : status === 'warning' ? 'border-orange-400/85' : 'border-red-400/90';
  const chipColor = status === 'good' ? 'text-emerald-400' : status === 'warning' ? 'text-orange-400' : 'text-red-400';
  const dotColor = status === 'good' ? 'bg-emerald-400' : status === 'warning' ? 'bg-orange-400' : 'bg-red-400';
  
  return (
    <div className={`relative bg-[radial-gradient(circle_at_0_-20%,rgba(99,179,237,0.3),transparent_60%),#0b1021] rounded-xl border ${borderColor} p-2.5 flex flex-col gap-1.5 shadow-[0_14px_32px_rgba(0,0,0,0.7)] overflow-hidden`}>
      <div className={`inline-flex self-start items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-widest bg-slate-900/90 border border-slate-400/75 ${chipColor}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
        <span>{title}</span>
      </div>
      <div className="text-[11px] uppercase tracking-widest text-slate-400 mt-1">{subtitle}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
      <div className="flex justify-between items-baseline text-[11px] text-slate-400 mt-1">
        <span>{insight}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-slate-900/90 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-blue-400 transition-all duration-300" style={{ width: `${progress}%` }}></div>
      </div>
    </div>
  );
}

function RegionBarChart({ title, metricKey, formatter, regionAgg }: any) {
  const regions = dashboardData.metadata.regions;
  let maxValue = 0;
  const rowsData = regions.map(r => {
    const k = regionAgg[r] || aggregateKPIs([]);
    const v = k[metricKey as keyof typeof k];
    if (v != null && !isNaN(v as number)) {
      maxValue = Math.max(maxValue, Math.abs(v as number));
    }
    return { region: r, value: v };
  });

  return (
    <div className="bg-[#10182b] rounded-xl border border-slate-800 p-2 flex flex-col gap-1">
      <div className="text-[11px] uppercase tracking-widest text-slate-400">{title}</div>
      <div className="flex-1 mt-0.5 relative flex flex-col justify-center">
        {rowsData.map(rd => {
          const kForRegion = regionAgg[rd.region] || aggregateKPIs([]);
          const statusMetricKey = metricKey === "avgDelayDays" ? "avgDeliveryDays" : metricKey === "transportationCostPerMile" ? "costPerMile" : metricKey;
          const status = classifyStatus(statusMetricKey, kForRegion[metricKey as keyof typeof kForRegion] as number);
          
          let widthPct = 0;
          if (maxValue > 0 && rd.value != null && !isNaN(rd.value as number)) {
            widthPct = Math.max(6, Math.abs(rd.value as number) / maxValue * 100);
          }
          
          const gradient = status === 'bad' ? 'from-red-400 to-orange-400' : status === 'good' ? 'from-emerald-500 to-teal-400' : 'from-teal-400 to-blue-400';

          return (
            <div key={rd.region} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)] gap-1 items-center text-[10px] mb-0.5">
              <div className="text-slate-400 truncate">{rd.region}</div>
              <div className="h-1.5 rounded-full bg-slate-900/90 overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-300`} style={{ width: `${widthPct}%` }} title={`${title} · ${rd.region} · ${formatter(rd.value)}`}></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function USMap({ regionAgg, selectedRegion, onSelectRegion }: any) {
  return (
    <svg viewBox="0 0 100 60" role="img" aria-label="US Regions" className="w-full h-full">
      <path 
        onClick={() => onSelectRegion("West")}
        className={`cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:drop-shadow-[0_0_14px_rgba(129,230,217,0.6)] ${selectedRegion === 'West' ? 'stroke-slate-50 stroke-[1.8px] drop-shadow-[0_0_18px_rgba(129,230,217,0.9)]' : 'stroke-slate-900 stroke-[1.4px]'}`}
        d="M5,18 L22,14 L30,18 L30,35 L15,42 L5,35 Z"
        fill={getRegionColor("West", regionAgg)} 
      />
      <path 
        onClick={() => onSelectRegion("Southwest")}
        className={`cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:drop-shadow-[0_0_14px_rgba(129,230,217,0.6)] ${selectedRegion === 'Southwest' ? 'stroke-slate-50 stroke-[1.8px] drop-shadow-[0_0_18px_rgba(129,230,217,0.9)]' : 'stroke-slate-900 stroke-[1.4px]'}`}
        d="M20,36 L36,30 L46,32 L46,44 L36,52 L22,50 Z"
        fill={getRegionColor("Southwest", regionAgg)} 
      />
      <path 
        onClick={() => onSelectRegion("Midwest")}
        className={`cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:drop-shadow-[0_0_14px_rgba(129,230,217,0.6)] ${selectedRegion === 'Midwest' ? 'stroke-slate-50 stroke-[1.8px] drop-shadow-[0_0_18px_rgba(129,230,217,0.9)]' : 'stroke-slate-900 stroke-[1.4px]'}`}
        d="M34,15 L50,10 L64,13 L62,30 L46,34 L34,27 Z"
        fill={getRegionColor("Midwest", regionAgg)} 
      />
      <path 
        onClick={() => onSelectRegion("Southeast")}
        className={`cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:drop-shadow-[0_0_14px_rgba(129,230,217,0.6)] ${selectedRegion === 'Southeast' ? 'stroke-slate-50 stroke-[1.8px] drop-shadow-[0_0_18px_rgba(129,230,217,0.9)]' : 'stroke-slate-900 stroke-[1.4px]'}`}
        d="M48,32 L64,29 L78,32 L78,45 L62,50 L52,46 Z"
        fill={getRegionColor("Southeast", regionAgg)} 
      />
      <path 
        onClick={() => onSelectRegion("Northeast")}
        className={`cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:drop-shadow-[0_0_14px_rgba(129,230,217,0.6)] ${selectedRegion === 'Northeast' ? 'stroke-slate-50 stroke-[1.8px] drop-shadow-[0_0_18px_rgba(129,230,217,0.9)]' : 'stroke-slate-900 stroke-[1.4px]'}`}
        d="M62,9 L84,6 L96,10 L92,22 L76,26 L64,22 Z"
        fill={getRegionColor("Northeast", regionAgg)} 
      />
    </svg>
  );
}

function getRegionColor(regionId: string, regionAgg: any) {
  const k = regionAgg[regionId] || aggregateKPIs([]);
  const status = classifyStatus("delayRate", k.delayRate);
  if (status === "good") return "#134e4a";
  if (status === "warning") return "#78350f";
  return "#7f1d1d";
}
