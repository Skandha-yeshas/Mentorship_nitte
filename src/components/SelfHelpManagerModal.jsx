import React, { useState, useEffect } from 'react';

export default function SelfHelpManagerModal({
  isOpen,
  onClose,
  ro,
  category,
  onCategoryChange,
  categories = [],
  targetIssueId = null,
  videoTitle,
  setVideoTitle,
  videoUrl,
  setVideoUrl,
  videoDesc,
  setVideoDesc,
  noVideo = false,
  setNoVideo,
  onSave,
  saveSuccess = false,
  getYoutubeEmbedUrl
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  useEffect(() => { setSaveError(''); }, [isOpen, category]);

  if (!isOpen) return null;

  // Safe YouTube embed URL resolution
  const embedUrl = (() => {
    if (getYoutubeEmbedUrl) return getYoutubeEmbedUrl(videoUrl);
    if (!videoUrl) return '';
    const match = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match && match[1] ? `https://www.youtube-nocookie.com/embed/${match[1]}?rel=0` : videoUrl;
  })();

  const isEmbeddable = !noVideo && Boolean(embedUrl && (embedUrl.includes('/embed/') || embedUrl.includes('youtube') || embedUrl.includes('youtu.be')));


  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setSaveError('');
    setIsSaving(true);
    try {
      await onSave(e);
    } catch (error) {
      setSaveError(error.message || 'Could not save the self-help setting. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div id="self-help-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] relative">
        {/* Top Accent Gradient Strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 flex-shrink-0"></div>

        {/* Modal Header */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-rose-600 to-red-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-2xl">smart_display</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight truncate">
                  Self-Help Hub &amp; Video Guidance Center
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-semibold text-[11px]">
                  <span className="material-symbols-outlined text-xs text-blue-600">verified_user</span>
                  RO Authorized
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate flex items-center gap-1.5">
                <span>Officer: <strong className="text-slate-700 font-medium">{ro?.name || 'Prof. Suresh Nayak'}</strong></span>
                <span>•</span>
                <span>Scope: <strong className="text-slate-700 font-medium">{category || 'Hostel Wi-Fi & Connectivity'}</strong></span>
                {targetIssueId && (
                  <>
                    <span>•</span>
                    <span className="font-mono font-semibold text-slate-700">#{targetIssueId}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer flex-shrink-0"
            title="Close Dialog"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Category Navigation Subheader (for RO to switch between assigned categories) */}
        {categories.length > 1 && !targetIssueId && (
          <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 shrink-0 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-blue-600">tune</span> Scope:
            </span>
            {categories.map((cat) => {
              const isActive = cat === category;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onCategoryChange && onCategoryChange(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-blue-700 text-white shadow-2xs font-bold'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>{cat}</span>
                  {isActive && <span className="material-symbols-outlined text-xs">check</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Form Container */}
        <form onSubmit={handleFormSubmit} className="flex flex-col flex-grow overflow-hidden">
          {/* Modal Scrollable Content: 2-Column Responsive Layout */}
          <div className="p-6 overflow-y-auto space-y-5 text-xs sm:text-sm flex-grow">

            {/* Success Alert Banner */}
            {saveSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <span className="material-symbols-outlined text-emerald-600 text-base">check_circle</span>
                <span>{noVideo ? 'No-video setting saved. Students will skip the video for this issue.' : 'Self-help video published and synced with the student portal.'}</span>
              </div>
            )}

            {saveError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{saveError}</p>}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-xs font-bold text-slate-800">Video availability for {category}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={!noVideo} onClick={() => setNoVideo(false)} className={`rounded-xl border px-4 py-2 text-xs font-bold ${!noVideo ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>Video Available</button>
                <button type="button" aria-pressed={noVideo} onClick={() => setNoVideo(true)} className={`rounded-xl border px-4 py-2 text-xs font-bold ${noVideo ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-slate-300 bg-white text-slate-700'}`}>No Video Available</button>
              </div>
              {noVideo && <p className="text-xs text-slate-600">After you save, students submitting this issue will go directly to their ticket without a video popup. You can add a video later.</p>}
            </div>

            {/* Form & Live Preview Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Editor Column (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                {/* Video Title & Headline */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Video Title &amp; Headline {!noVideo && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="text"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs sm:text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 transition"
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    placeholder="e.g. Resolution Walkthrough for Student Wi-Fi Disruption"
                    required={!noVideo}
                    disabled={noVideo}
                  />
                </div>

                {/* YouTube URL or Share Link */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      YouTube URL or Share Link {!noVideo && <span className="text-rose-500">*</span>}
                    </label>
                    {!noVideo && videoUrl && (
                      <a
                        href={videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-0.5"
                      >
                        Open in Tab <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                      </a>
                    )}
                  </div>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-rose-600 text-lg pointer-events-none">
                      play_circle
                    </span>
                    <input
                      type="url"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs sm:text-sm font-mono font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 transition"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="Paste standard YouTube watch URL or share link..."
                      required={!noVideo}
                      disabled={noVideo}
                    />
                  </div>
                </div>

                {/* Step-by-Step Instructions & FAQ */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Step-by-Step Resolution Instructions &amp; FAQ
                  </label>
                  <textarea
                    rows={5}
                    className="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100/60 focus:bg-white text-slate-900 text-xs leading-relaxed transition-all border border-slate-200 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    value={videoDesc}
                    onChange={(e) => setVideoDesc(e.target.value)}
                    placeholder="Enter guidelines, troubleshooting steps, and instructions for students..."
                  />
                </div>
              </div>

              {/* Right Live Video Preview Pane (5 cols) */}
              <div className="lg:col-span-5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {noVideo ? 'Video Unavailable' : 'Live Video Preview'}
                  </label>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {noVideo ? 'Playback Skipped' : '16:9 Aspect Ready'}
                  </span>
                </div>

                {/* Video Preview Card */}
                <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-md">
                  <div className="relative aspect-video bg-slate-900 flex items-center justify-center group overflow-hidden">
                    {isEmbeddable ? (
                      <iframe
                        className="w-full h-full"
                        src={embedUrl}
                        title="Self-Help Video Preview"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                        <span className="material-symbols-outlined text-4xl mb-1 text-slate-600">videocam_off</span>
                        <p className="text-xs">{noVideo ? 'No video available for this issue' : 'Enter a valid YouTube URL to preview'}</p>
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-slate-900 text-white border-t border-slate-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200 truncate">
                        {noVideo ? 'No Video Available' : (videoTitle || `${category || 'Self-Help'} Guidance SOP`)}
                      </span>
                      {!noVideo && <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">HD 1080p</span>}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                      Broadcast channel: Student Portal &gt; Self-Help Hub &gt; {category || 'Support'}
                    </p>
                  </div>
                </div>

                {/* Summary Callout Badge */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <span className="material-symbols-outlined text-sm text-blue-700">visibility</span> Visible to All Mentored Students
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {noVideo ? 'Students will skip video playback when submitting ' : 'The configured video will be shown for '}<strong className="text-slate-700 font-semibold">{category}</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
            <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-emerald-600">cloud_sync</span>
              Saves to database &amp; broadcasts across active student devices
            </span>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || (!noVideo && !videoUrl?.trim())}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-600 hover:from-blue-800 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-blue-700/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">save</span>
                <span>{isSaving ? 'Saving...' : (noVideo ? 'Save No-Video Setting' : 'Save & Publish Video')}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
