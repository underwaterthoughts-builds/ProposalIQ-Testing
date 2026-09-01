import { useState, memo } from 'react';

// ── VIEW RFP DOCUMENT TAB ───────────────────────────────────────────────
// Inline iframe of the uploaded source RFP. PDFs embed directly; other
// types show a download CTA since browsers can't preview them natively.
const RfpDocumentTab = memo(function RfpDocumentTab({ scan }) {
  const [loaded, setLoaded] = useState(false);
  const filename = scan.rfp_original_name || scan.rfp_filename || '';
  const ext = filename.toLowerCase().split('.').pop();
  const isPdf = ext === 'pdf';

  if (!scan.rfp_filename) {
    return <div className="text-center py-16 text-on-surface-variant">No source file attached to this scan.</div>;
  }

  if (!loaded) {
    return (
      <div className="text-center py-16 bg-surface-container-low">
        <span className="material-symbols-outlined text-5xl text-primary/40">picture_as_pdf</span>
        <h3 className="font-headline text-xl mt-4 text-on-surface">{filename || 'RFP document'}</h3>
        <p className="font-body text-sm mt-2 text-on-surface-variant max-w-md mx-auto">
          {isPdf
            ? 'Click to load the full PDF inline. Deferred so the workbench stays snappy.'
            : `This document is a .${ext} file — inline preview is only supported for PDFs. Use the download link to view it.`}
        </p>
        <div className="flex gap-3 justify-center mt-6">
          {isPdf && (
            <button
              onClick={() => setLoaded(true)}
              className="bg-primary text-on-primary px-6 py-3 text-[10px] font-label uppercase tracking-widest font-bold"
            >
              Load PDF
            </button>
          )}
          <a
            href={`/api/rfp/${scan.id}/download`}
            target="_blank" rel="noopener noreferrer"
            className="border border-outline/30 text-on-surface-variant hover:text-on-surface px-6 py-3 text-[10px] font-label uppercase tracking-widest flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Open / Download
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest">
      <iframe
        src={`/api/rfp/${scan.id}/download`}
        title="RFP document"
        className="w-full"
        style={{ height: 'calc(100vh - 280px)', minHeight: 600, border: 'none' }}
      />
    </div>
  );
});

export default RfpDocumentTab;
