import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getFeaturedArticleTitles,
  getMoreLikeArticles,
  getWikipediaPageCategories,
  getWikipediaPageSections,
  getWikipediaPageSummary,
  pickDailyFeaturedTitle,
  SearchResult,
  WikipediaSection,
} from '../api/wikipedia';
import './WhatInTheWikiPage.css';

type RevealLevel = 1 | 2 | 3 | 4 | 5;

interface DailyGameState {
  dateKey: string;
  revealLevel: RevealLevel;
  guesses: string[];
  isWon: boolean;
  isLost: boolean;
  correctTitle: string;
}

interface CachedPuzzleData {
  dateKey: string;
  correctTitle: string;
  options: string[];
  categories: string[];
  thumbnailUrl: string | null;
  sections: WikipediaSection[];
  leadParagraph: string;
  fullLead: string;
}

const MAX_REVEAL_LEVEL: RevealLevel = 5;

function getUtcDateKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactTitle(text: string, title: string): string {
  if (!text) return text;
  const titleSpaces = title.replace(/_/g, ' ');
  const titleUnderscores = title.replace(/ /g, '_');
  const pattern = new RegExp(`\\b(${escapeRegExp(titleSpaces)}|${escapeRegExp(titleUnderscores)})\\b`, 'gi');
  return text.replace(pattern, '████████');
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const WhatInTheWikiPage: React.FC = () => {
  const navigate = useNavigate();

  const dateKey = useMemo(() => getUtcDateKey(), []);
  const STORAGE_KEY = useMemo(() => `whatInTheWiki_dailyState_${dateKey}`, [dateKey]);
  const PUZZLE_CACHE_KEY = useMemo(() => `whatInTheWiki_puzzleCache_${dateKey}`, [dateKey]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [correctTitle, setCorrectTitle] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);

  const [categories, setCategories] = useState<string[]>([]);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [sections, setSections] = useState<WikipediaSection[]>([]);
  const [leadParagraph, setLeadParagraph] = useState<string>('');
  const [fullLead, setFullLead] = useState<string>(''); // unredacted, for level 5 display

  const [revealLevel, setRevealLevel] = useState<RevealLevel>(1);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [isWon, setIsWon] = useState(false);
  const [isLost, setIsLost] = useState(false);

  const scoreText = useMemo(() => {
    if (!isWon) return null;
    return `You got it on reveal ${revealLevel} / ${MAX_REVEAL_LEVEL}.`;
  }, [isWon, revealLevel]);

  const persistState = useCallback(
    (next: Partial<DailyGameState>) => {
      if (!correctTitle) return;
      const stateToSave: DailyGameState = {
        dateKey,
        revealLevel,
        guesses,
        isWon,
        isLost,
        correctTitle,
        ...next,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
      } catch {
        // ignore storage failures
      }
    },
    [STORAGE_KEY, correctTitle, dateKey, guesses, isLost, isWon, revealLevel]
  );

  const restoreStateIfPossible = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DailyGameState;
      if (!parsed || parsed.dateKey !== dateKey) return;
      if (!parsed.correctTitle) return;

      setCorrectTitle(parsed.correctTitle);
      setRevealLevel(parsed.revealLevel || 1);
      setGuesses(Array.isArray(parsed.guesses) ? parsed.guesses : []);
      setIsWon(Boolean(parsed.isWon));
      setIsLost(Boolean(parsed.isLost));
    } catch {
      // ignore restore failures
    }
  }, [STORAGE_KEY, dateKey]);

  const restorePuzzleDataIfPossible = useCallback((): boolean => {
    try {
      const raw = localStorage.getItem(PUZZLE_CACHE_KEY);
      if (!raw) return false;
      const cached = JSON.parse(raw) as CachedPuzzleData;
      if (!cached || cached.dateKey !== dateKey) return false;
      if (!cached.correctTitle) return false;

      // Restore all puzzle data from cache
      setCorrectTitle(cached.correctTitle);
      setOptions(cached.options);
      setCategories(cached.categories);
      setThumbnailUrl(cached.thumbnailUrl);
      setSections(cached.sections);
      setLeadParagraph(cached.leadParagraph);
      setFullLead(cached.fullLead);
      return true;
    } catch {
      return false;
    }
  }, [PUZZLE_CACHE_KEY, dateKey]);

  const cachePuzzleData = useCallback((data: CachedPuzzleData) => {
    try {
      localStorage.setItem(PUZZLE_CACHE_KEY, JSON.stringify(data));
    } catch {
      // ignore storage failures
    }
  }, [PUZZLE_CACHE_KEY]);

  const fetchDailyGame = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      // Try to restore puzzle data from cache first (fast path)
      const cachedDataRestored = restorePuzzleDataIfPossible();
      
      // Restore game state (reveal level, guesses, win/loss)
      restoreStateIfPossible();

      // If we have cached puzzle data, we're done loading
      if (cachedDataRestored) {
        setLoading(false);
        return;
      }

      // Otherwise, fetch all puzzle data upfront
      const featuredTitles = await getFeaturedArticleTitles(2500);
      const picked = pickDailyFeaturedTitle(featuredTitles, new Date());
      if (!picked) {
        setLoadError("Could not select today's article.");
        setLoading(false);
        return;
      }

      // Build multiple-choice options (1 correct + 3 similar)
      let similar: SearchResult[] = [];
      try {
        similar = await getMoreLikeArticles(picked.replace(/ /g, '_'), 10);
      } catch {
        // ignore
      }

      const similarTitles = similar
        .map(r => r.title)
        .filter(t => typeof t === 'string' && t.length > 0 && t.toLowerCase() !== picked.toLowerCase());

      const optionSet = new Set<string>([picked]);
      for (const t of similarTitles) {
        if (optionSet.size >= 4) break;
        optionSet.add(t);
      }
      // Fallback: fill from featured list if needed
      for (const t of featuredTitles) {
        if (optionSet.size >= 4) break;
        if (t.toLowerCase() === picked.toLowerCase()) continue;
        optionSet.add(t);
      }
      const optionList = shuffle(Array.from(optionSet)).slice(0, 4);

      // Fetch all clue content in parallel
      const [cats, secs, summary] = await Promise.all([
        getWikipediaPageCategories(picked, 30),
        getWikipediaPageSections(picked),
        getWikipediaPageSummary(picked),
      ]);

      const extract = summary?.extract || '';
      const firstParagraph = extract.split('\n\n')[0] || extract;
      const redactedLead = redactTitle(firstParagraph, picked);

      // Set all state
      setCorrectTitle(picked);
      setOptions(optionList);
      setCategories(cats);
      setSections(secs);
      setThumbnailUrl(summary?.thumbnailUrl || null);
      setFullLead(extract);
      setLeadParagraph(redactedLead);

      // Cache all puzzle data for future loads
      const puzzleDataToCache: CachedPuzzleData = {
        dateKey,
        correctTitle: picked,
        options: optionList,
        categories: cats,
        thumbnailUrl: summary?.thumbnailUrl || null,
        sections: secs,
        leadParagraph: redactedLead,
        fullLead: extract,
      };
      cachePuzzleData(puzzleDataToCache);

      // Persist game state
      persistState({ correctTitle: picked });

      setLoading(false);
    } catch (error) {
      console.error('WHAT_IN_THE_WIKI_LOAD_ERROR:', error);
      setLoadError("Failed to load today's game. Please try again.");
      setLoading(false);
    }
  }, [persistState, restoreStateIfPossible, restorePuzzleDataIfPossible, cachePuzzleData, dateKey]);

  useEffect(() => {
    fetchDailyGame();
  }, [fetchDailyGame]);

  useEffect(() => {
    // Keep localStorage up-to-date as gameplay progresses
    if (!correctTitle) return;
    persistState({});
  }, [persistState, correctTitle, revealLevel, guesses, isWon, isLost]);

  const canRevealMore = !isWon && !isLost && revealLevel < MAX_REVEAL_LEVEL;

  const handleRevealNext = () => {
    if (!canRevealMore) return;
    setRevealLevel(prev => (Math.min(MAX_REVEAL_LEVEL, (prev + 1) as RevealLevel) as RevealLevel));
  };

  const handleGuess = (choice: string) => {
    if (!correctTitle) return;
    if (isWon || isLost) return;

    setGuesses(prev => {
      if (prev.includes(choice)) return prev;
      return [...prev, choice];
    });

    const isCorrect = choice.toLowerCase() === correctTitle.toLowerCase();
    if (isCorrect) {
      setIsWon(true);
      return;
    }

    if (revealLevel >= MAX_REVEAL_LEVEL) {
      setIsLost(true);
    }
  };

  const showFullArticle = isWon || isLost || revealLevel >= 5;

  return (
    <div className="wiw-page">
      <header className="wiw-header">
        <button className="wiw-back" onClick={() => navigate('/games')}>
          ← Games
        </button>
        <div className="wiw-title-wrap">
          <h1 className="wiw-title">What in the Wiki</h1>
          <div className="wiw-meta">Daily • {dateKey} (UTC)</div>
        </div>
      </header>

      {loading && (
        <div className="wiw-loading">Loading today’s puzzle…</div>
      )}

      {!loading && loadError && (
        <div className="wiw-error">
          <div className="wiw-error-title">Couldn’t load the game</div>
          <div className="wiw-error-body">{loadError}</div>
          <button className="wiw-primary" onClick={fetchDailyGame}>
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && correctTitle && (
        <>
          <section className="wiw-panel">
            <div className="wiw-panel-top">
              <div className="wiw-panel-heading">Make a guess</div>
              <div className="wiw-panel-sub">
                Choose 1 of 4. Reveal more clues if you’re stuck.
              </div>
            </div>

            <div className="wiw-options">
              {options.map(opt => {
                const guessed = guesses.includes(opt);
                const correct = (isWon || isLost) && opt.toLowerCase() === correctTitle.toLowerCase();
                const wrong = guessed && !correct && opt.toLowerCase() !== correctTitle.toLowerCase();
                return (
                  <button
                    key={opt}
                    className={[
                      'wiw-option',
                      guessed ? 'guessed' : '',
                      correct ? 'correct' : '',
                      wrong ? 'wrong' : '',
                    ].join(' ')}
                    onClick={() => handleGuess(opt)}
                    disabled={isWon || isLost}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            <div className="wiw-actions">
              <button className="wiw-secondary" onClick={handleRevealNext} disabled={!canRevealMore}>
                Reveal next clue
              </button>
              <div className="wiw-reveal-status">Reveal {revealLevel} / {MAX_REVEAL_LEVEL}</div>
            </div>

            {(isWon || isLost) && (
              <div className={`wiw-result ${isWon ? 'win' : 'lose'}`}>
                <div className="wiw-result-title">
                  {isWon ? 'You got it!' : 'Game over'}
                </div>
                <div className="wiw-result-body">
                  The article was: <strong>{correctTitle}</strong>
                </div>
                {isWon && scoreText && (
                  <div className="wiw-score">{scoreText}</div>
                )}
                <button
                  className="wiw-link"
                  onClick={() => navigate(`/article/${encodeURIComponent(correctTitle.replace(/ /g, '_'))}`)}
                >
                  Read the article →
                </button>
              </div>
            )}
          </section>

          <section className="wiw-clues">
            {revealLevel >= 1 && (
              <div className="wiw-clue">
                <div className="wiw-clue-title">Reveal 1: Categories</div>
                {categories.length === 0 ? (
                  <div className="wiw-clue-body muted">No categories found.</div>
                ) : (
                  <div className="wiw-tags">
                    {categories.map(c => (
                      <span key={c} className="wiw-tag">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {revealLevel >= 2 && (
              <div className="wiw-clue">
                <div className="wiw-clue-title">Reveal 2: Image</div>
                <div className="wiw-clue-body">
                  {thumbnailUrl ? (
                    <img className="wiw-image" src={thumbnailUrl} alt="Article lead image clue" />
                  ) : (
                    <div className="muted">No image available for this article.</div>
                  )}
                </div>
              </div>
            )}

            {revealLevel >= 3 && (
              <div className="wiw-clue">
                <div className="wiw-clue-title">Reveal 3: Table of contents</div>
                {sections.length === 0 ? (
                  <div className="wiw-clue-body muted">No sections found.</div>
                ) : (
                  <ol className="wiw-toc">
                    {sections
                      .filter(s => s.toclevel <= 2)
                      .slice(0, 18)
                      .map((s) => (
                        <li key={`${s.number}-${s.anchor}`} className={`lvl-${s.toclevel}`}>
                          {redactTitle(s.line, correctTitle)}
                        </li>
                      ))}
                  </ol>
                )}
                <div className="wiw-clue-foot muted">
                  (Headings limited for readability; title redacted.)
                </div>
              </div>
            )}

            {revealLevel >= 4 && (
              <div className="wiw-clue">
                <div className="wiw-clue-title">Reveal 4: First paragraph</div>
                <div className="wiw-clue-body wiw-paragraph">
                  {leadParagraph ? leadParagraph : <span className="muted">No lead text available.</span>}
                </div>
              </div>
            )}

            {revealLevel >= 5 && (
              <div className="wiw-clue">
                <div className="wiw-clue-title">Reveal 5: Entire article revealed</div>
                <div className="wiw-clue-body">
                  {showFullArticle ? (
                    <>
                      <div className="wiw-full-title">{correctTitle}</div>
                      {fullLead && <div className="wiw-paragraph">{fullLead}</div>}
                      <button
                        className="wiw-link"
                        onClick={() => navigate(`/article/${encodeURIComponent(correctTitle.replace(/ /g, '_'))}`)}
                      >
                        Open full article →
                      </button>
                    </>
                  ) : (
                    <div className="muted">Keep guessing!</div>
                  )}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default WhatInTheWikiPage;

