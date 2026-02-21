import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import HistoryPage from './pages/HistoryPage';
import ArticlePage from './pages/ArticlePage';
import GamesPage from './pages/GamesPage';
import LinkQuestPage from './pages/LinkQuestPage';
import LinkQuestResultsPage from './pages/LinkQuestResultsPage';
import LinkQuestExplorePage from './pages/LinkQuestExplorePage';
import WhatInTheWikiPage from './pages/WhatInTheWikiPage';
import KnowledgeWebPage from './pages/KnowledgeWebPage';
import KnowledgeWebResultsPage from './pages/KnowledgeWebResultsPage';

const AppContent: React.FC = () => {
  const location = useLocation();
  const isLinkQuestRoute = location.pathname.startsWith('/games/linkquest');
  const isWhatInTheWikiRoute = location.pathname.startsWith('/games/what-in-the-wiki');
  const isKnowledgeWebRoute = location.pathname.startsWith('/games/knowledge-web');
  const shouldHideNavBar = isLinkQuestRoute || isWhatInTheWikiRoute || isKnowledgeWebRoute;
  
  return (
    <>
      {!shouldHideNavBar && <NavBar />}
    <Routes>
      <Route path="/" element={<Navigate to="/games" replace />} />
      <Route path="/explore" element={<HomePage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/history" element={<HistoryPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/games/linkquest" element={<LinkQuestPage />} />
        <Route path="/games/linkquest/results" element={<LinkQuestResultsPage />} />
        <Route path="/games/linkquest/explore" element={<LinkQuestExplorePage />} />
        <Route path="/games/what-in-the-wiki" element={<WhatInTheWikiPage />} />
        <Route path="/games/knowledge-web" element={<KnowledgeWebPage />} />
        <Route path="/games/knowledge-web/results" element={<KnowledgeWebResultsPage />} />
      <Route path="/article/:title" element={<ArticlePage />} />
    </Routes>
    </>
  );
};

const App: React.FC = () => (
  <Router basename="/wikipedia-app-prototype">
    <AppContent />
  </Router>
);

export default App; 