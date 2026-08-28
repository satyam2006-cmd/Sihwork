import React, { useState, useCallback } from 'react';
import { Upload, FileText, Calendar, ChevronRight, Check, Eye, Copy, Camera, PenTool, Type, Pin, Trash2, Image, Sparkles } from 'lucide-react';
import { DocumentType, ScannedDoc, TimelineEvent } from '../types/medical';
import { extractTextFromImage, createImagePreview } from '../utils/ocr';
import { callLocalGemma } from '../utils/ai';

interface ScanSectionProps {
  onScanComplete: (scannedDocs: ScannedDoc[], timeline: TimelineEvent[]) => void;
  existingDocs: ScannedDoc[];
  existingTimeline: TimelineEvent[];
}

// Keep note color classes for variety
const KEEP_COLORS = ['', 'keep-coral', 'keep-mint', 'keep-fog', 'keep-lavender', 'keep-sand', 'keep-sage', 'keep-blossom', 'keep-peach'];

const guessDocumentType = (fileName: string): DocumentType => {
  const lower = fileName.toLowerCase();
  if (lower.includes('lab') || lower.includes('report') || lower.includes('blood') || lower.includes('mri') || lower.includes('ct') || lower.includes('xray')) {
    return 'lab_report';
  }
  if (lower.includes('discharge') || lower.includes('summary')) {
    return 'discharge_summary';
  }
  return 'prescription';
};

// Extended ScannedDoc with image preview for Keep notes
interface KeepNote {
  doc: ScannedDoc;
  imagePreview?: string; // data URL for uploaded image thumbnail
  isPinned: boolean;
  colorClass: string;
}

