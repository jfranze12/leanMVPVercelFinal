import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Upload,
  Eye,
  Undo2,
  Trash2,
  BarChart3,
  FileDown,
  Sparkles,
  ClipboardCheck,
  Shield,
  Package,
  CalendarRange,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Wand2,
  ChevronRight,
  ChevronDown,
  Search,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem } from '@/components/ui/select'
import { getBootstrap, getMetricSummary, runPrediction, saveHumanAdjustment, updateReorderPoints, saveActualResults, uploadImport } from '@/api/client'

function downloadSpreadsheet(filename, rows) {
  const headers = Object.keys(rows[0] ?? { empty: '' })
  const escape = (v) => {
    const s = String(v ?? '')
    if (s.includes(',') || s.includes('\n') || s.includes('"')) return `"${s.replaceAll('"', '""')}"`
    return s
  }
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function toQuarter(dateString) {
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return 'Q1 2026'
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
}

function daysBetween(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1
  return Math.max(1, Math.ceil((end - start) / 86400000) + 1)
}

export default function App() {
  const [loggedInUIC, setLoggedInUIC] = useState(null)
  const [uics, setUics] = useState([])
  const [locations, setLocations] = useState([])
  const [dataset, setDataset] = useState([])
  const [shopStock, setShopStock] = useState([])
  const [predictions, setPredictions] = useState([])
  const [results, setResults] = useState([])
  const [metrics, setMetrics] = useState([])
  const [metricSummary, setMetricSummary] = useState({ evaluatedEvents: 0, algorithmMae: null, humanMae: null, algorithmRmse: null, humanRmse: null })
  const [shopStockUpdatedAt, setShopStockUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [loginOpen, setLoginOpen] = useState(false)
  const [activeDialog, setActiveDialog] = useState(null)
  const [resultsMode, setResultsMode] = useState('fields')
  const [selectedQuarter, setSelectedQuarter] = useState('Q1 2026')
  const [selectedPredId, setSelectedPredId] = useState('')
  const [showAllShopStock, setShowAllShopStock] = useState(false)
  const [shopStockSearch, setShopStockSearch] = useState('')
  const [shopStockInputName, setShopStockInputName] = useState('')
  const [shopStockInputFile, setShopStockInputFile] = useState(null)
  const [bulkInputFile, setBulkInputFile] = useState(null)

  const [locationName, setLocationName] = useState('Home Station')
  const [distanceMiles, setDistanceMiles] = useState(0)
  const [vehicleCount, setVehicleCount] = useState(20)
  const [startDate, setStartDate] = useState('2026-04-01')
  const [endDate, setEndDate] = useState('2026-04-07')
  const [notes, setNotes] = useState('')

  const [draftPrediction, setDraftPrediction] = useState(null)
  const [editablePredictionRows, setEditablePredictionRows] = useState([])
  const [manualResults, setManualResults] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const found = locations.find((item) => item.name === locationName)
    if (found) setDistanceMiles(found.distanceMiles)
  }, [locationName, locations])

  async function loadData(forceUicId) {
    try {
      setLoading(true)
      const bootstrap = await getBootstrap(forceUicId || loggedInUIC?.id || 'uic_b48')
      setUics(bootstrap.uics)
      setLocations(bootstrap.locations)
      const nextUic = bootstrap.uics.find((uic) => uic.id === (forceUicId || loggedInUIC?.id || 'uic_b48')) || bootstrap.uics[0]
      setLoggedInUIC(nextUic)
      setDataset(bootstrap.dataset)
      setShopStock(bootstrap.shopStockLines)
      setPredictions(bootstrap.predictions)
      setResults(bootstrap.actualResults)
      setMetrics(bootstrap.metrics)
      setShopStockUpdatedAt(bootstrap.shopStockUpdatedAt)
      setSelectedPredId((current) => current || bootstrap.predictions[0]?.id || '')
      const summary = await getMetricSummary(nextUic.id)
      setMetricSummary(summary)
      setSelectedQuarter(bootstrap.predictions[0]?.quarter || toQuarter(startDate))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const selectedPrediction = predictions.find((item) => item.id === selectedPredId)
  const selectedResult = results.find((item) => item.predictionId === selectedPredId)
  const currentMetricRows = metrics.filter((item) => item.predictionId === selectedPredId)

  useEffect(() => {
    if (selectedPrediction) {
      setManualResults(selectedPrediction.algorithmLines.map((line) => ({
        materialNumber: line.materialNumber,
        description: line.description,
        actualQty: selectedResult?.lines.find((entry) => entry.materialNumber === line.materialNumber)?.actualQty || 0,
        include: true,
      })))
    }
  }, [selectedPrediction, selectedResult])

  const comparisonRows = useMemo(() => {
    if (!selectedPrediction) return []
    const actualMap = new Map((selectedResult?.lines || []).map((row) => [row.materialNumber, row.actualQty]))
    const humanMap = new Map((selectedPrediction.humanAdjustment?.lines || []).map((row) => [row.materialNumber, row.humanPredictedQty]))
    return selectedPrediction.algorithmLines.map((line) => ({
      materialNumber: line.materialNumber,
      description: line.description,
      algorithmPredictedQty: line.predictedQty,
      humanPredictedQty: humanMap.has(line.materialNumber) ? humanMap.get(line.materialNumber) : line.predictedQty,
      actualQty: Number(actualMap.get(line.materialNumber) || 0),
    }))
  }, [selectedPrediction, selectedResult])

  const shopStockVisibleRows = useMemo(() => {
    const filtered = shopStock.filter((line) => {
      const q = shopStockSearch.trim().toLowerCase()
      if (!q) return true
      return line.description.toLowerCase().includes(q) || line.materialNumber.toLowerCase().includes(q)
    })
    return showAllShopStock ? filtered : filtered.slice(0, 5)
  }, [shopStock, shopStockSearch, showAllShopStock])

  const quarterOptions = useMemo(() => {
    const unique = new Set(predictions.map((item) => item.quarter))
    if (!unique.size) unique.add(toQuarter(startDate))
    return [...unique].sort()
  }, [predictions, startDate])

  const quarterStats = useMemo(() => quarterOptions.map((quarter) => {
    const quarterPredictions = predictions.filter((item) => item.quarter === quarter)
    const aggregate = new Map()
    quarterPredictions.forEach((prediction) => {
      const rows = prediction.humanAdjustment?.lines?.length
        ? prediction.humanAdjustment.lines.map((line) => ({ materialNumber: line.materialNumber, description: line.description, qty: line.humanPredictedQty }))
        : prediction.algorithmLines.map((line) => ({ materialNumber: line.materialNumber, description: line.description, qty: line.predictedQty }))
      rows.forEach((row) => {
        aggregate.set(row.materialNumber, {
          materialNumber: row.materialNumber,
          description: row.description,
          qty: (aggregate.get(row.materialNumber)?.qty || 0) + Number(row.qty || 0),
        })
      })
    })
    const topRecommendations = [...aggregate.values()].sort((a, b) => b.qty - a.qty).slice(0, 4)
    return { quarter, exerciseCount: quarterPredictions.length, topRecommendations }
  }), [predictions, quarterOptions])

  const selectedQuarterStats = quarterStats.find((item) => item.quarter === selectedQuarter) || quarterStats[0] || { exerciseCount: 0, topRecommendations: [] }

  async function handleRunPrediction() {
    try {
      const prediction = await runPrediction({
        uicId: loggedInUIC.id,
        locationName,
        distanceMiles,
        vehicleCount,
        startDate,
        endDate,
        notes,
      })
      setDraftPrediction(prediction)
      setEditablePredictionRows(prediction.algorithmLines.map((line) => ({
        materialNumber: line.materialNumber,
        description: line.description,
        humanPredictedQty: line.predictedQty,
        humanReorderPoint: line.predictedReorderPoint,
      })))
      setActiveDialog('predictionReview')
    } catch (err) {
      setError(err.message)
    }
  }

  async function finalizePrediction(updateRop) {
    try {
      if (!draftPrediction) return
      const changed = editablePredictionRows.some((line) => {
        const original = draftPrediction.algorithmLines.find((row) => row.materialNumber === line.materialNumber)
        return Number(original?.predictedQty || 0) !== Number(line.humanPredictedQty) || Number(original?.predictedReorderPoint || 0) !== Number(line.humanReorderPoint)
      })
      if (changed) {
        await saveHumanAdjustment(draftPrediction.id, { lines: editablePredictionRows })
      }
      if (updateRop) {
        await updateReorderPoints(draftPrediction.id)
        setActiveDialog('downloadReorder')
      } else {
        setActiveDialog(null)
      }
      setDraftPrediction(null)
      await loadData(loggedInUIC.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveResults() {
    if (!selectedPredId) return
    try {
      await saveActualResults({
        predictionId: selectedPredId,
        lines: manualResults.filter((item) => item.include).map((item) => ({
          materialNumber: item.materialNumber,
          description: item.description,
          actualQty: item.actualQty,
        })),
      })
      setActiveDialog(null)
      await loadData(loggedInUIC.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleImport(type, file) {
    if (!file) return
    try {
      await uploadImport(type, file, loggedInUIC.id)
      setShopStockInputName('')
      setShopStockInputFile(null)
      setBulkInputFile(null)
      setActiveDialog(null)
      await loadData(loggedInUIC.id)
    } catch (err) {
      setError(err.message)
    }
  }

  function handleUndoLastDataset() {
    setError('Undo Last remains visual-only in this build so existing imported records are preserved.')
  }

  function handleDeletePrompt() {
    setError('Delete workflow is intentionally preserved as non-destructive in this build.')
    setActiveDialog(null)
  }

  if (loading && !loggedInUIC) {
    return <div className="min-h-screen bg-[#111111] p-10 text-white">Loading MVP…</div>
  }

  return (
    <div className="min-h-screen w-full bg-[#111111] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10"><Sparkles className="h-5 w-5" /></div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Stryker Vehicles Predictive Tool</h1>
                <p className="mt-1 text-sm text-neutral-300">Unit dashboard for forecasting vehicle shop stock demand, capturing actual outcomes, and tracking algorithm versus human prediction performance.</p>
              </div>
            </div>
            {error ? <div className="mt-4 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card className={`border-white/10 bg-gradient-to-r ${loggedInUIC?.accent || 'from-neutral-700 to-neutral-800'}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-neutral-300">Unit profile</div>
                    <div className="mt-1 text-lg font-semibold">{loggedInUIC?.unit}</div>
                    <div className="mt-1 text-sm text-neutral-300">{loggedInUIC?.code} · {loggedInUIC?.location}</div>
                  </div>
                  <Shield className="mt-1 h-5 w-5 text-neutral-300" />
                </div>
                <Button className="mt-4 rounded-2xl bg-white text-black hover:bg-white/90" onClick={() => setLoginOpen(true)}>
                  <Lock className="mr-2 h-4 w-4" />Change UIC Profile
                </Button>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/5">
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-neutral-300">Current quarter</div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-2xl font-semibold">{selectedQuarter}</div>
                    <div className="mt-1 text-sm text-neutral-400">Planning is weighted by previous quarter and the previous matching quarter.</div>
                  </div>
                  <CalendarRange className="h-5 w-5 text-neutral-300" />
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="border-white/10 bg-white/5 xl:col-span-2">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-neutral-100">Main Actions</h2>
                  <p className="mt-1 text-sm text-neutral-300">Prediction, actual results entry, and algorithm review now run on persisted backend records.</p>
                </div>
                <Badge className="bg-white/10 text-white">Live backend MVP</Badge>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                <Button className="h-24 rounded-2xl bg-white text-black hover:bg-white/90" onClick={() => setActiveDialog('predict')}>
                  <div className="flex flex-col items-center gap-2 text-center"><Upload className="h-5 w-5" /><div><div className="font-semibold">Predict Training Exercise</div><div className="text-xs opacity-70">Location, vehicles, date range</div></div></div>
                </Button>
                <Button className="h-24 rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => setActiveDialog('results')}>
                  <div className="flex flex-col items-center gap-2 text-center"><ClipboardCheck className="h-5 w-5" /><div><div className="font-semibold">Input Training Results</div><div className="text-xs opacity-70">Save actual vehicle demand</div></div></div>
                </Button>
                <Button className="h-24 rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => setActiveDialog('algo')}>
                  <div className="flex flex-col items-center gap-2 text-center"><BarChart3 className="h-5 w-5" /><div><div className="font-semibold">Algorithm Results</div><div className="text-xs opacity-70">Algorithm vs human errors</div></div></div>
                </Button>
              </div>

              <Separator className="my-6 bg-white/10" />

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-100">Current Shop Stock Listing</h3>
                      <p className="mt-1 text-sm text-neutral-300">Showing {showAllShopStock ? 'all matching rows' : 'first 5 rows'} from persisted vehicle-only stock data.</p>
                    </div>
                    <Badge className="bg-white/10 text-white">Input date: {shopStockUpdatedAt ? new Date(shopStockUpdatedAt).toLocaleDateString() : '—'}</Badge>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                      <Input value={shopStockSearch} onChange={(e) => setShopStockSearch(e.target.value)} placeholder="Search material or NIIN" className="rounded-xl border-white/10 bg-white/5 pl-9" />
                    </div>
                    <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => setShowAllShopStock((value) => !value)}>
                      {showAllShopStock ? 'Show Top 5' : 'Show All'} <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10">
                          <TableHead className="text-neutral-300">NIIN</TableHead>
                          <TableHead className="text-neutral-300">Description</TableHead>
                          <TableHead className="text-neutral-300 text-right">On Hand</TableHead>
                          <TableHead className="text-neutral-300 text-right">ROP</TableHead>
                          <TableHead className="text-neutral-300 text-right">Recommended</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shopStockVisibleRows.map((row) => (
                          <TableRow key={row.id} className="border-white/10">
                            <TableCell className="text-neutral-200">{row.materialNumber}</TableCell>
                            <TableCell className="text-white">{row.description}</TableCell>
                            <TableCell className="text-right">{row.onHand}</TableCell>
                            <TableCell className="text-right">{row.reorderPoint}</TableCell>
                            <TableCell className="text-right">{row.recommendedReorderPoint}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {!showAllShopStock && shopStock.length > 5 ? <div className="mt-3 text-xs text-neutral-400">{shopStock.length - 5} additional lines hidden from the home page.</div> : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => downloadSpreadsheet(`current_shop_stock_${loggedInUIC.code}.csv`, shopStock.map((row) => ({ niin: row.materialNumber, description: row.description, onHand: row.onHand, reorderPoint: row.reorderPoint, recommendedReorderPoint: row.recommendedReorderPoint, leadTimeDays: row.leadTimeDays, supplyCode: row.supplyCode })))}>
                      <FileDown className="mr-2 h-4 w-4" />Download Shop Stock
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-neutral-100">Input Shop Stock</h3>
                        <p className="mt-1 text-sm text-neutral-300">Upload a MATSIT spreadsheet to refresh the current vehicle shop stock view.</p>
                      </div>
                      <Package className="h-5 w-5 text-neutral-300" />
                    </div>
                    <Input type="file" accept=".xlsx,.xls,.csv" className="mt-4 rounded-xl border-white/10 bg-white/5" onChange={(e) => { const file = e.target.files?.[0] || null; setShopStockInputFile(file); setShopStockInputName(file?.name || '') }} />
                    <div className="mt-3 text-xs text-neutral-400">{shopStockInputName || 'No spreadsheet selected'}</div>
                    <Button className="mt-4 w-full rounded-2xl bg-white text-black hover:bg-white/90" onClick={() => handleImport('matsit', shopStockInputFile)} disabled={!shopStockInputFile}>Update Shop Stock Listing</Button>
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/10 p-4">
                    <h3 className="text-lg font-semibold text-neutral-100">Quarterly Planning</h3>
                    <p className="mt-1 text-sm text-neutral-300">Based on planned events and persisted demand history.</p>
                    <div className="mt-4">
                      <Label className="text-neutral-200">Select quarter</Label>
                      <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                        <SelectContent>
                          {quarterOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Card className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-sm text-neutral-300">Exercises entered</div><div className="mt-1 text-2xl font-semibold">{selectedQuarterStats.exerciseCount}</div></CardContent></Card>
                      <Card className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-sm text-neutral-300">Top recommended parts</div><div className="mt-2 space-y-1 text-sm">{selectedQuarterStats.topRecommendations.length ? selectedQuarterStats.topRecommendations.map((item) => <div key={item.materialNumber} className="flex justify-between gap-3"><span className="truncate pr-2">{item.description}</span><span>{item.qty}</span></div>) : <div className="text-neutral-400">No recommendations yet.</div>}</div></CardContent></Card>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold text-neutral-100">Dataset & Performance</h2>
              <p className="mt-1 text-sm text-neutral-300">The backend records algorithm output, human adjustments, and actual outcomes separately.</p>
              <div className="mt-5 rounded-2xl border border-white/10 p-4">
                <div className="text-sm text-neutral-300">Algorithm Score</div>
                <div className="mt-1 text-3xl font-semibold">{metricSummary.algorithmMae === null ? '—' : `${Math.max(0, Math.round(100 - metricSummary.algorithmMae * 5))}/100`}</div>
                <div className="mt-4"><Progress value={metricSummary.algorithmMae === null ? 0 : Math.max(0, Math.round(100 - metricSummary.algorithmMae * 5))} className="h-2" /></div>
                <div className="mt-3 text-xs text-neutral-400">Evaluated events: {metricSummary.evaluatedEvents}</div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Card className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-xs text-neutral-300">Algorithm MAE</div><div className="mt-1 text-xl font-semibold">{metricSummary.algorithmMae === null ? '—' : metricSummary.algorithmMae.toFixed(2)}</div></CardContent></Card>
                <Card className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-xs text-neutral-300">Human MAE</div><div className="mt-1 text-xl font-semibold">{metricSummary.humanMae === null ? '—' : metricSummary.humanMae.toFixed(2)}</div></CardContent></Card>
              </div>
              <div className="mt-6 rounded-2xl border border-white/10 p-4">
                <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-neutral-200">Latest datasets</h3><p className="mt-1 text-xs text-neutral-400">All uploaded/imported records.</p></div><Badge className="bg-white/10 text-white">{dataset.length} total</Badge></div>
                <div className="mt-4 rounded-2xl border border-white/10 overflow-hidden">
                  <Table>
                    <TableHeader><TableRow className="border-white/10"><TableHead className="text-neutral-300">Type</TableHead><TableHead className="text-neutral-300">Label</TableHead></TableRow></TableHeader>
                    <TableBody>{dataset.slice(0, 6).map((item) => <TableRow key={item.id} className="border-white/10"><TableCell><Badge className="bg-white/10 text-white">{item.kind}</Badge></TableCell><TableCell className="text-xs text-neutral-100">{item.label}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="fixed bottom-6 right-6 flex flex-col gap-2">
          <Button className="rounded-2xl bg-white text-black hover:bg-white/90 shadow-lg" onClick={() => setActiveDialog('bulk')}><Upload className="mr-2 h-4 w-4" />Upload New Dataset</Button>
          <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15 shadow-lg" onClick={() => setActiveDialog('viewdata')}><Eye className="mr-2 h-4 w-4" />View Dataset</Button>
          <div className="flex gap-2">
            <Button className="flex-1 rounded-2xl bg-white/10 text-white hover:bg-white/15 shadow-lg" onClick={handleUndoLastDataset}><Undo2 className="mr-2 h-4 w-4" />Undo Last</Button>
            <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15 shadow-lg" onClick={() => setActiveDialog('delete')}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
          </div>
        </div>

        <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-xl">
            <DialogHeader><DialogTitle>Select Unit Profile</DialogTitle><DialogDescription>One shared dashboard view per UIC.</DialogDescription></DialogHeader>
            <div className="grid gap-3">{uics.map((uic) => <button key={uic.id} className={`rounded-2xl border p-4 text-left ${loggedInUIC?.id === uic.id ? 'border-white bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`} onClick={async () => { setLoginOpen(false); await loadData(uic.id) }}><div className="flex items-center justify-between gap-3"><div><div className="font-semibold">{uic.unit}</div><div className="mt-1 text-sm text-neutral-400">{uic.code} · {uic.location}</div></div>{loggedInUIC?.id === uic.id ? <CheckCircle2 className="h-5 w-5" /> : <ChevronRight className="h-5 w-5 text-neutral-400" />}</div></button>)}</div>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'predict'} onOpenChange={(value) => setActiveDialog(value ? 'predict' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-2xl">
            <DialogHeader><DialogTitle>Predict Training Exercise</DialogTitle><DialogDescription>Manual planning fields reflect how training is actually entered for the MVP.</DialogDescription></DialogHeader>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Location</Label>
                <Select value={locationName} onValueChange={setLocationName}><SelectContent>{locations.map((item) => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div>
                <Label>Distance (miles)</Label>
                <Input value={distanceMiles} readOnly className="mt-2 rounded-xl border-white/10 bg-white/5" />
              </div>
              <div>
                <Label>Number of vehicles</Label>
                <Input type="number" value={vehicleCount} onChange={(e) => setVehicleCount(Number(e.target.value))} className="mt-2 rounded-xl border-white/10 bg-white/5" />
              </div>
              <div>
                <Label>Quarter</Label>
                <Input value={toQuarter(startDate)} readOnly className="mt-2 rounded-xl border-white/10 bg-white/5" />
              </div>
              <div>
                <Label>Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-2 rounded-xl border-white/10 bg-white/5" />
              </div>
              <div>
                <Label>End date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-2 rounded-xl border-white/10 bg-white/5" />
              </div>
              <div>
                <Label>Duration (days)</Label>
                <Input value={daysBetween(startDate, endDate)} readOnly className="mt-2 rounded-xl border-white/10 bg-white/5" />
              </div>
              <div className="md:col-span-2">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2 rounded-xl border-white/10 bg-white/5" />
              </div>
            </div>
            <DialogFooter><Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={handleRunPrediction}>Run Prediction</Button><Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => setActiveDialog(null)}>Cancel</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'predictionReview'} onOpenChange={(value) => setActiveDialog(value ? 'predictionReview' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-5xl">
            <DialogHeader><DialogTitle>Review Predicted Parts</DialogTitle><DialogDescription>Raw algorithm output is saved separately from the human-adjusted version.</DialogDescription></DialogHeader>
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <Table>
                <TableHeader><TableRow className="border-white/10"><TableHead className="text-neutral-300">NIIN</TableHead><TableHead className="text-neutral-300">Description</TableHead><TableHead className="text-neutral-300 text-right">Algorithm Qty</TableHead><TableHead className="text-neutral-300 text-right">Human Qty</TableHead><TableHead className="text-neutral-300 text-right">Human ROP</TableHead></TableRow></TableHeader>
                <TableBody>{draftPrediction && editablePredictionRows.map((row, idx) => { const original = draftPrediction.algorithmLines[idx]; return <TableRow key={row.materialNumber} className="border-white/10"><TableCell>{row.materialNumber}</TableCell><TableCell className="max-w-[280px] truncate">{row.description}</TableCell><TableCell className="text-right">{original.predictedQty}</TableCell><TableCell className="text-right"><Input type="number" value={row.humanPredictedQty} onChange={(e) => setEditablePredictionRows((prev) => prev.map((item, i) => i === idx ? { ...item, humanPredictedQty: Number(e.target.value) } : item))} className="ml-auto w-24 rounded-xl border-white/10 bg-white/5 text-right" /></TableCell><TableCell className="text-right"><Input type="number" value={row.humanReorderPoint} onChange={(e) => setEditablePredictionRows((prev) => prev.map((item, i) => i === idx ? { ...item, humanReorderPoint: Number(e.target.value) } : item))} className="ml-auto w-24 rounded-xl border-white/10 bg-white/5 text-right" /></TableCell></TableRow> })}</TableBody>
              </Table>
            </div>
            <DialogFooter><Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={() => setActiveDialog('reorderConfirm')}>Continue</Button><Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => finalizePrediction(false)}>Save Prediction Only</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'reorderConfirm'} onOpenChange={(value) => setActiveDialog(value ? 'reorderConfirm' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-xl">
            <DialogHeader><DialogTitle>Update Reorder Points?</DialogTitle><DialogDescription>Apply the reviewed recommendation to the persisted shop stock list.</DialogDescription></DialogHeader>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-start gap-3"><Wand2 className="mt-0.5 h-5 w-5 text-neutral-300" /><div><div className="font-medium">This writes updated reorder points to backend shop stock data.</div><p className="mt-1 text-sm text-neutral-400">Algorithm and human-adjusted predictions remain saved separately for scoring later.</p></div></div></div>
            <DialogFooter><Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={() => finalizePrediction(true)}>Yes, Update Reorder Points</Button><Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => finalizePrediction(false)}>No, Save Prediction Only</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'downloadReorder'} onOpenChange={(value) => setActiveDialog(value ? 'downloadReorder' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-xl">
            <DialogHeader><DialogTitle>Download Updated Shop Stock Order Points?</DialogTitle><DialogDescription>The backend has already saved the updated recommended reorder points.</DialogDescription></DialogHeader>
            <DialogFooter>
              <Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={() => { downloadSpreadsheet(`updated_shop_stock_${loggedInUIC.code}.csv`, shopStock.map((row) => ({ niin: row.materialNumber, description: row.description, currentRop: row.reorderPoint, recommendedReorderPoint: row.recommendedReorderPoint, onHand: row.onHand }))); setActiveDialog(null) }}>Download Now</Button>
              <Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => setActiveDialog(null)}>Download Later</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'results'} onOpenChange={(value) => setActiveDialog(value ? 'results' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-4xl">
            <DialogHeader><DialogTitle>Input Training Results</DialogTitle><DialogDescription>Save actual results so both the algorithm and the human-adjusted version can be scored.</DialogDescription></DialogHeader>
            <div>
              <Label>Select predicted exercise</Label>
              <select className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm" value={selectedPredId} onChange={(e) => setSelectedPredId(e.target.value)}>
                <option value="">— Select —</option>
                {predictions.map((prediction) => <option key={prediction.id} value={prediction.id}>{prediction.event.locationName} · {prediction.event.startDate}</option>)}
              </select>
            </div>
            <Tabs value={resultsMode} onValueChange={setResultsMode} className="mt-4">
              <TabsList className="rounded-2xl border border-white/10 bg-white/5"><TabsTrigger value="fields" className="rounded-2xl">Manual Fields</TabsTrigger><TabsTrigger value="spreadsheet" className="rounded-2xl">Spreadsheet</TabsTrigger></TabsList>
              <TabsContent value="fields" className="mt-5">
                <div className="rounded-2xl border border-white/10 overflow-hidden">
                  <Table>
                    <TableHeader><TableRow className="border-white/10"><TableHead className="text-neutral-300">Include</TableHead><TableHead className="text-neutral-300">NIIN</TableHead><TableHead className="text-neutral-300">Description</TableHead><TableHead className="text-neutral-300 text-right">Actual Qty</TableHead></TableRow></TableHeader>
                    <TableBody>{manualResults.map((item, idx) => <TableRow key={item.materialNumber} className="border-white/10"><TableCell><div className="flex items-center justify-center"><Checkbox checked={item.include} onCheckedChange={(value) => setManualResults((prev) => prev.map((row, i) => i === idx ? { ...row, include: value } : row))} /></div></TableCell><TableCell>{item.materialNumber}</TableCell><TableCell className="max-w-[280px] truncate">{item.description}</TableCell><TableCell className="text-right"><Input type="number" value={item.actualQty} onChange={(e) => setManualResults((prev) => prev.map((row, i) => i === idx ? { ...row, actualQty: Number(e.target.value) } : row))} className="ml-auto w-24 rounded-xl border-white/10 bg-white/5 text-right" /></TableCell></TableRow>)}</TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsContent value="spreadsheet" className="mt-5"><div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-neutral-300">Manual result entry is enabled in this build. Spreadsheet-based result parsing is staged for a later iteration.</div></TabsContent>
            </Tabs>
            <DialogFooter><Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={handleSaveResults} disabled={!selectedPredId}>Save Results</Button><Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => setActiveDialog(null)}>Cancel</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'algo'} onOpenChange={(value) => setActiveDialog(value ? 'algo' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-6xl">
            <DialogHeader><DialogTitle>Algorithm Results</DialogTitle><DialogDescription>Separate records are kept for raw algorithm output and the human-adjusted version.</DialogDescription></DialogHeader>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Card className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-sm text-neutral-300">Evaluated events</div><div className="mt-1 text-2xl font-semibold">{metricSummary.evaluatedEvents}</div></CardContent></Card>
              <Card className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-sm text-neutral-300">Algorithm MAE</div><div className="mt-1 text-2xl font-semibold">{metricSummary.algorithmMae === null ? '—' : metricSummary.algorithmMae.toFixed(2)}</div></CardContent></Card>
              <Card className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-sm text-neutral-300">Human MAE</div><div className="mt-1 text-2xl font-semibold">{metricSummary.humanMae === null ? '—' : metricSummary.humanMae.toFixed(2)}</div></CardContent></Card>
              <Card className="border-white/10 bg-white/5"><CardContent className="p-4"><div className="text-sm text-neutral-300">Winner</div><div className="mt-1 text-2xl font-semibold">{metricSummary.algorithmMae === null ? '—' : metricSummary.humanMae < metricSummary.algorithmMae ? 'Human' : 'Algorithm'}</div></CardContent></Card>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="rounded-2xl border border-white/10 overflow-hidden">
                  <Table>
                    <TableHeader><TableRow className="border-white/10"><TableHead className="text-neutral-300">Exercise</TableHead><TableHead className="text-neutral-300">Quarter</TableHead><TableHead className="text-neutral-300 text-right">Alg. MAE</TableHead><TableHead className="text-neutral-300 text-right">Human MAE</TableHead></TableRow></TableHeader>
                    <TableBody>{predictions.map((prediction) => {
                      const eventMetrics = metrics.filter((item) => item.predictionId === prediction.id)
                      const algMae = eventMetrics.length ? eventMetrics.reduce((sum, item) => sum + item.algorithmAbsError, 0) / eventMetrics.length : null
                      const humanMae = eventMetrics.length ? eventMetrics.reduce((sum, item) => sum + item.humanAbsError, 0) / eventMetrics.length : null
                      return <TableRow key={prediction.id} className="border-white/10 cursor-pointer hover:bg-white/5" onClick={() => setSelectedPredId(prediction.id)}><TableCell className="text-white">{prediction.event.locationName} · {prediction.event.startDate}</TableCell><TableCell>{prediction.quarter}</TableCell><TableCell className="text-right">{algMae === null ? '—' : algMae.toFixed(2)}</TableCell><TableCell className="text-right">{humanMae === null ? '—' : humanMae.toFixed(2)}</TableCell></TableRow>
                    })}</TableBody>
                  </Table>
                </div>
              </div>
              <div>
                <div className="flex items-end justify-between gap-3"><div><h3 className="text-lg font-semibold">Prediction vs. Results</h3><p className="mt-1 text-sm text-neutral-300">Includes algorithm output, human-adjusted output, and actual demand.</p></div><Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => selectedPrediction && downloadSpreadsheet(`comparison_${selectedPrediction.id}.csv`, comparisonRows)} disabled={!selectedPrediction}><FileDown className="mr-2 h-4 w-4" />Download Comparison</Button></div>
                <div className="mt-4 rounded-2xl border border-white/10 overflow-hidden">
                  <Table>
                    <TableHeader><TableRow className="border-white/10"><TableHead className="text-neutral-300">NIIN</TableHead><TableHead className="text-neutral-300">Description</TableHead><TableHead className="text-neutral-300 text-right">Alg.</TableHead><TableHead className="text-neutral-300 text-right">Human</TableHead><TableHead className="text-neutral-300 text-right">Actual</TableHead></TableRow></TableHeader>
                    <TableBody>{comparisonRows.map((row) => <TableRow key={row.materialNumber} className="border-white/10"><TableCell>{row.materialNumber}</TableCell><TableCell className="max-w-[240px] truncate">{row.description}</TableCell><TableCell className="text-right">{row.algorithmPredictedQty}</TableCell><TableCell className="text-right">{row.humanPredictedQty}</TableCell><TableCell className="text-right">{row.actualQty}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </div>
                {currentMetricRows.length ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4"><div className="font-medium">Selected event error summary</div><div className="mt-2 grid grid-cols-2 gap-3 text-sm"><div>Algorithm MAE: {(currentMetricRows.reduce((sum, item) => sum + item.algorithmAbsError, 0) / currentMetricRows.length).toFixed(2)}</div><div>Human MAE: {(currentMetricRows.reduce((sum, item) => sum + item.humanAbsError, 0) / currentMetricRows.length).toFixed(2)}</div></div></div> : <div className="mt-3 flex items-start gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-neutral-300"><AlertTriangle className="mt-0.5 h-4 w-4" />No actual training results are linked to this exercise yet.</div>}
              </div>
            </div>
            <DialogFooter><Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => setActiveDialog(null)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'viewdata'} onOpenChange={(value) => setActiveDialog(value ? 'viewdata' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-3xl">
            <DialogHeader><DialogTitle>View Dataset</DialogTitle><DialogDescription>Review persisted uploads, predictions, and results.</DialogDescription></DialogHeader>
            <div className="rounded-2xl border border-white/10 overflow-hidden"><Table><TableHeader><TableRow className="border-white/10"><TableHead className="text-neutral-300">Added</TableHead><TableHead className="text-neutral-300">Type</TableHead><TableHead className="text-neutral-300">Label</TableHead></TableRow></TableHeader><TableBody>{dataset.map((item) => <TableRow key={item.id} className="border-white/10"><TableCell className="text-xs text-neutral-200">{formatDateTime(item.addedAt)}</TableCell><TableCell><Badge className="bg-white/10 text-white">{item.kind}</Badge></TableCell><TableCell className="text-xs text-neutral-100">{item.label}</TableCell></TableRow>)}</TableBody></Table></div>
            <DialogFooter><Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={() => downloadSpreadsheet('datasets_loaded.csv', dataset)}>Export Dataset List</Button><Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => setActiveDialog(null)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'bulk'} onOpenChange={(value) => setActiveDialog(value ? 'bulk' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-xl">
            <DialogHeader><DialogTitle>Upload New Dataset</DialogTitle><DialogDescription>Accepted dataset types: SSL, Demand Analysis, or ZRRR vehicle-only files.</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><Label>Choose spreadsheet</Label><Input type="file" accept=".xlsx,.xls,.csv" className="mt-2 rounded-xl border-white/10 bg-white/5" onChange={(e) => setBulkInputFile(e.target.files?.[0] || null)} /></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={() => handleImport('ssl', bulkInputFile)} disabled={!bulkInputFile}>Upload SSL</Button>
                <Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={() => handleImport('demand-analysis', bulkInputFile)} disabled={!bulkInputFile}>Upload Demand Analysis</Button>
                <Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={() => handleImport('zrrr', bulkInputFile)} disabled={!bulkInputFile}>Upload ZRRR</Button>
              </div>
            </div>
            <DialogFooter><Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => setActiveDialog(null)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDialog === 'delete'} onOpenChange={(value) => setActiveDialog(value ? 'delete' : null)}>
          <DialogContent className="rounded-2xl border-white/10 bg-[#111111] text-white sm:max-w-xl">
            <DialogHeader><DialogTitle>Delete Dataset</DialogTitle><DialogDescription>Destructive delete remains intentionally disabled in this build.</DialogDescription></DialogHeader>
            <DialogFooter><Button className="rounded-2xl bg-white/10 text-white hover:bg-white/15" onClick={() => setActiveDialog(null)}>Cancel</Button><Button className="rounded-2xl bg-white text-black hover:bg-white/90" onClick={handleDeletePrompt}>Acknowledge</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
