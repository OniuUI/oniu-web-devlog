import { useEffect, useState, useMemo } from 'react'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'

type MonitorData = {
  ok: boolean
  timestamp: number
  memory: {
    used: number
    used_formatted: string
    peak: number
    peak_formatted: string
    limit: number
    limit_formatted: string
    percent: number
  }
  disk: {
    used: number
    used_formatted: string
    total: number
    total_formatted: string
    free: number
    free_formatted: string
    percent: number
    data_size: number
    data_size_formatted: string
    uploads_size: number
    uploads_size_formatted: string
  }
  cpu: {
    cores?: number
    model?: string
    load_avg?: {
      '1min': number
      '5min': number
      '15min': number
    }
    load_percent?: number
  }
  system: {
    php_version: string
    server_software: string
    max_execution_time: string
    max_upload_size: string
    post_max_size: string
    timezone: string
  }
  network: {
    hostname: string
    server_addr: string
    remote_addr: string
  }
  load?: {
    '1min': number
    '5min': number
    '15min': number
  }
  history: Array<{
    ts: number
    memory?: {
      used: number
      peak: number
      limit: number
      percent: number
    }
    cpu?: {
      load_avg?: {
        '1min': number
        '5min': number
        '15min': number
      }
      load_percent?: number
    }
    disk?: {
      used: number
      total: number
      percent: number
    }
    load?: {
      '1min': number
      '5min': number
      '15min': number
    }
  }>
  errors: string[]
  files: {
    data_files: number
    upload_files: number
    data_dirs: number
    upload_dirs: number
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

export default function MonitoringDashboard() {
  const [data, setData] = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [historyHours, setHistoryHours] = useState(24)

  const fetchData = async () => {
    try {
      const res = await fetch(`/admin/monitor.php?history_hours=${historyHours}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
      const json = await res.json() as MonitorData
      setData(json)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load monitoring data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [historyHours])

  const memoryChartOptions = useMemo((): Highcharts.Options => {
    if (!data?.history || data.history.length === 0) return {}

    const memData = data.history
      .map(h => [h.ts, h.memory?.used ?? null])
      .filter(d => d[1] !== null) as [number, number][]
    
    const memPeak = data.history
      .map(h => [h.ts, h.memory?.peak ?? null])
      .filter(d => d[1] !== null) as [number, number][]
    
    const memPercent = data.history
      .map(h => [h.ts, h.memory?.percent ?? null])
      .filter(d => d[1] !== null) as [number, number][]
    
    const memLimit = data.history
      .map(h => [h.ts, h.memory?.limit ?? null])
      .filter(d => d[1] !== null && d[1] > 0) as [number, number][]
    
    const memAvg = memData.length > 0 
      ? memData.reduce((sum, d) => sum + d[1], 0) / memData.length 
      : 0

    return {
      chart: { backgroundColor: 'rgba(3,7,18,.3)', height: 300 },
      title: { text: 'Memory Usage', style: { color: '#eef2ff', fontSize: '14px' } },
      xAxis: { type: 'datetime', labels: { style: { color: '#9ca3af' } } },
      yAxis: [
        {
          title: { text: 'Bytes', style: { color: '#9ca3af' } },
          labels: { style: { color: '#9ca3af' }, formatter: function() { return formatBytes(typeof this.value === 'number' ? this.value : Number(this.value) || 0) } },
          opposite: false,
        },
        {
          title: { text: 'Percentage', style: { color: '#9ca3af' } },
          labels: { style: { color: '#9ca3af' }, formatter: function() { const v = typeof this.value === 'number' ? this.value : Number(this.value) || 0; return v + '%' } },
          min: 0,
          max: 100,
          opposite: true,
        },
      ],
      legend: { itemStyle: { color: '#9ca3af' } },
      tooltip: {
        backgroundColor: 'rgba(3,7,18,.9)',
        style: { color: '#eef2ff' },
        shared: true,
        formatter: function() {
          const x = typeof this.x === 'number' ? this.x : Number(this.x) || 0
          let s = Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', x) + '<br/>'
          this.points?.forEach(p => {
            if (p.y === undefined) return
            const y = typeof p.y === 'number' ? p.y : Number(p.y) || 0
            if (p.series.yAxis?.options?.title?.text === 'Percentage') {
              s += `<b>${p.series.name}</b>: ${y.toFixed(1)}%<br/>`
            } else {
              s += `<b>${p.series.name}</b>: ${formatBytes(y)}<br/>`
            }
          })
          return s
        },
      },
      series: [
        { name: 'Used', data: memData, color: '#10b981', type: 'line', yAxis: 0 },
        { name: 'Peak', data: memPeak, color: '#f59e0b', type: 'line', dashStyle: 'Dash', yAxis: 0 },
        { name: 'Limit', data: memLimit, color: '#ef4444', type: 'line', dashStyle: 'Dot', yAxis: 0 },
        { name: 'Usage %', data: memPercent, color: '#3b82f6', type: 'line', yAxis: 1 },
        { name: 'Avg Used', data: data.history.map(h => [h.ts, memAvg]), color: '#6366f1', type: 'line', dashStyle: 'Dot', enableMouseTracking: false, yAxis: 0 },
      ],
      plotOptions: { series: { marker: { radius: 2 } } },
    }
  }, [data])

  const cpuChartOptions = useMemo((): Highcharts.Options => {
    if (!data?.history || data.history.length === 0) return {}

    const cpuData = data.history
      .map(h => [h.ts, h.cpu?.load_avg?.['1min'] ?? h.load?.['1min'] ?? null])
      .filter(d => d[1] !== null) as [number, number][]
    
    const cpuAvg = cpuData.length > 0 
      ? cpuData.reduce((sum, d) => sum + d[1], 0) / cpuData.length 
      : 0

    return {
      chart: { backgroundColor: 'rgba(3,7,18,.3)', height: 300 },
      title: { text: 'CPU Load Average (1min)', style: { color: '#eef2ff', fontSize: '14px' } },
      xAxis: { type: 'datetime', labels: { style: { color: '#9ca3af' } } },
      yAxis: {
        title: { text: 'Load', style: { color: '#9ca3af' } },
        labels: { style: { color: '#9ca3af' } },
      },
      legend: { itemStyle: { color: '#9ca3af' } },
      tooltip: {
        backgroundColor: 'rgba(3,7,18,.9)',
        style: { color: '#eef2ff' },
        formatter: function() {
          const x = typeof this.x === 'number' ? this.x : Number(this.x) || 0
          const y = typeof this.y === 'number' ? this.y : Number(this.y) || 0
          return `<b>${this.series.name}</b><br/>${Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', x)}<br/>${y.toFixed(2)}`
        },
      },
      series: [
        { name: 'Load (1min)', data: cpuData, color: '#3b82f6', type: 'line' },
        { name: 'Average', data: data.history.map(h => [h.ts, cpuAvg]), color: '#6366f1', type: 'line', dashStyle: 'Dot', enableMouseTracking: false },
      ],
      plotOptions: { series: { marker: { radius: 2 } } },
    }
  }, [data])

  const diskChartOptions = useMemo((): Highcharts.Options => {
    if (!data?.history || data.history.length === 0) return {}

    const diskData = data.history
      .map(h => [h.ts, h.disk?.used ?? null])
      .filter(d => d[1] !== null) as [number, number][]
    
    const diskAvg = diskData.length > 0 
      ? diskData.reduce((sum, d) => sum + d[1], 0) / diskData.length 
      : 0

    return {
      chart: { backgroundColor: 'rgba(3,7,18,.3)', height: 300 },
      title: { text: 'Disk Usage', style: { color: '#eef2ff', fontSize: '14px' } },
      xAxis: { type: 'datetime', labels: { style: { color: '#9ca3af' } } },
      yAxis: {
        title: { text: 'Bytes', style: { color: '#9ca3af' } },
        labels: { style: { color: '#9ca3af' }, formatter: function() { return formatBytes(typeof this.value === 'number' ? this.value : Number(this.value) || 0) } },
      },
      legend: { itemStyle: { color: '#9ca3af' } },
      tooltip: {
        backgroundColor: 'rgba(3,7,18,.9)',
        style: { color: '#eef2ff' },
        formatter: function() {
          const x = typeof this.x === 'number' ? this.x : Number(this.x) || 0
          const y = typeof this.y === 'number' ? this.y : Number(this.y) || 0
          return `<b>${this.series.name}</b><br/>${Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', x)}<br/>${formatBytes(y)}`
        },
      },
      series: [
        { name: 'Used', data: diskData, color: '#ef4444', type: 'line' },
        { name: 'Average', data: data.history.map(h => [h.ts, diskAvg]), color: '#6366f1', type: 'line', dashStyle: 'Dot', enableMouseTracking: false },
      ],
      plotOptions: { series: { marker: { radius: 2 } } },
    }
  }, [data])

  const loadChartOptions = useMemo((): Highcharts.Options => {
    if (!data?.history || data.history.length === 0) return {}

    const load1Data = data.history
      .map(h => [h.ts, h.load?.['1min'] ?? null])
      .filter(d => d[1] !== null) as [number, number][]
    
    const load5Data = data.history
      .map(h => [h.ts, h.load?.['5min'] ?? null])
      .filter(d => d[1] !== null) as [number, number][]
    
    const load15Data = data.history
      .map(h => [h.ts, h.load?.['15min'] ?? null])
      .filter(d => d[1] !== null) as [number, number][]

    return {
      chart: { backgroundColor: 'rgba(3,7,18,.3)', height: 300 },
      title: { text: 'System Load Average', style: { color: '#eef2ff', fontSize: '14px' } },
      xAxis: { type: 'datetime', labels: { style: { color: '#9ca3af' } } },
      yAxis: {
        title: { text: 'Load', style: { color: '#9ca3af' } },
        labels: { style: { color: '#9ca3af' } },
      },
      legend: { itemStyle: { color: '#9ca3af' } },
      tooltip: {
        backgroundColor: 'rgba(3,7,18,.9)',
        style: { color: '#eef2ff' },
        shared: true,
        formatter: function() {
          const x = typeof this.x === 'number' ? this.x : Number(this.x) || 0
          let s = Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', x) + '<br/>'
          this.points?.forEach(p => {
            if (p.y !== undefined) {
              const y = typeof p.y === 'number' ? p.y : Number(p.y) || 0
              s += `<b>${p.series.name}</b>: ${y.toFixed(2)}<br/>`
            }
          })
          return s
        },
      },
      series: [
        { name: '1 min', data: load1Data, color: '#3b82f6', type: 'line' },
        { name: '5 min', data: load5Data, color: '#10b981', type: 'line' },
        { name: '15 min', data: load15Data, color: '#f59e0b', type: 'line' },
      ],
      plotOptions: { series: { marker: { radius: 2 } } },
    }
  }, [data])

  if (loading) {
    return <div className="text-neutral-400">Loading monitoring data...</div>
  }

  if (error) {
    return <div className="text-rose-300">Error: {error}</div>
  }

  if (!data) {
    return <div className="text-neutral-400">No data available</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-100">Server Monitoring</h2>
        <select
          value={historyHours}
          onChange={(e) => setHistoryHours(Number(e.target.value))}
          className="rounded-xl bg-neutral-950/50 px-3 py-1.5 text-sm text-neutral-200 ring-1 ring-white/10"
        >
          <option value={1}>Last hour</option>
          <option value={6}>Last 6 hours</option>
          <option value={24}>Last 24 hours</option>
          <option value={48}>Last 48 hours</option>
          <option value={168}>Last week</option>
        </select>
      </div>

      {data.history && data.history.length > 0 ? (
        <>
          <div className="rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
            <HighchartsReact highcharts={Highcharts} options={memoryChartOptions} />
          </div>
          <div className="rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
            <HighchartsReact highcharts={Highcharts} options={cpuChartOptions} />
          </div>
          <div className="rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
            <HighchartsReact highcharts={Highcharts} options={diskChartOptions} />
          </div>
          <div className="rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
            <HighchartsReact highcharts={Highcharts} options={loadChartOptions} />
          </div>
        </>
      ) : (
        <div className="rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10 text-center text-neutral-400">
          No historical data yet. Data will appear after a few minutes.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
          <div className="text-sm font-semibold text-neutral-200">Memory</div>
          <div className="mt-2 text-xs text-neutral-400">
            Used: {data.memory.used_formatted} / {data.memory.limit_formatted} ({data.memory.percent}%)
          </div>
          <div className="mt-1 text-xs text-neutral-400">Peak: {data.memory.peak_formatted}</div>
        </div>
        <div className="rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
          <div className="text-sm font-semibold text-neutral-200">CPU</div>
          {data.cpu.cores && <div className="mt-2 text-xs text-neutral-400">Cores: {data.cpu.cores}</div>}
          {data.cpu.load_avg && (
            <div className="mt-1 text-xs text-neutral-400">
              Load: {data.cpu.load_avg['1min']?.toFixed(2) ?? 'N/A'} / {data.cpu.load_avg['5min']?.toFixed(2) ?? 'N/A'} / {data.cpu.load_avg['15min']?.toFixed(2) ?? 'N/A'}
            </div>
          )}
          {data.cpu.load_percent !== undefined && (
            <div className="mt-1 text-xs text-neutral-400">Usage: {data.cpu.load_percent}%</div>
          )}
        </div>
        <div className="rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
          <div className="text-sm font-semibold text-neutral-200">Disk</div>
          <div className="mt-2 text-xs text-neutral-400">
            Used: {data.disk.used_formatted} / {data.disk.total_formatted} ({data.disk.percent}%)
          </div>
          <div className="mt-1 text-xs text-neutral-400">Free: {data.disk.free_formatted}</div>
        </div>
        <div className="rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
          <div className="text-sm font-semibold text-neutral-200">System</div>
          <div className="mt-2 text-xs text-neutral-400">PHP: {data.system.php_version}</div>
          <div className="mt-1 text-xs text-neutral-400">Server: {data.system.server_software}</div>
        </div>
      </div>

      {data.errors && data.errors.length > 0 ? (
        <div className="rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
          <details className="cursor-pointer">
            <summary className="text-sm font-semibold text-neutral-200 mb-2">
              Error Logs ({data.errors.length})
            </summary>
            <div className="mt-3 max-h-96 overflow-auto rounded-lg bg-neutral-950/50 p-3 ring-1 ring-white/5">
              <div className="space-y-1 font-mono text-[11px]">
                {data.errors.slice(0, 100).map((log, idx) => {
                  const isError = log.includes('[ERROR]') || log.toLowerCase().includes('error')
                  const isVideo = log.includes('video_upload.php') || log.includes('Video')
                  const color = isError ? 'text-rose-300' : isVideo ? 'text-blue-300' : 'text-neutral-400'
                  return (
                    <div key={idx} className={`${color} break-words`}>
                      {log}
                    </div>
                  )
                })}
              </div>
            </div>
          </details>
        </div>
      ) : (
        <div className="rounded-2xl bg-neutral-950/30 p-4 ring-1 ring-white/10">
          <div className="text-sm font-semibold text-neutral-200">Error Logs</div>
          <div className="mt-2 text-xs text-green-400">No recent errors</div>
        </div>
      )}
    </div>
  )
}
