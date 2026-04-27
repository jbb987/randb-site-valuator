interface SectionStatus {
  label: string;
  state: 'pending' | 'loading' | 'done' | 'error';
}

interface Props {
  siteName: string;
  generatedAt: number | null;
  sections: SectionStatus[];
}

function StatusDot({ state }: { state: SectionStatus['state'] }) {
  if (state === 'loading') {
    return (
      <div className="h-2.5 w-2.5 rounded-full border-2 border-[#ED202B] border-t-transparent animate-spin" />
    );
  }
  if (state === 'done') {
    return <div className="h-2.5 w-2.5 rounded-full bg-green-500" />;
  }
  if (state === 'error') {
    return <div className="h-2.5 w-2.5 rounded-full bg-red-500" />;
  }
  return <div className="h-2.5 w-2.5 rounded-full bg-stone-300" />;
}

export default function ReportHeader({ siteName, generatedAt, sections }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#ED202B]/10 flex items-center justify-center">
              <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="font-heading text-xl font-semibold text-[#201F1E]">
                {siteName || 'Site Analysis'}
              </h1>
              {generatedAt && (
                <p className="text-xs text-[#7A756E] mt-0.5">
                  Generated {new Date(generatedAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {sections.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <StatusDot state={s.state} />
              <span className="text-xs text-[#7A756E]">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
