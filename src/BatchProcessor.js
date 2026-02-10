/**
 * BatchProcessor.js - Maroon & White Auto Batch IPQC Processor
 * Auto-starts, 3-day target, auto-refresh, log toggle button
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { extractTextFromImage } from './services/azureOCR';
import { deepScanAllPages, storePageOCR, clearAllOCR } from './services/deepPageScanner';
import { getDefaultCheckpoints, applyMappedDataToFormData } from './services/checkpointDefaults';

const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8080'
  : `http://${window.location.hostname}:8080`;
const PDF_PROXY_URL = '/proxy-pdf';
const AUTO_REFRESH_INTERVAL = 30 * 60 * 1000;

const BatchProcessor = ({ onBack }) => {
  const [allChecklists, setAllChecklists] = useState([]);
  const [processedStatuses, setProcessedStatuses] = useState({});
  const [isLoadingChecklists, setIsLoadingChecklists] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [batchQueue, setBatchQueue] = useState([]);
  const [currentProcessing, setCurrentProcessing] = useState(null);
  const [processLog, setProcessLog] = useState([]);
  const [batchStats, setBatchStats] = useState({ total: 0, completed: 0, failed: 0, inProgress: 0 });
  const [currentProgress, setCurrentProgress] = useState({ phase: '', page: 0, totalPages: 0, detail: '', fieldsFound: 0 });
  const [perPdfResults, setPerPdfResults] = useState({});
  const [error, setError] = useState('');
  const [autoMode, setAutoMode] = useState('running');
  const [nextRefresh, setNextRefresh] = useState(null);
  const [dayTarget, setDayTarget] = useState(0);
  const [showLog, setShowLog] = useState(false);

  const isPausedRef = useRef(false);
  const isProcessingRef = useRef(false);
  const autoStartedRef = useRef(false);
  const refreshTimerRef = useRef(null);
  const logEndRef = useRef(null);

  useEffect(() => { if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [processLog]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  const addLog = useCallback((msg, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setProcessLog(prev => [...prev.slice(-300), { msg, type, timestamp }]);
  }, []);

  const fetchChecklists = async () => {
    setIsLoadingChecklists(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/peelTest/getuploadCheckListPdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
      });
      if (!response.ok) throw new Error('Failed to fetch checklists');
      const data = await response.json();
      let arr = [];
      if (Array.isArray(data)) arr = data;
      else if (data?.data && Array.isArray(data.data)) arr = data.data;
      else if (data?.result && Array.isArray(data.result)) arr = data.result;
      else if (data?.checklists && Array.isArray(data.checklists)) arr = data.checklists;
      const ipqc = arr.filter(i => i && i.Type === 'ipqcChecklist').sort((a, b) => new Date(b.date) - new Date(a.date));
      setAllChecklists(ipqc);
      addLog(`📡 Fetched ${ipqc.length} IPQC checklists`, 'success');
      await checkBulkStatuses(ipqc);
      return ipqc;
    } catch (err) { setError(err.message); addLog(`❌ ${err.message}`, 'error'); return []; }
    finally { setIsLoadingChecklists(false); }
  };

  const checkBulkStatuses = async (checklists) => {
    try {
      const ids = checklists.map(c => c._id || c.id || `${c.date}_${c.Line}_${c.Shift}`);
      const res = await fetch(`${API_BASE_URL}/api/forms/bulk-status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklist_ids: ids })
      });
      const data = await res.json();
      if (data.success) {
        setProcessedStatuses(data.data || {});
        addLog(`📊 ${Object.values(data.data || {}).filter(s => s.saved).length}/${checklists.length} already done`, 'info');
      }
    } catch (err) { addLog(`⚠ ${err.message}`, 'warning'); }
  };

  const getPendingChecklists = useCallback(() => {
    return allChecklists.filter(c => {
      const id = c._id || c.id || `${c.date}_${c.Line}_${c.Shift}`;
      return !processedStatuses[id] || !processedStatuses[id].saved;
    });
  }, [allChecklists, processedStatuses]);

  const convertPdfToImage = async (pdfUrl) => {
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`PDF fetch failed: ${response.status}`);
    const buf = await response.arrayBuffer();
    const bytes = new Uint8Array(buf.slice(0, 20));
    if (String.fromCharCode(...bytes).includes('<html')) throw new Error('HTML instead of PDF');
    const pdfjsLib = window.pdfjsLib || await loadPdfJs();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.height = vp.height; canvas.width = vp.width;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
  };

  const loadPdfJs = () => new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; resolve(window.pdfjsLib); };
    s.onerror = () => reject(new Error('PDF.js load failed'));
    document.head.appendChild(s);
  });

  const blobToBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onloadend = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  const processSingleChecklist = async (checklist) => {
    const checklistId = checklist._id || checklist.id || `${checklist.date}_${checklist.Line}_${checklist.Shift}`;
    const label = `${checklist.Line || '?'} | ${checklist.Shift || ''} | ${checklist.date ? new Date(checklist.date).toLocaleDateString() : ''}`;
    setCurrentProcessing({ ...checklist, label, checklistId });
    addLog(`▶ ${label}`, 'info');
    try {
      const pages = [...new Set([checklist.Page1PdfFile, checklist.Page2PdfFile, checklist.Page3PdfFile, checklist.Page4PdfFile, checklist.Page5PdfFile, checklist.Page6PdfFile, checklist.Page7PdfFile].filter(Boolean))];
      if (!pages.length) throw new Error('No PDF pages');
      addLog(`  📄 ${pages.length} pages`, 'info');
      setCurrentProgress({ phase: 'OCR', page: 0, totalPages: pages.length, detail: 'Starting...', fieldsFound: 0 });
      const ocrTexts = {}; let ocrOk = 0; clearAllOCR();
      for (let i = 0; i < pages.length; i++) {
        while (isPausedRef.current) await delay(1000);
        if (!isProcessingRef.current) throw new Error('STOPPED');
        setCurrentProgress(p => ({ ...p, page: i + 1, detail: `OCR ${i + 1}/${pages.length}` }));
        if (i > 0) { addLog(`  ⏳ 20s wait...`, 'info'); await delay(20000); }
        try {
          const blob = await convertPdfToImage(`${PDF_PROXY_URL}/api/${pages[i]}`);
          if (!blob) continue;
          const txt = await extractTextFromImage(await blobToBase64(blob));
          ocrTexts[i + 1] = txt; storePageOCR(i + 1, txt); ocrOk++;
          addLog(`  ✅ Page ${i + 1} (${txt.length} chars)`, 'success');
        } catch (e) { addLog(`  ❌ Page ${i + 1}: ${e.message}`, 'error'); }
      }
      if (!ocrOk) throw new Error('All OCR failed');
      setCurrentProgress(p => ({ ...p, phase: 'AI Scan', detail: 'Deep scanning...' }));
      addLog(`  🤖 AI scanning ${Object.keys(ocrTexts).length} pages...`, 'info');
      let mapped = {};
      try { clearAllOCR(); mapped = await deepScanAllPages(ocrTexts, pr => setCurrentProgress(p => ({ ...p, detail: pr }))); addLog(`  ✅ ${Object.keys(mapped).length} fields`, 'success'); }
      catch (e) { addLog(`  ⚠ AI failed: ${e.message}`, 'warning'); }
      const { formData, filledCount, totalFields } = applyMappedDataToFormData(mapped);
      formData.date = checklist.date ? new Date(checklist.date).toISOString().split('T')[0] : formData.date;
      formData.shift = checklist.Shift || formData.shift;
      formData.poNo = checklist.Line || formData.poNo;
      const pct = totalFields > 0 ? Math.round((filledCount / totalFields) * 100) : 0;
      setCurrentProgress(p => ({ ...p, fieldsFound: filledCount, phase: 'Saving', detail: `${filledCount} fields (${pct}%)` }));
      addLog(`  💾 Saving (${filledCount} fields, ${pct}%)...`, 'info');
      const saveRes = await fetch(`${API_BASE_URL}/api/forms/save-by-checklist`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist_id: checklistId, date: formData.date, time: formData.time, shift: formData.shift, line: checklist.Line || '', po_no: formData.poNo, form_data: formData, checkpoints_data: formData.checkpoints, original_pdf_urls: pages.map(f => `https://newmaintenance.umanerp.com/api/${f}`) })
      });
      if (!saveRes.ok) throw new Error('Save failed');
      addLog(`  ✅ SAVED!`, 'success');
      setProcessedStatuses(p => ({ ...p, [checklistId]: { exists: true, processed: true, saved: true } }));
      setPerPdfResults(p => ({ ...p, [checklistId]: { filledCount, totalFields, filledPercentage: pct, status: 'success', label } }));
      return { success: true, filledCount, totalFields, filledPercentage: pct };
    } catch (err) {
      if (err.message === 'STOPPED') { setPerPdfResults(p => ({ ...p, [checklistId]: { status: 'stopped', label } })); return { success: false, stopped: true }; }
      addLog(`  ❌ ${err.message}`, 'error');
      setPerPdfResults(p => ({ ...p, [checklistId]: { status: 'failed', error: err.message, label } }));
      return { success: false, error: err.message };
    }
  };

  const startAutoBatch = async (checklists, statuses) => {
    const pending = checklists.filter(c => { const id = c._id || c.id || `${c.date}_${c.Line}_${c.Shift}`; const s = statuses[id]; return !s || !s.saved; });
    if (!pending.length) { addLog('✅ All done! Waiting for new PDFs...', 'success'); setAutoMode('waiting'); scheduleAutoRefresh(); return; }
    const perDay = Math.ceil(pending.length / 3); setDayTarget(perDay);
    addLog(`🎯 ${pending.length} pending → ${perDay}/day (3-day target)`, 'info');
    const batch = [...pending].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, perDay);
    setIsProcessing(true); isProcessingRef.current = true; setIsPaused(false); isPausedRef.current = false; setAutoMode('running');
    setBatchQueue(batch.map(c => c._id || c.id || `${c.date}_${c.Line}_${c.Shift}`));
    addLog(`🚀 Processing ${batch.length} PDFs`, 'success');
    let done = 0, fail = 0;
    setBatchStats({ total: batch.length, completed: 0, failed: 0, inProgress: 1 });
    for (let i = 0; i < batch.length; i++) {
      if (!isProcessingRef.current) break;
      addLog(`\n━━━ PDF ${i + 1}/${batch.length} ━━━`, 'info');
      const r = await processSingleChecklist(batch[i]);
      if (r.stopped) break;
      r.success ? done++ : fail++;
      setBatchStats({ total: batch.length, completed: done, failed: fail, inProgress: i + 1 < batch.length ? 1 : 0 });
      if (i < batch.length - 1 && isProcessingRef.current) { addLog(`⏳ 5s cooldown...`, 'info'); await delay(5000); }
    }
    setIsProcessing(false); isProcessingRef.current = false; setCurrentProcessing(null);
    setCurrentProgress({ phase: '', page: 0, totalPages: 0, detail: '', fieldsFound: 0 });
    addLog(`\n🏁 DONE: ${done}✅ ${fail}❌ / ${batch.length}`, done > 0 ? 'success' : 'error');
    setAutoMode('waiting'); scheduleAutoRefresh();
  };

  const scheduleAutoRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const next = new Date(Date.now() + AUTO_REFRESH_INTERVAL); setNextRefresh(next);
    addLog(`⏰ Next check: ${next.toLocaleTimeString()}`, 'info');
    refreshTimerRef.current = setTimeout(async () => {
      addLog(`\n🔄 Checking for new PDFs...`, 'info');
      const cl = await fetchChecklists();
      if (cl.length > 0) {
        try {
          const ids = cl.map(c => c._id || c.id || `${c.date}_${c.Line}_${c.Shift}`);
          const res = await fetch(`${API_BASE_URL}/api/forms/bulk-status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklist_ids: ids }) });
          const data = await res.json();
          if (data.success) {
            const st = data.data || {}; setProcessedStatuses(st);
            const np = cl.filter(c => { const id = c._id || c.id || `${c.date}_${c.Line}_${c.Shift}`; return !st[id] || !st[id].saved; });
            if (np.length > 0) { addLog(`📥 ${np.length} new pending!`, 'success'); await startAutoBatch(cl, st); }
            else { addLog(`✅ All caught up!`, 'success'); scheduleAutoRefresh(); }
          }
        } catch (e) { addLog(`❌ ${e.message}`, 'error'); scheduleAutoRefresh(); }
      } else { scheduleAutoRefresh(); }
    }, AUTO_REFRESH_INTERVAL);
  }, []);

  useEffect(() => { return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); }; }, []);

  useEffect(() => {
    if (autoStartedRef.current) return; autoStartedRef.current = true;
    addLog('🔌 Initialized', 'success'); addLog('⚡ Auto-starting...', 'info');
    (async () => {
      const cl = await fetchChecklists();
      if (!cl.length) { addLog('⚠ No checklists. Retry in 30 min.', 'warning'); scheduleAutoRefresh(); return; }
      await delay(2000);
      let st = {};
      try { const ids = cl.map(c => c._id || c.id || `${c.date}_${c.Line}_${c.Shift}`); const res = await fetch(`${API_BASE_URL}/api/forms/bulk-status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklist_ids: ids }) }); const d = await res.json(); if (d.success) st = d.data || {}; } catch (e) {}
      await startAutoBatch(cl, st);
    })();
  }, []);

  const stopProcessing = () => { isProcessingRef.current = false; setIsProcessing(false); setAutoMode('waiting'); addLog('⏹ Stopped.', 'warning'); };
  const togglePause = () => { setIsPaused(p => { const v = !p; isPausedRef.current = v; addLog(v ? '⏸ Paused' : '▶ Resumed', 'info'); return v; }); };

  const pendingCount = getPendingChecklists().length;
  const processedCount = allChecklists.length - pendingCount;
  const overallProgress = allChecklists.length > 0 ? Math.round((processedCount / allChecklists.length) * 100) : 0;

  // Maroon & White Theme
  const M = '#800020', ML = '#a0304a', MD = '#5c0018';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Segoe UI', Calibri, sans-serif", background: '#faf7f5', color: '#2c1810' }}>

      {/* Top Bar - Maroon */}
      <div style={{ background: M, padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(128,0,32,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button onClick={onBack} style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>← Back</button>
          <span style={{ fontWeight: '800', fontSize: '18px', color: '#fff' }}>⚡ Auto Batch Processor</span>
          <span style={{ padding: '4px 14px', borderRadius: '12px', fontSize: '12px', fontWeight: '700', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
            {autoMode === 'running' ? '● PROCESSING' : autoMode === 'waiting' ? '● WAITING' : '● IDLE'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {nextRefresh && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Next: {nextRefresh.toLocaleTimeString()}</span>}
          <button onClick={() => setShowLog(!showLog)} style={{ padding: '6px 14px', background: showLog ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
            {showLog ? '✕ Close Log' : '📜 Show Log'}
          </button>
          {isProcessing && <>
            <button onClick={togglePause} style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>{isPaused ? '▶ Resume' : '⏸ Pause'}</button>
            <button onClick={stopProcessing} style={{ padding: '6px 14px', background: 'rgba(255,0,0,0.2)', color: '#fff', border: '1px solid rgba(255,100,100,0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>⏹ Stop</button>
          </>}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Main Panel */}
        <div style={{ width: showLog ? '60%' : '100%', overflow: 'auto', background: '#faf7f5', padding: '20px', transition: 'width 0.3s' }}>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
            {[
              { v: allChecklists.length, l: 'Total PDFs', c: M },
              { v: processedCount, l: 'Completed', c: '#1e7a3a' },
              { v: pendingCount, l: 'Pending', c: '#d4760a' },
              { v: `${overallProgress}%`, l: 'Progress', c: M },
            ].map((s, i) => (
              <div key={i} style={{ background: '#fff', padding: '18px 12px', textAlign: 'center', border: '2px solid #e0d5cc', borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: '34px', fontWeight: '800', color: s.c }}>{s.v}</div>
                <div style={{ fontSize: '13px', color: '#7a6b60', marginTop: '4px', fontWeight: '600' }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Progress + Target */}
          <div style={{ display: 'flex', gap: '14px', marginBottom: '18px', alignItems: 'stretch' }}>
            <div style={{ flex: 1, background: '#fff', border: '2px solid #e0d5cc', borderRadius: '10px', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px', color: '#7a6b60', fontWeight: '600' }}>
                <span>Overall Completion</span><span style={{ color: M, fontWeight: '700' }}>{processedCount}/{allChecklists.length}</span>
              </div>
              <div style={{ background: '#ede5df', height: '28px', borderRadius: '8px', position: 'relative', overflow: 'hidden', border: '1px solid #e0d5cc' }}>
                <div style={{ background: `linear-gradient(90deg, ${M}, ${ML})`, height: '100%', width: `${overallProgress}%`, transition: 'width 0.5s', borderRadius: '7px' }} />
                <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: '14px', fontWeight: '700', color: overallProgress > 30 ? '#fff' : M }}>{overallProgress}%</span>
              </div>
            </div>
            {dayTarget > 0 && (
              <div style={{ background: '#fff', border: `2px solid ${M}33`, borderRadius: '10px', padding: '14px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ color: M, fontWeight: '800', fontSize: '14px' }}>🎯 3-Day Target</div>
                <div style={{ color: '#2c1810', fontSize: '22px', fontWeight: '800', marginTop: '2px' }}>{dayTarget} <span style={{ fontSize: '13px', fontWeight: '600', color: '#7a6b60' }}>PDFs/day</span></div>
              </div>
            )}
          </div>

          {/* Current Processing */}
          {isProcessing && currentProcessing && (
            <div style={{ background: '#fff', border: `2px solid ${M}44`, borderLeft: `5px solid ${M}`, borderRadius: '10px', padding: '16px 20px', marginBottom: '18px', boxShadow: '0 2px 8px rgba(128,0,32,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontWeight: '700', fontSize: '15px', color: isPaused ? '#d4760a' : M }}>{isPaused ? '⏸ PAUSED' : '⚡ Processing Now'}</div>
                {batchStats.total > 0 && <span style={{ fontSize: '13px', color: '#7a6b60', fontWeight: '600' }}>✅{batchStats.completed} ❌{batchStats.failed} 📦{batchStats.total - batchStats.completed - batchStats.failed} left</span>}
              </div>
              <div style={{ fontSize: '15px', color: '#2c1810', marginBottom: '8px', fontWeight: '600' }}>{currentProcessing.label}</div>
              <div style={{ fontSize: '13px', color: '#7a6b60', marginBottom: '10px' }}>
                {currentProgress.phase} {currentProgress.page > 0 && `| Page ${currentProgress.page}/${currentProgress.totalPages}`} | {currentProgress.detail}
              </div>
              <div style={{ background: '#ede5df', height: '18px', borderRadius: '6px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ background: currentProgress.phase === 'Saving' ? '#1e7a3a' : currentProgress.phase === 'AI Scan' ? '#6c3483' : M, height: '100%', borderRadius: '6px', width: currentProgress.totalPages > 0 ? `${Math.round((currentProgress.page / currentProgress.totalPages) * 100)}%` : '50%', transition: 'width 0.3s' }} />
                <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: '10px', fontWeight: '700', color: '#fff' }}>{currentProgress.phase}</span>
              </div>
              {currentProgress.fieldsFound > 0 && <div style={{ marginTop: '8px', fontSize: '13px', color: '#1e7a3a', fontWeight: '700' }}>✅ {currentProgress.fieldsFound} fields</div>}
            </div>
          )}

          {/* Results */}
          {Object.keys(perPdfResults).length > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontWeight: '700', fontSize: '16px', marginBottom: '10px', color: M }}>📋 Results</div>
              <div style={{ border: '2px solid #e0d5cc', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead><tr style={{ background: M }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#fff', fontWeight: '700' }}>#</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#fff', fontWeight: '700' }}>PDF</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', color: '#fff', fontWeight: '700' }}>Fields</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', color: '#fff', fontWeight: '700' }}>%</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', color: '#fff', fontWeight: '700' }}>Status</th>
                  </tr></thead>
                  <tbody>{Object.entries(perPdfResults).map(([id, r], i) => (
                    <tr key={id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f0ed' }}>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid #e0d5cc', color: '#7a6b60' }}>{i + 1}</td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid #e0d5cc', color: '#2c1810', fontWeight: '600' }}>{r.label || id.substring(0, 30)}</td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid #e0d5cc', textAlign: 'center', color: '#7a6b60' }}>{r.filledCount || '-'}/{r.totalFields || '-'}</td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid #e0d5cc', textAlign: 'center', fontWeight: '700', color: (r.filledPercentage || 0) > 70 ? '#1e7a3a' : (r.filledPercentage || 0) > 40 ? '#d4760a' : '#c0392b' }}>{r.filledPercentage != null ? `${r.filledPercentage}%` : '-'}</td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid #e0d5cc', textAlign: 'center', fontSize: '15px' }}>{r.status === 'success' ? '✅' : r.status === 'failed' ? '❌' : '⏹'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Main Checklist Table */}
          <div>
            <div style={{ fontWeight: '800', fontSize: '18px', marginBottom: '12px', color: M }}>📄 All IPQC Checklists ({allChecklists.length})</div>
            {isLoadingChecklists ? <div style={{ textAlign: 'center', padding: '40px', color: '#7a6b60', fontSize: '16px' }}>Loading...</div> : (
              <div style={{ border: '2px solid #e0d5cc', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ maxHeight: 'calc(100vh - 400px)', overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr style={{ background: M }}>
                        <th style={{ padding: '12px 14px', textAlign: 'left', color: '#fff', fontWeight: '700', fontSize: '14px' }}>#</th>
                        <th style={{ padding: '12px 14px', textAlign: 'left', color: '#fff', fontWeight: '700', fontSize: '14px' }}>Date</th>
                        <th style={{ padding: '12px 14px', textAlign: 'left', color: '#fff', fontWeight: '700', fontSize: '14px' }}>Line</th>
                        <th style={{ padding: '12px 14px', textAlign: 'left', color: '#fff', fontWeight: '700', fontSize: '14px' }}>Shift</th>
                        <th style={{ padding: '12px 14px', textAlign: 'center', color: '#fff', fontWeight: '700', fontSize: '14px' }}>Pages</th>
                        <th style={{ padding: '12px 14px', textAlign: 'center', color: '#fff', fontWeight: '700', fontSize: '14px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allChecklists.map((c, i) => {
                        const id = c._id || c.id || `${c.date}_${c.Line}_${c.Shift}`;
                        const saved = processedStatuses[id]?.saved;
                        const pc = [c.Page1PdfFile, c.Page2PdfFile, c.Page3PdfFile, c.Page4PdfFile, c.Page5PdfFile, c.Page6PdfFile, c.Page7PdfFile].filter(Boolean).length;
                        return (
                          <tr key={i} style={{ background: saved ? '#eef7ee' : i % 2 === 0 ? '#fff' : '#f5f0ed' }}>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid #e0d5cc', color: '#7a6b60', fontSize: '13px' }}>{i + 1}</td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid #e0d5cc', color: '#2c1810', fontSize: '14px' }}>{c.date ? new Date(c.date).toLocaleDateString() : '-'}</td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid #e0d5cc', color: '#2c1810', fontSize: '14px', fontWeight: '700' }}>{c.Line || '-'}</td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid #e0d5cc', color: '#2c1810', fontSize: '14px' }}>{c.Shift || '-'}</td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid #e0d5cc', textAlign: 'center', color: '#7a6b60', fontSize: '14px' }}>{pc}</td>
                            <td style={{ padding: '10px 14px', borderBottom: '1px solid #e0d5cc', textAlign: 'center' }}>
                              {saved ? <span style={{ color: '#1e7a3a', fontWeight: '700', fontSize: '14px' }}>✅ Done</span> : <span style={{ color: '#d4760a', fontSize: '14px', fontWeight: '600' }}>⏳ Pending</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Log Panel - toggle */}
        {showLog && (
          <div style={{ width: '40%', display: 'flex', flexDirection: 'column', background: '#1a1014', borderLeft: `3px solid ${M}` }}>
            <div style={{ padding: '10px 16px', background: MD, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#fff', fontWeight: '700', fontSize: '14px' }}>📜 Processing Log</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{processLog.length} entries</span>
                <button onClick={() => setProcessLog([])} style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Clear</button>
                <button onClick={() => setShowLog(false)} style={{ padding: '4px 10px', background: 'rgba(255,0,0,0.2)', color: '#ff8888', border: '1px solid rgba(255,100,100,0.3)', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', fontFamily: "'Cascadia Code', Consolas, monospace", fontSize: '12px', lineHeight: '1.7' }}>
              {processLog.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '60px 20px' }}>
                  <div style={{ fontSize: '40px', marginBottom: '10px' }}>📜</div><div style={{ fontSize: '14px' }}>No log entries yet</div>
                </div>
              ) : processLog.map((log, i) => (
                <div key={i} style={{ padding: '2px 0', color: log.type === 'error' ? '#ff6b6b' : log.type === 'success' ? '#69db7c' : log.type === 'warning' ? '#ffd43b' : 'rgba(255,255,255,0.5)', borderBottom: log.msg.includes('━━━') ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                  <span style={{ color: 'rgba(255,255,255,0.2)', marginRight: '8px', fontSize: '10px' }}>{log.timestamp}</span>{log.msg}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchProcessor;