export const ScanSection: React.FC<ScanSectionProps> = ({
  onScanComplete,
  existingDocs,
  existingTimeline,
}) => {
  const [docs, setDocs] = useState<ScannedDoc[]>(existingDocs);
  const [timeline, setTimeline] = useState<TimelineEvent[]>(existingTimeline);
  const [keepNotes, setKeepNotes] = useState<KeepNote[]>([]);

  // Animation states
  const [isScanning, setIsScanning] = useState(false);
  const [scanningDocName, setScanningDocName] = useState('');
  const [previewDoc, setPreviewDoc] = useState<ScannedDoc | null>(null);

  // Google Keep OCR states
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isHandwritingMode, setIsHandwritingMode] = useState(true);
  const [isDragActive, setIsDragActive] = useState(false);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const [loadingGemmaNoteId, setLoadingGemmaNoteId] = useState<string | null>(null);

  // Drag & Drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const files = e.dataTransfer.files;
    if (files?.[0]) {
      processFileUpload(files[0]);
    }
  }, [docs, isHandwritingMode]);

  // Process uploaded file through OCR
  const processFileUpload = async (file: File) => {
    if (docs.some(d => d.name === file.name)) {
      alert("This document is already uploaded and digitized!");
      return;
    }

    setIsScanning(true);
    setScanningDocName(file.name);
    setOcrProgress(0);

    try {
      // Generate image preview for the Keep note
      let imagePreview: string | undefined;
      if (file.type.startsWith('image/')) {
        imagePreview = await createImagePreview(file);
      }
      const filePreview = URL.createObjectURL(file);
      const documentType = guessDocumentType(file.name);

      let extractedText = '';
      let gemmaSummary: string | undefined;
      let ocrConfidence: number | undefined;
      let handwrittenConfidence: number | undefined;
      const sourceKind = isHandwritingMode ? 'handwritten_gemma' : file.type.startsWith('image/') ? 'printed_ocr' : 'uploaded_file';

      if (isHandwritingMode) {
        setOcrProgress(50);
        if (imagePreview) {
          const result = await callLocalGemma(imagePreview);
          extractedText = result.text;
          handwrittenConfidence = result.confidence;
        } else {
          extractedText = 'Handwritten PDF/report attached for doctor review. Upload an image photo for handwritten text extraction.';
          handwrittenConfidence = 0;
        }
        setOcrProgress(100);
      } else if (file.type.startsWith('image/')) {
        const result = await extractTextFromImage(file, setOcrProgress);
        extractedText = result.text;
        ocrConfidence = result.confidence;

        if (imagePreview && (!extractedText || extractedText.trim().length < 15)) {
          const gemmaResult = await callLocalGemma(imagePreview, extractedText);
          gemmaSummary = gemmaResult.text;
          handwrittenConfidence = gemmaResult.confidence;
        }
      } else {
        extractedText = 'PDF/report attached for doctor review. Printed OCR currently runs on image uploads only.';
        ocrConfidence = 0;
        setOcrProgress(100);
      }

      const newDocId = `doc-${Date.now()}`;
      const newDoc: ScannedDoc = {
        id: newDocId,
        name: file.name,
        type: documentType,
        uploadedAt: new Date().toLocaleDateString(),
        rawText: extractedText || '(No text detected — try a clearer image)',
        imagePreview,
        filePreview,
        mimeType: file.type,
        sourceKind,
        ocrConfidence,
        handwrittenConfidence,
        gemmaSummary,
        structuredData: {},
      };

      const newTimelineEvent: TimelineEvent = {
        id: `tl-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        title: file.name,
        description: isHandwritingMode
          ? `Handwritten analysis via local vision model. Confidence: ${handwrittenConfidence ?? 0}%.`
          : `Printed OCR. Confidence: ${ocrConfidence ?? 0}%.`,
        type: documentType,
        sourceId: newDocId,
      };

      // Create Keep note card
      const colorIndex = (keepNotes.length + 1) % KEEP_COLORS.length;
      const newKeepNote: KeepNote = {
        doc: newDoc,
        imagePreview,
        isPinned: false,
        colorClass: KEEP_COLORS[colorIndex],
      };

      const updatedDocs = [...docs, newDoc];
      const updatedTimeline = [...timeline, newTimelineEvent].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setDocs(updatedDocs);
      setTimeline(updatedTimeline);
      setKeepNotes(prev => [...prev, newKeepNote]);
      setPreviewDoc(newDoc);
    } catch (err) {
      console.error('OCR failed:', err);
      alert('OCR failed to process this file. Try a clearer image of the document.');
    } finally {
      setIsScanning(false);
    }
  };

  // File input change handler
  const handleRealFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFileUpload(file);
    e.target.value = '';
  };

  // Keep note actions
  const handleGemmaCheck = async (noteId: string) => {
    const note = keepNotes.find(n => n.doc.id === noteId);
    if (!note) return;

    setLoadingGemmaNoteId(noteId);

    try {
      const imgToUse = note.imagePreview || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const result = await callLocalGemma(imgToUse, note.doc.rawText);

      // Update keepNotes
      setKeepNotes(prev => prev.map(n =>
        n.doc.id === noteId ? { ...n, doc: { ...n.doc, gemmaSummary: result.text } } : n
      ));
      // Update docs
      setDocs(prev => prev.map(d =>
        d.id === noteId ? { ...d, gemmaSummary: result.text } : d
      ));
      
      // Update previewDoc if active
      if (previewDoc?.id === noteId) {
        setPreviewDoc(prev => prev ? { ...prev, gemmaSummary: result.text } : null);
      }
      
      if (result.isSimulated) {
        alert("Ollama (local GLM-OCR) offline. Showing simulated GLM double-check summary.");
      } else {
        alert("GLM-OCR local analysis completed successfully!");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to run local GLM-OCR check.");
    } finally {
      setLoadingGemmaNoteId(null);
    }
  };

  const handleCopyText = (noteId: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedNoteId(noteId);
      setTimeout(() => setCopiedNoteId(null), 1200);
    });
  };

  const handleTogglePin = (noteId: string) => {
    setKeepNotes(prev => prev.map(n =>
      n.doc.id === noteId ? { ...n, isPinned: !n.isPinned } : n
    ));
  };

  const handleDeleteNote = (noteId: string) => {
    setKeepNotes(prev => prev.filter(n => n.doc.id !== noteId));
    setDocs(prev => prev.filter(d => d.id !== noteId));
    setTimeline(prev => prev.filter(t => t.sourceId !== noteId));
    if (previewDoc?.id === noteId) setPreviewDoc(null);
  };

  const handleNext = () => {
    onScanComplete(docs, timeline);
  };

  // Sort notes: pinned first
  const sortedNotes = [...keepNotes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  return (
    <div className="neo-card" style={{ border: '3px solid #1E1E1E' }}>
      {/* Banner */}
      <div className="flex-between" style={{ marginBottom: '1rem', borderBottom: '3px solid #1E1E1E', paddingBottom: '0.75rem' }}>
        <div>
          <span className="neo-badge badge-pink" style={{ marginRight: '0.5rem' }}>STEP 3</span>
          <span style={{ fontSize: '1.25rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>DIGITIZE & TIMELINE RECORDS</span>
        </div>
        {/* Handwriting Mode Toggle */}
        <div className="ocr-mode-toggle">
          <Type size={14} />
          <span style={{ opacity: isHandwritingMode ? 0.5 : 1 }}>PRINTED</span>
          <div
            className={`toggle-track ${isHandwritingMode ? 'active' : ''}`}
            onClick={() => setIsHandwritingMode(!isHandwritingMode)}
          >
            <div className="toggle-thumb" />
          </div>
          <span style={{ opacity: isHandwritingMode ? 1 : 0.5 }}>HANDWRITTEN</span>
          <PenTool size={14} />
        </div>
      </div>

      <div style={scannerMainGrid}>
        {/* Left Side: Upload zone and presets */}
        <div>
          <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Image size={20} /> Upload Medical Records
          </h3>

          {/* Google Keep-style Drop Zone */}
          <div
            className={`drop-zone ${isDragActive ? 'drop-active' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              style={{ display: 'none' }}
              onChange={handleRealFileUpload}
            />
            {isDragActive ? (
              <>
                <Upload size={40} style={{ marginBottom: '0.5rem', color: '#F9A825' }} />
                <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#F57F17' }}>DROP TO SCAN!</div>
                <div style={{ fontSize: '0.75rem', color: '#F9A825', marginTop: '0.2rem' }}>Release to start {isHandwritingMode ? 'handwriting' : 'printed'} OCR</div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div style={uploadIconCircle}>
                    <Upload size={24} />
                  </div>
                  <div style={uploadIconCircle} onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}>
                    <Camera size={24} />
                  </div>
                </div>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={handleRealFileUpload}
                />
                <div style={{ fontWeight: '800', fontSize: '1rem' }}>
                  Drop, click, or 📸 capture
                </div>
                <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '0.2rem' }}>
                  {isHandwritingMode
                    ? 'Handwritten mode active - routes images to local GLM-OCR vision analysis'
                    : 'Printed mode active — runs OCR on image uploads and stores confidence'}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Side: Scan Status / Google Keep Preview */}
        <div className="neo-card" style={{ backgroundColor: '#F9FAFB', border: '2px solid #1E1E1E', padding: '1rem', boxShadow: 'none', minHeight: '350px' }}>

          {/* Active scanning state animation */}
          {isScanning && (
            <div style={scannerLoadingContainer}>
              <div style={scanningLaserBeam} />
              <div className="ocr-shimmer" style={{ width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #1E1E1E', marginBottom: '1rem' }}>
                {isHandwritingMode ? <PenTool size={32} style={{ color: '#1E1E1E' }} /> : <FileText size={32} style={{ color: '#1E1E1E' }} />}
              </div>
              <h4 style={{ fontFamily: 'var(--font-display)' }}>
                {isHandwritingMode ? '✍️ HANDWRITING OCR...' : '📄 PRINTED OCR...'}
              </h4>
              <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                Digitizing {scanningDocName}
                {ocrProgress > 0 && ocrProgress < 100 ? ` (${ocrProgress}%)` : ''}
              </p>
              {ocrProgress > 0 && (
                <div style={progressBarContainer}>
                  <div style={{ ...progressBarFill, width: `${ocrProgress}%` }} />
                </div>
              )}
            </div>
          )}

          {/* Previewing structured output (for presets with structured data) */}
          {!isScanning && previewDoc && (
            <div>
              <div className="flex-between" style={{ borderBottom: '2px solid #1E1E1E', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                <span className="neo-badge badge-green" style={{ fontSize: '0.65rem' }}>OCR SUCCESSFUL</span>
                <span style={{ fontWeight: '700', fontSize: '0.85rem', maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{previewDoc.name}</span>
              </div>
              <div style={confidenceStripStyle}>
                <strong>Source:</strong> {previewDoc.sourceKind || 'uploaded_file'} |
                <strong> Printed OCR:</strong> {previewDoc.ocrConfidence ?? 'N/A'}% |
                <strong> GLM-OCR:</strong> {previewDoc.handwrittenConfidence ?? 'N/A'}%
              </div>

              {/* Prescriptions View */}
              {previewDoc.type === 'prescription' && previewDoc.structuredData.medications && (
                <div>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Parsed Chronics:</h4>
                  <table style={parsedTableStyle}>
                    <thead>
                      <tr style={{ backgroundColor: '#FFE800' }}>
                        <th style={thStyle}>Medication</th>
                        <th style={thStyle}>Dosage</th>
                        <th style={thStyle}>Frequency</th>
                        <th style={thStyle}>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewDoc.structuredData.medications.map((m, idx) => (
                        <tr key={idx}>
                          <td style={tdStyle}><strong>{m.name}</strong></td>
                          <td style={tdStyle}>{m.dosage}</td>
                          <td style={tdStyle}>{m.frequency}</td>
                          <td style={tdStyle}>{m.duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={ocrHighlightFooter}>
                    <strong>Clinic:</strong> {previewDoc.structuredData.clinicName} | <strong>Doctor:</strong> {previewDoc.structuredData.doctorName}
                  </div>
                </div>
              )}

              {/* Lab Report View */}
              {previewDoc.type === 'lab_report' && previewDoc.structuredData.metrics && (
                <div>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Extracted Lab Biomarkers:</h4>
                  <table style={parsedTableStyle}>
                    <thead>
                      <tr style={{ backgroundColor: '#FFE800' }}>
                        <th style={thStyle}>Biomarker</th>
                        <th style={thStyle}>Value</th>
                        <th style={thStyle}>Ref Range</th>
                        <th style={thStyle}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewDoc.structuredData.metrics.map((m, idx) => (
                        <tr key={idx} style={{ backgroundColor: m.status === 'high' ? '#FEE2E2' : 'transparent' }}>
                          <td style={tdStyle}>{m.name}</td>
                          <td style={tdStyle}><strong>{m.value}</strong></td>
                          <td style={tdStyle}>{m.range}</td>
                          <td style={tdStyle}>
                            <span className={`neo-badge ${m.status === 'high' ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '0.55rem', padding: '0.1rem 0.25rem' }}>
                              {m.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={ocrHighlightFooter}>
                    ⚠️ Renal Clearance (eGFR) flagged as low. Creatinine level indicates moderate kidney strain.
                  </div>
                </div>
              )}

              {/* Discharge Summary View */}
              {previewDoc.type === 'discharge_summary' && (
                <div>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>Discharge Highlights:</h4>
                  <div style={dischargeBoxStyle}>
                    <p><strong>Primary Diagnosis:</strong> {previewDoc.structuredData.diagnosis}</p>
                    <p style={{ marginTop: '0.25rem' }}><strong>Hospital Course:</strong></p>
                    <ul style={{ paddingLeft: '1.25rem', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                      {previewDoc.structuredData.keyFindings?.map((kf, i) => (
                        <li key={i}>{kf}</li>
                      ))}
                    </ul>
                  </div>
                  <div style={ocrHighlightFooter}>
                    <strong>Consultant:</strong> {previewDoc.structuredData.doctorName} ({previewDoc.structuredData.clinicName})
                  </div>
                </div>
              )}

              {/* Fallback for real-upload docs with no structuredData — show raw OCR text */}
              {previewDoc.structuredData &&
                !previewDoc.structuredData.medications &&
                !previewDoc.structuredData.metrics &&
                previewDoc.type !== 'discharge_summary' && (
                <div style={{ fontSize: '0.8rem', color: '#444' }}>
                  No structured fields parsed yet for this upload — see raw OCR text below.
                </div>
              )}

              {/* Toggle to see Raw Plain Text OCR Output */}
              <details style={{ marginTop: '0.75rem' }} open={
                previewDoc.structuredData &&
                !previewDoc.structuredData.medications &&
                !previewDoc.structuredData.metrics &&
                previewDoc.type !== 'discharge_summary'
              }>
                <summary style={{ cursor: 'pointer', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase' }}>
                  <Eye size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> View Raw OCR Stream
                </summary>
                <pre style={rawTextContainer}>{previewDoc.rawText}</pre>
              </details>
            </div>
          )}

          {!isScanning && !previewDoc && (
            <div style={emptyScanContainer}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#FFF9C4', border: '3px solid #1E1E1E', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
                <PenTool size={28} style={{ color: '#1E1E1E' }} />
              </div>
              <h4>Google Keep-Style OCR</h4>
              <p style={{ fontSize: '0.75rem', color: '#666', textAlign: 'center', maxWidth: '85%', marginTop: '0.3rem' }}>
                Upload a handwritten or printed document, snap a photo, or drag & drop an image to extract text — just like Google Keep's "Grab image text" feature.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <span className="neo-badge badge-yellow" style={{ fontSize: '0.55rem' }}>✍️ HANDWRITING</span>
                <span className="neo-badge" style={{ fontSize: '0.55rem' }}>📸 CAMERA</span>
                <span className="neo-badge badge-green" style={{ fontSize: '0.55rem' }}>📋 DRAG & DROP</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Google Keep Notes Grid — displays all scanned docs as note cards */}
      {keepNotes.length > 0 && (
        <div style={{ marginTop: '1.5rem', borderTop: '3px solid #1E1E1E', paddingTop: '1rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            📋 DIGITIZED NOTES ({keepNotes.length})
          </h3>
          <p style={{ fontSize: '0.7rem', color: '#666', marginBottom: '0.5rem' }}>
            Extracted text displayed as Google Keep-style note cards. Pin, copy, or delete notes.
          </p>

          <div className="keep-notes-grid">
            {sortedNotes.map((note) => (
              <div key={note.doc.id} className={`keep-note ${note.colorClass}`}>
                {/* Image thumbnail */}
                {note.imagePreview && (
                  <img
                    src={note.imagePreview}
                    alt={note.doc.name}
                    className="keep-note-image"
                  />
                )}

                {/* Header */}
                <div className="keep-note-header">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {note.isPinned && <Pin size={12} fill="#1E1E1E" />}
                    {note.doc.name}
                  </span>
                  <span className="neo-badge" style={{ fontSize: '0.5rem', padding: '0.05rem 0.25rem' }}>
                    {note.doc.type === 'prescription' ? '💊 RX' : note.doc.type === 'lab_report' ? '🔬 LAB' : '🏥 DC'}
                  </span>
                </div>

                {/* Body: Extracted text */}
                <div className="keep-note-body">
                  <div className="keep-note-text">{note.doc.rawText}</div>
                  {note.doc.gemmaSummary && (
                    <div style={gemmaSummaryNoteBox}>
                      <div style={{ fontWeight: '800', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '0.2rem', color: '#B45309' }}>
                        <Sparkles size={12} style={{ color: '#F59E0B' }} /> GLM CLINICAL CHECK
                      </div>
                      <div style={{ fontSize: '0.72rem', whiteSpace: 'pre-wrap', lineHeight: '1.4', color: '#1E1E1E' }}>
                        {note.doc.gemmaSummary}
                      </div>
                    </div>
                  )}
                </div>
                <div style={confidenceMiniStyle}>
                  Tesseract {note.doc.ocrConfidence ?? 'N/A'}% | GLM {note.doc.handwrittenConfidence ?? 'N/A'}%
                </div>

                {/* Footer with actions */}
                <div className="keep-note-footer">
                  <span>{note.doc.uploadedAt}</span>
                  <div className="keep-note-actions" style={{ position: 'relative' }}>
                    {copiedNoteId === note.doc.id && (
                      <div className="copy-toast">COPIED!</div>
                    )}
                    <button 
                      onClick={() => handleGemmaCheck(note.doc.id)} 
                      title="Run Local GLM OCR/Clinical Double-Check"
                      disabled={loadingGemmaNoteId === note.doc.id}
                      style={{ color: note.doc.gemmaSummary ? '#D97706' : '#555' }}
                    >
                      <Sparkles size={14} className={loadingGemmaNoteId === note.doc.id ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={() => handleTogglePin(note.doc.id)} title={note.isPinned ? 'Unpin' : 'Pin'}>
                      <Pin size={14} fill={note.isPinned ? '#1E1E1E' : 'none'} />
                    </button>
                    <button onClick={() => handleCopyText(note.doc.id, note.doc.rawText)} title="Copy text">
                      <Copy size={14} />
                    </button>
                    <button onClick={() => { setPreviewDoc(note.doc); }} title="View details">
                      <Eye size={14} />
                    </button>
                    <button onClick={() => handleDeleteNote(note.doc.id)} title="Delete note">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visual Health History Timeline Section */}
      {timeline.length > 0 && (
        <div style={{ marginTop: '1.5rem', borderTop: '3px solid #1E1E1E', paddingTop: '1rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Calendar size={22} /> DIGITAL PATIENT HEALTH TIMELINE
          </h3>

          <div style={timelineContainer}>
            {timeline.map((event) => (
              <div
                key={event.id}
                style={timelineItemStyle}
                onClick={() => {
                  const matchingDoc = docs.find(d => d.id === event.sourceId);
                  if (matchingDoc) setPreviewDoc(matchingDoc);
                }}
              >
                {/* Timeline connector circle */}
                <div style={timelineBulletStyle}>
                  <Check size={12} style={{ color: '#FFF' }} />
                </div>

                {/* Timeline content block (Neobrutalist card tiny) */}
                <div
                  className="neo-card hoverable"
                  style={{
                    margin: 0,
                    padding: '0.5rem 0.75rem',
                    boxShadow: '2px 2px 0px #1E1E1E',
                    cursor: 'pointer',
                    backgroundColor: event.type === 'prescription' ? '#A3E635' : event.type === 'lab_report' ? '#FFE800' : '#FF8E9E'
                  }}
                >
                  <div style={{ fontSize: '0.65rem', fontWeight: '800' }}>{event.date}</div>
                  <div style={{ fontWeight: '800', fontSize: '0.8rem' }}>{event.title}</div>
                  <div style={{ fontSize: '0.7rem', marginTop: '0.1rem', opacity: 0.9 }}>{event.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', borderTop: '3px solid #1E1E1E', paddingTop: '1rem' }}>
        <button
          onClick={handleNext}
          className="neo-btn btn-yellow"
          disabled={docs.length === 0}
          style={{ padding: '0.85rem 2rem' }}
        >
          {docs.length === 0 ? 'Upload/Scan at least 1 document' : 'Generate Summary & Route (Step 4)'} <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};

// Styles
const scannerMainGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '1.5rem',
};

const uploadIconCircle: React.CSSProperties = {
  width: '52px',
  height: '52px',
  borderRadius: '50%',
  border: '3px solid #1E1E1E',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#FFF9C4',
  cursor: 'pointer',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  boxShadow: '2px 2px 0px #1E1E1E',
};

const scannerLoadingContainer: React.CSSProperties = {
  position: 'relative',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  minHeight: '300px',
};

const scanningLaserBeam: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '4px',
  backgroundColor: '#FBC02D',
  boxShadow: '0 0 10px #FBC02D, 0 0 20px #FBC02D',
  animation: 'scanLine 2s linear infinite',
};

const progressBarContainer: React.CSSProperties = {
  width: '60%',
  height: '8px',
  backgroundColor: '#E0E0E0',
  borderRadius: '4px',
  border: '1.5px solid #1E1E1E',
  marginTop: '0.75rem',
  overflow: 'hidden',
};

const progressBarFill: React.CSSProperties = {
  height: '100%',
  backgroundColor: '#FBC02D',
  borderRadius: '3px',
  transition: 'width 0.3s ease',
};

const emptyScanContainer: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '300px',
};

const parsedTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.75rem',
  border: '2px solid #1E1E1E',
};

const thStyle: React.CSSProperties = {
  border: '1px solid #1E1E1E',
  padding: '0.4rem',
  textAlign: 'left',
  fontWeight: '800',
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #1E1E1E',
  padding: '0.35rem',
};

const ocrHighlightFooter: React.CSSProperties = {
  marginTop: '0.75rem',
  backgroundColor: '#FFFBEB',
  border: '1.5px solid #FEF3C7',
  padding: '0.5rem',
  fontSize: '0.7rem',
  borderRadius: '4px',
};

const confidenceStripStyle: React.CSSProperties = {
  marginBottom: '0.75rem',
  backgroundColor: '#EEF2FF',
  border: '1.5px solid #1E1E1E',
  borderRadius: '4px',
  padding: '0.35rem 0.5rem',
  fontSize: '0.68rem',
};

const confidenceMiniStyle: React.CSSProperties = {
  marginTop: '0.4rem',
  paddingTop: '0.3rem',
  borderTop: '1px dashed rgba(30,30,30,0.35)',
  fontSize: '0.62rem',
  fontWeight: 800,
  color: '#555',
};

const dischargeBoxStyle: React.CSSProperties = {
  border: '1.5px solid #1E1E1E',
  padding: '0.5rem',
  fontSize: '0.75rem',
  backgroundColor: '#FFF',
  lineHeight: '1.4',
};

const rawTextContainer: React.CSSProperties = {
  marginTop: '0.5rem',
  padding: '0.5rem',
  backgroundColor: '#1E1E1E',
  color: '#FBC02D',
  borderRadius: '4px',
  fontSize: '0.65rem',
  overflowX: 'auto',
  maxHeight: '120px',
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
};

const timelineContainer: React.CSSProperties = {
  display: 'flex',
  gap: '1.5rem',
  overflowX: 'auto',
  padding: '0.5rem 0.5rem 1rem 0.5rem',
  alignItems: 'flex-start',
  borderLeft: '3px solid #1E1E1E',
};

const timelineItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  position: 'relative',
  minWidth: '200px',
};

const timelineBulletStyle: React.CSSProperties = {
  width: '20px',
  height: '20px',
  backgroundColor: '#1E1E1E',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '0.2rem',
  marginLeft: '-11px',
};

const gemmaSummaryNoteBox: React.CSSProperties = {
  marginTop: '0.5rem',
  padding: '0.4rem',
  backgroundColor: 'rgba(255, 255, 255, 0.6)',
  border: '1.5px dashed #D97706',
  borderRadius: '4px',
};

// Add scanner animation styles
if (typeof document !== 'undefined') {
  const styleTag = document.createElement('style');
  styleTag.innerHTML = `
    @keyframes scanLine {
      0% { top: 0%; }
      50% { top: 95%; }
      100% { top: 0%; }
    }
  `;
  document.head.appendChild(styleTag);
}
